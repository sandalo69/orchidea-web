const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db = require('../db');
const verifyCaptcha = require('../middleware/captcha');
const { sendConfirmationEmail } = require('../services/email');

router.get('/registra', (req, res) => {
  res.render('public/registra', { title: 'Registrati', query: req.query });
});

router.post('/registra', verifyCaptcha, async (req, res, next) => {
  const { nome, cognome, email, telefono, password } = req.body;
  if (!nome || !cognome || !email || !telefono || !password) {
    return res.redirect('/auth/registra?error=campi_mancanti');
  }
  if (password.length < 8) {
    return res.redirect('/auth/registra?error=password_corta');
  }
  try {
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.redirect('/auth/registra?error=email_esistente');
    }
    const password_hash = await bcrypt.hash(password, 12);
    const token = crypto.randomBytes(32).toString('hex');
    const scadenza = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.query(
      `INSERT INTO users (nome, cognome, email, telefono, password_hash, token_conferma, token_conferma_scadenza)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [nome, cognome, email.toLowerCase(), telefono, password_hash, token, scadenza]
    );
    await sendConfirmationEmail(email, nome, token);
    res.redirect('/auth/registra?success=email_inviata');
  } catch (err) {
    next(err);
  }
});

router.get('/conferma', async (req, res, next) => {
  const { token } = req.query;
  if (!token) return res.render('public/conferma', { title: 'Conferma account', success: false });
  try {
    const { rows } = await db.query(
      `UPDATE users
       SET confermato = TRUE, token_conferma = NULL, token_conferma_scadenza = NULL
       WHERE token_conferma = $1 AND token_conferma_scadenza > NOW()
       RETURNING id`,
      [token]
    );
    res.render('public/conferma', { title: 'Conferma account', success: rows.length > 0 });
  } catch (err) {
    next(err);
  }
});

router.get('/login', (req, res) => {
  res.render('public/login', { title: 'Accedi', query: req.query });
});

router.post('/login', async (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password) return res.redirect('/auth/login?error=campi_mancanti');
  try {
    const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    const user = rows[0];
    if (!user || !await bcrypt.compare(password, user.password_hash)) {
      return res.redirect('/auth/login?error=credenziali');
    }
    if (!user.confermato) {
      return res.redirect('/auth/login?error=non_confermato');
    }
    req.session.userId = user.id;
    req.session.userName = user.nome;
    const returnTo = req.session.returnTo && req.session.returnTo.startsWith('/')
      ? req.session.returnTo
      : '/';
    delete req.session.returnTo;
    res.redirect(returnTo);
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

module.exports = router;
