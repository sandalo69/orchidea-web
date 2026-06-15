require('dotenv').config();

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET environment variable is required');
}

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const helmet = require('helmet');
const session = require('express-session');
const ConnectPgSimple = require('connect-pg-simple');
const rateLimit = require('express-rate-limit');
const { pool } = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: false },
});

// Trust nginx reverse proxy
app.set('trust proxy', 1);

// Sicurezza HTTP headers
app.use(helmet({ contentSecurityPolicy: false }));

// Rate limiting globale
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
}));

// Sessioni con store su PostgreSQL
const PgSession = ConnectPgSimple(session);
app.use(session({
  store: new PgSession({
    pool,
    createTableIfMissing: true,
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));

// Parsing body
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// File statici
app.use(express.static(path.join(__dirname, 'public')));

// Template engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Rende io disponibile nei route handlers
app.set('io', io);

// ── Route ──────────────────────────────────────────────────
// Health check (usato da Docker e per i test)
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'error', db: err.message });
  }
});

// Le route vere vengono aggiunte nei Piani 2 e 3
// app.use('/', require('./routes/public'));
// app.use('/auth', require('./routes/auth'));
// app.use('/admin', require('./routes/admin'));
// app.use('/prenota', require('./routes/booking'));

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Errore interno del server' });
});

// ── Socket.io ──────────────────────────────────────────────
// La logica completa viene aggiunta nel Piano 3
io.on('connection', (socket) => {
  socket.on('disconnect', () => {});
});

// ── Avvio ─────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT, 10) || 3000;

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Orchidea server avviato su porta ${PORT}`);
  });
}

module.exports = { app, server, io };
