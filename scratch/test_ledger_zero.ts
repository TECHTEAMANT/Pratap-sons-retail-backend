import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';
import { reportService } from '../src/services/report.service';

async function checkLedger() {
  await initializeDatabase();
  const ds = AppDataSource;
  
  // Try to find the exact item the user sees
  const res = await ds.query(`SELECT barcode_alias_8digit, design_no, total_quantity, status FROM barcode_batches WHERE total_quantity = 0`);
  console.log('Barcodes with 0 qty:', res.length);
  
  if (res.length > 0) {
    const filters = {
      startDate: '2020-01-01',
      endDate: '2026-12-31',
      limit: 1000
    };
    const report = await reportService.stockLedgerReport(filters);
    const zeroItems = report.data.filter((r: any) => 
      res.some((z: any) => z.barcode_alias_8digit === r.barcode_alias || z.barcode_alias_8digit === r.barcode)
    );
    console.log('Zero qty items in report:', zeroItems);
  }

  await closeDatabase();
}

checkLedger().catch(console.error);
