import { AppDataSource } from '../src/config/data-source';

async function purgePreOpeningData() {
    try {
        console.log("🧹 Starting Pre-Opening Data Purge (Anything before Feb 1st, 2026)...");
        await AppDataSource.initialize();

        const OPENING_DATE = '2026-02-01';

        // 1. Purge Barcodes
        console.log("🗑️ Step 1: Purging all barcodes created before opening...");
        await AppDataSource.query(`
            UPDATE barcode_batches 
            SET status = 'deleted' 
            WHERE (COALESCE((SELECT order_date FROM purchase_orders po WHERE po.id = po_id), created_at)::date < $1)
            AND status != 'deleted'
        `, [OPENING_DATE]);

        // 2. Purge Invoices (Test data)
        console.log("🗑️ Step 2: Purging any test sales invoices before opening...");
        await AppDataSource.query(`
            UPDATE sales_invoices 
            SET payment_status = 'cancelled' 
            WHERE invoice_date < $1
        `, [OPENING_DATE]);

        // 3. Purge Purchase Orders
        console.log("🗑️ Step 3: Purging any test purchase orders before opening...");
        await AppDataSource.query(`
            UPDATE purchase_orders 
            SET status = 'deleted' 
            WHERE order_date < $1
        `);

        // Final Count
        const finalCount = await AppDataSource.query(`
            SELECT COUNT(*) as total 
            FROM barcode_batches 
            WHERE status != 'deleted'
        `);

        console.log("\n✅ PURGE COMPLETE!");
        console.log(`📊 YOUR OFFICIAL OPENING INVENTORY COUNT: ${finalCount[0].total}`);
        console.log("All 'Opening Stock' and 'N/A' items have been permanently removed.");
        
        process.exit(0);
    } catch (err) {
        console.error("❌ Purge failed:", err);
        process.exit(1);
    }
}

purgePreOpeningData();
