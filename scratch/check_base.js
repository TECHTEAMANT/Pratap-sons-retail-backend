const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:Root@123@localhost:5432/invento_erp' });
client.connect().then(async () => {
  const uiRes = await client.query(`
    SELECT SUM(pri.cost * pri.quantity) as base_cost
    FROM purchase_return_items pri
    INNER JOIN purchase_returns pr ON pr.id = pri.return_id
    WHERE DATE(pr.return_date) >= '2026-05-01' AND DATE(pr.return_date) <= '2026-05-31'
  `);
  console.log('Total PR Base Cost in DB (May):', uiRes.rows[0].base_cost);
  client.end();
});
