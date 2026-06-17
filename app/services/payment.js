const Stripe = require('stripe');
const paypal = require('@paypal/checkout-server-sdk');

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw Object.assign(new Error('STRIPE_SECRET_KEY non configurato'), { code: 'NO_STRIPE_KEY' });
  }
  return Stripe(process.env.STRIPE_SECRET_KEY);
}

function getPayPalClient() {
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_SECRET;
  if (!id || !secret) {
    throw Object.assign(new Error('Credenziali PayPal non configurate'), { code: 'NO_PAYPAL_KEY' });
  }
  const env = process.env.PAYPAL_MODE === 'live'
    ? new paypal.core.LiveEnvironment(id, secret)
    : new paypal.core.SandboxEnvironment(id, secret);
  return new paypal.core.PayPalHttpClient(env);
}

async function createStripeIntent(bookingId, amountEur, returnUrl) {
  const stripe = getStripe();
  return stripe.paymentIntents.create({
    amount: Math.round(amountEur * 100),
    currency: 'eur',
    automatic_payment_methods: { enabled: true },
    metadata: { booking_id: String(bookingId) },
    return_url: returnUrl,
  });
}

async function retrieveStripeIntent(paymentIntentId) {
  return getStripe().paymentIntents.retrieve(paymentIntentId);
}

async function createPayPalOrder(bookingId, amountEur) {
  const client = getPayPalClient();
  const request = new paypal.orders.OrdersCreateRequest();
  request.prefer('return=representation');
  request.requestBody({
    intent: 'CAPTURE',
    purchase_units: [{
      amount: { currency_code: 'EUR', value: amountEur.toFixed(2) },
      custom_id: String(bookingId),
    }],
  });
  const response = await client.execute(request);
  return response.result;
}

async function capturePayPalOrder(orderId) {
  const client = getPayPalClient();
  const request = new paypal.orders.OrdersCaptureRequest(orderId);
  request.prefer('return=representation');
  const response = await client.execute(request);
  return response.result;
}

module.exports = { createStripeIntent, retrieveStripeIntent, createPayPalOrder, capturePayPalOrder };
