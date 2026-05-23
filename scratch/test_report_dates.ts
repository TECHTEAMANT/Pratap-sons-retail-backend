import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';
import { reportService } from '../src/services/report.service';

async function testReport() {
  await initializeDatabase();
  
  const filters = {
    startDate: '2026-05-01',
    endDate: '2026-05-31',
    design: 'COT FEB 2',
    page: 1,
    limit: 50
  };
  
  const res = await reportService.stockLedgerReport(filters as any);
  console.log('API Result with May Date Filter:');
  console.log(JSON.stringify(res, null, 2));

  await closeDatabase();
}

testReport().catch(console.error);
