const express = require('express');
const router = express.Router();
const db = require('../db');
const requireUser = require('../middleware/auth');
const bookingService = require('../services/booking');

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
