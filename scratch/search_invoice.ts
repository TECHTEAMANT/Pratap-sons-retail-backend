import { AppDataSource } from '../src/config/data-source';
import { SalesInvoice } from '../src/entities/SalesInvoice';

async function searchInvoice() {
  try {
    await AppDataSource.initialize();
    
    const invoices = await AppDataSource.getRepository(SalesInvoice).find({
      where: { customer_name: 'anita jain' },
      order: { created_at: 'DESC' },
      take: 5
    });
    
    console.log("INVOICES FOUND:", JSON.stringify(invoices, null, 2));
    
    await AppDataSource.destroy();
  } catch (error) {
    console.error(error);
  }
}

searchInvoice();
