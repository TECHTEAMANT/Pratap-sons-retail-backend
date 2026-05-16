import { AppDataSource } from '../src/config/data-source';
import { BarcodeBatch } from '../src/entities/BarcodeBatch';
import { v4 as uuidv4 } from 'uuid';

async function sync() {
    await AppDataSource.initialize();
    console.log("Database Connected. Starting FINAL GLOBAL SYNC...");

    // --- STEP -1: NORMALIZE QUANTITIES ---
    console.log("Normalizing Barcode Quantities (1 Barcode = 1 Piece)...");
    await AppDataSource.query(`
        UPDATE barcode_batches 
        SET total_quantity = 1, available_quantity = (CASE WHEN status = 'active' THEN 1 ELSE 0 END)
        WHERE status != 'deleted'
    `);
    console.log("✅ Quantities Normalized.");

    // --- STEP 0: FIX DATES ---
    console.log("Fixing Barcode Dates to match PO Dates...");
    await AppDataSource.query(`
        UPDATE barcode_batches bb
        SET created_at = po.order_date
        FROM purchase_orders po
        WHERE bb.po_id = po.id AND bb.created_at::date != po.order_date::date
    `);
    console.log("✅ Dates Fixed.");

    // --- STEP 1: SYNC SALES STATUS ---
    console.log("Syncing Sales Status...");
    const salesItems = await AppDataSource.query(`
        SELECT sii.barcode_8digit, sii.design_no, sii.mrp, si.invoice_date, po.vendor as vendor_id, si.floor_id, po.id as po_id
        FROM sales_invoice_items sii
        JOIN sales_invoices si ON si.id = sii.invoice_id
        LEFT JOIN barcode_batches bb ON bb.barcode_alias_8digit = sii.barcode_8digit
        LEFT JOIN purchase_items pi ON pi.design_no = sii.design_no
        LEFT JOIN purchase_orders po ON po.id = pi.po_id
        WHERE sii.barcode_8digit IS NOT NULL
    `);

    let soldRecovered = 0;
    for (const item of salesItems) {
        const existing = await AppDataSource.query(`SELECT id FROM barcode_batches WHERE barcode_alias_8digit = '${item.barcode_8digit}'`);
        if (existing.length === 0) {
            // Create missing sold barcode
            await AppDataSource.query(`
                INSERT INTO barcode_batches (id, barcode_alias_8digit, design_no, status, total_quantity, available_quantity, created_at, updated_at, vendor, po_id, mrp)
                VALUES ('${uuidv4()}', '${item.barcode_8digit}', '${item.design_no}', 'sold', 1, 0, '${new Date(item.invoice_date).toISOString()}', NOW(), '${item.vendor_id}', '${item.po_id}', ${item.mrp})
            `);
            soldRecovered++;
        } else {
            await AppDataSource.query(`UPDATE barcode_batches SET status = 'sold', available_quantity = 0 WHERE barcode_alias_8digit = '${item.barcode_8digit}' AND status != 'sold'`);
        }
    }
    console.log(`✅ Sales Status Synced. Recovered ${soldRecovered} missing sold barcodes.`);

    // --- STEP 2: SYNC PURCHASE TOTALS (CREATE MISSING / DELETE SURPLUS) ---
    console.log("Loading Purchase Invoices...");
    const invoices = await AppDataSource.query(`
        SELECT pi.po_id, pi.design_no, pi.size as size_id, pi.product_group as category_id, pi.mrp, pi.cost_per_item as purchase_price, SUM(pi.quantity) as qty, po.vendor as vendor_id
        FROM purchase_items pi
        JOIN purchase_orders po ON po.id = pi.po_id
        GROUP BY pi.po_id, pi.design_no, pi.size, pi.product_group, pi.mrp, pi.cost_per_item, po.vendor
    `);

    let created = 0;
    let deleted = 0;

    for (const inv of invoices) {
        // Get PO date to keep everything in sync
        const poInfo = await AppDataSource.query(`SELECT order_date FROM purchase_orders WHERE id = '${inv.po_id}'`);
        const poDate = poInfo[0]?.order_date || new Date();

        const activeRes = await AppDataSource.query(`
            SELECT id, total_quantity, available_quantity FROM barcode_batches 
            WHERE po_id = '${inv.po_id}' AND design_no = '${inv.design_no}' AND size = '${inv.size_id}' AND status != 'deleted'
        `);
        
        const currentCount = activeRes.length;
        const target = parseInt(inv.qty);

        if (currentCount < target) {
            // CREATE MISSING
            const toCreate = target - currentCount;
            for (let i = 0; i < toCreate; i++) {
                const alias = Math.floor(10000000 + Math.random() * 90000000).toString();
                await AppDataSource.query(`
                    INSERT INTO barcode_batches (id, barcode_alias_8digit, design_no, size, product_group, vendor, po_id, mrp, cost_actual, total_quantity, available_quantity, status, created_at, updated_at)
                    VALUES ('${uuidv4()}', '${alias}', '${inv.design_no}', '${inv.size_id}', '${inv.category_id}', '${inv.vendor_id}', '${inv.po_id}', ${inv.mrp}, ${inv.purchase_price}, 1, 1, 'active', '${new Date(poDate).toISOString()}', NOW())
                `);
                created++;
            }
        } else if (currentCount > target) {
            // DELETE SURPLUS
            const toDeleteCount = currentCount - target;
            const deletable = activeRes.slice(0, toDeleteCount);
            if (deletable.length > 0) {
                const ids = deletable.map((d: any) => `'${d.id}'`).join(',');
                await AppDataSource.query(`
                    UPDATE barcode_batches SET status = 'deleted', total_quantity = 0, available_quantity = 0 WHERE id IN (${ids})
                `);
                deleted += deletable.length;
            }
        }
    }

    console.log(`-------------------------------------------`);
    console.log(`SYNC FINISHED.`);
    console.log(`- Created (Missing): ${created}`);
    console.log(`- Deleted (Surplus): ${deleted}`);
    console.log(`-------------------------------------------`);
    process.exit(0);
}

sync().catch(err => {
    console.error(err);
    process.exit(1);
});
