import { AppDataSource } from '../src/config/data-source';
import { reportService } from '../src/services/report.service';

async function test() {
  await AppDataSource.initialize();
  console.log("DB connected");

  const start = '2020-01-01';
  const end = '2099-12-31';
  
  try {
    // 1. Stock Ledger Totals
    console.log("--- Stock Ledger ---");
    const sl = await reportService.stockLedgerReport({ startDate: start, endDate: end, limit: 100000, page: 1, exportMode: true });
    console.log("Stock Ledger Totals (Aggregated from all barcode rows):");
    console.log(sl.summary);

    // 2. Sales Analysis Totals
    console.log("\n--- Sales Analysis ---");
    const salesTotal = await AppDataSource.query(`SELECT SUM(quantity) as qty FROM sales_invoice_items si_item INNER JOIN sales_invoices si ON si.id = si_item.invoice_id WHERE si.invoice_date BETWEEN '${start}' AND '${end}'`);
    console.log("Actual Sales DB QTY:", salesTotal[0]?.qty);

    // 3. Purchase Totals
    console.log("\n--- Purchase Analysis ---");
    const purchaseTotal = await AppDataSource.query(`SELECT SUM(quantity) as qty FROM purchase_items pi INNER JOIN purchase_orders po ON po.id = pi.po_id WHERE po.order_date BETWEEN '${start}' AND '${end}' AND po.status = 'Completed'`);
    console.log("Actual Purchase DB QTY:", purchaseTotal[0]?.qty);

    // 4. Returns Totals
    console.log("\n--- Returns ---");
    const srTotal = await AppDataSource.query(`SELECT SUM(quantity) as qty FROM sales_return_items sri INNER JOIN sales_returns sr ON sr.id = sri.return_id WHERE sr.return_date BETWEEN '${start}' AND '${end}'`);
    console.log("Actual Sales Return DB QTY:", srTotal[0]?.qty);

    const prTotal = await AppDataSource.query(`SELECT SUM(quantity) as qty FROM purchase_return_items pri INNER JOIN purchase_returns pr ON pr.id = pri.return_id WHERE pr.return_date BETWEEN '${start}' AND '${end}'`);
    console.log("Actual Purchase Return DB QTY:", prTotal[0]?.qty);

  } catch (e) {
    console.error("Error:", e);
  }
  process.exit(0);
}
test();
