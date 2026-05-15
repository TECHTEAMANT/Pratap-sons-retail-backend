import { AppDataSource } from '../src/config/data-source';

async function findGhosts() {
    await AppDataSource.initialize();
    
    const res = await AppDataSource.query(`
        SELECT bb.id, bb.barcode_alias_8digit, bb.total_quantity, bb.po_id
        FROM barcode_batches bb 
        WHERE bb.vendor = '850903cf-a0d5-456d-835a-7f835696a9b9'
    `);
    
    // Valid PO IDs
    const validPoIds = [
        '16342486-3254-4dad-9e04-d4d5dd79b5ed', // PI2026000310
        '65239794-d4f1-432a-bc91-3142750e3271'  // PI2026000311
    ];
    
    const ghosts = res.filter((b: any) => !validPoIds.includes(b.po_id));
    
    console.log('--- GHOST BARCODES (NOT ON PO 310/311) ---');
    console.table(ghosts);
    process.exit(0);
}
findGhosts();
