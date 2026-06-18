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

beforeAll(async () => {
  await pool.query('DELETE FROM admins WHERE email = $1', [ADMIN_EMAIL]);
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  await pool.query('INSERT INTO admins (email, password_hash) VALUES ($1, $2)', [ADMIN_EMAIL, hash]);
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

afterAll(async () => {
  await pool.query('DELETE FROM admins WHERE email = $1', [ADMIN_EMAIL]);
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
