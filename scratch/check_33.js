const { Client } = require('pg');

async function check() {
    const client = new Client({
        host: 'localhost', port: 5432, database: 'invento_erp', user: 'postgres', password: 'Root@123'
    });
    await client.connect();
    
    const res = await client.query("SELECT sri.* FROM sales_return_items sri JOIN sales_returns sr ON sr.id = sri.return_id WHERE sr.return_number = 'SRET2627000033'");
    console.log('Items for SRET2627000033:', res.rows.map(r => ({ barcode: r.barcode_8digit, design: r.design_no, mrp: r.mrp })));
    
    await client.end();
}
check().catch(console.error);
