import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';

async function fixExtraDiscrepancies() {
  await initializeDatabase();
  const ds = AppDataSource;
  
  // 1. Get all discrepancies where generated_qty > ordered_qty
  const query = `
    WITH purchase_agg AS (
      SELECT 
        po_id, design_no, product_group, color, size,
        SUM(quantity) as ordered_qty
      FROM purchase_items
      GROUP BY po_id, design_no, product_group, color, size
    ),
    barcode_agg AS (
      SELECT 
        po_id, design_no, product_group, color, size,
        SUM(total_quantity) as generated_qty
      FROM barcode_batches
      WHERE status != 'deleted'
      GROUP BY po_id, design_no, product_group, color, size
    ),
    mismatches AS (
      SELECT 
        ba.po_id, ba.design_no, ba.product_group, ba.color, ba.size,
        COALESCE(pa.ordered_qty, 0) as ordered_qty,
        ba.generated_qty,
        (ba.generated_qty - COALESCE(pa.ordered_qty, 0)) as extra_qty
      FROM barcode_agg ba
      LEFT JOIN purchase_agg pa 
        ON pa.po_id = ba.po_id 
        AND pa.design_no = ba.design_no 
        AND pa.product_group = ba.product_group
        AND (pa.color = ba.color OR (pa.color IS NULL AND ba.color IS NULL))
        AND (pa.size = ba.size OR (pa.size IS NULL AND ba.size IS NULL))
      WHERE ba.generated_qty > COALESCE(pa.ordered_qty, 0)
    )
    SELECT * FROM mismatches;
  `;
  
  const mismatches = await ds.query(query);
  console.log(`Found ${mismatches.length} distinct configurations with EXTRA barcodes.`);

  let updatedCount = 0;
  
  for (const mismatch of mismatches) {
    const { po_id, design_no, product_group, color, size, extra_qty } = mismatch;
    
    // We need to reduce extra_qty from existing batches
    // Fetch all active batches for this configuration
    let remainingToReduce = Number(extra_qty);
    
    // In case po_id is null, handle it:
    const poClause = po_id ? `po_id = $1` : `po_id IS NULL`;
    const params = po_id ? [po_id, design_no, product_group, color, size] : [design_no, product_group, color, size];
    
    const batches = await ds.query(
      `SELECT id, total_quantity, available_quantity FROM barcode_batches 
       WHERE ${poClause} AND design_no = $${po_id ? 2 : 1} AND product_group = $${po_id ? 3 : 2} 
         AND (color = $${po_id ? 4 : 3} OR (color IS NULL AND $${po_id ? 4 : 3} IS NULL))
         AND (size = $${po_id ? 5 : 4} OR (size IS NULL AND $${po_id ? 5 : 4} IS NULL))
         AND status != 'deleted'
       ORDER BY total_quantity DESC`,
      params
    );

    for (const batch of batches) {
      if (remainingToReduce <= 0) break;
      
      const reduceBy = Math.min(Number(batch.total_quantity), remainingToReduce);
      
      await ds.query(
        `UPDATE barcode_batches 
         SET total_quantity = total_quantity - $1,
             available_quantity = available_quantity - $1
         WHERE id = $2`,
        [reduceBy, batch.id]
      );
      
      remainingToReduce -= reduceBy;
      updatedCount++;
    }
  }

  // Double check manual barcodes with no PO
  const manualBatches = await ds.query(`
    SELECT id, total_quantity 
    FROM barcode_batches 
    WHERE po_id IS NULL AND status != 'deleted' AND total_quantity > 0
  `);
  
  for (const mb of manualBatches) {
      await ds.query(
        `UPDATE barcode_batches 
         SET total_quantity = 0, available_quantity = 0
         WHERE id = $1`,
        [mb.id]
      );
      updatedCount++;
  }

  console.log(`Successfully updated ${updatedCount} existing barcode batches to reduce extra quantities.`);
  await closeDatabase();
}

fixExtraDiscrepancies().catch(console.error);
