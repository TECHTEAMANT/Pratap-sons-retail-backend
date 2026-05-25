import { AppDataSource } from '../src/config/data-source';

async function test() {
  await AppDataSource.initialize();
  const res = await AppDataSource.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'barcode_batches'
  `);
  console.log(res);
  process.exit(0);
}
test();
