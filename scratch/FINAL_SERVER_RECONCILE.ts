import { AppDataSource } from '../src/config/data-source';
import { BarcodeBatch } from '../src/entities/BarcodeBatch';

async function finalServerReconcile() {
    try {
        console.log("🚀 Starting Ultimate Server Reconciliation...");
        await AppDataSource.initialize();
        const barcodeRepo = AppDataSource.getRepository(BarcodeBatch);

        const START_DATE = '2026-02-01';
        const END_DATE = '2026-05-15';

        // STEP 1: Delete anything that arrived BEFORE Feb 1st (The "Opening Stock" issue)
        console.log("🗑️ Step 1: Removing old stock (arrived before Feb 1st)...");
        const res1 = await AppDataSource.query(`
            UPDATE barcode_batches 
            SET status = 'deleted' 
            WHERE (COALESCE((SELECT order_date FROM purchase_orders po WHERE po.id = po_id), created_at)::date < $1)
            AND status != 'deleted'
        `, [START_DATE]);
        console.log("Old stock removed.");

        // STEP 2: Delete barcodes with NO PO or NO Invoice Number
        console.log("🗑️ Step 2: Removing orphan barcodes (No PO or No Invoice)...");
        await AppDataSource.query(`
            UPDATE barcode_batches 
            SET status = 'deleted' 
            WHERE (po_id IS NULL OR po_id NOT IN (SELECT id FROM purchase_orders WHERE invoice_number IS NOT NULL AND invoice_number != ''))
            AND status != 'deleted'
        `);

        // STEP 3: Synchronize Sold Status with Invoices
        console.log("📊 Step 3: Synchronizing Sold Status with Sales Invoices...");
        await AppDataSource.query(`
            UPDATE barcode_batches 
            SET status = 'sold', available_quantity = 0 
            WHERE barcode_alias_8digit IN (SELECT DISTINCT barcode_8digit FROM sales_invoice_items)
            AND status != 'deleted'
            AND status != 'sold'
        `);

        // STEP 4: Synchronize Returned Status
        console.log("📦 Step 4: Synchronizing Returned Status...");
        await AppDataSource.query(`
            UPDATE barcode_batches 
            SET status = 'Returned', available_quantity = 0 
            WHERE id IN (SELECT item_id FROM purchase_return_items)
            AND status != 'deleted'
            AND status != 'Returned'
        `);

        // FINAL COUNT VERIFICATION
        const finalCount = await AppDataSource.query(`
            SELECT COUNT(*) as total 
            FROM barcode_batches 
            WHERE status != 'deleted'
        `);
        
        console.log("\n✅ RECONCILIATION COMPLETE!");
        console.log(`📊 FINAL DATABASE COUNT: ${finalCount[0].total}`);
        console.log("This number should now match your Purchase Summary (12,130).");
        
        process.exit(0);
    } catch (err) {
        console.error("❌ Reconciliation failed:", err);
        process.exit(1);
    }
}

finalServerReconcile();
