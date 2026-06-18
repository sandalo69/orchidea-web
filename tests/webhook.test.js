process.env.SESSION_SECRET = 'test-secret-webhook-orchidea-2026-long-enough';
process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_PORT = process.env.DB_PORT || '5432';
process.env.DB_NAME = process.env.DB_NAME || 'orchidea';
process.env.DB_USER = process.env.DB_USER || 'orchidea_user';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || '';
process.env.BASE_URL = 'http://localhost';

const WEBHOOK_SECRET = 'whsec_test1234567890abcdefabcdef1234567890ab';
process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;

const request = require('supertest');
const Stripe = require('stripe');
const _stripe = new Stripe('sk_test_stub_for_webhook_utils_only');
const { app, server } = require('../app/server');
const { pool } = require('../app/db');

test('sendAdminBookingAlert invia log senza SMTP_HOST', async () => {
  const { sendAdminBookingAlert } = require('../app/services/email');
  const booking = {
    id: 999,
    evento_titolo: 'Test Serata',
    user_nome: 'Mario',
    user_email: 'mario@test.it',
    importo: '25.00',
    seat_ids: [1, 2],
    data_evento: new Date('2026-07-01'),
    payment_provider: 'stripe',
  };
  delete process.env.SMTP_HOST;
  await expect(sendAdminBookingAlert(booking)).resolves.not.toThrow();
});

afterAll(async () => {
  await new Promise(resolve => server.close(resolve));
  await pool.end();
});

test('POST /webhook/stripe senza stripe-signature → 400', async () => {
  const payload = JSON.stringify({ type: 'payment_intent.created', data: { object: {} } });
  const res = await request(app)
    .post('/webhook/stripe')
    .set('Content-Type', 'application/json')
    .send(payload);
  expect(res.status).toBe(400);
});

test('POST /webhook/stripe con firma valida e evento non gestito → 200', async () => {
  const payload = JSON.stringify({ type: 'charge.updated', data: { object: {} } });
  const header = _stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  const res = await request(app)
    .post('/webhook/stripe')
    .set('Content-Type', 'application/json')
    .set('stripe-signature', header)
    .send(payload);
  expect(res.status).toBe(200);
  expect(res.body.received).toBe(true);
});

test('POST /webhook/stripe payment_intent.succeeded con booking inesistente → 200 (idempotente)', async () => {
  const payload = JSON.stringify({
    type: 'payment_intent.succeeded',
    data: { object: { id: 'pi_test_webhook_orchidea', metadata: { booking_id: '99999' } } },
  });
  const header = _stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  const res = await request(app)
    .post('/webhook/stripe')
    .set('Content-Type', 'application/json')
    .set('stripe-signature', header)
    .send(payload);
  expect(res.status).toBe(200);
  expect(res.body.received).toBe(true);
});

// ── PayPal ────────────────────────────────────────────────────────────────────

test('POST /webhook/paypal senza PAYPAL_WEBHOOK_ID → 200 (dev passthrough)', async () => {
  delete process.env.PAYPAL_WEBHOOK_ID;
  const res = await request(app)
    .post('/webhook/paypal')
    .set('Content-Type', 'application/json')
    .send(JSON.stringify({ event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: {} }));
  expect(res.status).toBe(200);
  expect(res.body.received).toBe(true);
});

test('POST /webhook/paypal con evento PAYMENT.CAPTURE.COMPLETED senza custom_id → 200', async () => {
  delete process.env.PAYPAL_WEBHOOK_ID;
  const res = await request(app)
    .post('/webhook/paypal')
    .set('Content-Type', 'application/json')
    .send(JSON.stringify({
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: { id: 'capture_test_123', custom_id: null },
    }));
  expect(res.status).toBe(200);
  expect(res.body.received).toBe(true);
});
