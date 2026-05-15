import { DataSource } from 'typeorm';

async function cleanupRemote() {
    const remoteDS = new DataSource({
        type: 'postgres',
        host: '98.70.48.200',
        port: 5432,
        username: 'postgres_dev',
        password: 'ant-admin@123_dev',
        database: 'invento_erp_dev',
        synchronize: false,
        logging: false,
    });

    try {
        await remoteDS.initialize();
        console.log("✅ Connected to REMOTE DEV DB");

        // 1. DELETE ORPHANS
        console.log("🧹 Deleting Orphan Barcodes (No PO)...");
        const orphans = await remoteDS.query(`
            UPDATE barcode_batches 
            SET status = 'deleted' 
            WHERE po_id IS NULL 
            AND status != 'deleted' 
            AND available_quantity > 0
        `);
        console.log("   Done.");

        // 2. DELETE OVERAGES
        console.log("⚖️ Reconciling PO Overages...");
        const pos = await remoteDS.query(`SELECT id, invoice_number, total_items FROM purchase_orders WHERE status = 'Completed'`);
        let overageDeleted = 0;
        
        for (const po of pos) {
            const barcodes = await remoteDS.query(`
                SELECT id FROM barcode_batches 
                WHERE po_id = $1 AND status != 'deleted'
                ORDER BY created_at DESC
            `, [po.id]);

            if (barcodes.length > po.total_items) {
                const diff = barcodes.length - po.total_items;
                const toDeleteIds = barcodes.slice(0, diff).map((b: any) => b.id);
                await remoteDS.query(`UPDATE barcode_batches SET status = 'deleted' WHERE id = ANY($1)`, [toDeleteIds]);
                overageDeleted += diff;
            }
        }
        console.log(`   Deleted ${overageDeleted} overage barcodes.`);

        // 3. FINAL COUNT
        const final = await remoteDS.query(`SELECT COUNT(*) as count FROM barcode_batches WHERE status != 'deleted'`);
        console.log(`\n✨ FINAL DEV TOTAL: ${final[0].count}`);

        await remoteDS.destroy();
    } catch (error) {
        console.error("❌ Remote cleanup failed:", error);
    }
}
cleanupRemote();
