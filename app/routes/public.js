const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const eventi = await db.query(
      `SELECT * FROM events WHERE pubblicato = TRUE AND data_evento > NOW()
       ORDER BY data_evento ASC LIMIT 3`
    );
    const news = await db.query(
      `SELECT * FROM news WHERE pubblicata = TRUE ORDER BY created_at DESC LIMIT 3`
    );
    res.render('public/home', { title: 'Home', eventi: eventi.rows, news: news.rows });
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
  res.render('public/contatti', { title: 'Contatti' });
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

module.exports = router;
