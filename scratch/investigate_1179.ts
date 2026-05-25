import { AppDataSource } from '../src/config/data-source';

async function test() {
  await AppDataSource.initialize();
  const res = await AppDataSource.query(`
    SELECT pr.return_number, pr.return_date, pri.quantity 
    FROM purchase_return_items pri 
    INNER JOIN purchase_returns pr ON pr.id = pri.return_id
    WHERE pri.barcode_id = '00001179'
  `);
  console.log(res);

  const bb = await AppDataSource.query(`
    SELECT * FROM barcode_batches WHERE barcode_alias_8digit = '00001179'
  `);
  console.log(bb);

  process.exit(0);
}
test();
