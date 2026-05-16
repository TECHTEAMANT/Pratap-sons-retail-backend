import { AppDataSource } from '../src/config/data-source';

async function sumNiketan() {
    await AppDataSource.initialize();
    
    const res = await AppDataSource.query(`
        SELECT SUM(total_quantity) as total 
        FROM barcode_batches 
        WHERE vendor = '850903cf-a0d5-456d-835a-7f835696a9b9'
    `);
    
    console.log(res[0]);
    process.exit(0);
}
sumNiketan();
