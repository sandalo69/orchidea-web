require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const bcrypt = require('bcrypt');
const { pool } = require('../db');

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || !password.trim()) {
    console.error('Imposta ADMIN_EMAIL e ADMIN_PASSWORD (non vuota) in .env');
    process.exit(1);
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      `INSERT INTO admins (email, password_hash)
       VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [email, hash]
    );
    console.log(`Admin ${email} creato/aggiornato.`);
  } finally {
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
