import { AppDataSource } from '../src/config/data-source';
import { SalesInvoice } from '../src/entities/SalesInvoice';

async function check() {
  await AppDataSource.initialize();
  const inv = await AppDataSource.getRepository(SalesInvoice).findOne({
    where: { invoice_number: 'INV2026000004' },
    relations: ['items']
  });
  
  if (inv) {
    console.log('--- Invoice Details ---');
    console.log('Total MRP:', inv.total_mrp);
    console.log('Total Discount Column:', inv.total_discount);
    console.log('Voucher Discount Column:', inv.voucher_discount);
    console.log('Loyalty Redemption:', inv.loyalty_redemption_amount);
    console.log('Special Discount:', inv.special_discount);
    console.log('Amount Paid:', inv.amount_paid);
    console.log('Amount Pending:', inv.amount_pending);
    console.log('Net Payable (Stored):', inv.net_payable);
    
    let sumOfLineDiscounts = 0;
    inv.items.forEach(it => {
      sumOfLineDiscounts += Number(it.discount || 0);
    });
    console.log('Sum of Line Item Discounts:', sumOfLineDiscounts);
  } else {
    console.log('Invoice not found');
  }
  await AppDataSource.destroy();
}

check();
