const { Client } = require('pg');

async function check() {
    const client = new Client({
        host: 'localhost',
        port: 5432,
        database: 'invento_erp',
        user: 'postgres',
        password: 'Root@123'
    });

    await client.connect();
    
    const resRet = await client.query("SELECT * FROM sales_returns WHERE return_number = 'SRET2627000046'");
    console.log('Return SRET2627000046:', resRet.rows[0]);

    if (resRet.rows[0]) {
        const retId = resRet.rows[0].id;
        const resItems = await client.query("SELECT * FROM sales_return_items WHERE return_id = $1", [retId]);
        console.log('Return Items:', resItems.rows.map(i => ({ barcode_8digit: i.barcode_8digit, design_no: i.design_no, mrp: i.mrp, qty: i.quantity })));

        const invNum = resRet.rows[0].invoice_number;
        const resInvItems = await client.query("SELECT sii.* FROM sales_invoice_items sii JOIN sales_invoices si ON si.id = sii.invoice_id WHERE si.invoice_number = $1", [invNum]);
        console.log('Invoice Items:', resInvItems.rows.map(i => ({ id: i.id, barcode_8digit: i.barcode_8digit, design_no: i.design_no, mrp: i.mrp })));
    }

    await client.end();
}

check().catch(console.error);
