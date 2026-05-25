import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';

async function cleanupOrphanedDesigns() {
  await initializeDatabase();
  console.log('--- Starting Orphaned Design Cleanup ---');

  try {
    const db = AppDataSource;

    // 1. Identify barcode batches that have 0 total_quantity
    const orphans = await db.query(`
      SELECT id, barcode_alias_8digit, design_no, status
      FROM barcode_batches
      WHERE total_quantity = 0
    `);

    console.log(`Found ${orphans.length} orphaned barcode batches (total_quantity = 0).`);

    if (orphans.length === 0) {
      console.log('No cleanup needed.');
      return;
    }

    // 2. Perform safe deletion (Only delete if they have no sales/returns linked to them, just to be safe)
    const result = await db.query(`
      DELETE FROM barcode_batches 
      WHERE total_quantity = 0
      AND id NOT IN (SELECT barcode_batch_id FROM sales_invoice_items WHERE barcode_batch_id IS NOT NULL)
      AND id NOT IN (SELECT item_id FROM purchase_return_items WHERE item_id IS NOT NULL)
      AND id NOT IN (SELECT item_id FROM sales_return_items WHERE item_id IS NOT NULL)
      RETURNING id, design_no;
    `);

    console.log(`Successfully hard-deleted ${result.length} orphaned barcode batches from the database.`);
    
    // Optional: Identify if any designs now have ZERO barcodes associated with them at all
    // (We could clean up product_masters or just leave them)
    
  } catch (err) {
    console.error('Error during cleanup:', err);
  } finally {
    await closeDatabase();
  }
}

cleanupOrphanedDesigns().catch(console.error);
