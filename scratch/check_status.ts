import { AppDataSource } from '../src/config/data-source';
import { SalesInvoice } from '../src/entities/SalesInvoice';

async function check() {
  await AppDataSource.initialize();
  const inv = await AppDataSource.getRepository(SalesInvoice).findOne({
    where: { invoice_number: 'INV2627000654' }
  });
  
  if (inv) {
    console.log('--- Status Check ---');
    console.log('Invoice Number:', inv.invoice_number);
    console.log('Payment Status:', inv.payment_status);
    console.log('Amount Paid:', inv.amount_paid);
    console.log('Amount Pending:', inv.amount_pending);
    console.log('Net Payable:', inv.net_payable);
  } else {
    console.log('Invoice not found');
  }
  await AppDataSource.destroy();
}

check();
