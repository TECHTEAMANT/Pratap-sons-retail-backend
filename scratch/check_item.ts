import { AppDataSource } from '../src/config/data-source';
import { PurchaseItem } from '../src/entities/PurchaseItem';

async function checkItem() {
    await AppDataSource.initialize();
    const repo = AppDataSource.getRepository(PurchaseItem);
    const id = '1c77a7f6-e6c4-49f6-8d87-985ae3aca03b'; // The ID from BarcodeBatch
    const item = await repo.findOne({ 
        where: { id },
        relations: ['purchase_order']
    });
    console.log('PurchaseItem Data:', JSON.stringify(item, null, 2));
    await AppDataSource.destroy();
}

checkItem().catch(console.error);
