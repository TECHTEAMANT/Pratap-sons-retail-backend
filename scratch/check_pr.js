const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:Root@123@localhost:5432/invento_erp' });
client.connect().then(async () => {
  const uiRes = await client.query(`
    SELECT
        ((pri.cost * pri.quantity) * 
         (pr.total_return_amount / NULLIF(
           (SELECT SUM(pri2.cost * pri2.quantity) FROM purchase_return_items pri2 WHERE pri2.return_id = pr.id), 0
         ))
        ) AS cost_val,
        pr.status
    FROM purchase_return_items pri
    INNER JOIN purchase_returns pr ON pr.id = pri.return_id
    WHERE DATE(pr.return_date) >= '2026-05-01' AND DATE(pr.return_date) <= '2026-05-31'
  `);
  const totalUi = uiRes.rows.reduce((sum, r) => sum + parseFloat(r.cost_val || 0), 0);
  console.log('Purchase Return Analysis UI cost_val total:', totalUi);
  
  const completedUi = uiRes.rows.filter(r => r.status === 'Completed').reduce((sum, r) => sum + parseFloat(r.cost_val || 0), 0);
  console.log('Purchase Return Analysis UI Completed ONLY:', completedUi);
  
  client.end();
});
