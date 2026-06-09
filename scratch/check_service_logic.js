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
  
  const res1 = await client.query(`
    SELECT 
        COUNT(si.id) as "invoiceCount",
        SUM(ROUND(si.net_payable)) as "totalSales",
        SUM(si.total_mrp) as "totalMRP",
        SUM(si.total_gst) as "totalGST",
        SUM(si.taxable_value) as "taxableValue",
        SUM(si.total_discount) as "totalDiscount"
    FROM sales_invoices si
  `);
  
  const res2 = await client.query(`
    SELECT 
        COUNT(sr.id) as "returnCount",
        SUM(sr.total_return_amount) as "totalReturnAmount"
    FROM sales_returns sr
  `);
  
  const rawSummary = res1.rows[0];
  const rawRetSummary = res2.rows[0];
  
  const netSales = parseFloat(rawSummary.totalSales) || 0; 
  const returnAmount = parseFloat(rawRetSummary?.totalReturnAmount) || 0;
  const trueGrossSales = netSales + returnAmount;
  
  const rawTaxable = parseFloat(rawSummary.taxableValue) || 0;
  const rawGST = parseFloat(rawSummary.totalGST) || 0;
  const rawGross = rawTaxable + rawGST;
  
  const ratio = rawGross > 0 ? (trueGrossSales / rawGross) : 1;
  
  console.log('totalSales (Net Sales):', netSales);
  console.log('grossSales (True Gross):', trueGrossSales);
  console.log('rawTaxable:', rawTaxable);
  console.log('rawGST:', rawGST);
  console.log('ratio:', ratio);
  console.log('finalTaxable:', rawTaxable * ratio);
  console.log('finalGST:', rawGST * ratio);
  
  await client.end();
}

run().catch(console.error);
