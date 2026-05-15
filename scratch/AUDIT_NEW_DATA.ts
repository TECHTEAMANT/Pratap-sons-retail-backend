import { AppDataSource } from '../src/config/data-source';

async function auditNewData() {
    await AppDataSource.initialize();
    
    // 1. Total Barcodes (All)
    const allBarcodes = await AppDataSource.query(`SELECT COUNT(*) as count FROM barcode_batches WHERE status != 'deleted'`);
    console.log(`TOTAL PHYSICAL BARCODES (ALL): ${allBarcodes[0].count}`);

    // 2. Total Barcodes with PO link
    const linkedBarcodes = await AppDataSource.query(`SELECT COUNT(*) as count FROM barcode_batches WHERE po_id IS NOT NULL AND status != 'deleted'`);
    console.log(`BARCODES WITH PO LINK: ${linkedBarcodes[0].count}`);

    // 3. Total Barcodes without PO link (ORPHANS)
    const orphanBarcodes = await AppDataSource.query(`SELECT COUNT(*) as count FROM barcode_batches WHERE po_id IS NULL AND status != 'deleted'`);
    console.log(`ORPHAN BARCODES (NO PO): ${orphanBarcodes[0].count}`);

    // 4. Official Purchase Total (Feb-May)
    const poTotal = await AppDataSource.query(`SELECT SUM(total_items) as total FROM purchase_orders WHERE order_date BETWEEN '2026-02-01' AND '2026-05-15' AND status != 'deleted'`);
    console.log(`OFFICIAL PURCHASE TOTAL (Feb-May): ${poTotal[0].total}`);

    process.exit(0);
}
auditNewData();
