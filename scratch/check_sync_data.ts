import { AppDataSource } from '../src/config/data-source';

async function check() {
  await AppDataSource.initialize();
  
  try {
    const stats = await AppDataSource.query('SELECT record_type, count(*) as count FROM tally_sync GROUP BY record_type');
    console.log('Tally Sync Stats:', stats);
    
    const invoicesWithPayments = await AppDataSource.query('SELECT count(*) FROM sales_invoices WHERE payment_details IS NOT NULL AND payment_details <> \'[]\'');
    console.log('Invoices with Payments:', invoicesWithPayments);

    const pendingReceipts = await AppDataSource.query('SELECT count(*) FROM payment_receipts');
    console.log('Total Payment Receipts:', pendingReceipts);

  } catch (e) {
    console.log('Error:', e);
  }
  
  process.exit(0);
}

check();
