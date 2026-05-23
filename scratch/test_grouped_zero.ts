import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';
import { inventoryService } from '../src/services/inventory.service';

async function check() {
  await initializeDatabase();
  const res = await inventoryService.getGrouped({ searchDesign: 'KFS58' });
  console.log('Grouped result for KFS58 (which has 0 qty):', JSON.stringify(res.data, null, 2));
  await closeDatabase();
}
check().catch(console.error);
