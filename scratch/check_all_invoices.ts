import { AppDataSource } from '../src/config/data-source';
import { SalesInvoice } from '../src/entities/SalesInvoice';

async function check() {
  await AppDataSource.initialize();
  
  const invoices = await AppDataSource.getRepository(SalesInvoice).find({
    where: { customer_mobile: '9799861147' },
    relations: ['items']
  });
  
  console.log(`--- Invoices for 9799861147 (${invoices.length} found) ---`);
  invoices.forEach(inv => {
    console.log(`\nInvoice: ${inv.invoice_number}, Date: ${inv.invoice_date}, Status: ${inv.payment_status}`);
    console.log(`MRP: ${inv.total_mrp}, Net: ${inv.net_payable}, Paid: ${inv.amount_paid}, Pending: ${inv.amount_pending}`);
    console.log('Items: ' + inv.items?.map(i => `${i.barcode_8digit}(MRP:${i.mrp}, Disc:${i.discount})`).join(', '));
  });
  
  await AppDataSource.destroy();
}

check();
