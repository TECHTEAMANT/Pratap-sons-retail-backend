import { AppDataSource } from '../src/config/data-source';
import { PurchaseOrderItem } from '../src/entities/PurchaseOrderItem';

async function checkOrderItem() {
    await AppDataSource.initialize();
    const repo = AppDataSource.getRepository(PurchaseOrderItem);
    const id = '1c77a7f6-e6c4-49f6-8d87-985ae3aca03b'; // The ID from BarcodeBatch
    const item = await repo.findOne({ 
        where: { id },
        relations: ['purchaseOrder']
    });
    console.log('PurchaseOrderItem Data:', JSON.stringify(item, null, 2));
    await AppDataSource.destroy();
}

checkOrderItem().catch(console.error);
