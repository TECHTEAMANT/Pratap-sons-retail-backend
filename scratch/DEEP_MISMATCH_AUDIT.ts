import { AppDataSource } from '../src/config/data-source';

async function audit() {
    await AppDataSource.initialize();
    console.log("Database Connected. Starting DEEP SIZE-WISE AUDIT...");

    // This query finds mismatches between physical barcodes and the declared purchase_items
    const mismatches = await AppDataSource.query(`
        WITH BarcodeCounts AS (
            SELECT 
                bb.po_id, 
                bb.design_no, 
                bb.size as size_id, 
                SUM(bb.total_quantity) as actual_barcodes
            FROM barcode_batches bb
            WHERE bb.po_id IS NOT NULL AND bb.status != 'deleted'
            GROUP BY bb.po_id, bb.design_no, bb.size
        ),
        PO_Declared AS (
            SELECT 
                po_id, 
                design_no, 
                size as size_id, 
                SUM(quantity) as declared_qty
            FROM purchase_items
            GROUP BY po_id, design_no, size
        )
        SELECT 
            po.po_number,
            bc.design_no,
            sz.name as size_name,
            COALESCE(pd.declared_qty, 0) as "Invoiced_Qty",
            bc.actual_barcodes as "Inventory_Qty",
            (bc.actual_barcodes - COALESCE(pd.declared_qty, 0)) as "Extra_Units",
            po.id as po_id,
            bc.size_id as size_id
        FROM BarcodeCounts bc
        LEFT JOIN PO_Declared pd ON pd.po_id::text = bc.po_id::text 
                                AND pd.design_no = bc.design_no 
                                AND pd.size_id::text = bc.size_id::text
        JOIN purchase_orders po ON po.id::text = bc.po_id::text
        LEFT JOIN sizes sz ON sz.id::text = bc.size_id::text
        WHERE bc.actual_barcodes > COALESCE(pd.declared_qty, 0)
        ORDER BY "Extra_Units" DESC
    `);

    if (mismatches.length === 0) {
        console.log("✅ PERFECT PARITY: All barcodes match your purchase items exactly!");
    } else {
        console.log(`Found ${mismatches.length} Mismatches (Extra Barcodes detected).`);
        console.table(mismatches.slice(0, 50));
        
        const totalExtra = mismatches.reduce((acc: number, curr: any) => acc + parseFloat(curr.Extra_Units), 0);
        console.log(`--------------------------------------------------`);
        console.log(`Total Extra Barcodes found across all designs: ${totalExtra}`);
        console.log(`--------------------------------------------------`);
        console.log("Next Step: Run the REPAIR script to delete these extra units.");
    }

    process.exit(0);
}

audit().catch(err => {
    console.error(err);
    process.exit(1);
});
