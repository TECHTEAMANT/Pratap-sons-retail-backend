import { AppDataSource } from '../src/config/data-source';
import { reportService } from '../src/services/report.service';

async function test() {
  await AppDataSource.initialize();
  console.log("DB connected");
  try {
    const data = await reportService.inventoryReport({ exportMode: 'true', limit: 100000 });
    console.log(`Returned ${data.data.length} items`);
    const jsonStr = JSON.stringify(data);
    console.log(`JSON length: ${jsonStr.length} bytes`);
  } catch (e) {
    console.error("Error:", e);
  }
  process.exit(0);
}
test();
