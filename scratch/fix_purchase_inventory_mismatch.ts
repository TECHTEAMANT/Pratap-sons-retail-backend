import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';

async function fixBarcodeBatches() {
  await initializeDatabase();
  console.log('--- Starting Barcode Batch Reconciliation ---');
  
  try {
    const db = AppDataSource;
    
    // Find all POs and designs where purchase_items quantity != barcode_batches total_quantity
    const discrepancies = await db.query(`
      SELECT 
        pi.po_id, 
        pi.design_no, 
        pi.product_group, 
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
      GROUP BY pi.po_id, pi.design_no, pi.product_group, pi.color, pi.size
      HAVING SUM(pi.quantity) <> COALESCE((SELECT SUM(bb.total_quantity) 
         FROM barcode_batches bb 
         WHERE bb.po_id = pi.po_id 
           AND bb.design_no = pi.design_no 
           AND COALESCE(bb.color::text, '') = COALESCE(pi.color::text, '') 
           AND bb.size = pi.size 
           AND bb.status != 'deleted'), 0)
    `);

    console.log(`Found ${discrepancies.length} combinations with discrepancies.`);

    let fixedCount = 0;
    
    for (const row of discrepancies) {
      const po_id = row.po_id;
      const design_no = row.design_no;
      const color = row.color;
      const size = row.size;
      const pi_qty = Number(row.pi_qty);
      const bb_qty = Number(row.bb_qty);
      
      const delta = bb_qty - pi_qty;
      
      if (delta > 0) {
        // We need to REDUCE barcode_batches total_quantity by 'delta'
        // Let's get the barcode batches for this combination, ordered by created_at DESC
        const batches = await db.query(`
          SELECT id, total_quantity, available_quantity 
          FROM barcode_batches 
          WHERE po_id = $1 AND design_no = $2 
            AND COALESCE(color::text, '') = $3 AND size = $4 
            AND status != 'deleted'
          ORDER BY created_at DESC
        `, [po_id, design_no, color || '', size]);
        
        let remainingToReduce = delta;
        
        for (const batch of batches) {
          if (remainingToReduce <= 0) break;
          
          const batchQty = Number(batch.total_quantity);
          if (batchQty > 0) {
            const reduceBy = Math.min(batchQty, remainingToReduce);
            const newTotal = batchQty - reduceBy;
            const newAvailable = Math.max(0, Number(batch.available_quantity) - reduceBy);
            
            await db.query(`
              UPDATE barcode_batches 
              SET total_quantity = $1, available_quantity = $2 
              WHERE id = $3
            `, [newTotal, newAvailable, batch.id]);
            
            remainingToReduce -= reduceBy;
            fixedCount++;
          }
        }
      } else if (delta < 0) {
        // We need to INCREASE barcode_batches total_quantity by '|delta|'
        // Just add to the latest barcode batch
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
          
          fixedCount++;
        }
      }
    }
    
    console.log(`Successfully fixed ${fixedCount} barcode batches.`);
    
  } catch (err) {
    console.error('Error during reconciliation:', err);
  } finally {
    await closeDatabase();
  }
}

fixBarcodeBatches().catch(console.error);
