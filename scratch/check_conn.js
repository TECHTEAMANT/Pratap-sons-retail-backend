const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: 'postgres', // connect to postgres default
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function run() {
  try {
    const res = await pool.query(`
      SELECT pid, usename, client_addr
      FROM pg_stat_activity
      WHERE datname = 'invento_erp' AND pid <> pg_backend_pid();
    `);
    
    console.log("Active connections to invento_erp:", res.rows);
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
run();
