import { AppDataSource } from '../src/config/data-source';

async function run() {
  try {
    await AppDataSource.initialize();
    
    // Check invoice total
    const invoice = await AppDataSource.query(`
      SELECT id, invoice_number, total_mrp, net_payable, amount_paid, payment_details 
      FROM sales_invoices 
      WHERE invoice_number = 'INV2026000088'
    `);
    
    // Check returns
    const returns = await AppDataSource.query(`
      SELECT return_number, return_date, total_return_amount 
      FROM sales_returns 
      WHERE invoice_number = 'INV2026000088'
    `);

    console.log("Invoice:", JSON.stringify(invoice, null, 2));
    console.log("Returns:", JSON.stringify(returns, null, 2));
  } catch(e) {
    console.error(e);
  } finally {
    if(AppDataSource.isInitialized) await AppDataSource.destroy();
  }
}
run();
