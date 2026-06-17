const express = require('express');
const router = express.Router();
const db = require('../db');
const requireUser = require('../middleware/auth');
const bookingService = require('../services/booking');
const paymentService = require('../services/payment');
const { sendBookingConfirmation } = require('../services/email');

// GET /prenota → redirect to mie
router.get('/', requireUser, (req, res) => res.redirect('/prenota/mie'));

// GET /prenota/mie — user's bookings + available events
router.get('/mie', requireUser, async (req, res, next) => {
  try {
    const bookings = await bookingService.getByUser(req.session.userId);
    const { rows: eventi } = await db.query(
      `SELECT * FROM events WHERE pubblicato=TRUE AND prenotazioni_aperte=TRUE AND data_evento > NOW()
       ORDER BY data_evento ASC`
    );
    res.render('public/mie-prenotazioni', {
      title: 'Le mie prenotazioni',
      bookings,
      eventi,
      query: req.query,
    });
  } catch (err) { next(err); }
});

// ── Checkout ───────────────────────────────────────────────────────────────

// GET /prenota/conferma — success page (register BEFORE /:eventId)
router.get('/conferma', requireUser, async (req, res, next) => {
  try {
    const bookingId = parseInt(req.query.bookingId, 10);
    const booking = bookingId ? await bookingService.getById(bookingId) : null;
    if (booking && booking.user_id !== req.session.userId) return res.status(403).redirect('/prenota/mie');
    res.render('public/booking-conferma', { title: 'Prenotazione confermata', booking });
  } catch (err) { next(err); }
});

// GET /prenota/checkout/:bookingId — checkout page
router.get('/checkout/:bookingId', requireUser, async (req, res, next) => {
  try {
    const booking = await bookingService.getById(parseInt(req.params.bookingId, 10));
    if (!booking || booking.user_id !== req.session.userId) {
      return res.status(404).render('public/404', { title: '404' });
    }
    if (booking.stato === 'confermata') {
      return res.redirect(`/prenota/conferma?bookingId=${booking.id}`);
    }
    if (booking.stato === 'annullata') {
      return res.redirect('/prenota/mie?error=booking_annullato');
    }
    if (booking.stato === 'temporanea' && new Date(booking.scadenza_timer) < new Date()) {
      return res.redirect(`/prenota/${booking.event_id}?error=SCADUTO`);
    }
    res.render('public/checkout', {
      title: 'Checkout',
      booking,
      stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
      paypalClientId: process.env.PAYPAL_CLIENT_ID || '',
      query: req.query,
    });
  } catch (err) { next(err); }
});

// POST /prenota/checkout/:bookingId/stripe — create Stripe PaymentIntent
router.post('/checkout/:bookingId/stripe', requireUser, async (req, res, next) => {
  try {
    const booking = await bookingService.getById(parseInt(req.params.bookingId, 10));
    if (!booking || booking.user_id !== req.session.userId || booking.stato === 'annullata' || booking.stato === 'confermata') {
      return res.status(400).json({ error: 'Prenotazione non valida' });
    }
    const returnUrl = `${process.env.BASE_URL}/prenota/checkout/${booking.id}/stripe/return`;
    const intent = await paymentService.createStripeIntent(booking.id, parseFloat(booking.importo), returnUrl);
    if (booking.stato === 'temporanea') {
      await bookingService.setInAttesa(booking.id);
    }
    res.json({ clientSecret: intent.client_secret, publishableKey: process.env.STRIPE_PUBLISHABLE_KEY });
  } catch (err) {
    if (err.code === 'NO_STRIPE_KEY') return res.status(503).json({ error: 'Pagamento Stripe non configurato' });
    next(err);
  }
});

// GET /prenota/checkout/:bookingId/stripe/return — Stripe return URL
router.get('/checkout/:bookingId/stripe/return', requireUser, async (req, res, next) => {
  try {
    const { payment_intent, redirect_status } = req.query;
    if (redirect_status !== 'succeeded') {
      return res.redirect(`/prenota/checkout/${req.params.bookingId}?error=pagamento_fallito`);
    }
    const booking = await bookingService.getById(parseInt(req.params.bookingId, 10));
    if (!booking || booking.user_id !== req.session.userId) return res.status(404).render('public/404', { title: '404' });
    const intent = await paymentService.retrieveStripeIntent(payment_intent);
    if (intent.status !== 'succeeded') {
      return res.redirect(`/prenota/checkout/${req.params.bookingId}?error=pagamento_non_completato`);
    }
    const confirmedBooking = await bookingService.confirm(parseInt(req.params.bookingId, 10), 'stripe', payment_intent);
    const fullBooking = await bookingService.getById(confirmedBooking.id);
    req.app.get('io').to(`event:${confirmedBooking.event_id}`).emit('seats:update', { eventId: confirmedBooking.event_id });
    sendBookingConfirmation(fullBooking.user_email, fullBooking.user_nome, fullBooking, { titolo: fullBooking.evento_titolo, data_evento: fullBooking.data_evento }).catch(err => console.error('[EMAIL] Conferma fallita:', err.message));
    res.redirect(`/prenota/conferma?bookingId=${confirmedBooking.id}`);
  } catch (err) { next(err); }
});

