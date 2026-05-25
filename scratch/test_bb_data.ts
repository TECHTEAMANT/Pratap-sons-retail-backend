import { AppDataSource } from '../src/config/data-source';

async function test() {
  await AppDataSource.initialize();
  const res = await AppDataSource.query(`
    SELECT total_quantity, available_quantity, print_quantity, barcode_alias_8digit
    FROM barcode_batches
    LIMIT 5
  `);
  console.log(res);
  process.exit(0);
}
test();
