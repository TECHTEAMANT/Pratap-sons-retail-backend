import { AppDataSource } from '../src/config/data-source';

async function auditCreation() {
    await AppDataSource.initialize();
    
    // 1. Total Barcodes Created in Period
    const res = await AppDataSource.query(`
        SELECT COUNT(*) as count 
        FROM barcode_batches 
        WHERE created_at BETWEEN '2026-02-01' AND '2026-05-15 23:59:59'
        AND status != 'deleted'
    `);
    console.log(`TOTAL BARCODES CREATED FEB-MAY: ${res[0].count}`);

    // 2. Breakdown by with/without PO
    const linked = await AppDataSource.query(`
        SELECT COUNT(*) as count 
        FROM barcode_batches 
        WHERE created_at BETWEEN '2026-02-01' AND '2026-05-15 23:59:59'
        AND po_id IS NOT NULL
        AND status != 'deleted'
    `);
    console.log(`LINKED TO PO: ${linked[0].count}`);

    const unlinked = await AppDataSource.query(`
        SELECT COUNT(*) as count 
        FROM barcode_batches 
        WHERE created_at BETWEEN '2026-02-01' AND '2026-05-15 23:59:59'
        AND po_id IS NULL
        AND status != 'deleted'
    `);
    console.log(`NOT LINKED TO PO (ORPHANS): ${unlinked[0].count}`);

    process.exit(0);
}
auditCreation();
