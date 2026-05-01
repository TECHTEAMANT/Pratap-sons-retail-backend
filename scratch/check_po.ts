import { AppDataSource } from '../src/config/data-source';
import { PurchaseOrder } from '../src/entities/PurchaseOrder';

async function checkData() {
    await AppDataSource.initialize();
    const repo = AppDataSource.getRepository(PurchaseOrder);
    
    const count = await repo.createQueryBuilder('po')
        .where('po.invoice_number IS NOT NULL')
        .getCount();
        
    const samples = await repo.createQueryBuilder('po')
        .where('po.invoice_number IS NOT NULL')
        .limit(5)
        .getMany();
        
    console.log(`Total POs with Invoice: ${count}`);
    console.log('Samples:', JSON.stringify(samples, null, 2));
    await AppDataSource.destroy();
}

checkData().catch(console.error);
