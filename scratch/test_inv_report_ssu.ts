import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';
import { reportService } from '../src/services/report.service';

async function testInventoryReport() {
  await initializeDatabase();
  
  const filters = {
    design: 'SSU-034-25',
    page: 1,
    limit: 50
  };
  
  const res = await reportService.inventoryReport(filters as any);
  console.log('API Result for SSU-034-25:');
  console.log(JSON.stringify(res, null, 2));

  await closeDatabase();
}

testInventoryReport().catch(console.error);
