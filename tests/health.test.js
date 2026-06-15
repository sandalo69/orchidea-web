const request = require('supertest');

// Per i test usiamo variabili d'ambiente di test
process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_PORT = process.env.DB_PORT || '5432';
process.env.DB_NAME = process.env.DB_NAME || 'orchidea';
process.env.DB_USER = process.env.DB_USER || 'orchidea_user';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'change_me_strong_password';
process.env.SESSION_SECRET = 'test_secret_molto_lunga_per_i_test_1234567890';
process.env.NODE_ENV = 'test';

const { app, server } = require('../app/server');
const { pool } = require('../app/db');

afterAll(async () => {
  await pool.end();
  server.close();
});

describe('GET /health', () => {
  it('risponde 200 con status ok quando il DB è raggiungibile', async () => {
    const res = await request(app).get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('ok');
  });
});

describe('Route inesistente', () => {
  it('risponde 404 per URL non definiti', async () => {
    const res = await request(app).get('/questa-pagina-non-esiste');
    expect(res.statusCode).toBe(404);
  });
});
