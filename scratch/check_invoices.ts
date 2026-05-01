import { AppDataSource } from '../src/config/data-source';
import { BarcodeBatch } from '../src/entities/BarcodeBatch';
import { PurchaseOrder } from '../src/entities/PurchaseOrder';

async function checkData() {
    await AppDataSource.initialize();
    const repo = AppDataSource.getRepository(BarcodeBatch);
    
    const codes = ['00001617', '00001618', '00006594'];
    const results = await repo.createQueryBuilder('bb')
        .leftJoinAndSelect(PurchaseOrder, 'po', 'po.id = bb.po_id')
        .where('bb.barcode_alias_8digit IN (:...codes)', { codes })
        .select(['bb.barcode_alias_8digit', 'bb.po_id', 'po.invoice_number', 'po.order_date', 'po.po_number', 'po.order_number'])
        .getRawMany();
        
    console.log(JSON.stringify(results, null, 2));
    await AppDataSource.destroy();
}

checkData().catch(console.error);
