import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';
import { reportService } from '../src/services/report.service';

async function testTotals() {
  await initializeDatabase();
  try {
    const filters = { startDate: '2020-01-01', endDate: '2030-01-01', limit: 100000 };
    const inventory: any = await reportService.inventoryReport(filters);
    
    let invSold = 0;
    let openingStockSold = 0;
    
    inventory.data.forEach((row: any) => {
      invSold += Number(row.soldQty) || 0;
      if (row.poInvoiceNumber === 'OPENING-STOCK') {
         openingStockSold += Number(row.soldQty) || 0;
      }
    });
    
    const salesAnalysis: any = await reportService.salesAnalysisReport(filters);
    let saSales = 0;
    if (salesAnalysis.data) {
      salesAnalysis.data.forEach((row: any) => {
        saSales += Number(row.quantity) || 0;
      });
    }

    console.log(`Total Opening Stock Sold: ${openingStockSold}`);
    console.log(`SALES: Inventory Analysis = ${invSold} | Sales Analysis = ${saSales}`);
    
  } catch (err) {
    console.error(err);
  } finally {
    await closeDatabase();
  }
}
testTotals().catch(console.error);
