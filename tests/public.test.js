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
const bcrypt = require('bcrypt');

const ACCOUNT_EMAIL = 'account-test@orchidea-test.local';

beforeAll(async () => {
  await pool.query("DELETE FROM users WHERE email = $1", [ACCOUNT_EMAIL]);
});

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

test('newsletter-welcome.ejs renderizza senza errori con nome e senza nome', async () => {
  const ejs = require('ejs');
  const path = require('path');
  const templatePath = path.join(__dirname, '../app/views/emails/newsletter-welcome.ejs');

  const htmlConNome = await ejs.renderFile(templatePath, {
    nome: 'Giulia',
    baseUrl: 'http://localhost',
    unsubscribeLink: null,
  });
  expect(htmlConNome).toContain('Giulia');
  expect(htmlConNome).toContain('newsletter');
  expect(htmlConNome).toContain('Orchidea');

  const htmlSenzaNome = await ejs.renderFile(templatePath, {
    nome: '',
    baseUrl: 'http://localhost',
    unsubscribeLink: null,
  });
  expect(htmlSenzaNome).toContain('newsletter');
  expect(htmlSenzaNome).not.toContain('undefined');
});

test('POST /newsletter/subscribe genera unsubscribe_token nel DB', async () => {
  const email = 'unsub-token-test@orchidea-test.local';
  await pool.query("DELETE FROM newsletter_subscribers WHERE email = $1", [email]);
  await request(app).post('/newsletter/subscribe').type('form')
    .send({ email, nome: 'Test Unsub' });
  const { rows: [row] } = await pool.query(
    'SELECT unsubscribe_token FROM newsletter_subscribers WHERE email = $1', [email]
  );
  expect(row).toBeDefined();
  expect(row.unsubscribe_token).toBeTruthy();
  await pool.query("DELETE FROM newsletter_subscribers WHERE email = $1", [email]);
});

test('GET /newsletter/unsubscribe con token valido → 200 e rimozione dal DB', async () => {
  const email = 'unsub-valid-test@orchidea-test.local';
  const token = 'test-unsub-token-valid-' + Date.now();
  await pool.query(
    "INSERT INTO newsletter_subscribers (email, nome, unsubscribe_token) VALUES ($1, 'Test', $2) ON CONFLICT (email) DO UPDATE SET unsubscribe_token = $2",
    [email, token]
  );
  const res = await request(app).get(`/newsletter/unsubscribe?token=${token}`);
  expect(res.status).toBe(200);
  expect(res.text).toContain('disiscritto');
  const { rows } = await pool.query('SELECT id FROM newsletter_subscribers WHERE email = $1', [email]);
  expect(rows.length).toBe(0);
});

test('GET /newsletter/unsubscribe con token inesistente → 200 con messaggio not found', async () => {
  const res = await request(app).get('/newsletter/unsubscribe?token=nonexistent-token-xyz-999');
  expect(res.status).toBe(200);
  expect(res.text).toMatch(/non trovato|già disiscritto|non valido/i);
});

test('GET /account senza login → redirect a /auth/login', async () => {
  const res = await request(app).get('/account');
  expect(res.status).toBe(302);
  expect(res.headers.location).toContain('/auth/login');
});

test('GET /account con login → 200 e mostra profilo', async () => {
  const hash = await bcrypt.hash('AccPass123!', 12);
  await pool.query(
    `INSERT INTO users (nome, cognome, email, telefono, password_hash, confermato)
     VALUES ('Test', 'Account', $1, '3001111111', $2, TRUE)
     ON CONFLICT (email) DO NOTHING`,
    [ACCOUNT_EMAIL, hash]
  );
  const agent = request.agent(app);
  await agent.post('/auth/login').type('form').send({ email: ACCOUNT_EMAIL, password: 'AccPass123!' });
  const res = await agent.get('/account');
  expect(res.status).toBe(200);
  expect(res.text).toContain('Test');
});

test('POST /account/profilo aggiorna nome e telefono', async () => {
  const agent = request.agent(app);
  await agent.post('/auth/login').type('form').send({ email: ACCOUNT_EMAIL, password: 'AccPass123!' });
  const res = await agent.post('/account/profilo').type('form')
    .send({ nome: 'TestMod', cognome: 'AccountMod', telefono: '3009999999' });
  expect(res.status).toBe(302);
  expect(res.headers.location).toContain('success=profilo_aggiornato');
  const { rows: [user] } = await pool.query('SELECT nome, telefono FROM users WHERE email = $1', [ACCOUNT_EMAIL]);
  expect(user.nome).toBe('TestMod');
  expect(user.telefono).toBe('3009999999');
});

test('POST /account/password con password corrente sbagliata → errore', async () => {
  const agent = request.agent(app);
  await agent.post('/auth/login').type('form').send({ email: ACCOUNT_EMAIL, password: 'AccPass123!' });
  const res = await agent.post('/account/password').type('form')
    .send({ password_corrente: 'sbagliata', nuova_password: 'NuovaPass456!' });
  expect(res.status).toBe(302);
  expect(res.headers.location).toContain('error=password_corrente_errata');
});

test('POST /account/password con password corrente giusta → aggiornata', async () => {
  const agent = request.agent(app);
  await agent.post('/auth/login').type('form').send({ email: ACCOUNT_EMAIL, password: 'AccPass123!' });
  const res = await agent.post('/account/password').type('form')
    .send({ password_corrente: 'AccPass123!', nuova_password: 'NuovaPass456!' });
  expect(res.status).toBe(302);
  expect(res.headers.location).toContain('success=password_aggiornata');
  await pool.query('DELETE FROM users WHERE email = $1', [ACCOUNT_EMAIL]);
});
