import { AppDataSource } from '../src/config/data-source';
import { PurchaseOrder } from '../src/entities/PurchaseOrder';

async function checkId() {
    await AppDataSource.initialize();
    const repo = AppDataSource.getRepository(PurchaseOrder);
    const id = '1c77a7f6-e6c4-49f6-8d87-985ae3aca03b';
    const po = await repo.findOneBy({ id });
    console.log('PO Data for 1c77...:', JSON.stringify(po, null, 2));
    await AppDataSource.destroy();
}

checkId().catch(console.error);
