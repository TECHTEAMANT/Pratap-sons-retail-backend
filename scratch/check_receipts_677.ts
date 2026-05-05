import { AppDataSource } from '../src/config/data-source';
import { SalesInvoice } from '../src/entities/SalesInvoice';

async function check() {
  await AppDataSource.initialize();
  
  const inv = await AppDataSource.getRepository(SalesInvoice).findOne({
    where: { invoice_number: 'INV2627000677' },
    relations: ['receipt_items', 'receipt_items.receipt']
  });
  
  if (inv) {
    console.log('--- Invoice: ' + inv.invoice_number + ' ---');
    console.log('Stored Amount Paid:', inv.amount_paid);
    
    console.log('\n--- Linked Receipts ---');
    if (!inv.receipt_items || inv.receipt_items.length === 0) {
      console.log('No receipts found in payment_receipt_items');
    } else {
      inv.receipt_items.forEach((ri, idx) => {
        console.log(`Receipt ${idx+1}: Number=${ri.receipt?.receipt_number}, AmountAllocated=${ri.amount_paid}`);
      });
    }
    
    // Check payment_details JSON too
    console.log('\nPayment Details JSON:', inv.payment_details);
  }
  
  await AppDataSource.destroy();
}

check();
