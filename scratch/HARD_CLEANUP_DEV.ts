import { AppDataSource } from '../src/config/data-source';

async function hardCleanupDev() {
    try {
        console.log("🧹 Starting Hard Cleanup on Dev Server...");
        await AppDataSource.initialize();

        // 1. Mark barcodes with NO Purchase Order as deleted
        console.log("🗑️ Step 1: Deleting barcodes with no PO link...");
        const res1 = await AppDataSource.query(`
            UPDATE barcode_batches 
            SET status = 'deleted' 
            WHERE po_id IS NULL 
            AND status != 'deleted'
        `);
        console.log(`Removed items with no PO.`);

        // 2. Mark barcodes where the PO has NO invoice number as deleted
        console.log("🗑️ Step 2: Deleting barcodes with empty PO Invoice numbers...");
        const res2 = await AppDataSource.query(`
            UPDATE barcode_batches 
            SET status = 'deleted' 
            WHERE po_id IN (SELECT id FROM purchase_orders WHERE invoice_number IS NULL OR invoice_number = '')
            AND status != 'deleted'
        `);
        console.log(`Removed items with empty invoice numbers.`);

        // 3. Optional: Remove barcodes with "Unknown" size/color if requested
        console.log("🗑️ Step 3: Deleting barcodes with unknown attributes (Optional check)...");
        // Add specific logic here if needed

        console.log("✅ Hard Cleanup Complete! Your Inventory Analysis should now be clean.");
        process.exit(0);
    } catch (err) {
        console.error("❌ Cleanup failed:", err);
        process.exit(1);
    }
}

hardCleanupDev();
