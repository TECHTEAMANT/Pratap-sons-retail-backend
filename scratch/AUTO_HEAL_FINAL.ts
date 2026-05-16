import { AppDataSource } from '../src/config/data-source';

async function autoHeal() {
    await AppDataSource.initialize();
    console.log("🩹 Starting Inventory Auto-Heal...");

    const mismatches = await AppDataSource.query(`
        SELECT 
            po.id,
            po.invoice_number, 
            po.total_items as official, 
            COALESCE(SUM(bb.total_quantity), 0) as physical
        FROM purchase_orders po 
        LEFT JOIN barcode_batches bb ON bb.po_id = po.id AND bb.status != 'deleted'
        WHERE po.status = 'Completed' 
        GROUP BY po.id, po.invoice_number, po.total_items 
        HAVING po.total_items > COALESCE(SUM(bb.total_quantity), 0)
    `);

    for (const po of mismatches) {
        const diff = po.official - po.physical;
        console.log(`🩹 Healing PO ${po.invoice_number}: Adding ${diff} to balance.`);

        // Find the most recent barcode for this PO to "absorb" the difference
        const lastBarcode = await AppDataSource.query(`
            SELECT id FROM barcode_batches 
            WHERE po_id = $1 AND status != 'deleted'
            ORDER BY created_at DESC LIMIT 1
        `, [po.id]);

        if (lastBarcode.length > 0) {
            await AppDataSource.query(`
                UPDATE barcode_batches 
                SET total_quantity = total_quantity + $1,
                    available_quantity = available_quantity + $1
                WHERE id = $2
            `, [diff, lastBarcode[0].id]);
        } else {
            console.log(`   🚨 Cannot heal PO ${po.invoice_number} because it has NO active barcodes!`);
        }
    }

    console.log("\n✅ AUTO-HEAL COMPLETE.");
    
    const final = await AppDataSource.query(`SELECT SUM(total_quantity) as total FROM barcode_batches WHERE status != 'deleted'`);
    console.log(`✨ ABSOLUTE FINAL TOTAL: ${final[0].total}`);

    process.exit(0);
}
autoHeal();
