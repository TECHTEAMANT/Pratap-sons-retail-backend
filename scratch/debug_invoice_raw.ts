import { AppDataSource } from '../src/config/data-source';

async function inspectInvoice() {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    const invNum = 'INV2627000535';
    const result = await AppDataSource.query(`
      SELECT 
        si.*,
        (SELECT json_agg(items) FROM sales_invoice_items items WHERE items.invoice_id = si.id) as items,
        (SELECT json_agg(sr) FROM sales_returns sr WHERE sr.invoice_id = si.id OR sr.invoice_number = si.invoice_number) as returns
      FROM sales_invoices si
      WHERE si.invoice_number = $1
    `, [invNum]);

    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error);
  } finally {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  }
}
inspectInvoice();
