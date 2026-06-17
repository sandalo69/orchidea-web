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
  await pool.end();
  await new Promise(resolve => server.close(resolve));
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
