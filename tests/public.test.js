process.env.SESSION_SECRET = 'test-secret-public-orchidea-2026-long-enough';
process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_PORT = process.env.DB_PORT || '5432';
process.env.DB_NAME = process.env.DB_NAME || 'orchidea';
process.env.DB_USER = process.env.DB_USER || 'orchidea_user';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || '';
process.env.BASE_URL = 'http://localhost';

const request = require('supertest');
const { app, server } = require('../app/server');
const { pool } = require('../app/db');

afterAll(async () => {
  await new Promise(resolve => server.close(resolve));
  await pool.end();
});

test('GET / returns 200', async () => {
  const res = await request(app).get('/');
  expect(res.status).toBe(200);
  expect(res.text).toContain('Orchidea');
});

test('GET /eventi returns 200', async () => {
  const res = await request(app).get('/eventi');
  expect(res.status).toBe(200);
});

test('GET /dj returns 200', async () => {
  const res = await request(app).get('/dj');
  expect(res.status).toBe(200);
});

test('GET /galleria returns 200', async () => {
  const res = await request(app).get('/galleria');
  expect(res.status).toBe(200);
});

test('GET /contatti returns 200', async () => {
  const res = await request(app).get('/contatti');
  expect(res.status).toBe(200);
});

test('GET /eventi/99999 returns 404', async () => {
  const res = await request(app).get('/eventi/99999');
  expect(res.status).toBe(404);
});

test('GET /pagina-inesistente returns 404', async () => {
  const res = await request(app).get('/pagina-inesistente');
  expect(res.status).toBe(404);
});

test('GET /news ritorna 200', async () => {
  const res = await request(app).get('/news');
  expect(res.status).toBe(200);
  expect(res.text).toContain('News');
});

test('GET /news/:id con articolo inesistente ritorna 404', async () => {
  const res = await request(app).get('/news/99999');
  expect(res.status).toBe(404);
});

test('GET /news/:id con articolo pubblicato ritorna 200 e mostra contenuto', async () => {
  const { rows: [n] } = await pool.query(
    "INSERT INTO news (titolo, contenuto, pubblicata) VALUES ('TestNews Piano4', 'Testo test piano4', true) RETURNING *"
  );
  const res = await request(app).get(`/news/${n.id}`);
  expect(res.status).toBe(200);
  expect(res.text).toContain('TestNews Piano4');
  await pool.query('DELETE FROM news WHERE id=$1', [n.id]);
});

test('POST /contatti con dati validi redirige con success', async () => {
  const res = await request(app).post('/contatti').type('form')
    .send({ nome: 'Mario Rossi', email: 'mario@test.it', messaggio: 'Voglio informazioni.' });
  expect(res.status).toBe(302);
  expect(res.headers.location).toContain('success');
});

test('POST /contatti con dati mancanti redirige con error', async () => {
  const res = await request(app).post('/contatti').type('form')
    .send({ nome: '', email: 'mario@test.it', messaggio: '' });
  expect(res.status).toBe(302);
  expect(res.headers.location).toContain('error');
});

test('POST /newsletter/subscribe con email valida redirige con ok', async () => {
  await pool.query("DELETE FROM newsletter_subscribers WHERE email='nl-test@orchidea-test.local'");
  const res = await request(app).post('/newsletter/subscribe').type('form')
    .send({ email: 'nl-test@orchidea-test.local', nome: 'Test' });
  expect(res.status).toBe(302);
  expect(res.headers.location).toContain('newsletter=ok');
  await pool.query("DELETE FROM newsletter_subscribers WHERE email='nl-test@orchidea-test.local'");
});

test('POST /newsletter/subscribe con email duplicata non crasha', async () => {
  await pool.query(
    "INSERT INTO newsletter_subscribers (email) VALUES ('dup-nl@orchidea-test.local') ON CONFLICT DO NOTHING"
  );
  const res = await request(app).post('/newsletter/subscribe').type('form')
    .send({ email: 'dup-nl@orchidea-test.local', nome: '' });
  expect(res.status).toBe(302);
  expect(res.headers.location).toContain('newsletter=ok');
  await pool.query("DELETE FROM newsletter_subscribers WHERE email='dup-nl@orchidea-test.local'");
});
