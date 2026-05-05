import { AppDataSource } from '../src/config/data-source';
import { PaymentReceipt } from '../src/entities/PaymentReceipt';
import { PaymentReceiptItem } from '../src/entities/PaymentReceiptItem';

async function check() {
  await AppDataSource.initialize();
  
  const receipts = await AppDataSource.getRepository(PaymentReceipt).find({
    where: { customer_mobile: '9799861147' },
    relations: ['items']
  });
  
  console.log(`--- Receipts for 9799861147 (${receipts.length} found) ---`);
  receipts.forEach(r => {
    console.log(`\nReceipt: ${r.receipt_number}, Date: ${r.receipt_date}, Total: ${r.amount_received}`);
    r.items?.forEach(it => {
      console.log(`  -> Applied to Invoice ID: ${it.invoice_id}, Amount: ${it.amount_paid}`);
    });
  });
  
  await AppDataSource.destroy();
}

check();
