import { AppDataSource } from '../src/config/data-source';
import { SalesInvoice } from '../src/entities/SalesInvoice';

async function checkInvoices() {
  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository(SalesInvoice);
  
  const inv1 = await repo.findOne({ where: { invoice_number: 'INV2627000577' } });
  const inv2 = await repo.findOne({ where: { invoice_number: 'INV2627000535' } });
  
  console.log('--- INV2627000577 ---');
  console.log('Pending in DB:', inv1?.amount_pending);
  console.log('Net Payable in DB:', inv1?.net_payable);
  
  console.log('--- INV2627000535 ---');
  console.log('Pending in DB:', inv2?.amount_pending);
  console.log('Net Payable in DB:', inv2?.net_payable);
  
  process.exit(0);
}

checkInvoices();
