import { AppDataSource } from '../src/config/data-source';
import { SalesInvoice } from '../src/entities/SalesInvoice';

async function check() {
  await AppDataSource.initialize();
  const invs = await AppDataSource.getRepository(SalesInvoice).find({
    where: {},
    order: { created_at: 'ASC' },
    take: 20
  });
  
  console.log('Last 20 Invoices:');
  invs.forEach(i => console.log(i.invoice_number));
  
  await AppDataSource.destroy();
}

check();
