const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/events/:id/seats', async (req, res, next) => {
  try {
    const eventId = parseInt(req.params.id, 10);
    if (!eventId) return res.json({ eventId: null, layoutId: null, seats: [] });

    const { rows: [event] } = await db.query(
      'SELECT id, layout_id FROM events WHERE id = $1 AND pubblicato = TRUE',
      [eventId]
    );
    if (!event || !event.layout_id) {
      return res.json({ eventId, layoutId: null, seats: [] });
    }

    const { rows: seats } = await db.query(
      `SELECT s.id, s.tipo, s.pos_x, s.pos_y, s.capienza, s.etichetta,
         CASE
           WHEN EXISTS (
             SELECT 1 FROM bookings b
             WHERE s.id = ANY(b.seat_ids)
               AND b.event_id = $1
               AND b.stato NOT IN ('annullata')
           ) THEN 'occupato'
           ELSE 'disponibile'
         END AS stato
       FROM seats s
       WHERE s.layout_id = $2
       ORDER BY s.etichetta`,
      [eventId, event.layout_id]
    );

    res.json({ eventId, layoutId: event.layout_id, seats });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
