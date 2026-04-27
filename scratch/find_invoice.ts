import { AppDataSource } from '../src/config/data-source';

async function findInvoice() {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    const result = await AppDataSource.query(`
      SELECT invoice_number, invoice_date, net_payable, customer_name
      FROM sales_invoices 
      WHERE invoice_number LIKE '%535'
    `);

    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error);
  } finally {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  }
}
findInvoice();
