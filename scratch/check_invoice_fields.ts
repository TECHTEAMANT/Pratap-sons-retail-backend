import { AppDataSource } from '../src/config/data-source';
import { SalesInvoice } from '../src/entities/SalesInvoice';

async function checkInvoice() {
  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository(SalesInvoice);
  
  // Find the invoice from the screenshot (or any recent one with coupon)
  const inv = await repo.createQueryBuilder('inv')
    .where('inv.coupon_no IS NOT NULL')
    .orderBy('inv.created_at', 'DESC')
    .limit(1)
    .getOne();
    
  console.log('Invoice Found:', JSON.stringify(inv, null, 2));
  
  process.exit(0);
}

checkInvoice().catch(console.error);
