import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';
import { reportService } from '../src/services/report.service';

async function testTotals() {
  await initializeDatabase();
  
  try {
    const filters = { startDate: '2020-01-01', endDate: '2030-01-01', limit: 100000 };
    
    // 1. Stock Ledger
    console.log("Fetching Stock Ledger...");
    const stockLedger = await reportService.stockLedgerReport(filters);
    let slPurchases = 0;
    let slSales = 0;
    let slSalesReturns = 0;
    let slPurchaseReturns = 0;
    
    stockLedger.data.forEach((row: any) => {
      slPurchases += Number(row.purchased_qty) || 0;
      slSales += Number(row.sold_qty) || 0;
      slSalesReturns += Number(row.sales_return_qty) || 0;
      slPurchaseReturns += Number(row.purchase_return_qty) || 0;
    });
    
    // 2. Purchase Analysis
    console.log("Fetching Purchase Analysis...");
    const purchaseAnalysis: any = await reportService.purchaseAnalysisReport(filters);
    const paPurchases = Number(purchaseAnalysis.summary.totalItems) || 0;
    
    // 3. Sales Analysis
    console.log("Fetching Sales Analysis...");
    const salesAnalysis: any = await reportService.salesAnalysisReport(filters);
    let saSales = 0;
    if (salesAnalysis.data) {
      salesAnalysis.data.forEach((row: any) => {
        saSales += Number(row.sold_qty || row.quantity || 0);
      });
    } else {
      console.log("Could not find salesAnalysis.data:", Object.keys(salesAnalysis));
    }
    
    // 4. Sales Return Analysis
    console.log("Fetching Sales Return Analysis...");
    const salesReturnAnalysis: any = await reportService.salesReturnReport(filters);
    const srReturns = Number(salesReturnAnalysis.summary?.totalQuantity) || 0;
    
    console.log("=========================================");
    console.log(`PURCHASES: Stock Ledger = ${slPurchases} | Purchase Analysis = ${paPurchases}`);
    console.log(`SALES: Stock Ledger = ${slSales} | Sales Analysis = ${saSales}`);
    console.log(`SALES RETURN: Stock Ledger = ${slSalesReturns} | Sales Return Analysis = ${srReturns}`);
    console.log("=========================================");
    
  } catch (err) {
    console.error(err);
  } finally {
    await closeDatabase();
  }
}

testTotals().catch(console.error);
