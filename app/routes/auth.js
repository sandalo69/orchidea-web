const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db = require('../db');
const verifyCaptcha = require('../middleware/captcha');
const { sendConfirmationEmail, sendPasswordReset } = require('../services/email');

// Hash placeholder per prevenire timing attack su email inesistente
const DUMMY_HASH = '$2b$12$invalidhashpaddingtomatchbcryptcost12xx';

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
    const { rows } = await db.query(
      'SELECT id, nome, password_hash, confermato FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    const user = rows[0];
    // Sempre esegue bcrypt per prevenire timing attack su email enumeration
    const hashToCompare = user ? user.password_hash : DUMMY_HASH;
    const valid = await bcrypt.compare(password, hashToCompare);
    if (!user || !valid) {
      return res.redirect('/auth/login?error=credenziali');
    }
    if (!user.confermato) {
      return res.redirect('/auth/login?error=non_confermato');
    }
    req.session.userId = user.id;
    req.session.userName = user.nome;
    // Previene open redirect: rifiuta URL assoluti (// o http://)
    const rawReturn = req.session.returnTo;
    const returnTo = rawReturn && rawReturn.startsWith('/') && !rawReturn.startsWith('//')
      ? rawReturn
      : '/';
    delete req.session.returnTo;
    res.redirect(returnTo);
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('Errore distruzione sessione:', err.message);
    res.redirect('/');
  });
});

router.get('/password-reset', (req, res) => {
  res.render('public/password-reset', { title: 'Password dimenticata', query: req.query });
});

router.post('/password-reset', async (req, res, next) => {
  const email = (req.body.email || '').trim().toLowerCase().substring(0, 255);
  if (!email) return res.redirect('/auth/password-reset?error=campi_mancanti');
  try {
    const { rows: [user] } = await db.query(
      'SELECT id, nome FROM users WHERE email = $1 AND confermato = TRUE', [email]
    );
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const scadenza = new Date(Date.now() + 60 * 60 * 1000); // 1 ora
      await db.query(
        'UPDATE users SET password_reset_token = $1, password_reset_scadenza = $2 WHERE id = $3',
        [token, scadenza, user.id]
      );
      sendPasswordReset(email, user.nome, token)
        .catch(err => console.error('[auth] Email reset fallita:', err.message));
    }
    // Risposta identica per email esistente/inesistente → previene email enumeration
    res.redirect('/auth/password-reset?success=email_inviata');
  } catch (err) { next(err); }
});

router.get('/nuova-password', async (req, res, next) => {
  const token = (req.query.token || '').trim();
  if (!token) return res.redirect('/auth/password-reset?error=token_mancante');
  try {
    const { rows: [user] } = await db.query(
      'SELECT id FROM users WHERE password_reset_token = $1 AND password_reset_scadenza > NOW()',
      [token]
    );
    res.render('public/nuova-password', {
      title: 'Nuova password',
      valid: !!user,
      token: user ? token : '',
      query: req.query,
    });
  } catch (err) { next(err); }
});

router.post('/nuova-password', async (req, res, next) => {
  const token = (req.body.token || '').trim();
  const password = req.body.password || '';
  if (!token) return res.redirect('/auth/password-reset?error=token_mancante');
  if (password.length < 8) {
    return res.redirect(`/auth/nuova-password?token=${encodeURIComponent(token)}&error=password_corta`);
  }
  try {
    const { rows: [user] } = await db.query(
      'SELECT id FROM users WHERE password_reset_token = $1 AND password_reset_scadenza > NOW()',
      [token]
    );
    if (!user) {
      return res.render('public/nuova-password', { title: 'Nuova password', valid: false, token: '', query: {} });
    }
    const password_hash = await bcrypt.hash(password, 12);
    const { rows: [updated] } = await db.query(
      `UPDATE users SET password_hash = $1, password_reset_token = NULL, password_reset_scadenza = NULL
       WHERE id = $2 AND password_reset_token = $3
       RETURNING id`,
      [password_hash, user.id, token]
    );
    if (!updated) {
      return res.render('public/nuova-password', { title: 'Nuova password', valid: false, token: '', query: {} });
    }
    res.redirect('/auth/login?success=password_aggiornata');
  } catch (err) { next(err); }
});

module.exports = router;
