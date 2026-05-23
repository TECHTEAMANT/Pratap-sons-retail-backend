import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from './src/config/data-source';

async function checkSchema() {
  await initializeDatabase();
  const ds = AppDataSource;
  
  const res = await ds.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'barcode_batches'
  `);
  console.table(res);

  const sumRes = await ds.query(`SELECT SUM(quantity) as qty FROM barcode_batches WHERE status != 'deleted'`);
  console.log("Total quantity in barcode_batches:", sumRes[0]);

  await closeDatabase();
}
checkSchema().catch(console.error);
