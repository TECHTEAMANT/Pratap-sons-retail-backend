import { AppDataSource } from '../src/config/data-source';
import { SalesInvoice } from '../src/entities/SalesInvoice';

async function checkInvoice() {
  await AppDataSource.initialize();
  const inv = await AppDataSource.getRepository(SalesInvoice).findOne({
    where: { invoice_number: 'INV2627000613' },
    relations: ['salesman', 'items', 'items.salesman']
  });

  if (inv) {
    console.log("Invoice Header Salesman:", inv.salesman?.name || 'NONE', `(${inv.salesman_id})`);
    inv.items.forEach((item, idx) => {
      console.log(`Item ${idx + 1} Salesman:`, item.salesman?.name || 'NONE', `(${item.salesman_id})`);
    });
  } else {
    console.log("Invoice not found");
  }

  await AppDataSource.destroy();
}
checkInvoice();
