import { AppDataSource } from '../src/config/data-source';
import { reportService } from '../src/services/report.service';
import * as fs from 'fs';
import * as path from 'path';

async function test() {
  await AppDataSource.initialize();

  const sl = await reportService.stockLedgerReport({ exportMode: true, limit: 100000 });
  
  let markdown = "# Negative Stock Ledger Items\n\n";
  markdown += "| Barcode | Design | Purchased Qty | Sold Qty | Purchase Return Qty | Closing Stock | Reason for Negative |\n";
  markdown += "|---|---|---|---|---|---|---|\n";

  for (const item of sl.data) {
    if (item.closing_stock < 0) {
      let reason = "";
      if (item.purchase_return_qty > 0) reason = `Item was RETURNED to vendor (${item.purchase_return_qty} times)`;
      else if (item.sold_qty > 0) reason = `Item was SOLD to customer (${item.sold_qty} times)`;

      markdown += `| ${item.barcode} | ${item.design_no} | ${item.purchased_qty} | ${item.sold_qty} | ${item.purchase_return_qty} | **${item.closing_stock}** | ${reason} |\n`;
    }
  }
  
  // Write to scratch so I can read it and formulate response
  fs.writeFileSync(path.join(__dirname, 'negative_items.md'), markdown);
  console.log("Written to negative_items.md");
  
  process.exit(0);
}
test();
