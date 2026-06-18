process.env.SESSION_SECRET = 'test-secret-admin-orchidea-2026-long-enough';
process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_PORT = process.env.DB_PORT || '5432';
process.env.DB_NAME = process.env.DB_NAME || 'orchidea';
process.env.DB_USER = process.env.DB_USER || 'orchidea_user';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || '';
process.env.BASE_URL = 'http://localhost';

const request = require('supertest');
const bcrypt = require('bcrypt');
const { app, server } = require('../app/server');
const { pool } = require('../app/db');

const ADMIN_EMAIL = 'test-admin-piano2@orchidea-test.local';
const ADMIN_PASSWORD = 'TestAdmin2026!';

let p9UserId, p9EventId, p9LayoutId, p9SeatId;

beforeAll(async () => {
  await pool.query('DELETE FROM admins WHERE email = $1', [ADMIN_EMAIL]);
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  await pool.query('INSERT INTO admins (email, password_hash) VALUES ($1, $2)', [ADMIN_EMAIL, hash]);
});

beforeAll(async () => {
  const { rows: [lay] } = await pool.query("INSERT INTO layouts (nome) VALUES ('P9TestLayout') RETURNING id");
  p9LayoutId = lay.id;
  const { rows: [seat] } = await pool.query(
    "INSERT INTO seats (layout_id, tipo, pos_x, pos_y, capienza, etichetta) VALUES ($1,'posto_singolo',100,100,1,'P9S1') RETURNING id",
    [p9LayoutId]
  );
  p9SeatId = seat.id;
  const { rows: [ev] } = await pool.query(
    `INSERT INTO events (titolo, data_evento, layout_id, costo_acconto, max_posti_per_utente, prenotazioni_aperte, pubblicato)
     VALUES ('P9Event', NOW()+interval'30 days', $1, 10.00, 5, true, true) RETURNING id`,
    [p9LayoutId]
  );
  p9EventId = ev.id;
  const bcrypt = require('bcrypt');
  const hash = await bcrypt.hash('p9pass', 10);
  const { rows: [u] } = await pool.query(
    "INSERT INTO users (nome, cognome, email, telefono, password_hash, confermato) VALUES ('P9','User','p9-test@orchidea-test.local','0000000000',$1,true) RETURNING id",
    [hash]
  );
  p9UserId = u.id;
});

test('POST /admin/newsletter include newsletter_subscribers nei destinatari', async () => {
  await pool.query(
    "INSERT INTO newsletter_subscribers (email) VALUES ('nl-union-test@orchidea.local') ON CONFLICT DO NOTHING"
  );
  const agent = request.agent(app);
  await agent.post('/admin/login').type('form')
    .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  const res = await agent.post('/admin/newsletter').type('form')
    .send({ oggetto: 'Test UNION Piano6', corpo: '<p>Test body</p>' });
  expect(res.status).toBe(302);
  expect(res.headers.location).toContain('success=inviata');
  await pool.query("DELETE FROM newsletter_subscribers WHERE email='nl-union-test@orchidea.local'");
});

test('GET /admin/utenti con sessione restituisce 200', async () => {
  const agent = request.agent(app);
  await agent.post('/admin/login').type('form').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  const res = await agent.get('/admin/utenti');
  expect(res.status).toBe(200);
  expect(res.text).toContain('Utenti');
});

test('GET /admin/prenotazioni con sessione → 200 e contiene Prenotazioni', async () => {
  const agent = request.agent(app);
  await agent.post('/admin/login').type('form').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  const res = await agent.get('/admin/prenotazioni');
  expect(res.status).toBe(200);
  expect(res.text).toContain('Prenotazioni');
});

test('POST /admin/prenotazioni/:id/approva imposta stato confermata e redirige', async () => {
  const { rows: [b] } = await pool.query(
    `INSERT INTO bookings (user_id, event_id, seat_ids, stato, importo, payment_provider, scadenza_timer)
     VALUES ($1, $2, $3, 'in_attesa', 10.00, 'stripe', NOW()+interval'1 hour') RETURNING id`,
    [p9UserId, p9EventId, [p9SeatId]]
  );
  const agent = request.agent(app);
  await agent.post('/admin/login').type('form').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  const res = await agent.post(`/admin/prenotazioni/${b.id}/approva`);
  expect(res.status).toBe(302);
  expect(res.headers.location).toContain('/admin/prenotazioni');
  const { rows: [updated] } = await pool.query('SELECT stato FROM bookings WHERE id=$1', [b.id]);
  expect(updated.stato).toBe('confermata');
  await pool.query('DELETE FROM bookings WHERE id=$1', [b.id]);
});

