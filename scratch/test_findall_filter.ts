import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';
import { inventoryService } from '../src/services/inventory.service';

async function check() {
  await initializeDatabase();
  try {
    const res = await inventoryService.findAll({ search: 'KFS58' });
    console.log('Count for KFS58 search:', res.total);
  } catch (err) {
    console.error('Error in search:', err);
  }
  await closeDatabase();
}
check().catch(console.error);
