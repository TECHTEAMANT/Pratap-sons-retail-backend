import { DataSource } from 'typeorm';

const AppDataSource = new DataSource({
  type: "postgres",
  url: "postgres://postgres:postgres@localhost:5432/pratap_sons", // Assumption, will adjust if needed
  synchronize: false,
  logging: false,
});

async function run() {
  try {
    await AppDataSource.initialize();
    const res = await AppDataSource.query(`
      SELECT invoice_number, net_payable, amount_paid, amount_pending, payment_status, payment_details 
      FROM sales_invoices 
      WHERE invoice_number IN ('INV2026000088', 'INV2026000108', 'INV2627000475', 'INV2026000173', 'INV2026000147')
    `);
    console.log(JSON.stringify(res, null, 2));
  } catch(e) {
    console.error(e);
  } finally {
    if(AppDataSource.isInitialized) await AppDataSource.destroy();
  }
}
run();
