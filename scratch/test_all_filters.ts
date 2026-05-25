import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';
import { inventoryService } from '../src/services/inventory.service';

async function check() {
  await initializeDatabase();
  try {
    const res1 = await inventoryService.getGrouped({ searchDesign: 'test' });
    console.log('Grouped searchDesign:', res1.total);

    const res2 = await inventoryService.getGrouped({ searchBarcode: '000000' });
    console.log('Grouped searchBarcode:', res2.total);

    const res3 = await inventoryService.getGrouped({ searchVendor: 'test' });
    console.log('Grouped searchVendor (text):', res3.total);

    const res4 = await inventoryService.getGrouped({ searchVendor: '0c766e4e-0a56-4277-ac3e-000000000000' });
    console.log('Grouped searchVendor (uuid):', res4.total);

    const res5 = await inventoryService.findAll({ search_barcode_alias_8digit: 'test' });
    console.log('FindAll search_barcode_alias_8digit:', res5.total);

  } catch (err) {
    console.error('Error in tests:', err);
  }
  await closeDatabase();
}
check().catch(console.error);
