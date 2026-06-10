const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: 'postgres', // connect to default DB
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function run() {
  try {
    console.log("Renaming existing database...");
    
    // First terminate any hidden connections just in case
    await pool.query(`
      SELECT pg_terminate_backend(pid) 
      FROM pg_stat_activity 
      WHERE datname = 'invento_erp' AND pid <> pg_backend_pid();
    `);
    
    // Drop the backup if it already exists from a previous run
    await pool.query(`DROP DATABASE IF EXISTS invento_erp_bak;`);
    
    // Rename current to bak
    await pool.query(`ALTER DATABASE invento_erp RENAME TO invento_erp_bak;`);
    
    console.log("Creating fresh database...");
    // Create fresh
    await pool.query(`CREATE DATABASE invento_erp;`);
    
    console.log("Database reset complete.");
  } catch(e) {
    console.error("Error resetting database:", e);
  } finally {
    pool.end();
  }
}
run();
