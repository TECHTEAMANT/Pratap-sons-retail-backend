import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';

async function fixDiscrepancies() {
  await initializeDatabase();
  const ds = AppDataSource;
  
  // 1. Get all discrepancies at the granular level (po_id, design_no, product_group, color, size)
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
        pa.po_id, pa.design_no, pa.product_group, pa.color, pa.size,
        pa.ordered_qty,
        COALESCE(ba.generated_qty, 0) as generated_qty,
        (pa.ordered_qty - COALESCE(ba.generated_qty, 0)) as missing_qty
      FROM purchase_agg pa
      LEFT JOIN barcode_agg ba 
        ON ba.po_id = pa.po_id 
        AND ba.design_no = pa.design_no 
        AND ba.product_group = pa.product_group
        AND (ba.color = pa.color OR (ba.color IS NULL AND pa.color IS NULL))
        AND (ba.size = pa.size OR (ba.size IS NULL AND pa.size IS NULL))
      WHERE pa.ordered_qty > COALESCE(ba.generated_qty, 0)
    )
    SELECT * FROM mismatches;
  `;
  
  const mismatches = await ds.query(query);
  console.log(`Found ${mismatches.length} distinct mismatched configurations.`);

  let updatedCount = 0;
  let insertedCount = 0;
  
  for (const mismatch of mismatches) {
    const { po_id, design_no, product_group, color, size, missing_qty } = mismatch;
    
    // Check if a batch already exists
    const existingBatches = await ds.query(
      `SELECT id, total_quantity, available_quantity FROM barcode_batches 
       WHERE po_id = $1 AND design_no = $2 AND product_group = $3 
         AND (color = $4 OR (color IS NULL AND $4 IS NULL))
         AND (size = $5 OR (size IS NULL AND $5 IS NULL))
         AND status != 'deleted'
       LIMIT 1`,
      [po_id, design_no, product_group, color, size]
    );

    if (existingBatches.length > 0) {
      // Increase quantity of existing batch
      const batch = existingBatches[0];
      await ds.query(
        `UPDATE barcode_batches 
         SET total_quantity = total_quantity + $1,
             available_quantity = available_quantity + $1
         WHERE id = $2`,
        [missing_qty, batch.id]
      );
      updatedCount++;
    } else {
      // Create a new batch
      // For this, we need vendor, cost, mrp from purchase_items
      const piData = await ds.query(
        `SELECT pi.mrp, pi.cost_per_item, pi.hsn_code, po.vendor
         FROM purchase_items pi
         JOIN purchase_orders po ON po.id = pi.po_id
         WHERE pi.po_id = $1 AND pi.design_no = $2 AND pi.product_group = $3
         LIMIT 1`,
         [po_id, design_no, product_group]
      );
      
      if (piData.length > 0) {
        const pd = piData[0];
        
        // Let's just generate an alias manually if reserveBarcodeAliases isn't easily importable
        const nextValRes = await ds.query(
          `INSERT INTO barcode_sequence (id, last_number)
           VALUES (1, $1)
           ON CONFLICT (id) DO UPDATE
             SET last_number = CASE
               WHEN barcode_sequence.last_number >= 10000000
                 THEN (
                   SELECT COALESCE(MAX(CAST(barcode_alias_8digit AS INTEGER)), 0)
                   FROM barcode_batches
                   WHERE barcode_alias_8digit ~ '^[0-9]+$'
                     AND CAST(barcode_alias_8digit AS INTEGER) < 10000000
                 ) + $1
               ELSE barcode_sequence.last_number + $1
             END
           RETURNING last_number`,
          [1]
        );
        const nextVal = nextValRes[0].last_number;
        const alias = nextVal.toString().padStart(8, '0');
        
        const struct = `ST-${design_no}-X-X-X-${alias}`; // Simplified structured barcode
        
        await ds.query(
          `INSERT INTO barcode_batches (
             barcode_alias_8digit, barcode_structured, po_id, vendor,
             design_no, product_group, color, size,
             total_quantity, available_quantity, mrp, cost_actual,
             status
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'active')`,
          [
            alias, struct, po_id, pd.vendor,
            design_no, product_group, color, size,
            missing_qty, missing_qty, pd.mrp, pd.cost_per_item
          ]
        );
        insertedCount++;
      }
    }
  }

  console.log(`Successfully updated ${updatedCount} existing barcodes and inserted ${insertedCount} new barcodes.`);
  await closeDatabase();
}

fixDiscrepancies().catch(console.error);
