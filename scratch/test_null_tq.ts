import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';

async function check() {
  await initializeDatabase();
  try {
    const ds = AppDataSource;
    const res = await ds.query('SELECT COUNT(*) FROM barcode_batches WHERE total_quantity IS NULL');
    console.log('Null total_quantity:', res);
  } catch (err) {
    console.error('Error:', err);
  }
  await closeDatabase();
}
check().catch(console.error);
