const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const db = require('../db');
const requireAdmin = require('../middleware/adminAuth');
const { sendBulkNewsletter } = require('../services/email');

// Multer per upload immagini
const storage = multer.diskStorage({
  destination: path.join(__dirname, '../uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (['.jpg', '.jpeg', '.png', '.webp'].includes(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Solo immagini JPG, PNG, WEBP'));
    }
  },
});
fs.mkdirSync(path.join(__dirname, '../uploads'), { recursive: true });

// ── Login ──────────────────────────────────────────────────────────────────

router.get('/login', (req, res) => {
  if (req.session.adminId) return res.redirect('/admin');
  res.render('admin/login', { title: 'Admin Login', query: req.query });
});

router.post('/login', async (req, res, next) => {
  const { email, password } = req.body;
  try {
    const { rows } = await db.query('SELECT * FROM admins WHERE email = $1', [email]);
    const admin = rows[0];
    if (!admin || !await bcrypt.compare(password, admin.password_hash)) {
      return res.redirect('/admin/login?error=credenziali');
    }
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.adminId = admin.id;
      req.session.adminEmail = admin.email;
      res.redirect('/admin');
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('Errore distruzione sessione admin:', err.message);
    res.redirect('/admin/login');
  });
});

// ── Dashboard ──────────────────────────────────────────────────────────────

