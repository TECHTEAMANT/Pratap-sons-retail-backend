import { AppDataSource } from '../src/config/data-source';
import { PurchaseOrder } from '../src/entities/PurchaseOrder';
import { Like } from 'typeorm';

async function checkPOs() {
  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository(PurchaseOrder);
  
  const pos = await repo.find({
    where: [
      { invoice_number: 'DVS/90/26-27' },
      { invoice_number: '848-2627' }
    ],
    relations: ['vendor', 'purchase_items', 'purchase_items.product_group', 'order_items']
  });

  console.log(`Found ${pos.length} purchase orders.`);
  
  const fs = require('fs');
  fs.writeFileSync('po_data.json', JSON.stringify(pos, null, 2));
  console.log('Saved to po_data.json');

  process.exit(0);
}

checkPOs().catch(console.error);
