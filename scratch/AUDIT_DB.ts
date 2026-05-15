import { AppDataSource } from '../src/config/data-source';

async function audit() {
    await AppDataSource.initialize();
    console.log("Status Counts:");
    const status = await AppDataSource.query(`SELECT status, COUNT(*) as cnt FROM barcode_batches GROUP BY status`);
    console.table(status);

    console.log("Date Counts:");
    const dates = await AppDataSource.query(`SELECT DATE(created_at) as d, COUNT(*) as cnt FROM barcode_batches GROUP BY DATE(created_at) ORDER BY d DESC LIMIT 5`);
    console.table(dates);

    console.log("Active Quantity Check:");
    const activeQty = await AppDataSource.query(`SELECT COUNT(*) as row_count, SUM(available_quantity) as total_qty FROM barcode_batches WHERE status = 'active'`);
    console.table(activeQty);
    
    process.exit(0);
}
audit().catch(err => {
    console.error(err);
    process.exit(1);
});
