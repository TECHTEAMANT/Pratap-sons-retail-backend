import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';
import { reportService } from '../src/services/report.service';

async function testReportVendor() {
  await initializeDatabase();
  const ds = AppDataSource;
  
  const vRes = await ds.query(`SELECT id FROM vendors WHERE name = 'HANDLOOM EMPORIUM TEXT.PRT.LTD'`);
  const vId = vRes[0]?.id;
  
  const filters = {
    design: 'COT FEB 2',
    vendorId: vId,
    page: 1,
    limit: 50
  };
  
  const res = await reportService.stockLedgerReport(filters as any);
  console.log('API Result with Vendor Filter:');
  console.log(JSON.stringify(res, null, 2));

  await closeDatabase();
}

testReportVendor().catch(console.error);
