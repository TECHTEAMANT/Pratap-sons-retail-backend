import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from './src/config/data-source';

async function analyzeDiscrepancy() {
  await initializeDatabase();
  const ds = AppDataSource;

  console.log("--- Analyzing Barcode vs Purchase Quantities ---");

  // 1. Total Purchase Items Quantity
  const piRes = await ds.query(`SELECT SUM(quantity) as total_pi FROM purchase_items`);
  console.log("Total quantity on Purchase Invoices:", piRes[0].total_pi);

  // 2. Total Barcodes Generated
  const bbRes = await ds.query(`SELECT COUNT(*) as total_bb FROM barcode_batches WHERE status != 'deleted'`);
  console.log("Total physical barcodes generated:", bbRes[0].total_bb);

  // 3. True Orphans (barcodes where the PO or Design doesn't exist at all in purchase_items)
  const orphanRes = await ds.query(`
    SELECT COUNT(*) as orphan_count 
    FROM barcode_batches bb 
    WHERE bb.status != 'deleted' 
    AND NOT EXISTS (
      SELECT 1 FROM purchase_items pi 
      WHERE pi.po_id = bb.po_id AND pi.design_no = bb.design_no
    )
  `);
  console.log("True Orphan Barcodes (PO/Design completely missing):", orphanRes[0].orphan_count);

  // 4. Over-generated Barcodes (Valid PO/Design, but more barcodes than ordered quantity)
  const overgenRes = await ds.query(`
    WITH ValidMatches AS (
      SELECT 
        pi.po_id, 
        pi.design_no, 
        SUM(pi.quantity) as ordered_qty,
        (
          SELECT COUNT(bb.id) 
          FROM barcode_batches bb 
          WHERE bb.po_id = pi.po_id AND bb.design_no = pi.design_no AND bb.status != 'deleted'
        ) as generated_qty
      FROM purchase_items pi
      GROUP BY pi.po_id, pi.design_no
    )
    SELECT 
      SUM(generated_qty - ordered_qty) as total_overgenerated
    FROM ValidMatches
    WHERE generated_qty > ordered_qty
  `);
  console.log("Over-generated Barcodes (Valid design, but too many barcodes printed):", overgenRes[0].total_overgenerated);

  // 5. Let's list a few examples of over-generated items
  const examplesRes = await ds.query(`
    WITH ValidMatches AS (
      SELECT 
        pi.po_id, 
        po.invoice_number,
        pi.design_no, 
        SUM(pi.quantity) as ordered_qty,
        (
          SELECT COUNT(bb.id) 
          FROM barcode_batches bb 
          WHERE bb.po_id = pi.po_id AND bb.design_no = pi.design_no AND bb.status != 'deleted'
        ) as generated_qty
      FROM purchase_items pi
      JOIN purchase_orders po ON po.id = pi.po_id
      GROUP BY pi.po_id, po.invoice_number, pi.design_no
    )
    SELECT *
    FROM ValidMatches
    WHERE generated_qty > ordered_qty
    LIMIT 5
  `);
  
  if (examplesRes.length > 0) {
    console.log("\nExamples of items with extra barcodes:");
    console.table(examplesRes);
  }

  await closeDatabase();
}

analyzeDiscrepancy().catch(console.error);
