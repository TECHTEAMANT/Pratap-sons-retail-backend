const { DataSource } = require('typeorm');
const ds = new DataSource({
  type: 'postgres',
  url: 'postgresql://postgres:Root@123@localhost:5432/invento_erp',
  synchronize: false
});

ds.initialize().then(async () => {
  const res = await ds.query('SELECT si.invoice_number, si.total_amount, si.net_payable, sr.total_return_amount FROM sales_invoices si JOIN sales_returns sr ON sr.invoice_id = si.id LIMIT 5');
  console.log(res);
  process.exit(0);
}).catch(console.error);
