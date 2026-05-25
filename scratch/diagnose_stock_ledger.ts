import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';

async function diagnoseBarcode() {
  await initializeDatabase();
  try {
    const barcode = '00001542';

    // 1. Check what purchase exists for this barcode in barcode_batches
    const bb = await AppDataSource.query(`
      SELECT bb.barcode_alias_8digit, bb.design_no, bb.po_id, bb.status, po.invoice_number, po.order_date, po.status as po_status
      FROM barcode_batches bb
      LEFT JOIN purchase_orders po ON po.id = bb.po_id
      WHERE bb.barcode_alias_8digit = '${barcode}'
    `);
    console.log('Barcode Batches:', bb);

    // 2. Check purchase_items for this barcode's PO
    if (bb.length > 0 && bb[0].po_id) {
      const pi = await AppDataSource.query(`
        SELECT pi.design_no, pi.quantity, po.invoice_number, po.order_date, po.status
        FROM purchase_items pi
        INNER JOIN purchase_orders po ON po.id = pi.po_id
        WHERE pi.po_id = '${bb[0].po_id}' AND pi.design_no = '${bb[0].design_no}'
      `);
      console.log('\nPurchase Items for this PO/design:', pi);
    }

    // 3. Check sales for this barcode
    const sales = await AppDataSource.query(`
      SELECT sii.barcode_8digit, SUM(sii.quantity) as total_sold, si.invoice_date
      FROM sales_invoice_items sii
      INNER JOIN sales_invoices si ON si.id = sii.invoice_id
      WHERE sii.barcode_8digit = '${barcode}'
      GROUP BY sii.barcode_8digit, si.invoice_date
    `);
    console.log('\nSales:', sales);

    // 4. Check what the stock ledger sees as the "purchase barcode" for this item
    // The key question: does the purchase_items row link back to this barcode properly?
    const purchaseCheck = await AppDataSource.query(`
      SELECT 
        pi.design_no, pi.quantity,
        (SELECT bb.barcode_alias_8digit FROM barcode_batches bb 
          WHERE bb.po_id = pi.po_id AND bb.design_no = pi.design_no 
            AND bb.status != 'deleted'
          ORDER BY bb.created_at DESC LIMIT 1) as barcode_in_ledger,
        po.invoice_number, po.status as po_status
      FROM purchase_items pi
      INNER JOIN purchase_orders po ON po.id = pi.po_id
      INNER JOIN barcode_batches bb2 ON bb2.po_id = pi.po_id AND bb2.barcode_alias_8digit = '${barcode}'
      LIMIT 5
    `);
    console.log('\nPurchase lookup for this barcode:', purchaseCheck);

  } catch (err) {
    console.error(err);
  } finally {
    await closeDatabase();
  }
}
diagnoseBarcode().catch(console.error);
