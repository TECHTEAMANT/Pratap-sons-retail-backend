import { AppDataSource } from '../src/config/data-source';
import { SalesInvoice } from '../src/entities/SalesInvoice';
import { SalesInvoiceItem } from '../src/entities/SalesInvoiceItem';

async function check() {
  await AppDataSource.initialize();
  
  // Find the invoice containing barcode 00001914
  const item = await AppDataSource.getRepository(SalesInvoiceItem).findOne({
    where: { barcode_8digit: '00001914' },
    relations: ['invoice', 'invoice.items']
  });
  
  if (item && item.invoice) {
    const inv = item.invoice;
    console.log('--- Invoice Found: ' + inv.invoice_number + ' ---');
    console.log('Total MRP:', inv.total_mrp);
    console.log('Total Discount (Col):', inv.total_discount);
    console.log('Special Discount:', inv.special_discount);
    console.log('Voucher Discount:', inv.voucher_discount);
    console.log('Loyalty Redemption:', inv.loyalty_redemption_amount);
    console.log('Coupon Amount:', inv.coupon_amount);
    console.log('Net Payable (Stored):', inv.net_payable);
    console.log('Amount Paid:', inv.amount_paid);
    
    let itemSum = 0;
    inv.items.forEach(it => {
      console.log(`Item ${it.barcode_8digit}: MRP=${it.mrp}, Disc=${it.discount}`);
      itemSum += Number(it.discount || 0);
    });
    console.log('Sum of Item Discounts:', itemSum);
  } else {
    console.log('Invoice not found for barcode 00001914');
  }
  
  await AppDataSource.destroy();
}

check();
