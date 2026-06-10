import { AppDataSource } from '../src/config/data-source';
import { PurchaseOrder } from '../src/entities/PurchaseOrder';

async function checkPOs() {
  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository(PurchaseOrder);
  
  const pos = await repo.find({
    where: [
      { invoice_number: 'DVS/90/26-27' },
      { po_number: 'DVS/90/26-27' },
      { invoice_number: '848-26-27' },
      { po_number: '848-26-27' }
    ],
    relations: ['vendor', 'purchase_items', 'purchase_items.product_group', 'order_items']
  });

  console.log(`Found ${pos.length} purchase orders.`);
  
  for (const po of pos) {
    console.log(`\n--- PO: ${po.po_number} | Invoice: ${po.invoice_number} ---`);
    console.log(`Vendor:`, po.vendor ? po.vendor.name : 'NULL');
    console.log(`Total Amount: ${po.total_amount}`);
    console.log(`Total Items: ${po.total_items}`);
    console.log(`Purchase Items Count: ${po.purchase_items?.length}`);
    console.log(`Status: ${po.status}`);
    
    // Check for weird data in items
    let zeroCostCount = 0;
    let missingGSTCount = 0;
    for (const item of po.purchase_items) {
      if (!item.cost_per_item || Number(item.cost_per_item) <= 0) zeroCostCount++;
      if (!item.gst_logic) missingGSTCount++;
    }
    console.log(`Zero Cost Items: ${zeroCostCount}`);
    console.log(`Missing GST Logic Items: ${missingGSTCount}`);
    
    // Check tally sync issues
    console.log(`Ledger Discount: ${po.ledger_discount}`);
    console.log(`Ledger Freight: ${po.ledger_freight}`);
    console.log(`Manual GST: ${po.manual_gst_amount}`);
  }

  process.exit(0);
}

checkPOs().catch(console.error);
