import { AppDataSource } from '../src/config/data-source';

async function main() {
    await AppDataSource.initialize();
    
    // Check product masters for ssu-034-25
    const pms = await AppDataSource.query(`
        SELECT pm.id, pm.design_no, pm.color, pm.product_group
        FROM product_masters pm
        WHERE pm.design_no ILIKE '%ssu-034-25%'
    `);
    console.log("Product Masters:");
    console.table(pms);

    await AppDataSource.destroy();
}

main().catch(console.error);
