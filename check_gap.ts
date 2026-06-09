import { AppDataSource } from './src/config/data-source';

async function check() {
  await AppDataSource.initialize();
  const invoices = await AppDataSource.query(
    SELECT invoice_number, net_payable, payment_status, payment_details 
    FROM sales_invoices 
    WHERE invoice_date >= '2026-02-01 00:00:00' 
      AND invoice_date <= '2026-06-09 23:59:59'
  );
  
  const skipped = [];
  
  for (const inv of invoices) {
    let pd = inv.payment_details;
    if (typeof pd === 'string') {
      try { pd = JSON.parse(pd); } catch(e) { pd = null; }
    }
    
    let totalPaid = 0;
    if (Array.isArray(pd) && pd.length > 0) {
      totalPaid = pd.reduce((sum, p) => sum + Math.round(parseFloat(p.amount || 0)), 0);
    } else {
      totalPaid = Math.round(parseFloat(inv.net_payable || 0));
    }
    
    if (totalPaid <= 0) {
      skipped.push({
        inv: inv.invoice_number,
        net: inv.net_payable,
        pd: pd,
        status: inv.payment_status
      });
    }
  }

  console.log('Total sales:', invoices.length);
  console.log('Skipped receipts:', skipped.length);
  console.log('Sample skipped:', JSON.stringify(skipped.slice(0, 5), null, 2));

  process.exit(0);
}
check().catch(console.error);
