import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';

async function testFix() {
  await initializeDatabase();
  const ds = AppDataSource;
  const design = 'SSU-034-25';

  const detailedItemsRes = await ds.query(`
        SELECT 
          MIN(pi.id) as "id",
          pi.design_no as "design",
          SUM(pi.quantity) as "total_qty",
          pi.cost_per_item as "cost",
          pi.mrp as "mrp",
          MAX(pi.hsn_code) as "hsn",
          po.invoice_number as "po_no",
          po.order_date as "po_date",
          v.name as "vendorName",
          pg.name as "productGroup",
          cl.name as "color",
          sz.name as "size",
          pi.po_id as "po_id",
          pi.color as "color_id",
          pi.size as "size_id"
        FROM purchase_items pi
        INNER JOIN purchase_orders po ON po.id = pi.po_id
        LEFT JOIN vendors v ON v.id = po.vendor
        LEFT JOIN product_groups pg ON pg.id = pi.product_group
        LEFT JOIN colors cl ON cl.id = pi.color
        LEFT JOIN sizes sz ON sz.id = pi.size
        WHERE pi.design_no = $1
        GROUP BY 
          pi.po_id, pi.design_no, pi.color, pi.size, pi.cost_per_item, pi.mrp,
          po.invoice_number, po.order_date, v.name, pg.name, cl.name, sz.name
  `, [design]);

  console.log('Grouped Rows:', detailedItemsRes.length);
  console.log('First Row:', detailedItemsRes[0]);

  await closeDatabase();
}

testFix().catch(console.error);
