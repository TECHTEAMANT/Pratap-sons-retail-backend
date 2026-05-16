import { AppDataSource } from '../src/data-source';
import { BarcodeBatch } from '../src/entities/BarcodeBatch';

async function checkMissing() {
    await AppDataSource.initialize();
    const vendorId = '5f5cc3c5-55a7-46f8-8c54-0b6ad7c0c01b'; // A.R. ENTERPRISES
    const barcodes = await AppDataSource.getRepository(BarcodeBatch).find({
        where: { vendor_id: vendorId },
        order: { created_at: 'DESC' }
    });

    console.log(`Found ${barcodes.length} barcodes for this vendor.`);
    barcodes.forEach(b => {
        console.log(`Barcode: ${b.barcode_alias_8digit}, Design: ${b.design_no}, Status: ${b.status}, Qty: ${b.total_quantity}, PO: ${b.po_id}`);
    });
    
    await AppDataSource.destroy();
}

checkMissing();