// POST /prenota/checkout/:bookingId/paypal — create PayPal order
router.post('/checkout/:bookingId/paypal', requireUser, async (req, res, next) => {
  try {
    const booking = await bookingService.getById(parseInt(req.params.bookingId, 10));
    if (!booking || booking.user_id !== req.session.userId || booking.stato === 'annullata' || booking.stato === 'confermata') {
      return res.status(400).json({ error: 'Prenotazione non valida' });
    }
    const order = await paymentService.createPayPalOrder(booking.id, parseFloat(booking.importo));
    if (booking.stato === 'temporanea') {
      await bookingService.setInAttesa(booking.id);
    }
    res.json({ orderID: order.id });
  } catch (err) {
    if (err.code === 'NO_PAYPAL_KEY') return res.status(503).json({ error: 'Pagamento PayPal non configurato' });
    next(err);
  }
});

// POST /prenota/checkout/:bookingId/paypal/capture — capture PayPal order
router.post('/checkout/:bookingId/paypal/capture', requireUser, async (req, res, next) => {
  try {
    const { orderID } = req.body;
    if (!orderID) return res.status(400).json({ error: 'orderID mancante' });
    const capture = await paymentService.capturePayPalOrder(orderID);
    if (capture.status !== 'COMPLETED') {
      return res.status(400).json({ error: 'Pagamento PayPal non completato' });
    }
    const booking = await bookingService.confirm(parseInt(req.params.bookingId, 10), 'paypal', orderID);
    const fullBooking = await bookingService.getById(booking.id);
    req.app.get('io').to(`event:${booking.event_id}`).emit('seats:update', { eventId: booking.event_id });
    sendBookingConfirmation(fullBooking.user_email, fullBooking.user_nome, fullBooking, { titolo: fullBooking.evento_titolo, data_evento: fullBooking.data_evento }).catch(err => console.error('[EMAIL] Conferma fallita:', err.message));
    res.json({ success: true, bookingId: booking.id });
  } catch (err) { next(err); }
});

// GET /prenota/:eventId — seat selection page
router.get('/:eventId', requireUser, async (req, res, next) => {
  try {
    const eventId = parseInt(req.params.eventId, 10);
    const { rows: [event] } = await db.query(
      'SELECT * FROM events WHERE id=$1 AND pubblicato=TRUE AND prenotazioni_aperte=TRUE',
      [eventId]
    );
    if (!event) return res.status(404).render('public/404', { title: '404' });
    if (!event.layout_id) {
      return res.redirect(`/eventi/${eventId}?error=nessuna_planimetria`);
    }
    res.render('public/prenota', {
      title: `Prenota — ${event.titolo}`,
      event,
      query: req.query,
    });
  } catch (err) { next(err); }
});

// POST /prenota/:eventId — create temporary booking
router.post('/:eventId', requireUser, async (req, res, next) => {
  try {
    const eventId = parseInt(req.params.eventId, 10);
    const rawIds = (req.body.seat_ids || '').split(',').map(s => parseInt(s.trim(), 10)).filter(Boolean);
    const booking = await bookingService.createTemporary(req.session.userId, eventId, rawIds);

    // Broadcast seat update to all clients viewing this event
    req.app.get('io').to(`event:${eventId}`).emit('seats:update', { eventId });

    res.redirect(`/prenota/checkout/${booking.id}`);
  } catch (err) {
    if (err.code) {
      const msg = encodeURIComponent(err.message);
      return res.redirect(`/prenota/${req.params.eventId}?error=${err.code}&msg=${msg}`);
    }
    next(err);
  }
});

// POST /prenota/:bookingId/annulla
router.post('/:bookingId/annulla', requireUser, async (req, res, next) => {
  try {
    const booking = await bookingService.cancel(parseInt(req.params.bookingId, 10), req.session.userId);
    req.app.get('io').to(`event:${booking.event_id}`).emit('seats:update', { eventId: booking.event_id });
    res.redirect('/prenota/mie?success=annullata');
  } catch (err) {
    if (err.code) return res.redirect('/prenota/mie?error=' + err.code);
    next(err);
  }
});

module.exports = router;
