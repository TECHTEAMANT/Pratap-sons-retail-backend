const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:ant-admin@123@localhost:5432/invento_erp' });
client.connect().then(() => client.query(`SELECT po_number FROM purchase_orders ORDER BY po_number DESC LIMIT 5`)).then(res => { console.log(res.rows); return client.end(); }).catch(console.error);
