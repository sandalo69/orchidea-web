const express = require('express');
const router = express.Router();
const db = require('../db');
const emailService = require('../services/email');
const crypto = require('crypto');

router.get('/', async (req, res, next) => {
  try {
    const eventi = await db.query(
      `SELECT * FROM events WHERE pubblicato = TRUE AND data_evento > NOW()
       ORDER BY data_evento ASC LIMIT 3`
    );
    const news = await db.query(
      `SELECT * FROM news WHERE pubblicata = TRUE ORDER BY created_at DESC LIMIT 3`
    );
    res.render('public/home', { title: 'Home', eventi: eventi.rows, news: news.rows, newsletter: req.query.newsletter || null });
  } catch (err) {
    next(err);
  }
});

router.get('/eventi', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM events WHERE pubblicato = TRUE ORDER BY data_evento ASC`
    );
    res.render('public/eventi', { title: 'Eventi', eventi: rows });
  } catch (err) {
    next(err);
  }
});

router.get('/eventi/:id', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM events WHERE id = $1 AND pubblicato = TRUE`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).render('public/404', { title: '404' });
    res.render('public/evento', { title: rows[0].titolo, evento: rows[0] });
  } catch (err) {
    next(err);
  }
});

router.get('/dj', async (req, res, next) => {
  try {
    const { rows } = await db.query(`SELECT * FROM dj_profiles ORDER BY ordine ASC`);
    res.render('public/dj', { title: 'DJ', djs: rows });
  } catch (err) {
    next(err);
  }
});

router.get('/galleria', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT g.*, e.titolo AS evento_titolo FROM gallery g
       LEFT JOIN events e ON g.event_id = e.id
       ORDER BY g.created_at DESC`
    );
    res.render('public/galleria', { title: 'Galleria', foto: rows });
  } catch (err) {
    next(err);
  }
});

router.get('/contatti', (req, res) => {
  res.render('public/contatti', { title: 'Contatti', query: req.query });
});

router.post('/contatti', async (req, res) => {
  const nome = (req.body.nome || '').trim().substring(0, 100);
  const email = (req.body.email || '').trim().substring(0, 255);
  const messaggio = (req.body.messaggio || '').trim().substring(0, 2000);
  const emailValida = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!nome || !email || !emailValida || !messaggio) {
    return res.redirect('/contatti?error=campi_mancanti');
  }
  emailService.sendContactMessage(nome, email, messaggio)
    .catch(err => console.error('[contatti]', err.message));
  res.redirect('/contatti?success=1');
});

router.get('/news', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM news WHERE pubblicata=TRUE ORDER BY created_at DESC'
    );
    res.render('public/news', { title: 'News', articoli: rows });
  } catch (err) { next(err); }
});

router.get('/news/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(404).render('public/404', { title: '404' });
    const { rows: [articolo] } = await db.query(
      'SELECT * FROM news WHERE id=$1 AND pubblicata=TRUE', [id]
    );
    if (!articolo) return res.status(404).render('public/404', { title: '404' });
    res.render('public/singola-news', { title: articolo.titolo, articolo });
  } catch (err) { next(err); }
});

router.post('/newsletter/subscribe', async (req, res, next) => {
  const email = (req.body.email || '').trim().toLowerCase().substring(0, 255);
  const nome = (req.body.nome || '').trim().substring(0, 100);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.redirect('/?newsletter=error');
  }
  try {
    const unsubscribeToken = crypto.randomBytes(32).toString('hex');
    const result = await db.query(
      'INSERT INTO newsletter_subscribers (email, nome, unsubscribe_token) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING',
      [email, nome || null, unsubscribeToken]
    );
    if (result.rowCount > 0) {
      emailService.sendNewsletterWelcome(nome, email, unsubscribeToken)
        .catch(err => console.error('[newsletter]', err.message));
    }
    res.redirect('/?newsletter=ok');
  } catch (err) { next(err); }
});

router.get('/newsletter/unsubscribe', async (req, res, next) => {
  const token = (req.query.token || '').trim();
  if (!token) {
    return res.render('public/newsletter-unsubscribe', {
      title: 'Disiscrizione newsletter',
      success: false,
      notFound: true,
    });
  }
  try {
    const result = await db.query(
      'DELETE FROM newsletter_subscribers WHERE unsubscribe_token = $1 RETURNING email',
      [token]
    );
    res.render('public/newsletter-unsubscribe', {
      title: 'Disiscrizione newsletter',
      success: result.rowCount > 0,
      notFound: result.rowCount === 0,
    });
  } catch (err) { next(err); }
});

module.exports = router;
