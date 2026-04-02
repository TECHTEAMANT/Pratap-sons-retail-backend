import { initializeDatabase, closeDatabase, AppDataSource } from './src/config/data-source';
import dotenv from 'dotenv';
dotenv.config();

async function debugInvoice() {
  try {
    await initializeDatabase();
    const result = await AppDataSource.query(`
      SELECT 
        invoice_number, 
        additional_charges_total, 
        additional_charges_base, 
        net_payable, 
        amount_paid,
        total_mrp,
        special_discount
      FROM sales_invoices 
      WHERE invoice_number = 'INV2026000052'
    `);
    console.log('--- DEBUG INVOICE ---');
    console.log(JSON.stringify(result, null, 2));
    await closeDatabase();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

debugInvoice();
