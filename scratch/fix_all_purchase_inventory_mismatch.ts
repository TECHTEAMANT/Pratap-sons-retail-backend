import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';

async function fixAllBarcodeBatches() {
  await initializeDatabase();
  console.log('--- Starting Complete Barcode Batch Reconciliation ---');
  
  try {
    const db = AppDataSource;
    
    // First, find all barcode_batches that are linked to a PO, but the PO doesn't have that item
    console.log("Fixing orphaned barcode batches...");
    const orphanedBatches = await db.query(`
      SELECT bb.id, bb.total_quantity
      FROM barcode_batches bb
      WHERE bb.po_id IS NOT NULL AND bb.status != 'deleted' AND bb.total_quantity > 0
      AND NOT EXISTS (
        SELECT 1 FROM purchase_items pi 
        WHERE pi.po_id = bb.po_id 
          AND pi.design_no = bb.design_no 
          AND COALESCE(pi.color::text, '') = COALESCE(bb.color::text, '') 
          AND pi.size = bb.size
      )
    `);
    
    let orphanedFixed = 0;
    for (const batch of orphanedBatches) {
      await db.query(`
        UPDATE barcode_batches 
        SET total_quantity = 0, available_quantity = 0 
        WHERE id = $1
      `, [batch.id]);
      orphanedFixed++;
    }
    console.log(`Zeroed out ${orphanedFixed} orphaned barcode batches.`);

    // Then, reconcile quantities for matching items
    console.log("Fixing mismatched quantities...");
    const discrepancies = await db.query(`
      SELECT 
        pi.po_id, 
        pi.design_no, 
        pi.color, 
        pi.size, 
        SUM(pi.quantity) as pi_qty, 
        COALESCE((SELECT SUM(bb.total_quantity) 
         FROM barcode_batches bb 
         WHERE bb.po_id = pi.po_id 
           AND bb.design_no = pi.design_no 
           AND COALESCE(bb.color::text, '') = COALESCE(pi.color::text, '') 
           AND bb.size = pi.size 
           AND bb.status != 'deleted'), 0) as bb_qty
      FROM purchase_items pi
      GROUP BY pi.po_id, pi.design_no, pi.color, pi.size
      HAVING SUM(pi.quantity) <> COALESCE((SELECT SUM(bb.total_quantity) 
         FROM barcode_batches bb 
         WHERE bb.po_id = pi.po_id 
           AND bb.design_no = pi.design_no 
           AND COALESCE(bb.color::text, '') = COALESCE(pi.color::text, '') 
           AND bb.size = pi.size 
           AND bb.status != 'deleted'), 0)
    `);

    let qtyFixed = 0;
    
    for (const row of discrepancies) {
      const po_id = row.po_id;
      const design_no = row.design_no;
      const color = row.color;
      const size = row.size;
      const pi_qty = Number(row.pi_qty);
      const bb_qty = Number(row.bb_qty);
      
      const delta = bb_qty - pi_qty;
      
      if (delta > 0) {
        const batches = await db.query(`
          SELECT id, total_quantity, available_quantity 
          FROM barcode_batches 
          WHERE po_id = $1 AND design_no = $2 
            AND COALESCE(color::text, '') = $3 AND size = $4 
            AND status != 'deleted' AND total_quantity > 0
          ORDER BY created_at DESC
        `, [po_id, design_no, color || '', size]);
        
        let remainingToReduce = delta;
        
        for (const batch of batches) {
          if (remainingToReduce <= 0) break;
          
          const batchQty = Number(batch.total_quantity);
          const reduceBy = Math.min(batchQty, remainingToReduce);
          const newTotal = batchQty - reduceBy;
          const newAvailable = Math.max(0, Number(batch.available_quantity) - reduceBy);
          
          await db.query(`
            UPDATE barcode_batches 
            SET total_quantity = $1, available_quantity = $2 
            WHERE id = $3
          `, [newTotal, newAvailable, batch.id]);
          
          remainingToReduce -= reduceBy;
          qtyFixed++;
        }
      } else if (delta < 0) {
        const batches = await db.query(`
          SELECT id, total_quantity, available_quantity 
          FROM barcode_batches 
          WHERE po_id = $1 AND design_no = $2 
            AND COALESCE(color::text, '') = $3 AND size = $4 
            AND status != 'deleted'
          ORDER BY created_at DESC
          LIMIT 1
        `, [po_id, design_no, color || '', size]);
        
        if (batches.length > 0) {
          const batch = batches[0];
          const addAmount = Math.abs(delta);
          const newTotal = Number(batch.total_quantity) + addAmount;
          const newAvailable = Number(batch.available_quantity) + addAmount;
          
          await db.query(`
            UPDATE barcode_batches 
            SET total_quantity = $1, available_quantity = $2 
            WHERE id = $3
          `, [newTotal, newAvailable, batch.id]);
          
          qtyFixed++;
        }
      }
    }
    
    console.log(`Successfully fixed ${qtyFixed} mismatched quantities.`);
    
  } catch (err) {
    console.error('Error during reconciliation:', err);
  } finally {
    await closeDatabase();
  }
}

fixAllBarcodeBatches().catch(console.error);