router.get('/', requireAdmin, async (req, res, next) => {
  try {
    const [utenti, eventi, prenotazioni, dj] = await Promise.all([
      db.query('SELECT COUNT(*) FROM users WHERE confermato = TRUE'),
      db.query('SELECT COUNT(*) FROM events'),
      db.query("SELECT COUNT(*) FROM bookings WHERE stato = 'confermata'"),
      db.query('SELECT COUNT(*) FROM dj_profiles'),
    ]);
    res.render('admin/dashboard', {
      title: 'Dashboard',
      active: 'dashboard',
      stats: {
        utenti: parseInt(utenti.rows[0].count),
        eventi: parseInt(eventi.rows[0].count),
        prenotazioni: parseInt(prenotazioni.rows[0].count),
        dj: parseInt(dj.rows[0].count),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── CRUD: Eventi ───────────────────────────────────────────────────────────

router.get('/eventi', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT e.*, l.nome AS layout_nome FROM events e
       LEFT JOIN layouts l ON e.layout_id = l.id
       ORDER BY e.data_evento DESC`
    );
    res.render('admin/eventi/lista', { title: 'Gestione eventi', active: 'eventi', eventi: rows });
  } catch (err) {
    next(err);
  }
});

router.get('/eventi/nuovo', requireAdmin, async (req, res, next) => {
  try {
    const { rows: layouts } = await db.query('SELECT id, nome FROM layouts ORDER BY nome');
    res.render('admin/eventi/form', { title: 'Nuovo evento', active: 'eventi', evento: null, layouts, query: req.query });
  } catch (err) {
    next(err);
  }
});

router.post('/eventi', requireAdmin, async (req, res, next) => {
  const { titolo, data_evento, descrizione, layout_id, costo_acconto, max_posti_per_utente } = req.body;
  const prenotazioni_aperte = req.body.prenotazioni_aperte === 'on';
  const pubblicato = req.body.pubblicato === 'on';
  try {
    await db.query(
      `INSERT INTO events (titolo, data_evento, descrizione, layout_id, costo_acconto, max_posti_per_utente, prenotazioni_aperte, pubblicato)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [titolo, data_evento, descrizione || null, layout_id || null, costo_acconto || 0, max_posti_per_utente || 10, prenotazioni_aperte, pubblicato]
    );
    res.redirect('/admin/eventi');
  } catch (err) {
    next(err);
  }
});

router.get('/eventi/:id/modifica', requireAdmin, async (req, res, next) => {
  try {
    const { rows: [evento] } = await db.query('SELECT * FROM events WHERE id = $1', [req.params.id]);
    if (!evento) return res.redirect('/admin/eventi');
    const { rows: layouts } = await db.query('SELECT id, nome FROM layouts ORDER BY nome');
    res.render('admin/eventi/form', { title: 'Modifica evento', active: 'eventi', evento, layouts, query: req.query });
  } catch (err) {
    next(err);
  }
});

router.post('/eventi/:id', requireAdmin, async (req, res, next) => {
  const { titolo, data_evento, descrizione, layout_id, costo_acconto, max_posti_per_utente } = req.body;
  const prenotazioni_aperte = req.body.prenotazioni_aperte === 'on';
  const pubblicato = req.body.pubblicato === 'on';
  try {
    await db.query(
      `UPDATE events SET titolo=$1, data_evento=$2, descrizione=$3, layout_id=$4,
       costo_acconto=$5, max_posti_per_utente=$6, prenotazioni_aperte=$7, pubblicato=$8
       WHERE id=$9`,
      [titolo, data_evento, descrizione || null, layout_id || null, costo_acconto, max_posti_per_utente, prenotazioni_aperte, pubblicato, req.params.id]
    );
    res.redirect('/admin/eventi');
  } catch (err) {
    next(err);
  }
});

router.post('/eventi/:id/elimina', requireAdmin, async (req, res, next) => {
  try {
    await db.query('DELETE FROM events WHERE id = $1', [req.params.id]);
    res.redirect('/admin/eventi');
  } catch (err) {
    next(err);
  }
});

// ── CRUD: Layouts ──────────────────────────────────────────────────────────

router.get('/layouts', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM layouts ORDER BY created_at DESC');
    res.render('admin/layouts/lista', { title: 'Planimetrie', active: 'layouts', layouts: rows });
  } catch (err) {
    next(err);
  }
});

router.get('/layouts/nuovo', requireAdmin, (req, res) => {
  res.render('admin/layouts/form', { title: 'Nuova planimetria', active: 'layouts', layout: null });
});

router.post('/layouts', requireAdmin, async (req, res, next) => {
  try {
    await db.query('INSERT INTO layouts (nome) VALUES ($1)', [req.body.nome]);
    res.redirect('/admin/layouts');
  } catch (err) {
    next(err);
  }
});

router.get('/layouts/:id/modifica', requireAdmin, async (req, res, next) => {
  try {
    const { rows: [layout] } = await db.query('SELECT * FROM layouts WHERE id = $1', [req.params.id]);
    if (!layout) return res.redirect('/admin/layouts');
    res.render('admin/layouts/form', { title: 'Modifica planimetria', active: 'layouts', layout });
  } catch (err) {
    next(err);
  }
});

router.post('/layouts/:id', requireAdmin, async (req, res, next) => {
  try {
    await db.query('UPDATE layouts SET nome=$1 WHERE id=$2', [req.body.nome, req.params.id]);
    res.redirect('/admin/layouts');
  } catch (err) {
    next(err);
  }
});

router.post('/layouts/:id/elimina', requireAdmin, async (req, res, next) => {
  try {
    await db.query('DELETE FROM layouts WHERE id = $1', [req.params.id]);
    res.redirect('/admin/layouts');
  } catch (err) {
    next(err);
  }
});

// ── Layouts: gestione posti ─────────────────────────────────────────────────

router.get('/layouts/:id/posti', requireAdmin, async (req, res, next) => {
  try {
    const { rows: [layout] } = await db.query('SELECT * FROM layouts WHERE id = $1', [req.params.id]);
    if (!layout) return res.redirect('/admin/layouts');
    const { rows: seats } = await db.query(
      'SELECT * FROM seats WHERE layout_id = $1 ORDER BY etichetta',
      [req.params.id]
    );
    res.render('admin/layouts/posti', { title: `Posti — ${layout.nome}`, active: 'layouts', layout, seats, query: req.query });
  } catch (err) { next(err); }
});

router.post('/layouts/:id/posti', requireAdmin, async (req, res, next) => {
  const TIPI = ['tavolo_tondo', 'poltroncina_2', 'posto_singolo'];
  const etichetta = (req.body.etichetta || '').trim();
  const tipo = req.body.tipo;
  const x = parseInt(req.body.pos_x, 10);
  const y = parseInt(req.body.pos_y, 10);
  const cap = parseInt(req.body.capienza, 10);

  if (!etichetta || !TIPI.includes(tipo) || isNaN(x) || isNaN(y) || isNaN(cap)
      || x < 0 || x > 800 || y < 0 || y > 600 || cap < 1 || cap > 20) {
    return res.redirect(`/admin/layouts/${req.params.id}/posti?error=campi_mancanti`);
  }
  try {
    const { rows: [layout] } = await db.query('SELECT id FROM layouts WHERE id = $1', [req.params.id]);
    if (!layout) return res.redirect('/admin/layouts');
    await db.query(
      'INSERT INTO seats (layout_id, tipo, pos_x, pos_y, capienza, etichetta) VALUES ($1,$2,$3,$4,$5,$6)',
      [req.params.id, tipo, x, y, cap, etichetta]
    );
    res.redirect(`/admin/layouts/${req.params.id}/posti?success=aggiunto`);
  } catch (err) { next(err); }
});

router.post('/layouts/:id/posti/:seatId/elimina', requireAdmin, async (req, res, next) => {
  try {
    const result = await db.query('DELETE FROM seats WHERE id = $1 AND layout_id = $2', [req.params.seatId, req.params.id]);
    if (result.rowCount === 0) {
      return res.redirect(`/admin/layouts/${req.params.id}/posti?error=posto_non_trovato`);
    }
    res.redirect(`/admin/layouts/${req.params.id}/posti`);
  } catch (err) { next(err); }
});

// ── CRUD: DJ ───────────────────────────────────────────────────────────────

router.get('/dj', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM dj_profiles ORDER BY ordine ASC');
    res.render('admin/dj/lista', { title: 'Gestione DJ', active: 'dj', djs: rows });
  } catch (err) {
    next(err);
  }
});

