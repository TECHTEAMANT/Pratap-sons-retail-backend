
require('dotenv').config({ path: './backend/Pratap-sons-retail-backend/.env' });
const { AppDataSource } = require('./backend/Pratap-sons-retail-backend/dist/config/data-source');
const { SalesInvoice } = require('./backend/Pratap-sons-retail-backend/dist/entities/SalesInvoice');

async function audit() {
  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository(SalesInvoice);
  
  // Find invoices where amount_pending + amount_paid != net_payable
  const invoices = await repo.find({
    relations: ['receipt_items', 'receipt_items.receipt']
  });
  
  console.log('Total Invoices:', invoices.length);
  
  const discrepancies = invoices.filter(inv => {
    const diff = Math.abs(Number(inv.net_payable) - (Number(inv.amount_paid) + Number(inv.amount_pending)));
    return diff > 1;
  });
  
  console.log('Discrepancies found:', discrepancies.length);
  discrepancies.forEach(inv => {
    console.log(`Invoice ${inv.invoice_number}: Net=${inv.net_payable}, Paid=${inv.amount_paid}, Pending=${inv.amount_pending}`);
  });

  // Specifically check for invoices with duplicate payments (Advance + Receipt)
  const duplicates = invoices.filter(inv => {
    const pds = Array.isArray(inv.payment_details) ? inv.payment_details : [];
    const advancePayments = pds.filter(p => p.mode.includes('Advance'));
    return advancePayments.length > 0 && inv.receipt_items.length > 0;
  });

  console.log('\nInvoices with both Advance and Receipts:', duplicates.length);
  duplicates.forEach(inv => {
    console.log(`Invoice ${inv.invoice_number}:`);
    console.log(`  Payment Details:`, inv.payment_details);
    console.log(`  Receipt Items:`, inv.receipt_items.map(ri => ({ receipt: ri.receipt.receipt_number, amount: ri.amount_paid })));
    console.log(`  Total Paid (stored): ${inv.amount_paid}`);
  });

  process.exit(0);
}

audit().catch(console.error);
