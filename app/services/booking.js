const db = require('../db');

async function createTemporary(userId, eventId, seatIds) {
  if (!Array.isArray(seatIds) || seatIds.length === 0) {
    throw Object.assign(new Error('Seleziona almeno un posto'), { code: 'NO_SEATS' });
  }

  const { rows: [event] } = await db.query(
    'SELECT * FROM events WHERE id = $1 AND pubblicato = TRUE AND prenotazioni_aperte = TRUE',
    [eventId]
  );
  if (!event) throw Object.assign(new Error('Evento non disponibile'), { code: 'EVENT_NOT_FOUND' });
  if (!event.layout_id) throw Object.assign(new Error('Evento senza planimetria'), { code: 'NO_LAYOUT' });

  if (seatIds.length > event.max_posti_per_utente) {
    throw Object.assign(
      new Error(`Massimo ${event.max_posti_per_utente} posti per utente`),
      { code: 'TOO_MANY_SEATS' }
    );
  }

  // No duplicate active booking for this user+event
  const { rows: existing } = await db.query(
    "SELECT id FROM bookings WHERE user_id=$1 AND event_id=$2 AND stato NOT IN ('annullata')",
    [userId, eventId]
  );
  if (existing.length > 0) {
    throw Object.assign(new Error('Hai già una prenotazione per questo evento'), { code: 'ALREADY_BOOKED' });
  }

  // All seats must belong to this event's layout
  const { rows: validSeats } = await db.query(
    `SELECT s.id, s.capienza FROM seats s
     WHERE s.id = ANY($1::int[]) AND s.layout_id = $2`,
    [seatIds, event.layout_id]
  );
  if (validSeats.length !== seatIds.length) {
    throw Object.assign(new Error('Posti non validi per questo evento'), { code: 'INVALID_SEATS' });
  }

  // No seat already booked for this event
  const { rows: conflicts } = await db.query(
    "SELECT id FROM bookings WHERE event_id=$1 AND stato NOT IN ('annullata') AND seat_ids && $2::int[]",
    [eventId, seatIds]
  );
  if (conflicts.length > 0) {
    throw Object.assign(new Error('Uno o più posti non disponibili'), { code: 'SEATS_UNAVAILABLE' });
  }

  const totalCapienza = validSeats.reduce((s, r) => s + r.capienza, 0);
  const importo = totalCapienza * parseFloat(event.costo_acconto);
  const scadenza = new Date(Date.now() + 15 * 60 * 1000);

  const { rows: [booking] } = await db.query(
    `INSERT INTO bookings (user_id, event_id, seat_ids, stato, importo, scadenza_timer)
     VALUES ($1, $2, $3, 'temporanea', $4, $5) RETURNING *`,
    [userId, eventId, seatIds, importo, scadenza]
  );
  return booking;
}

async function confirm(bookingId, paymentProvider, paymentId) {
  const { rows: [booking] } = await db.query(
    `UPDATE bookings
     SET stato='confermata', payment_provider=$2, payment_id=$3, scadenza_timer=NULL
     WHERE id=$1 AND stato IN ('temporanea','in_attesa')
     RETURNING *`,
    [bookingId, paymentProvider, paymentId]
  );
  if (!booking) throw Object.assign(new Error('Prenotazione non trovabile o già processata'), { code: 'NOT_FOUND' });
  return booking;
}

async function setInAttesa(bookingId) {
  const { rows: [booking] } = await db.query(
    "UPDATE bookings SET stato='in_attesa' WHERE id=$1 AND stato='temporanea' RETURNING *",
    [bookingId]
  );
  if (!booking) throw Object.assign(new Error('Prenotazione non in stato temporanea'), { code: 'WRONG_STATE' });
  return booking;
}

async function cancel(bookingId, userId) {
  const { rows: [booking] } = await db.query(
    "UPDATE bookings SET stato='annullata' WHERE id=$1 AND user_id=$2 AND stato NOT IN ('confermata','annullata') RETURNING *",
    [bookingId, userId]
  );
  if (!booking) throw Object.assign(new Error('Prenotazione non annullabile'), { code: 'NOT_CANCELLABLE' });
  return booking;
}

async function expireOld() {
  const { rows } = await db.query(
    `UPDATE bookings SET stato='annullata'
     WHERE stato='temporanea' AND scadenza_timer < NOW()
     RETURNING event_id`
  );
  return [...new Set(rows.map(r => r.event_id))]; // affected event IDs
}

async function getByUser(userId) {
  const { rows } = await db.query(
    `SELECT b.*, e.titolo AS evento_titolo, e.data_evento
     FROM bookings b JOIN events e ON b.event_id = e.id
     WHERE b.user_id = $1 ORDER BY b.created_at DESC`,
    [userId]
  );
  return rows;
}

async function getById(bookingId) {
  const { rows: [booking] } = await db.query(
    `SELECT b.*, e.titolo AS evento_titolo, e.data_evento, e.costo_acconto,
            u.email AS user_email, u.nome AS user_nome
     FROM bookings b
     JOIN events e ON b.event_id = e.id
     JOIN users u ON b.user_id = u.id
     WHERE b.id = $1`,
    [bookingId]
  );
  return booking || null;
}

module.exports = { createTemporary, confirm, setInAttesa, cancel, expireOld, getByUser, getById };
