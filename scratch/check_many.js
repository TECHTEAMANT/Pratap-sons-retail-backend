const { Client } = require('pg');

async function check() {
    const client = new Client({
        host: 'localhost', port: 5432, database: 'invento_erp', user: 'postgres', password: 'Root@123'
    });
    await client.connect();
    
    // Check multiple returns from the screenshot
    const returns = ['SRET2627000033', 'SRET2627000032', 'SRET2627000031', 'SRET2627000030', 'SRET2627000029'];
    for (const num of returns) {
        const res = await client.query("SELECT sri.* FROM sales_return_items sri JOIN sales_returns sr ON sr.id = sri.return_id WHERE sr.return_number = $1", [num]);
        console.log(`Items for ${num}:`, res.rows.length);
    }
    
    await client.end();
}
check().catch(console.error);
