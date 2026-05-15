import { AppDataSource } from '../src/config/data-source';
import { BarcodeBatch } from '../src/entities/BarcodeBatch';
import { SalesInvoiceItem } from '../src/entities/SalesInvoiceItem';
import { PurchaseReturnItem } from '../src/entities/PurchaseReturnItem';
import { In } from 'typeorm';

async function syncDatabaseToReality() {
    try {
        console.log("🚀 Starting Global Database Reconciliation...");
        await AppDataSource.initialize();
        const barcodeRepo = AppDataSource.getRepository(BarcodeBatch);

        // 1. RECONCILE SOLD ITEMS
        console.log("📊 Step 1: Reconciling Sold Items from Invoices...");
        const soldBarcodes = await AppDataSource.query(`
            SELECT DISTINCT barcode_8digit 
            FROM sales_invoice_items 
            WHERE barcode_8digit IS NOT NULL
        `);
        const soldList = soldBarcodes.map((b: any) => b.barcode_8digit);

        if (soldList.length > 0) {
            console.log(`Found ${soldList.length} sold barcodes. Updating statuses...`);
            // Update barcodes to 'sold' if they are in an invoice
            await barcodeRepo.createQueryBuilder()
                .update()
                .set({ status: 'sold', available_quantity: 0 })
                .where("barcode_alias_8digit IN (:...list)", { list: soldList })
                .andWhere("status != 'sold'")
                .execute();
        }

        // 2. RECONCILE RETURNED ITEMS
        console.log("📦 Step 2: Reconciling Returned Items from Purchase Returns...");
        const returnedBarcodes = await AppDataSource.query(`
            SELECT DISTINCT b.barcode_alias_8digit
            FROM purchase_return_items pri
            JOIN barcode_batches b ON b.id = pri.item_id
        `);
        const returnList = returnedBarcodes.map((b: any) => b.barcode_alias_8digit);

        if (returnList.length > 0) {
            console.log(`Found ${returnList.length} returned barcodes. Updating statuses...`);
            await barcodeRepo.createQueryBuilder()
                .update()
                .set({ status: 'Returned', available_quantity: 0 })
                .where("barcode_alias_8digit IN (:...list)", { list: returnList })
                .andWhere("status != 'Returned'")
                .execute();
        }

        // 3. NORMALIZE QUANTITIES (1 Barcode = 1 Piece)
        console.log("📏 Step 3: Normalizing Active Quantities...");
        await barcodeRepo.query(`
            UPDATE barcode_batches 
            SET available_quantity = total_quantity 
            WHERE status = 'active' AND available_quantity != total_quantity
        `);

        console.log("✅ Database Reconciliation Complete!");
        process.exit(0);
    } catch (err) {
        console.error("❌ Sync failed:", err);
        process.exit(1);
    }
}

syncDatabaseToReality();
