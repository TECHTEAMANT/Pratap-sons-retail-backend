import { AppDataSource } from '../src/config/data-source';
import { PurchaseOrder } from '../src/entities/PurchaseOrder';
import { Like } from 'typeorm';

async function checkPOs() {
  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository(PurchaseOrder);
  
  const pos = await repo.find({
    where: [
      { invoice_number: Like('%848%') },
      { po_number: Like('%848%') }
    ],
    relations: ['vendor', 'purchase_items', 'purchase_items.product_group', 'order_items']
  });

  console.log(`Found ${pos.length} purchase orders for 848.`);
  
  for (const po of pos) {
    console.log(`\n--- PO: ${po.po_number} | Invoice: ${po.invoice_number} ---`);
    console.log(`Vendor:`, po.vendor ? po.vendor.name : 'NULL');
    console.log(`Total Amount: ${po.total_amount}`);
  }

  process.exit(0);
}

checkPOs().catch(console.error);
