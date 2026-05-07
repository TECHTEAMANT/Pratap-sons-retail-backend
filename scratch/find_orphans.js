const { Client } = require('pg');

async function check() {
    const client = new Client({
        host: 'localhost', port: 5432, database: 'invento_erp', user: 'postgres', password: 'Root@123'
    });
    await client.connect();
    
    // Check for any return items created around the time of the return
    const res = await client.query("SELECT * FROM sales_return_items WHERE created_at >= '2026-04-30 07:00:00' AND created_at <= '2026-05-06 08:00:00' ORDER BY created_at DESC LIMIT 50");
    console.log('Recent Return Items:', res.rows.map(i => ({ id: i.id, return_id: i.return_id, barcode: i.barcode_8digit, mrp: i.mrp })));
    
    await client.end();
}
check().catch(console.error);
