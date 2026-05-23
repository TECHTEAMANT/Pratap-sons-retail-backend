import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';

async function auditSales() {
  await initializeDatabase();
  try {
    const filters = { startDate: '2020-01-01', endDate: '2030-01-01', limit: 100000 };
    
    const [salesAgg, salesReturnAgg] = await Promise.all([
      AppDataSource.query(`SELECT barcode_8digit, SUM(quantity)::int as qty FROM sales_invoice_items GROUP BY barcode_8digit`),
      AppDataSource.query(`SELECT barcode_8digit, SUM(quantity)::int as qty FROM sales_return_items GROUP BY barcode_8digit`)
    ]);
    
    const salesMap = new Map<string, number>();
    salesAgg.forEach((s: any) => salesMap.set(s.barcode_8digit, Number(s.qty)));
    const salesReturnMap = new Map<string, number>();
    salesReturnAgg.forEach((s: any) => salesReturnMap.set(s.barcode_8digit, Number(s.qty)));
    
    let totalSalesSystem = 0;
    salesMap.forEach((qty, barcode) => {
        totalSalesSystem += qty - (salesReturnMap.get(barcode) || 0);
    });
    console.log(`Total Net Sales System-wide: ${totalSalesSystem}`);

    // Inventory Report Logic
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
      SELECT bb.barcode_alias_8digit, bb.po_id, bb.design_no, bb.color, bb.size, bb.status
      FROM barcode_batches bb
      WHERE bb.po_id IN (${poIdList})
    `);
    
    // Categorize Barcodes
    const validBarcodes = new Set();
    const deletedBarcodes = new Set();
    barcodeBatches.forEach((bb: any) => {
        if (bb.status === 'deleted') deletedBarcodes.add(bb.barcode_alias_8digit);
        else validBarcodes.add(bb.barcode_alias_8digit);
    });

    let salesFromDeleted = 0;
    deletedBarcodes.forEach((barcode: any) => {
        if (!validBarcodes.has(barcode)) { // only count if it's not ALSO a valid barcode somehow
            salesFromDeleted += (salesMap.get(barcode) || 0) - (salesReturnMap.get(barcode) || 0);
        }
    });

    let salesFromNonPurchased = 0;
    salesMap.forEach((qty, barcode) => {
        if (!validBarcodes.has(barcode) && !deletedBarcodes.has(barcode)) {
            salesFromNonPurchased += qty - (salesReturnMap.get(barcode) || 0);
        }
    });

    // Capping Calculation
    const barcodesByKey = new Map<string, any[]>();
    barcodeBatches.forEach((bb: any) => {
      if (bb.status !== 'deleted') {
          const key = `${bb.po_id}_${bb.design_no}_${bb.color || ''}_${bb.size || ''}`;
          if (!barcodesByKey.has(key)) barcodesByKey.set(key, []);
          barcodesByKey.get(key)!.push(bb);
      }
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
    
    let totalInventorySales = 0;
    let totalCapped = 0;

    detailedItemsRes.forEach((pi: any) => {
      const key = `${pi.po_id}_${pi.design}_${pi.color_id || ''}_${pi.size_id || ''}`;
      const rowTotalQty = Number(pi.total_qty || 0);
      let remSold = remainingSoldMap.get(key) || 0;
      
      if (remSold > 0) {
         const rowSold = Math.min(rowTotalQty, remSold);
         remainingSoldMap.set(key, remSold - rowSold);
         totalInventorySales += rowSold;
      }
    });
    
    remainingSoldMap.forEach((remSold, key) => {
      if (remSold > 0) {
        totalCapped += remSold;
      }
    });

    console.log(`Total Sales in Inventory Report: ${totalInventorySales}`);
    console.log(`Discrepancy Breakdown:`);
    console.log(`1. Sales from Items NOT in Purchase Invoices (e.g., Opening Stock): ${salesFromNonPurchased}`);
    console.log(`2. Sales from DELETED barcodes (but linked to a Purchase): ${salesFromDeleted}`);
    console.log(`3. Capped Sales (Sales quantity > Purchased quantity): ${totalCapped}`);
    
    console.log(`Sum of all parts: ${totalInventorySales + salesFromNonPurchased + salesFromDeleted + totalCapped} (Should equal ${totalSalesSystem})`);

  } catch (err) {
    console.error(err);
  } finally {
    await closeDatabase();
  }
}
auditSales().catch(console.error);
