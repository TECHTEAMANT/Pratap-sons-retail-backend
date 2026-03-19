import { AppDataSource } from './src/config/data-source';
import { PurchaseOrder } from './src/entities/PurchaseOrder';

async function test() {
  try {
    await AppDataSource.initialize();
    
    const repo = AppDataSource.getRepository(PurchaseOrder);
    
    const all = await repo.find();
    console.log(`Total POs: ${all.length}`);
    
    // Check PO counts per vendor
    const byVendor = await repo.createQueryBuilder('po')
      .select('po.vendor_id', 'vendorId')
      .addSelect('po.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('po.vendor_id, po.status')
      .orderBy('count', 'DESC')
      .getRawMany();
      
    console.log("Details:");
    byVendor.forEach(row => {
      console.log(`Vendor: ${row.vendorId} | Status: ${row.status} | Count: ${row.count}`);
    });
    
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

test();
