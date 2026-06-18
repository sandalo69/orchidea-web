const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const bookingService = require('../services/booking');
const { sendBookingConfirmation } = require('../services/email');

// Lazy singleton — nessuna API call, serve solo per webhooks.constructEvent
let _stripeInstance;
function getStripe() {
  if (!_stripeInstance) {
    _stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_stub_webhook_only');
  }
  return _stripeInstance;
}


router.post('/stripe', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    // Nessun segreto configurato → dev senza webhook, ignora silenziosamente
    return res.json({ received: true });
  }

  let event;
  try {
    // req.body è un Buffer grazie a express.raw() montato in server.js
    event = getStripe().webhooks.constructEvent(req.body, sig, secret);
  } catch (err) {
    console.error('[webhook] Firma non valida:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object;
    const bookingId = parseInt(intent.metadata.booking_id, 10);
    if (bookingId) {
      try {
        const booking = await bookingService.confirm(bookingId, 'stripe', intent.id);
        const fullBooking = await bookingService.getById(booking.id);
        req.app.get('io').to(`event:${booking.event_id}`).emit('seats:update', { eventId: booking.event_id });
        sendBookingConfirmation(
          fullBooking.user_email,
          fullBooking.user_nome,
          fullBooking,
          { titolo: fullBooking.evento_titolo, data_evento: fullBooking.data_evento }
        ).catch(err => console.error('[webhook] Email conferma fallita:', err.message));
      } catch (err) {
        // NOT_FOUND = prenotazione già confermata via return-URL → idempotente, OK
        if (err.code !== 'NOT_FOUND') {
          console.error('[webhook] Errore conferma prenotazione:', err.message);
        }
      }
    }
  }

  res.json({ received: true });
});

module.exports = router;
