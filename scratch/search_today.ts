import { AppDataSource } from '../src/config/data-source';
import { SalesInvoice } from '../src/entities/SalesInvoice';
import { Between } from 'typeorm';

async function searchToday() {
  await AppDataSource.initialize();
  const start = new Date();
  start.setHours(0,0,0,0);
  const end = new Date();
  end.setHours(23,59,59,999);

  const invoices = await AppDataSource.getRepository(SalesInvoice).find({
    where: { created_at: Between(start, end) },
    order: { created_at: 'DESC' }
  });

  console.log(`Found ${invoices.length} invoices today.`);
  invoices.forEach(i => {
    console.log(`${i.invoice_number} | ${i.salesman_id} | ${i.created_at}`);
  });

  await AppDataSource.destroy();
}
searchToday();