test('POST /admin/prenotazioni/:id/rifiuta imposta stato annullata e redirige', async () => {
  const { rows: [b] } = await pool.query(
    `INSERT INTO bookings (user_id, event_id, seat_ids, stato, importo, payment_provider, scadenza_timer)
     VALUES ($1, $2, $3, 'in_attesa', 10.00, 'stripe', NOW()+interval'1 hour') RETURNING id`,
    [p9UserId, p9EventId, [p9SeatId]]
  );
  const agent = request.agent(app);
  await agent.post('/admin/login').type('form').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  const res = await agent.post(`/admin/prenotazioni/${b.id}/rifiuta`);
  expect(res.status).toBe(302);
  expect(res.headers.location).toContain('/admin/prenotazioni');
  const { rows: [updated] } = await pool.query('SELECT stato FROM bookings WHERE id=$1', [b.id]);
  expect(updated.stato).toBe('annullata');
  await pool.query('DELETE FROM bookings WHERE id=$1', [b.id]);
});

afterAll(async () => {
  await pool.query('DELETE FROM admins WHERE email = $1', [ADMIN_EMAIL]);
  if (p9EventId) {
    await pool.query('DELETE FROM bookings WHERE event_id=$1', [p9EventId]);
    await pool.query('DELETE FROM events WHERE id=$1', [p9EventId]);
    await pool.query('DELETE FROM seats WHERE id=$1', [p9SeatId]);
    await pool.query('DELETE FROM layouts WHERE id=$1', [p9LayoutId]);
    await pool.query("DELETE FROM users WHERE email='p9-test@orchidea-test.local'");
  }
  await new Promise(resolve => server.close(resolve));
  await pool.end();
});

test('GET /admin/login returns 200', async () => {
  const res = await request(app).get('/admin/login');
  expect(res.status).toBe(200);
});

test('GET /admin senza sessione redirige al login', async () => {
  const res = await request(app).get('/admin');
  expect(res.status).toBe(302);
  expect(res.headers.location).toBe('/admin/login');
});

test('POST /admin/login con credenziali errate redirige con errore', async () => {
  const res = await request(app)
    .post('/admin/login')
    .type('form')
    .send({ email: ADMIN_EMAIL, password: 'sbagliata' });
  expect(res.status).toBe(302);
  expect(res.headers.location).toContain('error=credenziali');
});

test('POST /admin/login con credenziali corrette redirige al dashboard', async () => {
  const res = await request(app)
    .post('/admin/login')
    .type('form')
    .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  expect(res.status).toBe(302);
  expect(res.headers.location).toBe('/admin');
});

test('GET /admin con sessione restituisce 200', async () => {
  const agent = request.agent(app);
  await agent.post('/admin/login').type('form').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  const res = await agent.get('/admin');
  expect(res.status).toBe(200);
  expect(res.text).toContain('Dashboard');
});

test('GET /admin/eventi con sessione restituisce 200', async () => {
  const agent = request.agent(app);
  await agent.post('/admin/login').type('form').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  const res = await agent.get('/admin/eventi');
  expect(res.status).toBe(200);
});

test('GET /admin/news con sessione restituisce 200', async () => {
  const agent = request.agent(app);
  await agent.post('/admin/login').type('form').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  const res = await agent.get('/admin/news');
  expect(res.status).toBe(200);
});

test('GET /admin/newsletter/iscritti con sessione restituisce 200', async () => {
  const agent = request.agent(app);
  await agent.post('/admin/login').type('form').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  const res = await agent.get('/admin/newsletter/iscritti');
  expect(res.status).toBe(200);
  expect(res.text).toContain('Iscritti');
});

test('POST /admin/layouts/:id/posti con tipo poltroncina_3 viene rifiutato (tipo rinominato)', async () => {
  const agent = request.agent(app);
  await agent.post('/admin/login').type('form').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  const { rows: [layout] } = await pool.query("INSERT INTO layouts (nome) VALUES ('test-layout-tipo') RETURNING id");
  const res = await agent.post(`/admin/layouts/${layout.id}/posti`).type('form').send({
    etichetta: 'T1', tipo: 'poltroncina_3', pos_x: '100', pos_y: '100', capienza: '3'
  });
  expect(res.status).toBe(302);
  expect(res.headers.location).toContain('error');
  await pool.query('DELETE FROM layouts WHERE id = $1', [layout.id]);
});

test('POST /admin/layouts/:id/posti con tipo poltroncina_2 viene accettato', async () => {
  const agent = request.agent(app);
  await agent.post('/admin/login').type('form').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  const { rows: [layout] } = await pool.query("INSERT INTO layouts (nome) VALUES ('test-layout-tipo2') RETURNING id");
  const res = await agent.post(`/admin/layouts/${layout.id}/posti`).type('form').send({
    etichetta: 'P1', tipo: 'poltroncina_2', pos_x: '100', pos_y: '100', capienza: '2'
  });
  expect(res.status).toBe(302);
  expect(res.headers.location).not.toContain('error');
  await pool.query('DELETE FROM layouts WHERE id = $1', [layout.id]);
});
