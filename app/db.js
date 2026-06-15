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

async function query(text, params) {
  const result = await pool.query(text, params);
  return result;
}

module.exports = { query, pool };
