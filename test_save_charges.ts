import { initializeDatabase, closeDatabase, AppDataSource } from './src/config/data-source';
import { SalesInvoice } from './src/entities/SalesInvoice';
import dotenv from 'dotenv';
dotenv.config();

async function testSave() {
  try {
    await initializeDatabase();
    const repo = AppDataSource.getRepository(SalesInvoice);
    
    // Create a dummy invoice
    const inv = repo.create({
      invoice_number: 'TEST_SAVE_CHARGES',
      invoice_date: new Date(),
      customer_name: 'Test Customer',
      customer_mobile: '9999999999',
      total_mrp: 1000,
      total_discount: 100,
      net_payable: 1118,
      amount_paid: 1118,
      additional_charges_base: 200,
      additional_charges_gst_rate: 18,
      additional_charges_gst: 36,
      additional_charges_total: 236,
      payment_details: [{ mode: 'Cash', amount: 1118 }]
    });

    const saved = await repo.save(inv);
    console.log('--- SAVED INVOICE ---');
    console.log(JSON.stringify(saved, null, 2));

    const verify = await AppDataSource.query(`SELECT additional_charges_total FROM sales_invoices WHERE invoice_number = 'TEST_SAVE_CHARGES'`);
    console.log('--- VERIFY DB ---');
    console.log(verify);

    await repo.delete({ invoice_number: 'TEST_SAVE_CHARGES' });
    await closeDatabase();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

testSave();
