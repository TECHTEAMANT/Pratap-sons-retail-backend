import { AppDataSource } from './src/config/data-source';

async function check() {
  await AppDataSource.initialize();
  const invoices = await AppDataSource.query(
    SELECT net_payable, payment_details 
    FROM sales_invoices 
    WHERE invoice_date >= '2026-02-01 00:00:00' 
      AND invoice_date <= '2026-06-09 23:59:59'
  );
  
  let zeroNet = invoices.filter((i:any) => Number(i.net_payable) <= 0);
  
  let emptyArray = invoices.filter((i:any) => {
    try {
      const pd = typeof i.payment_details === 'string' ? JSON.parse(i.payment_details) : i.payment_details;
      return Array.isArray(pd) && pd.length === 0;
    } catch(e) { return false; }
  });

  console.log('Total invoices in range:', invoices.length);
  console.log('zeroNet invoices:', zeroNet.length);
  console.log('emptyArray payment_details:', emptyArray.length);

  process.exit(0);
}
check().catch(console.error);
