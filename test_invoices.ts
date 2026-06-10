import { AppDataSource } from './src/config/data-source';
import { SalesInvoice } from './src/entities/SalesInvoice';

async function check() {
  await AppDataSource.initialize();
  console.log('DB connected');

  const qb = AppDataSource.getRepository(SalesInvoice).createQueryBuilder('inv');
  qb.where('inv.invoice_date >= :start', { start: '2026-02-01 00:00:00' });
  qb.andWhere('inv.invoice_date <= :end', { end: '2026-06-09 23:59:59' });
  
  const invoices = await qb.getMany();
  console.log('Total invoices in range:', invoices.length);

  const zeroNet = invoices.filter(i => Number(i.net_payable) <= 0);
  console.log('zeroNet invoices:', zeroNet.length);
  
  process.exit(0);
}
check().catch(console.error);