router.get('/dj/nuovo', requireAdmin, (req, res) => {
  res.render('admin/dj/form', { title: 'Nuovo DJ', active: 'dj', dj: null });
});

router.post('/dj', requireAdmin, upload.single('foto'), async (req, res, next) => {
  const { nome, bio, ordine } = req.body;
  const foto_path = req.file ? req.file.filename : null;
  try {
    await db.query(
      'INSERT INTO dj_profiles (nome, bio, foto_path, ordine) VALUES ($1, $2, $3, $4)',
      [nome, bio || null, foto_path, ordine || 0]
    );
    res.redirect('/admin/dj');
  } catch (err) {
    next(err);
  }
});

router.get('/dj/:id/modifica', requireAdmin, async (req, res, next) => {
  try {
    const { rows: [dj] } = await db.query('SELECT * FROM dj_profiles WHERE id = $1', [req.params.id]);
    if (!dj) return res.redirect('/admin/dj');
    res.render('admin/dj/form', { title: 'Modifica DJ', active: 'dj', dj });
  } catch (err) {
    next(err);
  }
});

router.post('/dj/:id', requireAdmin, upload.single('foto'), async (req, res, next) => {
  const { nome, bio, ordine } = req.body;
  try {
    if (req.file) {
      await db.query(
        'UPDATE dj_profiles SET nome=$1, bio=$2, foto_path=$3, ordine=$4 WHERE id=$5',
        [nome, bio || null, req.file.filename, ordine || 0, req.params.id]
      );
    } else {
      await db.query(
        'UPDATE dj_profiles SET nome=$1, bio=$2, ordine=$3 WHERE id=$4',
        [nome, bio || null, ordine || 0, req.params.id]
      );
    }
    res.redirect('/admin/dj');
  } catch (err) {
    next(err);
  }
});

router.post('/dj/:id/elimina', requireAdmin, async (req, res, next) => {
  try {
    await db.query('DELETE FROM dj_profiles WHERE id = $1', [req.params.id]);
    res.redirect('/admin/dj');
  } catch (err) {
    next(err);
  }
});

// ── CRUD: Galleria ─────────────────────────────────────────────────────────

