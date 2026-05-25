import { AppDataSource, initializeDatabase } from '../src/config/data-source';
import * as fs from 'fs';

async function testBatchMapping() {
  try {
    await initializeDatabase();
    
    let logText = '';
    const log = (msg: string) => {
      console.log(msg);
      logText += msg + '\n';
    };

    const startTotal = Date.now();

    log('Fetching purchase items...');
    const startItems = Date.now();
    const purchaseItems = await AppDataSource.query(`
      SELECT 
        pi.id as "id",
        pi.design_no as "design",
        pi.quantity as "total_qty",
        pi.cost_per_item as "cost",
        pi.mrp as "mrp",
        pi.hsn_code as "hsn",
        po.invoice_number as "po_no",
        po.order_date as "po_date",
        v.name as "vendorName",
        pg.name as "productGroup",
        cl.name as "color",
        sz.name as "size",
        pi.po_id as "po_id",
        pi.color as "color_id",
        pi.size as "size_id"
      FROM purchase_items pi
      INNER JOIN purchase_orders po ON po.id = pi.po_id
      LEFT JOIN vendors v ON v.id = po.vendor
      LEFT JOIN product_groups pg ON pg.id = pi.product_group
      LEFT JOIN colors cl ON cl.id = pi.color
      LEFT JOIN sizes sz ON sz.id = pi.size
      WHERE po.order_date BETWEEN '2000-01-01' AND '2099-12-31'
      ORDER BY po.order_date ASC, pi.design_no ASC;
    `);
    const durationItems = Date.now() - startItems;
    log(`Fetched ${purchaseItems.length} purchase items in ${durationItems}ms.`);

    if (purchaseItems.length === 0) {
      log('No purchase items found.');
      fs.writeFileSync('scratch/durations.txt', logText, 'utf8');
      await AppDataSource.destroy();
      return;
    }

    log('Fetching barcode batches...');
    const startBarcodes = Date.now();
    const barcodeBatches = await AppDataSource.query(`
      SELECT 
        barcode_alias_8digit, 
        barcode_structured, 
        photos[1] as photo, 
        po_id, 
        design_no, 
        color, 
        size
      FROM barcode_batches
      WHERE status != 'deleted' 
        AND po_id IN (
          SELECT DISTINCT pi.po_id 
          FROM purchase_items pi
          INNER JOIN purchase_orders po ON po.id = pi.po_id
          WHERE po.order_date BETWEEN '2000-01-01' AND '2099-12-31'
        )
    `);
    const durationBarcodes = Date.now() - startBarcodes;
    log(`Fetched ${barcodeBatches.length} barcode batches in ${durationBarcodes}ms.`);

    log('Fetching sales/returns transactions in batch...');
    const startTx = Date.now();

    const sales = await AppDataSource.query(`
      SELECT barcode_8digit, SUM(quantity) as qty
      FROM sales_invoice_items
      WHERE barcode_8digit IN (
        SELECT barcode_alias_8digit 
        FROM barcode_batches 
        WHERE status != 'deleted' 
          AND po_id IN (
            SELECT DISTINCT pi.po_id 
            FROM purchase_items pi
            INNER JOIN purchase_orders po ON po.id = pi.po_id
            WHERE po.order_date BETWEEN '2000-01-01' AND '2099-12-31'
          )
      )
      GROUP BY barcode_8digit
    `);

    const salesReturns = await AppDataSource.query(`
      SELECT barcode_8digit, SUM(quantity) as qty
      FROM sales_return_items
      WHERE barcode_8digit IN (
        SELECT barcode_alias_8digit 
        FROM barcode_batches 
        WHERE status != 'deleted' 
          AND po_id IN (
            SELECT DISTINCT pi.po_id 
            FROM purchase_items pi
            INNER JOIN purchase_orders po ON po.id = pi.po_id
            WHERE po.order_date BETWEEN '2000-01-01' AND '2099-12-31'
          )
      )
      GROUP BY barcode_8digit
    `);

    const purchaseReturns = await AppDataSource.query(`
      SELECT barcode_id as barcode_8digit, SUM(quantity) as qty
      FROM purchase_return_items
      WHERE barcode_id IN (
        SELECT barcode_alias_8digit 
        FROM barcode_batches 
        WHERE status != 'deleted' 
          AND po_id IN (
            SELECT DISTINCT pi.po_id 
            FROM purchase_items pi
            INNER JOIN purchase_orders po ON po.id = pi.po_id
            WHERE po.order_date BETWEEN '2000-01-01' AND '2099-12-31'
          )
      )
      GROUP BY barcode_id
    `);
    const durationTx = Date.now() - startTx;
    log(`Transactions fetched in ${durationTx}ms.`);

    log('Mapping results in memory...');
    const startMap = Date.now();

    const salesMap = new Map<string, number>();
    sales.forEach((s: any) => salesMap.set(s.barcode_8digit, Number(s.qty)));

    const salesReturnMap = new Map<string, number>();
    salesReturns.forEach((s: any) => salesReturnMap.set(s.barcode_8digit, Number(s.qty)));

    const purchaseReturnMap = new Map<string, number>();
    purchaseReturns.forEach((s: any) => purchaseReturnMap.set(s.barcode_8digit, Number(s.qty)));

    const barcodesByKey = new Map<string, any[]>();
    barcodeBatches.forEach((bb: any) => {
      const key = `${bb.po_id}_${bb.design_no}_${bb.color || ''}_${bb.size || ''}`;
      if (!barcodesByKey.has(key)) barcodesByKey.set(key, []);
      barcodesByKey.get(key)!.push(bb);
    });

    const finalResults = purchaseItems.map((pi: any) => {
      const key = `${pi.po_id}_${pi.design}_${pi.color_id || ''}_${pi.size_id || ''}`;
      const matchingBarcodes = barcodesByKey.get(key) || [];

      let barcode_alias = 'NO BARCODE';
      let barcode = 'NO BARCODE';
      let photo = null;
      let soldQty = 0;
      let returnedQty = 0;

      if (matchingBarcodes.length > 0) {
        barcode_alias = matchingBarcodes[0].barcode_alias_8digit || 'NO BARCODE';
        barcode = matchingBarcodes[0].barcode_structured || 'NO BARCODE';
        photo = matchingBarcodes[0].photo || null;

        matchingBarcodes.forEach((bb: any) => {
          const alias = bb.barcode_alias_8digit;
          const sQty = salesMap.get(alias) || 0;
          const srQty = salesReturnMap.get(alias) || 0;
          const prQty = purchaseReturnMap.get(alias) || 0;

          soldQty += (sQty - srQty);
          returnedQty += prQty;
        });
      }

      return {
        ...pi,
        barcode_alias,
        barcode,
        photo,
        soldQty,
        returnedQty,
      };
    });

    const durationMap = Date.now() - startMap;
    log(`Mapping finished in ${durationMap}ms.`);
    const durationTotal = Date.now() - startTotal;
    log(`Total operation finished in ${durationTotal}ms.`);

    fs.writeFileSync('scratch/durations.txt', logText, 'utf8');

    await AppDataSource.destroy();
  } catch (err) {
    console.error(err);
  }
}

testBatchMapping();
