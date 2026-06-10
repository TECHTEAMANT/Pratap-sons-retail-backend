import { AppDataSource } from './src/config/data-source';
import { SalesInvoice } from './src/entities/SalesInvoice';

async function check() {
  await AppDataSource.initialize();
  const qb = AppDataSource.getRepository(SalesInvoice).createQueryBuilder('inv');
  qb.where('inv.invoice_date >= :start', { start: '2026-02-01 00:00:00' });
  qb.andWhere('inv.invoice_date <= :end', { end: '2026-06-09 23:59:59' });
  
  const invoices = await qb.getMany();
  let zeroNet = invoices.filter(i => Number(i.net_payable) <= 0);
  let zeroTotal = invoices.filter(i => Number(i.total_amount) <= 0);
  
  let emptyArray = invoices.filter(i => Array.isArray(i.payment_details) && i.payment_details.length === 0);

  console.log('Total invoices in range:', invoices.length);
  console.log('zeroNet invoices:', zeroNet.length);
  console.log('zeroTotal invoices:', zeroTotal.length);
  console.log('emptyArray payment_details:', emptyArray.length);

  process.exit(0);
}
check().catch(console.error);
