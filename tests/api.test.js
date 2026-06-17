process.env.SESSION_SECRET = 'test-secret-api-orchidea-2026-long-enough';
process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_PORT = process.env.DB_PORT || '5432';
process.env.DB_NAME = process.env.DB_NAME || 'orchidea';
process.env.DB_USER = process.env.DB_USER || 'orchidea_user';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || '';

const request = require('supertest');
const { app, server } = require('../app/server');
const { pool } = require('../app/db');

afterAll(async () => {
  await pool.end();
  await new Promise(resolve => server.close(resolve));
});

test('GET /api/events/:id/seats senza evento restituisce seats vuoti', async () => {
  const res = await request(app).get('/api/events/999999/seats');
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('seats');
  expect(Array.isArray(res.body.seats)).toBe(true);
  expect(res.body.seats).toHaveLength(0);
});

test('GET /api/events/:id/seats restituisce struttura corretta per evento con layout', async () => {
  const { rows: [layout] } = await pool.query("INSERT INTO layouts (nome) VALUES ('TestLayout') RETURNING *");
  await pool.query(
    "INSERT INTO seats (layout_id, tipo, pos_x, pos_y, capienza, etichetta) VALUES ($1,'tavolo_tondo',100,100,4,'T1')",
    [layout.id]
  );
  const { rows: [evento] } = await pool.query(
    "INSERT INTO events (titolo, data_evento, layout_id, costo_acconto, prenotazioni_aperte, pubblicato) VALUES ('EvTest', NOW()+interval'7 days', $1, 10.00, true, true) RETURNING *",
    [layout.id]
  );

  const res = await request(app).get(`/api/events/${evento.id}/seats`);
  expect(res.status).toBe(200);
  expect(res.body.eventId).toBe(evento.id);
  expect(res.body.seats).toHaveLength(1);
  expect(res.body.seats[0]).toMatchObject({
    id: expect.any(Number),
    tipo: 'tavolo_tondo',
    pos_x: 100,
    pos_y: 100,
    capienza: 4,
    etichetta: 'T1',
    stato: 'disponibile',
  });

  // Cleanup
  await pool.query('DELETE FROM events WHERE id = $1', [evento.id]);
  await pool.query('DELETE FROM layouts WHERE id = $1', [layout.id]);
});
