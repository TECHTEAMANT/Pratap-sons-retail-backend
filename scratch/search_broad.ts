import { AppDataSource } from '../src/config/data-source';
import { SalesInvoice } from '../src/entities/SalesInvoice';
import { Like } from 'typeorm';

async function searchBroad() {
  try {
    await AppDataSource.initialize();
    const repo = AppDataSource.getRepository(SalesInvoice);
    
    // Search by partial number
    const invs = await repo.find({
      where: { invoice_number: Like('%334%') },
      relations: ['receipt_items', 'coupon_applications', 'credit_note_applications', 'advance_applications']
    });
    
    console.log("BROAD SEARCH RESULTS:", JSON.stringify(invs, null, 2));
    
    await AppDataSource.destroy();
  } catch (error) {
    console.error(error);
  }
}

searchBroad();
