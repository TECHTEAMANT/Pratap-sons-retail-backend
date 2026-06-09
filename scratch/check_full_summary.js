const { Client } = require('pg');

const client = new Client({
  host: 'localhost',
  port: 5432,
  database: 'invento_erp',
  user: 'postgres',
  password: 'Root@123',
});

async function run() {
  await client.connect();
  
  const res = await client.query(`
    SELECT 
      SUM(ROUND(si.net_payable)) as "totalSales"
    FROM sales_invoices si
  `);
  
  const retRes = await client.query(`
    SELECT SUM(ROUND(total_return_amount)) as "totalReturnAmount"
    FROM sales_returns
  `);
  
  console.log('totalSales from si:', res.rows[0].totalSales);
  console.log('totalReturnAmount from sr:', retRes.rows[0].totalReturnAmount);
  
  const netSales = parseFloat(res.rows[0].totalSales) || 0;
  const retAmt = parseFloat(retRes.rows[0].totalReturnAmount) || 0;
  console.log('Gross Sales (net + ret):', netSales + retAmt);
  
  await client.end();
}

run().catch(console.error);
