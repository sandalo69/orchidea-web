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
const bcrypt = require('bcrypt');

const TEST_EMAIL = 'test-auth-piano2@orchidea-test.local';

beforeAll(async () => {
  await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [[
    TEST_EMAIL,
    'pw-reset-test@orchidea-test.local',
    'pw-newpass-test@orchidea-test.local',
  ]]);
});

test('GET /auth/password-reset ritorna 200', async () => {
  const res = await request(app).get('/auth/password-reset');
  expect(res.status).toBe(200);
  expect(res.text).toContain('password');
});

test('POST /auth/password-reset con email inesistente → 302 success (no email enumeration)', async () => {
  const res = await request(app).post('/auth/password-reset').type('form')
    .send({ email: 'nonexistent-reset@orchidea-test.local' });
  expect(res.status).toBe(302);
  expect(res.headers.location).toContain('success=email_inviata');
});

test('POST /auth/password-reset con email valida → token salvato nel DB', async () => {
  const email = 'pw-reset-test@orchidea-test.local';
  const hash = await bcrypt.hash('TestPass123!', 12);
  await pool.query(`
    INSERT INTO users (nome, cognome, email, telefono, password_hash, confermato)
    VALUES ('Test', 'Reset', $1, '3001234567', $2, TRUE)
    ON CONFLICT (email) DO NOTHING
  `, [email, hash]);
  const res = await request(app).post('/auth/password-reset').type('form').send({ email });
  expect(res.status).toBe(302);
  expect(res.headers.location).toContain('success=email_inviata');
  const { rows: [user] } = await pool.query('SELECT password_reset_token FROM users WHERE email = $1', [email]);
  expect(user.password_reset_token).not.toBeNull();
  await pool.query('DELETE FROM users WHERE email = $1', [email]);
});

test('GET /auth/nuova-password con token inesistente mostra stato scaduto', async () => {
  const res = await request(app).get('/auth/nuova-password?token=invalid-token-xyz-999');
  expect(res.status).toBe(200);
  expect(res.text).toMatch(/scaduto|non valido|link/i);
});

test('POST /auth/nuova-password con token valido aggiorna password → 302 login', async () => {
  const email = 'pw-newpass-test@orchidea-test.local';
  const hash = await bcrypt.hash('OldPass123!', 12);
  const resetToken = 'valid-reset-token-' + Date.now();
  const scadenza = new Date(Date.now() + 60 * 60 * 1000);
  await pool.query(`
    INSERT INTO users (nome, cognome, email, telefono, password_hash, confermato,
                       password_reset_token, password_reset_scadenza)
    VALUES ('Test', 'Newpass', $1, '3001234568', $2, TRUE, $3, $4)
    ON CONFLICT (email) DO UPDATE
      SET password_reset_token = $3, password_reset_scadenza = $4
  `, [email, hash, resetToken, scadenza]);
  const res = await request(app).post('/auth/nuova-password').type('form')
    .send({ token: resetToken, password: 'NewPass456!' });
  expect(res.status).toBe(302);
  expect(res.headers.location).toContain('password_aggiornata');
  const { rows: [user] } = await pool.query('SELECT password_reset_token FROM users WHERE email = $1', [email]);
  expect(user.password_reset_token).toBeNull();
  await pool.query('DELETE FROM users WHERE email = $1', [email]);
});

test('app/views/public/500.ejs renderizza senza errori', async () => {
  const ejs = require('ejs');
  const path = require('path');
  const html = await ejs.renderFile(
    path.join(__dirname, '../app/views/public/500.ejs'),
    { title: 'Errore del server' }
  );
  expect(html).toContain('500');
  expect(html).toContain('Orchidea');
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
