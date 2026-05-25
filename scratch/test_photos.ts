import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';
import { reportService } from '../src/services/report.service';

async function testPhotos() {
  await initializeDatabase();
  try {
    // Test 1: getInventoryPhoto with valid barcode
    const photo = await reportService.getInventoryPhoto("00000895");
    console.log("getInventoryPhoto result:", photo ? `OK (${photo.length} chars, starts: ${photo.substring(0,30)})` : 'NULL - no photo found');
    
    // Test 2: inventory report with includePhotos=true, check item.barcode is alias
    const report = await reportService.inventoryReport({
      startDate: '2020-01-01',
      endDate: '2030-01-01',
      limit: 5,
      page: 1,
      includePhotos: true
    } as any);
    
    const items = report.data;
    console.log(`\nInventory report returned ${items.length} items`);
    for (const item of items.slice(0, 3)) {
      const photoStatus = item.photos?.length > 0 
        ? `HAS PHOTO (${item.photos[0].length} chars)`
        : 'NO PHOTO';
      console.log(`  barcode: "${item.barcode}" (len=${item.barcode?.length}), photo: ${photoStatus}`);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await closeDatabase();
  }
}
testPhotos().catch(console.error);
