const { Client } = require('pg');

async function check() {
    const client = new Client({
        host: 'localhost', port: 5432, database: 'invento_erp', user: 'postgres', password: 'Root@123'
    });
    await client.connect();
    const resRet = await client.query("SELECT * FROM sales_returns WHERE return_number = 'SRET2627000047'");
    console.log('Return SRET2627000047:', resRet.rows[0]);
    if (resRet.rows[0]) {
        const resItems = await client.query("SELECT * FROM sales_return_items WHERE return_id = $1", [resRet.rows[0].id]);
        console.log('Return Items:', resItems.rows.map(i => ({ barcode_8digit: i.barcode_8digit, design_no: i.design_no, mrp: i.mrp, qty: i.quantity })));
    }
    await client.end();
}
check().catch(console.error);
