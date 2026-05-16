import { AppDataSource } from '../src/config/data-source';

async function checkCollision() {
    await AppDataSource.initialize();
    
    const res = await AppDataSource.query(`
        SELECT id, name 
        FROM vendors 
        WHERE id = '850903cf-a0d5-456d-835a-7f835696a9b9' 
           OR name LIKE '%SHREE NIKETAN%' 
           OR name LIKE '%SHREE VISHWANATH%'
    `);
    
    console.table(res);
    process.exit(0);
}
checkCollision();
