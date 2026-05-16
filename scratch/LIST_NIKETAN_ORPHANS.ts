import { AppDataSource } from '../src/config/data-source';

async function listOrphans() {
    await AppDataSource.initialize();
    
    const res = await AppDataSource.query(`
        SELECT bb.barcode_alias_8digit, bb.po_id, bb.total_quantity
        FROM barcode_batches bb 
        WHERE bb.vendor = '850903cf-a0d5-456d-835a-7f835696a9b9'
    `);
    
    const validPoIds = [
        '16342486-3254-4dad-9e04-d4d5dd79b5ed', // PI2026000310
        'b75f1e29-d521-4afc-968f-a5c8ff6a0af6'  // PI2026000311
    ];
    
    const orphans = res.filter((b: any) => !validPoIds.includes(b.po_id));
    
    console.log('--- ORPHAN BARCODES (NOT ON PI 310/311) ---');
    console.table(orphans);
    process.exit(0);
}
listOrphans();
