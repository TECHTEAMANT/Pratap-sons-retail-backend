import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';

async function checkColumns() {
  await initializeDatabase();
  const ds = AppDataSource;
  const res = await ds.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'sales_invoices'`);
  console.log(res);
  await closeDatabase();
}

checkColumns().catch(console.error);
