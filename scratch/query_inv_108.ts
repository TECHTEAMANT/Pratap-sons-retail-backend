import { AppDataSource } from '../src/config/data-source';

async function run() {
  try {
    await AppDataSource.initialize();
    
    // Check invoice total
    const invoice = await AppDataSource.query(`
      SELECT id, invoice_number, invoice_date, total_mrp, net_payable, amount_paid, amount_pending, payment_details, total_discount, special_discount, voucher_discount
      FROM sales_invoices 
      WHERE invoice_number = 'INV2026000108'
    `);
    
    const invoiceId = invoice[0]?.id;

    // Check returns
    const returns = await AppDataSource.query(`
      SELECT return_number, return_date, total_return_amount 
      FROM sales_returns 
      WHERE invoice_id = $1
    `, [invoiceId]);
    
    // Check receipts
    const receipts = await AppDataSource.query(`
      SELECT r.receipt_number, r.receipt_date, ri.amount_paid, r.payment_mode
      FROM payment_receipt_items ri
      JOIN payment_receipts r ON r.id = ri.receipt_id
      WHERE ri.invoice_id = $1
    `, [invoiceId]);

    console.log("Invoice:", JSON.stringify(invoice, null, 2));
    console.log("Returns:", JSON.stringify(returns, null, 2));
    console.log("Receipts:", JSON.stringify(receipts, null, 2));
  } catch(e) {
    console.error(e);
  } finally {
    if(AppDataSource.isInitialized) await AppDataSource.destroy();
  }
}
run();
