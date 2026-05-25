import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';
import { reportService } from '../src/services/report.service';

async function testTotals() {
  await initializeDatabase();
  try {
    const filters = { startDate: '2020-01-01', endDate: '2030-01-01', limit: 100000 };
    const salesAnalysis: any = await reportService.salesAnalysisReport(filters);
    
    let grossSales = 0;
    let returns = 0;
    
    salesAnalysis.data.forEach((row: any) => {
      if (row.type === 'SALE') grossSales += Number(row.quantity);
      if (row.type === 'RETURN') returns += Number(row.quantity);
    });
    
    console.log(`Gross Sales: ${grossSales}`);
    console.log(`Returns: ${returns}`);
    console.log(`Net Sales: ${grossSales + returns}`);
    
  } catch (err) {
    console.error(err);
  } finally {
    await closeDatabase();
  }
}
testTotals().catch(console.error);
