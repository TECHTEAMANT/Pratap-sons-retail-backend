import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from './src/config/data-source';
import { ReportService } from './src/services/report.service';

async function test() {
  await initializeDatabase();
  const reportService = new ReportService();
  
  const res = await reportService.stockLedgerReport({
    startDate: "2026-02-01T00:00:00.000Z",
    endDate: "2026-05-20T23:59:59.999Z",
    limit: 100000
  });
  
  console.log("Total items exported:", res.data.length);
  console.log("Total count reported:", res.pagination.total);
  
  await closeDatabase();
}
test();
