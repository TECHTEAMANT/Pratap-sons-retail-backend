const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:Root@123@localhost:5432/invento_erp' });
client.connect().then(async () => {
  const summaryData = await client.query(`
      WITH combined_data AS (
        SELECT 
          po.id as po_id,
          pi.quantity,
          ((pi.cost_per_item * pi.quantity) * (COALESCE(po.total_amount, 0) / COALESCE(NULLIF((COALESCE(po.taxable_value, 0) + COALESCE(po.ledger_discount, 0)), 0), 1))) as cost_val,
          (pi.mrp * pi.quantity) as mrp_val
        FROM purchase_items pi
        INNER JOIN purchase_orders po ON po.id = pi.po_id
        WHERE po.status = 'Completed'
        AND po.order_date >= '2026-05-01' AND po.order_date < '2026-06-01'
      )
      SELECT 
        SUM(cost_val) as totalCost
      FROM combined_data
  `);
  console.log('Purchase Analysis UI Total Cost:', summaryData.rows[0].totalcost);
  
  const purchaseSummary = await client.query(`SELECT SUM(total_amount) as total_purchase FROM purchase_orders WHERE status = 'Completed' AND order_date >= '2026-05-01' AND order_date < '2026-06-01'`);
  console.log('Purchase Summary total_purchase:', purchaseSummary.rows[0].total_purchase);

  client.end();
});
