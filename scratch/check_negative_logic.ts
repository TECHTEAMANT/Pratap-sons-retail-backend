import { AppDataSource } from '../src/config/data-source';
import { reportService } from '../src/services/report.service';

async function test() {
  await AppDataSource.initialize();

  const sl = await reportService.stockLedgerReport({ exportMode: true, limit: 100000 });
  
  let found = false;
  for (const item of sl.data) {
    if (item.closing_stock < 0) {
      if (item.sold_qty === 0 && item.purchase_return_qty === 0) {
        console.log("Negative item with NO sale and NO return:", item);
        found = true;
      }
    }
  }
  
  if (!found) {
    console.log("No such items exist! All negative closing stocks have either a Sale or a Purchase Return.");
  }
  
  process.exit(0);
}
test();
