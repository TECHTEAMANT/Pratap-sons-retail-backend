import { AppDataSource } from '../src/config/data-source';

async function check() {
  await AppDataSource.initialize();
  
  const result = await AppDataSource.query(`
    SELECT 
      invoice_number, 
      net_payable, 
      amount_paid, 
      amount_pending, 
      payment_status, 
      payment_details,
      voucher_discount,
      special_discount,
      loyalty_redemption_amount
    FROM sales_invoices 
    WHERE invoice_number = 'INV2627000677'
  `);
  
  console.log('--- Raw Invoice Data ---');
  console.log(JSON.stringify(result, null, 2));

  const items = await AppDataSource.query(`
    SELECT 
      barcode_8digit, 
      mrp, 
      discount, 
      on_approval, 
      delivered 
    FROM sales_invoice_items 
    WHERE invoice_id = (SELECT id FROM sales_invoices WHERE invoice_number = 'INV2627000677')
  `);
  
  console.log('\n--- Raw Item Data ---');
  console.log(JSON.stringify(items, null, 2));
  
  await AppDataSource.destroy();
}

check();
