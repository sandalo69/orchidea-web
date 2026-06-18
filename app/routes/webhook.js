const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const bookingService = require('../services/booking');
const { sendBookingConfirmation } = require('../services/email');

let _stripeInstance;
function getStripe() {
  if (!_stripeInstance) {
    _stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_stub_webhook_only');
  }
  return _stripeInstance;
}

async function verifyPayPalWebhook(headers, rawBody) {
  const base = process.env.PAYPAL_MODE === 'live'
    ? 'https://api.paypal.com'
    : 'https://api.sandbox.paypal.com';

  const credentials = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`
  ).toString('base64');

  const tokenRes = await fetch(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!tokenRes.ok) throw new Error(`PayPal OAuth fallito: ${tokenRes.status}`);
  const { access_token } = await tokenRes.json();

  const verifyRes = await fetch(`${base}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      transmission_id: headers['paypal-transmission-id'],
      transmission_time: headers['paypal-transmission-time'],
      cert_url: headers['paypal-cert-url'],
      auth_algo: headers['paypal-auth-algo'],
      transmission_sig: headers['paypal-transmission-sig'],
      webhook_id: process.env.PAYPAL_WEBHOOK_ID,
      webhook_event: JSON.parse(rawBody.toString()),
    }),
  });
  if (!verifyRes.ok) throw new Error(`PayPal verify fallito: ${verifyRes.status}`);
  const { verification_status } = await verifyRes.json();
  return verification_status === 'SUCCESS';
}

router.post('/stripe', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    return res.json({ received: true });
  }

  let event;
  try {
    event = getStripe().webhooks.constructEvent(req.body, sig, secret);
  } catch (err) {
    console.error('[webhook] Firma non valida:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object;
    const bookingId = parseInt(intent.metadata?.booking_id, 10);
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
        if (err.code !== 'NOT_FOUND') {
          console.error('[webhook] Errore conferma prenotazione:', err.message);
          return res.status(500).json({ error: 'Errore interno' });
        }
      }
    }
  }

  res.json({ received: true });
});

router.post('/paypal', async (req, res) => {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;

  if (!webhookId) return res.json({ received: true });

  let isValid;
  try {
    isValid = await verifyPayPalWebhook(req.headers, req.body);
  } catch (err) {
    console.error('[webhook/paypal] Errore verifica firma:', err.message);
    return res.status(500).json({ error: 'Errore verifica firma' });
  }
  if (!isValid) {
    return res.status(400).json({ error: 'Firma PayPal non valida' });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString());
  } catch (err) {
    return res.status(400).json({ error: 'Payload non valido' });
  }

  if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
    const bookingId = parseInt(event.resource?.custom_id, 10);
    if (bookingId) {
      try {
        const booking = await bookingService.confirm(bookingId, 'paypal', event.resource?.id);
        const fullBooking = await bookingService.getById(booking.id);
        req.app.get('io').to(`event:${booking.event_id}`).emit('seats:update', { eventId: booking.event_id });
        sendBookingConfirmation(
          fullBooking.user_email,
          fullBooking.user_nome,
          fullBooking,
          { titolo: fullBooking.evento_titolo, data_evento: fullBooking.data_evento }
        ).catch(err => console.error('[webhook/paypal] Email conferma fallita:', err.message));
      } catch (err) {
        if (err.code !== 'NOT_FOUND') {
          console.error('[webhook/paypal] Errore conferma prenotazione:', err.message);
          return res.status(500).json({ error: 'Errore interno' });
        }
      }
    }
  }

  res.json({ received: true });
});

module.exports = router;
