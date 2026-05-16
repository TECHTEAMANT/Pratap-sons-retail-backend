import { AppDataSource } from '../src/config/data-source';

async function deleteOrphans() {
    await AppDataSource.initialize();
    
    console.log("🧹 Deleting Orphan Barcodes (No PO)...");
    
    const res = await AppDataSource.query(`
        UPDATE barcode_batches 
        SET status = 'deleted' 
        WHERE po_id IS NULL 
        AND status != 'deleted' 
        AND available_quantity > 0
    `);
    
    console.log(`✅ ORPHAN CLEANUP COMPLETE.`);
    process.exit(0);
}
deleteOrphans();
