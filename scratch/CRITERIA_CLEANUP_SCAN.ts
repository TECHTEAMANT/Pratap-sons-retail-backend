import { AppDataSource } from '../src/config/data-source';
import { BarcodeBatch } from '../src/entities/BarcodeBatch';
import { PurchaseOrder } from '../src/entities/PurchaseOrder';

async function scan() {
    await AppDataSource.initialize();
    console.log("Database Connected. Scanning for garbage barcodes...");

    const items = await AppDataSource.getRepository(BarcodeBatch).createQueryBuilder('bb')
        .leftJoin(PurchaseOrder, 'po', 'po.id = bb.po_id')
        .leftJoin('bb.size', 'sz')
        .select([
            'bb.id as id',
            'bb.barcode_alias_8digit as barcode',
            'bb.design_no as design',
            'sz.name as size_name',
            'po.invoice_number as invoice',
            'bb.po_id as po_id',
            'bb.total_quantity as qty'
        ])
        .where('sz.name IS NULL OR sz.name ILIKE :unk', { unk: '%UNKNOWN%' })
        .orWhere('po.invoice_number IS NULL OR po.invoice_number = :empty OR po.invoice_number = :na', { empty: '', na: 'N/A' })
        .orWhere('bb.po_id IS NULL')
        .getRawMany();

    const totalQty = items.reduce((acc, curr) => acc + parseFloat(curr.qty || 0), 0);
    
    console.log(`-------------------------------------------`);
    console.log(`Found ${items.length} Barcode Batches to remove.`);
    console.log(`Total Units to remove: ${totalQty}`);
    console.log(`-------------------------------------------`);
    
    if (items.length > 0) {
        console.log("Sample of items to be removed:");
        console.table(items.slice(0, 20));
    }

    process.exit(0);
}

scan().catch(err => {
    console.error(err);
    process.exit(1);
});
