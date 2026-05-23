import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';
import { reportService } from '../src/services/report.service';

async function testReport() {
  await initializeDatabase();
  
  const filters = {
    startDate: '2020-01-01',
    endDate: '2030-01-01',
    design: 'COT FEB 2',
    page: 1,
    limit: 50
  };
  
  const res = await reportService.stockLedgerReport(filters as any);
  console.log('API Result for COT FEB 2:');
  console.log(JSON.stringify(res, null, 2));

  await closeDatabase();
}

testReport().catch(console.error);
