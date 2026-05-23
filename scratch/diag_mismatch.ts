import { AppDataSource, initializeDatabase } from '../src/config/data-source';
import * as fs from 'fs';
import * as path from 'path';

async function diagMismatch() {
  try {
    await initializeDatabase();
    console.log('Connected.\n');

    // 1. What does the ACTUAL sales_invoice_items table total?
    const actualSales = await AppDataSource.query(`
      SELECT SUM(quantity)::int as total_sold, COUNT(*) as line_items
      FROM sales_invoice_items
    `);
    console.log('=== ACTUAL SALES INVOICE ITEMS ===');
    console.log(`Total sold qty: ${actualSales[0].total_sold}, Line items: ${actualSales[0].line_items}`);

    // 2. What does the ACTUAL purchase_return_items table total?
    const actualPurchaseReturns = await AppDataSource.query(`
      SELECT SUM(quantity)::int as total_returned, COUNT(*) as line_items
      FROM purchase_return_items
    `);
    console.log('\n=== ACTUAL PURCHASE RETURN ITEMS ===');
    console.log(`Total purchase returned qty: ${actualPurchaseReturns[0].total_returned}, Line items: ${actualPurchaseReturns[0].line_items}`);

    // 3. What does the inventory report show for sales (only barcodes in active barcode_batches)?
    const inventorySales = await AppDataSource.query(`
      SELECT SUM(sii.quantity)::int as counted_sold
      FROM sales_invoice_items sii
      WHERE sii.barcode_8digit IN (
        SELECT bb.barcode_alias_8digit FROM barcode_batches bb WHERE bb.status != 'deleted' AND bb.po_id IS NOT NULL
      )
    `);
    console.log('\n=== SALES COUNTED BY INVENTORY REPORT (via barcode match) ===');
    console.log(`Inventory-counted sold qty: ${inventorySales[0].counted_sold}`);

    // 4. Sales that are MISSING from inventory report (barcodes not in active barcode_batches)
    const missingSales = await AppDataSource.query(`
      SELECT sii.barcode_8digit, SUM(sii.quantity)::int as qty, COUNT(*) as line_items
      FROM sales_invoice_items sii
      WHERE sii.barcode_8digit IS NOT NULL
        AND sii.barcode_8digit NOT IN (
          SELECT bb.barcode_alias_8digit FROM barcode_batches bb WHERE bb.status != 'deleted' AND bb.po_id IS NOT NULL
        )
      GROUP BY sii.barcode_8digit
      ORDER BY qty DESC
      LIMIT 30
    `);
    console.log(`\n=== SALES WITH BARCODES NOT IN ACTIVE INVENTORY (top 30) ===`);
    console.log(`Missing sales line count: ${missingSales.length}`);
    missingSales.forEach((r: any) => console.log(`  Barcode: ${r.barcode_8digit} | Qty: ${r.qty} | Lines: ${r.line_items}`));

    // 5. Sales with NULL barcode
    const nullBarcodeSales = await AppDataSource.query(`
      SELECT SUM(quantity)::int as qty, COUNT(*) as line_items
      FROM sales_invoice_items
      WHERE barcode_8digit IS NULL OR barcode_8digit = ''
    `);
    console.log(`\n=== SALES WITH NULL/EMPTY BARCODE ===`);
    console.log(`Qty: ${nullBarcodeSales[0].qty}, Lines: ${nullBarcodeSales[0].line_items}`);

    // 6. Purchase returns that are MISSING from inventory report
    const missingPurchaseReturns = await AppDataSource.query(`
      SELECT pri.barcode_id, SUM(pri.quantity)::int as qty, COUNT(*) as line_items
      FROM purchase_return_items pri
      WHERE pri.barcode_id NOT IN (
        SELECT bb.barcode_alias_8digit FROM barcode_batches bb WHERE bb.status != 'deleted' AND bb.po_id IS NOT NULL
      )
      GROUP BY pri.barcode_id
      ORDER BY qty DESC
      LIMIT 20
    `);
    console.log(`\n=== PURCHASE RETURNS WITH BARCODES NOT IN ACTIVE INVENTORY (top 20) ===`);
    console.log(`Missing purchase return line count: ${missingPurchaseReturns.length}`);
    missingPurchaseReturns.forEach((r: any) => console.log(`  Barcode: ${r.barcode_id} | Qty: ${r.qty} | Lines: ${r.line_items}`));

    // 7. Purchase returns counted by inventory report
    const inventoryPurchaseReturns = await AppDataSource.query(`
      SELECT SUM(pri.quantity)::int as counted_returned
      FROM purchase_return_items pri
      WHERE pri.barcode_id IN (
        SELECT bb.barcode_alias_8digit FROM barcode_batches bb WHERE bb.status != 'deleted' AND bb.po_id IS NOT NULL
      )
    `);
    console.log(`\n=== PURCHASE RETURNS COUNTED BY INVENTORY REPORT ===`);
    console.log(`Inventory-counted purchase returned qty: ${inventoryPurchaseReturns[0].counted_returned}`);

    // 8. Summary mismatch
    console.log('\n=== MISMATCH SUMMARY ===');
    const totalSold = Number(actualSales[0].total_sold || 0);
    const inventoryCounted = Number(inventorySales[0].counted_sold || 0);
    const nullSold = Number(nullBarcodeSales[0].qty || 0);
    console.log(`Sales mismatch: Actual=${totalSold}, Inventory counted=${inventoryCounted}, Diff=${totalSold - inventoryCounted}`);
    console.log(`Sales with null barcode: ${nullSold}`);
    console.log(`Sales with unmatched barcode: ${totalSold - inventoryCounted - nullSold}`);

    const totalReturned = Number(actualPurchaseReturns[0].total_returned || 0);
    const inventoryCountedReturns = Number(inventoryPurchaseReturns[0].counted_returned || 0);
    console.log(`\nPurchase return mismatch: Actual=${totalReturned}, Inventory counted=${inventoryCountedReturns}, Diff=${totalReturned - inventoryCountedReturns}`);

    // Write result to file
    const output = {
      actualSales: actualSales[0],
      inventorySales: inventorySales[0],
      nullBarcodeSales: nullBarcodeSales[0],
      missingSalesTop: missingSales,
      actualPurchaseReturns: actualPurchaseReturns[0],
      inventoryPurchaseReturns: inventoryPurchaseReturns[0],
      missingPurchaseReturnsTop: missingPurchaseReturns,
    };
    fs.writeFileSync(path.join(__dirname, 'mismatch_diagnosis.json'), JSON.stringify(output, null, 2), 'utf8');
    console.log('\nDiagnosis written to scratch/mismatch_diagnosis.json');

    await AppDataSource.destroy();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
diagMismatch();
