process.env.SESSION_SECRET = 'test-secret-auth-orchidea-2026-long-enough';
process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_PORT = process.env.DB_PORT || '5432';
process.env.DB_NAME = process.env.DB_NAME || 'orchidea';
process.env.DB_USER = process.env.DB_USER || 'orchidea_user';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || '';
process.env.BASE_URL = 'http://localhost';

const request = require('supertest');
const { app, server } = require('../app/server');
const { pool } = require('../app/db');

const TEST_EMAIL = 'test-auth-piano2@orchidea-test.local';

beforeAll(async () => {
  await pool.query('DELETE FROM users WHERE email = $1', [TEST_EMAIL]);
});

afterAll(async () => {
  await pool.query('DELETE FROM users WHERE email = $1', [TEST_EMAIL]);
  await pool.end();
  await new Promise(resolve => server.close(resolve));
});

test('GET /auth/registra returns 200', async () => {
  const res = await request(app).get('/auth/registra');
  expect(res.status).toBe(200);
  expect(res.text).toContain('Registrati');
});

test('GET /auth/login returns 200', async () => {
  const res = await request(app).get('/auth/login');
  expect(res.status).toBe(200);
  expect(res.text).toContain('Accedi');
});

test('POST /auth/registra con campi mancanti redirige con errore', async () => {
  const res = await request(app).post('/auth/registra').send('nome=Mario');
  expect(res.status).toBe(302);
  expect(res.headers.location).toContain('error=campi_mancanti');
});

test('POST /auth/registra con password corta redirige con errore', async () => {
  const res = await request(app)
    .post('/auth/registra')
    .type('form')
    .send({ nome: 'Mario', cognome: 'Rossi', email: TEST_EMAIL, telefono: '1234567890', password: 'abc' });
  expect(res.status).toBe(302);
  expect(res.headers.location).toContain('error=password_corta');
});

test('POST /auth/registra con dati validi redirige con success', async () => {
  const res = await request(app)
    .post('/auth/registra')
    .type('form')
    .send({ nome: 'Mario', cognome: 'Rossi', email: TEST_EMAIL, telefono: '1234567890', password: 'password123' });
  expect(res.status).toBe(302);
  expect(res.headers.location).toContain('success=email_inviata');
});

test('POST /auth/registra con email duplicata redirige con errore', async () => {
  const res = await request(app)
    .post('/auth/registra')
    .type('form')
    .send({ nome: 'Mario', cognome: 'Rossi', email: TEST_EMAIL, telefono: '1234567890', password: 'password123' });
  expect(res.status).toBe(302);
  expect(res.headers.location).toContain('error=email_esistente');
});

test('POST /auth/login con credenziali errate redirige con errore', async () => {
  const res = await request(app)
    .post('/auth/login')
    .type('form')
    .send({ email: TEST_EMAIL, password: 'sbagliata' });
  expect(res.status).toBe(302);
  expect(res.headers.location).toContain('error=credenziali');
});

test('POST /auth/login con account non confermato redirige con errore', async () => {
  const res = await request(app)
    .post('/auth/login')
    .type('form')
    .send({ email: TEST_EMAIL, password: 'password123' });
  expect(res.status).toBe(302);
  expect(res.headers.location).toContain('error=non_confermato');
});

test('GET /auth/conferma con token invalido mostra errore', async () => {
  const res = await request(app).get('/auth/conferma?token=token-fasullo');
  expect(res.status).toBe(200);
  expect(res.text).toContain('non valido');
});
