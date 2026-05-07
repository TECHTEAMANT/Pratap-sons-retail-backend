const { Client } = require('pg');

async function check() {
    const client = new Client({
        host: 'localhost', port: 5432, database: 'invento_erp', user: 'postgres', password: 'Root@123'
    });
    await client.connect();
    
    const res = await client.query("SELECT * FROM sales_invoices WHERE invoice_number = 'INV2627000700'");
    const inv = res.rows[0];
    console.log('Invoice:', { id: inv.id, payment_details: inv.payment_details });

    const receipts = await client.query("SELECT * FROM payment_receipt_items WHERE invoice_id = $1", [inv.id]);
    console.log('Receipts:', receipts.rows);

    const advances = await client.query("SELECT * FROM advance_applications WHERE invoice_id = $1", [inv.id]);
    console.log('Advances:', advances.rows);

    await client.end();
}
check().catch(console.error);
