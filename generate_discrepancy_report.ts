import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from './src/config/data-source';
import * as fs from 'fs';
import * as path from 'path';

async function generateDiscrepancyReport() {
  await initializeDatabase();
  const ds = AppDataSource;
  
  const query = `
    WITH ValidMatches AS (
      SELECT 
        pi.po_id, 
        po.invoice_number as po_no,
        po.order_date,
        v.name as vendor,
        pi.design_no, 
        SUM(pi.quantity) as ordered_qty,
        (
          SELECT COALESCE(SUM(bb.total_quantity), 0)
          FROM barcode_batches bb 
          WHERE bb.po_id = pi.po_id AND bb.design_no = pi.design_no AND bb.status != 'deleted'
        ) as generated_qty
      FROM purchase_items pi
      JOIN purchase_orders po ON po.id = pi.po_id
      LEFT JOIN vendors v ON v.id = po.vendor
      GROUP BY pi.po_id, po.invoice_number, po.order_date, v.name, pi.design_no
    )
    SELECT 
      po_no,
      TO_CHAR(order_date, 'YYYY-MM-DD') as date,
      vendor,
      design_no,
      ordered_qty,
      generated_qty,
      ordered_qty - generated_qty as missing_qty
    FROM ValidMatches
    WHERE ordered_qty != generated_qty
    ORDER BY missing_qty DESC, po_no ASC
  `;
  
  const discrepancies = await ds.query(query);
  
  let csv = 'Invoice No,Date,Vendor,Design No,Ordered Qty,Generated Barcodes Qty,Missing Qty (If Negative then Extra)\n';
  discrepancies.forEach((row: any) => {
    csv += `"${row.po_no}","${row.date}","${row.vendor}","${row.design_no}",${row.ordered_qty},${row.generated_qty},${row.missing_qty}\n`;
  });
  
  const filePath = path.join(__dirname, 'barcode_discrepancy_report.csv');
  fs.writeFileSync(filePath, csv);
  
  console.log(`Generated report with ${discrepancies.length} mismatched items.`);
  console.log(`Saved to: ${filePath}`);

  const under = discrepancies.filter((d: any) => d.missing_qty > 0);
  const over = discrepancies.filter((d: any) => d.missing_qty < 0);
  
  console.log(`Total missing items to generate: ${under.reduce((s: number, r: any) => s + Number(r.missing_qty), 0)}`);
  console.log(`Total extra items to delete: ${over.reduce((s: number, r: any) => s + Math.abs(Number(r.missing_qty)), 0)}`);

  await closeDatabase();
}

generateDiscrepancyReport().catch(console.error);
