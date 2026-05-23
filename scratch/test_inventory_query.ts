import { AppDataSource } from '../src/config/data-source';
import { inventoryService } from '../src/services/inventory.service';

async function test() {
  await AppDataSource.initialize();
  console.log("DB connected");

  console.time('getGrouped');
  const res = await inventoryService.getGrouped({ page: 1, limit: 10 });
  console.timeEnd('getGrouped');

  console.log("Total groups:", res.total);
  console.log("First item design_no:", res.data[0]?.design_no);
  console.log("First item total sizes array length:", res.data[0]?.sizes?.length);
  process.exit(0);
}
test().catch(e => { console.error(e); process.exit(1); });
