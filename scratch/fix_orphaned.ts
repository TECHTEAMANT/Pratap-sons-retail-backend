import fs from 'fs';
const file = 'src/services/report.service.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  "AppDataSource.query(`SELECT barcode_8digit, SUM(quantity)::int as qty FROM sales_invoice_items WHERE barcode_8digit IN (${aliasesQuery}) GROUP BY barcode_8digit`),",
  "AppDataSource.query(`SELECT sii.barcode_8digit, SUM(sii.quantity)::int as qty FROM sales_invoice_items sii INNER JOIN sales_invoices si ON si.id = sii.invoice_id WHERE sii.barcode_8digit IN (${aliasesQuery}) GROUP BY sii.barcode_8digit`),"
);

content = content.replace(
  "AppDataSource.query(`SELECT barcode_8digit, SUM(quantity)::int as qty FROM sales_return_items WHERE barcode_8digit IN (${aliasesQuery}) GROUP BY barcode_8digit`),",
  "AppDataSource.query(`SELECT sri.barcode_8digit, SUM(sri.quantity)::int as qty FROM sales_return_items sri INNER JOIN sales_returns sr ON sr.id = sri.return_id WHERE sri.barcode_8digit IN (${aliasesQuery}) GROUP BY sri.barcode_8digit`),"
);

content = content.replace(
  "AppDataSource.query(`SELECT barcode_id as barcode_8digit, SUM(quantity)::int as qty FROM purchase_return_items WHERE barcode_id IN (${aliasesQuery}) GROUP BY barcode_id`),",
  "AppDataSource.query(`SELECT pri.barcode_id as barcode_8digit, SUM(pri.quantity)::int as qty FROM purchase_return_items pri INNER JOIN purchase_returns pr ON pr.id = pri.return_id WHERE pri.barcode_id IN (${aliasesQuery}) GROUP BY pri.barcode_id`),"
);

fs.writeFileSync(file, content);
console.log("Fixed!");
