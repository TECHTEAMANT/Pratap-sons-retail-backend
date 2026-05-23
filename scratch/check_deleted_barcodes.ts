import { AppDataSource, initializeDatabase } from '../src/config/data-source';

async function checkDeletedBarcodes() {
  await initializeDatabase();
  const res = await AppDataSource.query(`
    SELECT 
      bb.barcode_alias_8digit, 
      bb.design_no, 
      bb.status, 
      bb.po_id,
      (SELECT SUM(quantity) FROM sales_invoice_items WHERE barcode_8digit = bb.barcode_alias_8digit) as sold_qty,
      (SELECT SUM(quantity) FROM purchase_return_items WHERE barcode_id = bb.barcode_alias_8digit) as pr_qty,
      (SELECT COUNT(*) FROM purchase_items WHERE design_no = bb.design_no) as has_purchase_items
    FROM barcode_batches bb
    WHERE bb.barcode_alias_8digit IN (
      '00007544','00004716','00007550','00001404','00005153','00000844','00000954',
      '00006011','00003216','00005152','00005154','00001405','00003218',
      '00006439','00008387','00001180','00001185','00001181','00001179','00008430','00005156'
    )
    ORDER BY bb.design_no
  `);
  console.log('Deleted barcodes with transaction history:');
  res.forEach((r: any) => console.log(JSON.stringify(r)));
  await AppDataSource.destroy();
}
checkDeletedBarcodes().catch(console.error);
