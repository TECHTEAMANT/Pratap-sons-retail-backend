import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';
import { reportService } from '../src/services/report.service';

async function testTotals() {
  await initializeDatabase();
  try {
    const filters = { startDate: '2020-01-01', endDate: '2030-01-01', limit: 100000 };
    const inventory: any = await reportService.inventoryReport(filters);
    
    let invPurchRet = 0;
    
    inventory.data.forEach((row: any) => {
      invPurchRet += Number(row.purchase_return_qty || row.returnedQty || 0);
    });
    
    console.log(`Inventory Analysis Purchase Returns (total returnedQty/purchase_return_qty): ${invPurchRet}`);
    console.log(inventory.summary);
    
  } catch (err) {
    console.error(err);
  } finally {
    await closeDatabase();
  }
}
testTotals().catch(console.error);
