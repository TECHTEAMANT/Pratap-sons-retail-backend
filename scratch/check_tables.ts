import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';

async function checkTables() {
  await initializeDatabase();
  const ds = AppDataSource;
  const res = await ds.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
  console.log(res.map(r => r.table_name).filter(n => n.includes('sale')));
  await closeDatabase();
}

checkTables().catch(console.error);
