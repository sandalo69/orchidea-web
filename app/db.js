require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

pool.on('error', (err) => {
  console.error('Errore pool PostgreSQL:', err.message);
});

(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS newsletter_subscribers (
        id         SERIAL PRIMARY KEY,
        email      VARCHAR(255) UNIQUE NOT NULL,
        nome       VARCHAR(100),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(255)`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_scadenza TIMESTAMP`);
    await pool.query(`ALTER TABLE newsletter_subscribers ADD COLUMN IF NOT EXISTS unsubscribe_token VARCHAR(255) UNIQUE`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS consenso_privacy_at TIMESTAMP`);
    await pool.query(`ALTER TABLE newsletter_subscribers ADD COLUMN IF NOT EXISTS consenso_newsletter_at TIMESTAMP`);
    await pool.query(`ALTER TABLE seats DROP CONSTRAINT IF EXISTS seats_tipo_check`);
    await pool.query(`UPDATE seats SET tipo='poltroncina_2', capienza=2 WHERE tipo='poltroncina_3'`);
    await pool.query(`ALTER TABLE seats ADD CONSTRAINT seats_tipo_check CHECK (tipo IN ('tavolo_tondo', 'poltroncina_2', 'posto_singolo'))`);
  } catch (err) {
    console.error('[db] migration error:', err.message);
  }
})();

async function query(text, params) {
  const result = await pool.query(text, params);
  return result;
}

module.exports = { query, pool };
