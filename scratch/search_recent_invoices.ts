import { AppDataSource } from '../src/config/data-source';
import { SalesInvoice } from '../src/entities/SalesInvoice';

async function searchInvoices() {
  await AppDataSource.initialize();
  const invoices = await AppDataSource.getRepository(SalesInvoice).find({
    order: { created_at: 'DESC' },
    take: 20
  });

  console.log("Recent Invoices:");
  invoices.forEach(i => {
    console.log(`${i.invoice_number} | ${i.salesman_id} | ${i.created_at}`);
  });

  await AppDataSource.destroy();
}
searchInvoices();
