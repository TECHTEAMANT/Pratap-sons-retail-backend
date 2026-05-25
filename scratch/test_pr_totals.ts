import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';
import { reportService } from '../src/services/report.service';

async function testTotals() {
  await initializeDatabase();
  try {
    const filters = { startDate: '2020-01-01', endDate: '2030-01-01', limit: 100000 };
    const stockLedger = await reportService.stockLedgerReport(filters);
    let slPurchaseReturns = 0;
    stockLedger.data.forEach((row: any) => {
      slPurchaseReturns += Number(row.purchase_return_qty) || 0;
    });
    const prAnalysis: any = await reportService.purchaseReturnReport(filters);
    let prReturns = 0;
    if (prAnalysis.data) {
      prAnalysis.data.forEach((row: any) => {
        prReturns += Number(row.quantity) || 0;
      });
    }
    console.log(`PURCHASE RETURNS: Stock Ledger = ${slPurchaseReturns} | PR Analysis = ${prReturns}`);
  } catch (err) {
    console.error(err);
  } finally {
    await closeDatabase();
  }
}
testTotals().catch(console.error);
