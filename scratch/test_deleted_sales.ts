import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';

async function checkDeletedSales() {
  await initializeDatabase();
  try {
    const deletedSales = await AppDataSource.query(`
      WITH deleted_barcodes AS (
        SELECT bb.barcode_alias_8digit
        FROM barcode_batches bb
        WHERE bb.status = 'deleted' AND bb.barcode_alias_8digit IS NOT NULL
      )
      SELECT 
        (SELECT SUM(quantity) FROM sales_invoice_items sii WHERE sii.barcode_8digit IN (SELECT barcode_alias_8digit FROM deleted_barcodes)) as gross_sales,
        (SELECT SUM(quantity) FROM sales_return_items sri WHERE sri.barcode_8digit IN (SELECT barcode_alias_8digit FROM deleted_barcodes)) as sales_returns
    `);
    
    console.log("Deleted Barcode Sales details:", deletedSales);
    
  } catch (err) {
    console.error(err);
  } finally {
    await closeDatabase();
  }
}
checkDeletedSales().catch(console.error);
