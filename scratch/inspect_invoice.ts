import { AppDataSource } from '../src/config/data-source';
import { SalesInvoice } from '../src/entities/SalesInvoice';

async function checkInvoice() {
  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository(SalesInvoice);
  const inv = await repo.findOne({ 
    where: { invoice_number: 'INV2026000348' },
    relations: ['sales_returns', 'items']
  });

  if (inv) {
    console.log('--- INVOICE DATA ---');
    console.log('Invoice No:', inv.invoice_number);
    console.log('Total MRP:', inv.total_mrp);
    console.log('Total Discount (Column):', inv.total_discount);
    console.log('Special Discount:', inv.special_discount);
    console.log('Loyalty Redemption:', inv.loyalty_redemption_amount);
    console.log('Voucher Discount:', inv.voucher_discount);
    console.log('Additional Charges:', inv.additional_charges_total);
    console.log('Net Payable (Stored):', inv.net_payable);
    console.log('Amount Paid (Stored):', inv.amount_paid);
    console.log('Amount Pending (Stored):', inv.amount_pending);
    console.log('Returns Amount:', (inv.sales_returns || []).reduce((sum, r) => sum + Number(r.total_return_amount || 0), 0));
    console.log('--- ITEMS ---');
    (inv.items || []).forEach(item => {
      console.log(`- ${item.barcode_8digit}: MRP=${item.mrp}, Disc=${item.discount}, Qty=${item.quantity}`);
    });
  } else {
    console.log('Invoice not found');
  }
  process.exit(0);
}

checkInvoice();
