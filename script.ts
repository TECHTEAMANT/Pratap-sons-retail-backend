import { AppDataSource } from './src/config/data-source';

AppDataSource.initialize().then(async () => {
    const inv = await AppDataSource.query(`SELECT id, invoice_number, net_payable, amount_paid, total_mrp, loyalty_redemption_amount, total_discount FROM sales_invoices WHERE invoice_number = 'INV2026000248'`);
    console.log('Invoice:', inv);
    if (inv.length > 0) {
        const items = await AppDataSource.query(`SELECT barcode_8digit, quantity, mrp, selling_price, total_value, taxable_value FROM sales_invoice_items WHERE invoice_id = '${inv[0].id}'`);
        console.log('Items:', items);
    }
    const ret = await AppDataSource.query(`SELECT id, return_number, total_return_amount, total_discount_amount FROM sales_returns WHERE return_number = 'SRET2026000012'`);
    console.log('Return SRET2026000012:', ret);
    if (ret.length > 0) {
        const retItems = await AppDataSource.query(`SELECT barcode_8digit, return_amount, taxable_value, gst_amount FROM sales_return_items WHERE return_id = '${ret[0].id}'`);
        console.log('Return Items:', retItems);
    }
    process.exit(0);
}).catch(console.error);
