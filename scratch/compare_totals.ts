import { AppDataSource } from '../src/config/data-source';
import { reportService } from '../src/services/report.service';

async function test() {
  await AppDataSource.initialize();

  const sl = await reportService.stockLedgerReport({ exportMode: true, limit: 100000 });
  const closingTotal = sl.summary.totalClosing;
  
  const ir = await reportService.inventoryReport({ exportMode: true, limit: 100000 });
  const inventoryTotal = ir.data.data ? ir.data.data.reduce((sum: any, item: any) => sum + (item.availableQty || 0), 0) : ir.data.reduce((sum: any, item: any) => sum + (item.availableQty || 0), 0);
  
  console.log("Stock Ledger Total Closing:", closingTotal);
  console.log("Inventory Report Total Available:", inventoryTotal);
  console.log("Difference:", Math.abs(closingTotal - inventoryTotal));

  process.exit(0);
}
test();
