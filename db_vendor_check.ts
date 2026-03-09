import { DataSource } from 'typeorm';

const dataSource = new DataSource({
  type: 'postgres',
  url: 'postgresql://postgres:Root@123@localhost:5432/invento_erp',
});

dataSource.initialize().then(async () => {
  try {
    const unsyncedCount = await dataSource.query(`SELECT COUNT(*) FROM vendors WHERE tally_sync = false`);
    console.log('Unsynced Vendors in entire DB:', unsyncedCount);

    const totalVendors = await dataSource.query(`SELECT COUNT(*) FROM vendors`);
    console.log('Total Vendors in entire DB:', totalVendors);

    const invoices = await dataSource.query(`
      SELECT COUNT(DISTINCT v.id) 
      FROM purchase_orders po 
      JOIN vendors v ON po.vendor = v.id 
      WHERE po.status = 'Completed' AND v.tally_sync = false
    `);
    console.log('Unsynced Vendors associated with Complete Invoices:', invoices);

  } catch (err) {
    console.error(err);
  } finally {
    // @ts-ignore
    (process as any).exit(0);
  }
});
