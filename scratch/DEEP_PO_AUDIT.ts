import { AppDataSource } from '../src/config/data-source';

async function deepAudit() {
    await AppDataSource.initialize();
    
    const res = await AppDataSource.query(`
        SELECT 
            po.invoice_number, 
            po.order_date,
            po.total_items,
            SUM(bb.total_quantity) as barcodes_total,
            SUM(bb.total_quantity) - po.total_items as diff
        FROM purchase_orders po
        JOIN barcode_batches bb ON bb.po_id = po.id
        WHERE po.order_date BETWEEN '2026-02-01' AND '2026-05-15'
        AND po.status != 'deleted'
        AND bb.status != 'deleted'
        GROUP BY po.id, po.invoice_number, po.order_date, po.total_items
        HAVING SUM(bb.total_quantity) != po.total_items
        ORDER BY diff DESC
    `);
    
    console.log("Invoices with Barcode Discrepancies:");
    console.table(res);
    
    const totalDiff = res.reduce((acc: number, curr: any) => acc + Number(curr.diff), 0);
    console.log(`TOTAL DISCREPANCY ACROSS ALL POs: ${totalDiff}`);

    process.exit(0);
}
deepAudit();
