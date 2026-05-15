import { DataSource } from 'typeorm';

async function remoteAudit() {
    const RemoteDS = new DataSource({
        type: "postgres",
        host: "98.70.48.200",
        port: 5432,
        username: "postgres_dev",
        password: "ant-admin@123_dev",
        database: "invento_erp_dev",
        ssl: false,
    });

    try {
        await RemoteDS.initialize();
        console.log("📡 Connected to REMOTE DEV DATABASE.");

        // 1. Check Total Cost
        const costRes = await RemoteDS.query(`
            SELECT SUM(total_quantity * cost_actual) as cost 
            FROM barcode_batches 
            WHERE status != 'deleted'
        `);
        console.log(`REMOTE TOTAL COST: ${costRes[0].cost}`);

        // 2. Check Item Count in Feb-May range
        const countRes = await RemoteDS.query(`
            SELECT COUNT(bb.id) as total
            FROM barcode_batches bb
            JOIN purchase_orders po ON po.id = bb.po_id
            WHERE po.order_date BETWEEN '2026-02-01' AND '2026-05-15'
            AND po.status != 'deleted'
            AND bb.status != 'deleted'
        `);
        console.log(`REMOTE ITEM COUNT (Feb-May): ${countRes[0].total}`);

        // 3. Find items with NO PO but NOT DELETED
        const orphanRes = await RemoteDS.query(`
            SELECT COUNT(*) as count 
            FROM barcode_batches 
            WHERE po_id IS NULL AND status != 'deleted'
        `);
        console.log(`REMOTE ORPHANS (No PO): ${orphanRes[0].count}`);

        await RemoteDS.destroy();
    } catch (err) {
        console.error("❌ Failed to connect to remote DB:", err);
    }
    process.exit(0);
}
remoteAudit();
