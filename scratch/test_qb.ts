import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';
import { inventoryService } from '../src/services/inventory.service';

async function check() {
  await initializeDatabase();
  try {
    const qb = AppDataSource.getRepository('BarcodeBatch')
      .createQueryBuilder('bb')
      .leftJoinAndSelect('bb.vendor', 'vd');
      
    qb.andWhere('(bb.barcode_alias_8digit ILIKE :search OR bb.design_no ILIKE :search OR vd.name ILIKE :search)', { search: '%kfs58%' });
    qb.orderBy('bb.created_at', 'DESC');
    qb.andWhere('bb.total_quantity > 0');
    
    console.log(qb.getSql());
  } catch (err) {
    console.error('Error:', err);
  }
  await closeDatabase();
}
check().catch(console.error);
