import { AppDataSource } from '../src/config/data-source';

async function auditVendorId() {
    await AppDataSource.initialize();
    const res = await AppDataSource.query(`
        SELECT id, name FROM vendors WHERE name LIKE '%ABDUL HAKIM%'
    `);
    console.table(res);
    process.exit(0);
}
auditVendorId();
