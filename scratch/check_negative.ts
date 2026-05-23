import { AppDataSource } from '../src/config/data-source';
import { reportService } from '../src/services/report.service';

async function test() {
  await AppDataSource.initialize();

  const sl = await reportService.stockLedgerReport({ exportMode: true, limit: 100000 });
  
  let sumNegative = 0;
  for (const item of sl.data) {
    if (item.closing_stock < 0) {
      sumNegative += item.closing_stock;
    }
  }
  
  console.log("Sum of negative closing stocks:", sumNegative);
  process.exit(0);
}
test();
