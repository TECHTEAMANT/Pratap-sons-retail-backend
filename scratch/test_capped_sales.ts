import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';

async function checkCappedSales() {
  await initializeDatabase();
  try {
    // Step 1: get detailed items
    const detailedItemsRes = await AppDataSource.query(`
      SELECT 
        SUM(pi.quantity) as "total_qty",
        pi.po_id as "po_id",
        pi.design_no as "design",
        pi.color as "color_id",
        pi.size as "size_id"
      FROM purchase_items pi
      INNER JOIN purchase_orders po ON po.id = pi.po_id
      GROUP BY pi.po_id, pi.design_no, pi.color, pi.size
    `);
    
    const poIds = Array.from(new Set(detailedItemsRes.map((pi: any) => pi.po_id))).filter(Boolean);
    const poIdList = poIds.map((id: any) => `'${id}'`).join(',');
    
    const barcodeBatches = await AppDataSource.query(`
      SELECT bb.barcode_alias_8digit, bb.po_id, bb.design_no, bb.color, bb.size
      FROM barcode_batches bb
      WHERE bb.status != 'deleted' AND bb.po_id IN (${poIdList})
    `);
    
    const aliases = Array.from(new Set(barcodeBatches.map((bb: any) => bb.barcode_alias_8digit))).filter(Boolean);
    const aliasesQuery = aliases.map((a: any) => `'${String(a).replace(/'/g, "''")}'`).join(',');
    
    const [salesAgg, salesReturnAgg] = await Promise.all([
      AppDataSource.query(`SELECT barcode_8digit, SUM(quantity)::int as qty FROM sales_invoice_items WHERE barcode_8digit IN (${aliasesQuery}) GROUP BY barcode_8digit`),
      AppDataSource.query(`SELECT barcode_8digit, SUM(quantity)::int as qty FROM sales_return_items WHERE barcode_8digit IN (${aliasesQuery}) GROUP BY barcode_8digit`)
    ]);
    
    const salesMap = new Map<string, number>();
    salesAgg.forEach((s: any) => salesMap.set(s.barcode_8digit, Number(s.qty)));
    const salesReturnMap = new Map<string, number>();
    salesReturnAgg.forEach((s: any) => salesReturnMap.set(s.barcode_8digit, Number(s.qty)));
    
    const barcodesByKey = new Map<string, any[]>();
    barcodeBatches.forEach((bb: any) => {
      const key = `${bb.po_id}_${bb.design_no}_${bb.color || ''}_${bb.size || ''}`;
      if (!barcodesByKey.has(key)) barcodesByKey.set(key, []);
      barcodesByKey.get(key)!.push(bb);
    });
    
    const remainingSoldMap = new Map<string, number>();
    barcodesByKey.forEach((matchingBarcodes, key) => {
        let sold = 0;
        const uniqueAliases = new Set(matchingBarcodes.map((bb: any) => bb.barcode_alias_8digit));
        uniqueAliases.forEach(alias => {
          if (alias) {
            sold += (salesMap.get(alias as string) || 0) - (salesReturnMap.get(alias as string) || 0);
          }
        });
        remainingSoldMap.set(key, sold);
    });
    
    // Process items and cap sales
    detailedItemsRes.forEach((pi: any) => {
      const key = `${pi.po_id}_${pi.design}_${pi.color_id || ''}_${pi.size_id || ''}`;
      const rowTotalQty = Number(pi.total_qty || 0);
      let remSold = remainingSoldMap.get(key) || 0;
      
      if (remSold > 0) {
         const rowSold = Math.min(rowTotalQty, remSold);
         remainingSoldMap.set(key, remSold - rowSold);
      }
    });
    
    let totalCapped = 0;
    remainingSoldMap.forEach((remSold, key) => {
      if (remSold > 0) {
        totalCapped += remSold;
        console.log(`Capped Sale: ${key} has ${remSold} sales that couldn't be distributed because it exceeded purchase quantity.`);
      }
    });
    
    console.log(`Total Sales Capped (Ignored): ${totalCapped}`);
    
  } catch (err) {
    console.error(err);
  } finally {
    await closeDatabase();
  }
}
checkCappedSales().catch(console.error);
