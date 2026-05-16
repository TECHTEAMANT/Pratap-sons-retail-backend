import { AppDataSource } from '../src/data-source';
import { BarcodeBatch } from '../src/entities/BarcodeBatch';
import { PurchaseOrder } from '../src/entities/PurchaseOrder';

async function checkInvoices() {
    await AppDataSource.initialize();
    
    const poNumbers = ['PI2026000123', 'PI2026000102'];
    
    for (const poNo of poNumbers) {
        console.log(`\n--- Checking PO: ${poNo} ---`);
        const po = await AppDataSource.getRepository(PurchaseOrder).findOne({
            where: { invoice_number: poNo }
        });
        
        if (!po) {
            console.log(`PO ${poNo} not found!`);
            continue;
        }
        
        console.log(`PO ID: ${po.id}, Total Items: ${po.total_items}, Total Amount: ${po.total_amount}`);
        
        const barcodes = await AppDataSource.getRepository(BarcodeBatch).find({
            where: { po_id: po.id }
        });
        
        console.log(`Found ${barcodes.length} barcodes linked to this PO ID.`);
        barcodes.forEach(b => {
            console.log(`  Barcode: ${b.barcode_alias_8digit}, Design: ${b.design_no}, Status: ${b.status}, Cost: ${b.cost_actual}, Qty: ${b.total_quantity}`);
        });
        
        // Also check by order_number string just in case
        const barcodesByNo = await AppDataSource.getRepository(BarcodeBatch).find({
            where: { order_number: poNo }
        });
        if (barcodesByNo.length > barcodes.length) {
            console.log(`  Found ${barcodesByNo.length} barcodes linked by Order Number string.`);
        }
    }
    
    await AppDataSource.destroy();
}

checkInvoices();