router.get('/galleria', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT g.*, e.titolo AS evento_titolo FROM gallery g
       LEFT JOIN events e ON g.event_id = e.id
       ORDER BY g.created_at DESC`
    );
    res.render('admin/galleria/lista', { title: 'Galleria', active: 'galleria', foto: rows });
  } catch (err) {
    next(err);
  }
});

router.get('/galleria/nuovo', requireAdmin, async (req, res, next) => {
  try {
    const { rows: eventi } = await db.query('SELECT id, titolo FROM events ORDER BY data_evento DESC');
    res.render('admin/galleria/form', { title: 'Aggiungi foto', active: 'galleria', foto: null, eventi, query: req.query });
  } catch (err) {
    next(err);
  }
});

router.post('/galleria', requireAdmin, (req, res, next) => {
  upload.array('foto', 200)(req, res, err => {
    if (err) return next(err);
    next();
  });
}, async (req, res, next) => {
  if (!req.files || req.files.length === 0) return res.redirect('/admin/galleria/nuovo?error=no_file');
  const { didascalia, event_id } = req.body;
  try {
    for (const file of req.files) {
      await db.query(
        'INSERT INTO gallery (foto_path, didascalia, event_id) VALUES ($1, $2, $3)',
        [file.filename, didascalia || null, event_id || null]
      );
    }
    res.redirect('/admin/galleria');
  } catch (err) {
    next(err);
  }
});

router.get('/galleria/:id/modifica', requireAdmin, async (req, res, next) => {
  try {
    const { rows: [foto] } = await db.query('SELECT * FROM gallery WHERE id = $1', [req.params.id]);
    if (!foto) return res.redirect('/admin/galleria');
    const { rows: eventi } = await db.query('SELECT id, titolo FROM events ORDER BY data_evento DESC');
    res.render('admin/galleria/form', { title: 'Modifica foto', active: 'galleria', foto, eventi, query: req.query });
  } catch (err) {
    next(err);
  }
});

router.post('/galleria/:id', requireAdmin, upload.single('foto'), async (req, res, next) => {
  const { didascalia, event_id } = req.body;
  try {
    if (req.file) {
      await db.query(
        'UPDATE gallery SET foto_path=$1, didascalia=$2, event_id=$3 WHERE id=$4',
        [req.file.filename, didascalia || null, event_id || null, req.params.id]
      );
    } else {
      await db.query(
        'UPDATE gallery SET didascalia=$1, event_id=$2 WHERE id=$3',
        [didascalia || null, event_id || null, req.params.id]
      );
    }
    res.redirect('/admin/galleria');
  } catch (err) {
    next(err);
  }
});

router.post('/galleria/:id/elimina', requireAdmin, async (req, res, next) => {
  try {
    await db.query('DELETE FROM gallery WHERE id = $1', [req.params.id]);
    res.redirect('/admin/galleria');
  } catch (err) {
    next(err);
  }
});

router.post('/galleria/elimina-bulk', requireAdmin, async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : req.body.ids ? [req.body.ids] : [];
    if (ids.length > 0) {
      await db.query(`DELETE FROM gallery WHERE id = ANY($1::int[])`, [ids]);
    }
    res.redirect('/admin/galleria');
  } catch (err) {
    next(err);
  }
});

// ── CRUD: News ─────────────────────────────────────────────────────────────

router.get('/news', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM news ORDER BY created_at DESC');
    res.render('admin/news/lista', { title: 'Gestione news', active: 'news', notizie: rows });
  } catch (err) {
    next(err);
  }
});

router.get('/news/nuovo', requireAdmin, (req, res) => {
  res.render('admin/news/form', { title: 'Nuova news', active: 'news', notizia: null });
});

router.post('/news', requireAdmin, async (req, res, next) => {
  const { titolo, contenuto } = req.body;
  const pubblicata = req.body.pubblicata === 'on';
  try {
    await db.query('INSERT INTO news (titolo, contenuto, pubblicata) VALUES ($1, $2, $3)', [titolo, contenuto, pubblicata]);
    res.redirect('/admin/news');
  } catch (err) {
    next(err);
  }
});

router.get('/news/:id/modifica', requireAdmin, async (req, res, next) => {
  try {
    const { rows: [notizia] } = await db.query('SELECT * FROM news WHERE id = $1', [req.params.id]);
    if (!notizia) return res.redirect('/admin/news');
    res.render('admin/news/form', { title: 'Modifica news', active: 'news', notizia });
  } catch (err) {
    next(err);
  }
});

router.post('/news/:id', requireAdmin, async (req, res, next) => {
  const { titolo, contenuto } = req.body;
  const pubblicata = req.body.pubblicata === 'on';
  try {
    await db.query('UPDATE news SET titolo=$1, contenuto=$2, pubblicata=$3 WHERE id=$4', [titolo, contenuto, pubblicata, req.params.id]);
    res.redirect('/admin/news');
  } catch (err) {
    next(err);
  }
});

router.post('/news/:id/elimina', requireAdmin, async (req, res, next) => {
  try {
    await db.query('DELETE FROM news WHERE id = $1', [req.params.id]);
    res.redirect('/admin/news');
  } catch (err) {
    next(err);
  }
});

// ── Prenotazioni ───────────────────────────────────────────────────────────

router.get('/prenotazioni', requireAdmin, async (req, res, next) => {
  const eventId = req.query.evento;
  try {
    const { rows: eventi } = await db.query('SELECT id, titolo FROM events ORDER BY data_evento DESC');
    let prenotazioni = [];
    if (eventId) {
      const { rows } = await db.query(
        `SELECT b.*, u.nome, u.cognome, u.email, e.titolo AS evento_titolo
         FROM bookings b
         JOIN users u ON b.user_id = u.id
         JOIN events e ON b.event_id = e.id
         WHERE b.event_id = $1
         ORDER BY b.created_at DESC`,
        [eventId]
      );
      prenotazioni = rows;
    }
    res.render('admin/prenotazioni/lista', {
      title: 'Prenotazioni',
      active: 'prenotazioni',
      prenotazioni,
      eventi,
      eventoSelezionato: eventId || null,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/prenotazioni/:id/approva', requireAdmin, async (req, res, next) => {
  try {
    await db.query("UPDATE bookings SET stato = 'confermata' WHERE id = $1", [req.params.id]);
    res.redirect('/admin/prenotazioni');
  } catch (err) {
    next(err);
  }
});

router.post('/prenotazioni/:id/rifiuta', requireAdmin, async (req, res, next) => {
  try {
    await db.query("UPDATE bookings SET stato = 'annullata' WHERE id = $1", [req.params.id]);
    res.redirect('/admin/prenotazioni');
  } catch (err) {
    next(err);
  }
});

// ── Newsletter ─────────────────────────────────────────────────────────────

router.get('/newsletter/iscritti', requireAdmin, async (req, res, next) => {
  try {
    const { rows: iscritti } = await db.query(
      'SELECT id, email, nome, created_at FROM newsletter_subscribers ORDER BY created_at DESC'
    );
    res.render('admin/newsletter/iscritti', {
      title: 'Iscritti newsletter',
      active: 'newsletter',
      iscritti,
    });
  } catch (err) { next(err); }
});

router.get('/newsletter', requireAdmin, (req, res) => {
  res.render('admin/newsletter/form', { title: 'Newsletter', active: 'newsletter', query: req.query });
});

router.post('/newsletter', requireAdmin, async (req, res, next) => {
  const { oggetto, corpo } = req.body;
  try {
    const { rows: recipients } = await db.query(
      'SELECT email FROM users WHERE confermato = TRUE UNION SELECT email FROM newsletter_subscribers'
    );
    const count = await sendBulkNewsletter(oggetto, corpo, recipients);
    await db.query(
      'INSERT INTO newsletter_sends (oggetto, corpo, destinatari) VALUES ($1, $2, $3)',
      [oggetto, corpo, count]
    );
    res.redirect('/admin/newsletter?success=inviata&count=' + count);
  } catch (err) {
    next(err);
  }
});

// ── Utenti ─────────────────────────────────────────────────────────────────

router.get('/utenti', requireAdmin, async (req, res, next) => {
  try {
    const { rows: utenti } = await db.query(
      `SELECT id, nome, cognome, email, telefono, confermato, created_at
       FROM users ORDER BY created_at DESC`
    );
    res.render('admin/utenti/lista', { title: 'Utenti', active: 'utenti', utenti });
  } catch (err) { next(err); }
});

router.get('/utenti/:id/modifica', requireAdmin, async (req, res, next) => {
  try {
    const { rows: [utente] } = await db.query(
      `SELECT id, nome, cognome, email, telefono, confermato FROM users WHERE id=$1`, [req.params.id]
    );
    if (!utente) return res.redirect('/admin/utenti');
    res.render('admin/utenti/modifica', { title: 'Modifica utente', active: 'utenti', utente, success: req.query.success });
  } catch (err) { next(err); }
});

router.post('/utenti/:id', requireAdmin, async (req, res, next) => {
  try {
    const { nome, cognome, email, telefono, confermato, password } = req.body;
    await db.query(
      `UPDATE users SET nome=$1, cognome=$2, email=$3, telefono=$4, confermato=$5 WHERE id=$6`,
      [nome.trim(), cognome.trim(), email.trim(), telefono.trim(), confermato === 'on', req.params.id]
    );
    if (password && password.trim().length >= 6) {
      const bcrypt = require('bcrypt');
      const hash = await bcrypt.hash(password.trim(), 10);
      await db.query(`UPDATE users SET password_hash=$1 WHERE id=$2`, [hash, req.params.id]);
    }
    res.redirect(`/admin/utenti/${req.params.id}/modifica?success=1`);
  } catch (err) { next(err); }
});

router.post('/utenti/:id/elimina', requireAdmin, async (req, res, next) => {
  try {
    await db.query(`DELETE FROM bookings WHERE user_id=$1`, [req.params.id]);
    await db.query(`DELETE FROM users WHERE id=$1`, [req.params.id]);
    res.redirect('/admin/utenti');
  } catch (err) { next(err); }
});

module.exports = router;
