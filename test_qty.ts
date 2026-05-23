import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from './src/config/data-source';

async function testQty() {
  await initializeDatabase();
  const ds = AppDataSource;
  
  const sumRes = await ds.query("SELECT SUM(total_quantity) as qty FROM barcode_batches WHERE status != 'deleted'");
  console.log('Total total_quantity in barcode_batches:', sumRes[0].qty);
  
  const countRes = await ds.query("SELECT COUNT(*) as count FROM barcode_batches WHERE status != 'deleted'");
  console.log('Total rows in barcode_batches:', countRes[0].count);

  await closeDatabase();
}
testQty().catch(console.error);
