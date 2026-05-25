import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';

async function testTotals() {
  await initializeDatabase();
  try {
    const res = await AppDataSource.query(`
      SELECT barcode_8digit, SUM(quantity) as qty
      FROM sales_return_items
      WHERE barcode_8digit NOT IN (SELECT barcode_8digit FROM sales_invoice_items)
      GROUP BY barcode_8digit
    `);
    console.log(res);
  } catch (err) {
    console.error(err);
  } finally {
    await closeDatabase();
  }
}
testTotals().catch(console.error);
