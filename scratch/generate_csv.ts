import { AppDataSource } from '../src/config/data-source';
import * as fs from 'fs';
import * as path from 'path';

const invoicesList = [
  'INV2627000475', 'INV2026000155', 'INV2627000187', 'INV2026000332',
  'INV2026000147', 'INV2026000088', 'INV2627000491', 'INV2026000194',
  'INV2627000306', 'INV2026000375', 'INV2026000149', 'INV2026000198',
  'INV2627000595', 'INV2026000044', 'INV2627001088', 'INV2026000121',
  'INV2026000330', 'INV2026000238', 'INV2026000142', 'INV2026000108',
  'INV2627000551', 'INV2627000315', 'INV2026000137', 'INV2026000173',
  'INV2026000338', 'INV2627000005', 'INV2627001035'
];

async function run() {
  try {
    await AppDataSource.initialize();
    
    const invoices = await AppDataSource.query(`
      SELECT 
        i.invoice_number, 
        i.invoice_date, 
        i.total_mrp, 
        i.net_payable, 
        i.amount_paid, 
        i.amount_pending, 
        i.payment_status,
        i.payment_details,
        (SELECT COALESCE(SUM(total_return_amount), 0) FROM sales_returns sr WHERE sr.invoice_id = i.id) as total_returned
      FROM sales_invoices i
      WHERE i.invoice_number = ANY($1)
      ORDER BY i.invoice_date DESC
    `, [invoicesList]);

    let csv = "Invoice Number,Date,Total MRP,Net Payable,Amount Paid,Amount Pending,Payment Status,Total Returned,Payment Modes\n";

    for (const inv of invoices) {
      let modes = '';
      if (inv.payment_details) {
         try {
           const details = typeof inv.payment_details === 'string' ? JSON.parse(inv.payment_details) : inv.payment_details;
           if (Array.isArray(details)) {
             modes = details.map((d: any) => d.mode + '(' + d.amount + ')').join(' | ');
           } else if (typeof details === 'object') {
             modes = Object.keys(details).map(k => k + '(' + details[k] + ')').join(' | ');
           }
         } catch(e) {}
      }

      const dateStr = new Date(inv.invoice_date).toLocaleDateString();
      csv += inv.invoice_number + ',' + dateStr + ',' + inv.total_mrp + ',' + inv.net_payable + ',' + inv.amount_paid + ',' + inv.amount_pending + ',' + inv.payment_status + ',' + inv.total_returned + ',"' + modes + '"\n';
    }

    const filepath = path.join('C:', 'Users', 'LENOVO', 'OneDrive', 'Desktop', 'pratap sons retail', 'pending_invoices_analysis.csv');
    fs.writeFileSync(filepath, csv);
    console.log("CSV Generated at " + filepath);
  } catch(e) {
    console.error(e);
  } finally {
    if(AppDataSource.isInitialized) await AppDataSource.destroy();
  }
}
run();
