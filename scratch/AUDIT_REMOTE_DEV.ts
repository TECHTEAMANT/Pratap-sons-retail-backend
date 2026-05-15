import { DataSource } from 'typeorm';

async function auditRemote() {
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

        // 1. Total Barcodes
        const totalRes = await remoteDS.query(`SELECT COUNT(*) as count FROM barcode_batches WHERE status != 'deleted'`);
        console.log(`TOTAL BARCODES ON DEV: ${totalRes[0].count}`);

        // 2. Barcodes without PO
        const orphanRes = await remoteDS.query(`SELECT COUNT(*) as count FROM barcode_batches WHERE po_id IS NULL AND status != 'deleted'`);
        console.log(`ORPHAN BARCODES (NO PO): ${orphanRes[0].count}`);

        // 3. Official Purchase Total
        const poRes = await remoteDS.query(`SELECT SUM(total_items) as total FROM purchase_orders WHERE status = 'Completed'`);
        console.log(`OFFICIAL PURCHASE TOTAL (Completed): ${poRes[0].total}`);

        await remoteDS.destroy();
    } catch (error) {
        console.error("❌ Connection failed:", error);
    }
}
auditRemote();
