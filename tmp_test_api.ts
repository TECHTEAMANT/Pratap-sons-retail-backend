import { AppDataSource } from './src/config/data-source';
import { PurchaseOrder } from './src/entities/PurchaseOrder';

async function test() {
  try {
    await AppDataSource.initialize();
    
    const repo = AppDataSource.getRepository(PurchaseOrder);
    
    // Create 3 dummy purchase orders for a fake vendor
    const fakeVendorId = '11111111-1111-1111-1111-111111111111';
    
    // We can't insert a fake vendor ID if it's a foreign key, so let's find a real vendor
    const exist = await repo.findOne({ where: {} });
    if (!exist) return console.log("No POs to copy vendor from");
    
    const vendorId = exist.vendor_id || (exist.vendor as any)?.id;
    if (!vendorId) return console.log("No vendor ID");

    console.log(`Using vendor: ${vendorId}`);

    // Create 3 POs
    for(let i=0; i<3; i++) {
        const po = repo.create({
            vendor: { id: vendorId },
            po_number: `TEST_PO_999_${i}`,
            order_date: new Date(),
            status: 'Pending',
            total_amount: 100,
            taxable_value: 100,
            total_items: 10
        });
        await repo.save(po);
    }
    
    console.log("Created 3 mock POs.");
    
    // Now simulate the service call exactly as it happens
    const { PurchaseService } = require('./src/services/purchase.service');
    const svc = new PurchaseService();
    
    const res = await svc.getOrders({
        vendor: vendorId,
        neq_status: 'Completed',
        sort: 'order_date',
        order: 'desc'
    });
    
    console.log(`Service returned ${res.data.length} records. limit=${res.limit}, total=${res.total}`);
    res.data.forEach((r:any) => console.log(r.po_number, r.status));
    
    // Clean up
    await repo.createQueryBuilder().delete().where("po_number LIKE 'TEST_PO_999_%'").execute();

    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

test();
