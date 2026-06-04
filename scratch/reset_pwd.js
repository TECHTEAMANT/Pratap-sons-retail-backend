const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function run() {
  try {
    const hash = await bcrypt.hash('123456', 10);
    const res = await pool.query(`
      UPDATE users 
      SET password_hash = $1
      WHERE role IN ('Admin', 'Superadmin', 'Administrator');
    `, [hash]);
    
    console.log('Updated', res.rowCount, 'admin users with password 123456');
    
    const users = await pool.query(`SELECT name, mobile, role FROM users WHERE role IN ('Admin', 'Superadmin', 'Administrator');`);
    console.log(users.rows);
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
