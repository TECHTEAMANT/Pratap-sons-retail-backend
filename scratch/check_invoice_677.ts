import { AppDataSource } from '../src/config/data-source';
import { SalesInvoice } from '../src/entities/SalesInvoice';
import { SalesInvoiceItem } from '../src/entities/SalesInvoiceItem';

async function check() {
  await AppDataSource.initialize();
  
  const inv = await AppDataSource.getRepository(SalesInvoice).findOne({
    where: { invoice_number: 'INV2627000677' },
    relations: ['items']
  });
  
  if (inv) {
    console.log('--- Invoice: ' + inv.invoice_number + ' ---');
    console.log('Net Payable:', inv.net_payable);
    console.log('Amount Paid:', inv.amount_paid);
    console.log('Amount Pending:', inv.amount_pending);
    console.log('Payment Details:', inv.payment_details);
    
    console.log('\n--- Items ---');
    inv.items.forEach((it, idx) => {
      console.log(`Item ${idx+1}: Barcode=${it.barcode_8digit}, MRP=${it.mrp}, Disc=${it.discount}, OnApproval=${it.on_approval}, Delivered=${it.delivered}`);
    });
  } else {
    console.log('Invoice INV2627000677 not found');
  }
  
  await AppDataSource.destroy();
}

check();
