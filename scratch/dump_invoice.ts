import { AppDataSource } from '../src/config/data-source';
import { SalesInvoice } from '../src/entities/SalesInvoice';

async function dumpInvoice() {
  try {
    await AppDataSource.initialize();
    
    const invoice = await AppDataSource.getRepository(SalesInvoice).findOne({
      where: { invoice_number: 'INV2627000334' },
      relations: ['receipt_items', 'items']
    });
    
    console.log("INVOICE DUMP:", JSON.stringify(invoice, null, 2));
    
    await AppDataSource.destroy();
  } catch (error) {
    console.error(error);
  }
}

dumpInvoice();
