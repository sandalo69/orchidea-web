process.env.SESSION_SECRET = 'test-secret-booking-orchidea-2026-long-enough';
process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_PORT = process.env.DB_PORT || '5432';
process.env.DB_NAME = process.env.DB_NAME || 'orchidea';
process.env.DB_USER = process.env.DB_USER || 'orchidea_user';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || '';

const request = require('supertest');
const { app, server } = require('../app/server');
const { pool } = require('../app/db');
const bcrypt = require('bcrypt');

let testLayoutId, testEventId, testUserId, testSeatId;

beforeAll(async () => {
  const { rows: [layout] } = await pool.query("INSERT INTO layouts (nome) VALUES ('BookingTestLayout') RETURNING *");
  testLayoutId = layout.id;

  const { rows: [seat] } = await pool.query(
    "INSERT INTO seats (layout_id, tipo, pos_x, pos_y, capienza, etichetta) VALUES ($1,'poltroncina_2',200,200,2,'BT1') RETURNING *",
    [testLayoutId]
  );
  testSeatId = seat.id;

  const { rows: [event] } = await pool.query(
    `INSERT INTO events (titolo, data_evento, layout_id, costo_acconto, max_posti_per_utente, prenotazioni_aperte, pubblicato)
     VALUES ('BookingTestEvent', NOW()+interval'10 days', $1, 15.00, 5, true, true) RETURNING *`,
    [testLayoutId]
  );
  testEventId = event.id;

  const hash = await bcrypt.hash('testpass123', 10);
  const { rows: [user] } = await pool.query(
    `INSERT INTO users (nome, cognome, email, telefono, password_hash, confermato)
     VALUES ('Test','User','booking-test@orchidea-test.local','0000000000',$1,true) RETURNING *`,
    [hash]
  );
  testUserId = user.id;
});

afterAll(async () => {
  await pool.query("DELETE FROM bookings WHERE event_id = $1", [testEventId]);
  await pool.query("DELETE FROM events WHERE id = $1", [testEventId]);
  await pool.query("DELETE FROM layouts WHERE id = $1", [testLayoutId]);
  await pool.query("DELETE FROM users WHERE email = 'booking-test@orchidea-test.local'");
  await pool.end();
  await new Promise(resolve => server.close(resolve));
});

async function loginAsUser(agent) {
  await agent.post('/auth/login').type('form')
    .send({ email: 'booking-test@orchidea-test.local', password: 'testpass123' });
}

test('GET /prenota/:eventId senza login redirige a /auth/login', async () => {
  const res = await request(app).get(`/prenota/${testEventId}`);
  expect(res.status).toBe(302);
  expect(res.headers.location).toContain('/auth/login');
});

test('GET /prenota/:eventId con login mostra pagina selezione', async () => {
  const agent = request.agent(app);
  await loginAsUser(agent);
  const res = await agent.get(`/prenota/${testEventId}`);
  expect(res.status).toBe(200);
  expect(res.text).toContain('seat-map-svg');
  expect(res.text).toContain('booking-form');
});

test('POST /prenota/:eventId crea prenotazione temporanea e redirige a checkout', async () => {
  const agent = request.agent(app);
  await loginAsUser(agent);
  const res = await agent.post(`/prenota/${testEventId}`)
    .type('form').send({ seat_ids: String(testSeatId) });
  expect(res.status).toBe(302);
  expect(res.headers.location).toContain('/prenota/checkout/');
});

test('GET /prenota/checkout/:id mostra pagina checkout', async () => {
  const agent = request.agent(app);
  await loginAsUser(agent);
  await pool.query("DELETE FROM bookings WHERE user_id=$1 AND event_id=$2", [testUserId, testEventId]);
  const postRes = await agent.post(`/prenota/${testEventId}`)
    .type('form').send({ seat_ids: String(testSeatId) });
  const checkoutUrl = postRes.headers.location;
  const checkoutRes = await agent.get(checkoutUrl);
  expect(checkoutRes.status).toBe(200);
  expect(checkoutRes.text).toContain('Checkout');
  expect(checkoutRes.text).toContain('BookingTestEvent');
});

test('POST /prenota/:bookingId/annulla annulla prenotazione', async () => {
  const agent = request.agent(app);
  await loginAsUser(agent);
  await pool.query("DELETE FROM bookings WHERE user_id=$1 AND event_id=$2", [testUserId, testEventId]);
  const postRes = await agent.post(`/prenota/${testEventId}`)
    .type('form').send({ seat_ids: String(testSeatId) });
  const checkoutUrl = postRes.headers.location;
  const bookingId = checkoutUrl.split('/').pop();
  const cancelRes = await agent.post(`/prenota/${bookingId}/annulla`);
  expect(cancelRes.status).toBe(302);
  expect(cancelRes.headers.location).toContain('/prenota/mie');
  const { rows: [b] } = await pool.query("SELECT stato FROM bookings WHERE id=$1", [bookingId]);
  expect(b.stato).toBe('annullata');
});

test('GET /prenota/mie con login mostra le prenotazioni', async () => {
  const agent = request.agent(app);
  await loginAsUser(agent);
  await pool.query('DELETE FROM bookings WHERE user_id=$1 AND event_id=$2', [testUserId, testEventId]);
  const res = await agent.get('/prenota/mie');
  expect(res.status).toBe(200);
  expect(res.text.toLowerCase()).toContain('prenotazioni');
});

test('GET /prenota/conferma con bookingId valido mostra pagina confermata', async () => {
  const agent = request.agent(app);
  await loginAsUser(agent);
  await pool.query('DELETE FROM bookings WHERE user_id=$1 AND event_id=$2', [testUserId, testEventId]);
  const postRes = await agent.post(`/prenota/${testEventId}`)
    .type('form').send({ seat_ids: String(testSeatId) });
  const bookingId = postRes.headers.location.split('/').pop();
  const res = await agent.get(`/prenota/conferma?bookingId=${bookingId}`);
  expect(res.status).toBe(200);
  expect(res.text.toLowerCase()).toContain('confermata');
  await pool.query('DELETE FROM bookings WHERE id=$1', [bookingId]);
});
