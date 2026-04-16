import { AppDataSource, initializeDatabase } from './src/config/data-source';
import { SalesInvoice } from './src/entities/SalesInvoice';
import { SalesReturn } from './src/entities/SalesReturn';

async function research() {
  await initializeDatabase();
  console.log('Database initialized');

  const invoiceRepo = AppDataSource.getRepository(SalesInvoice);
  const returnRepo = AppDataSource.getRepository(SalesReturn);

  // Broad search
  const invoices = await invoiceRepo.createQueryBuilder('i')
    .leftJoinAndSelect('i.items', 'items')
    .where('i.invoice_number LIKE :num', { num: '%248' })
    .getMany();
  
  console.log(`Found ${invoices.length} potential invoices`);
  invoices.forEach(invoice => {
    console.log('\n--- INVOICE ---');
    console.log(`Invoice: ${invoice.invoice_number}`);
    console.log(`Net Payable: ${invoice.net_payable}`);
    console.log(`Total MRP: ${invoice.total_mrp}`);
    console.log(`Loyalty Redemption: ${invoice.loyalty_redemption_amount}`);
    console.log(`Voucher Discount: ${invoice.voucher_discount}`);
    console.log(`Special Discount: ${invoice.special_discount}`);
    console.log(`Total Items: ${invoice.items.length}`);
    invoice.items.forEach(it => {
        console.log(`  - Barcode: ${it.barcode_8digit}, Qty: ${it.quantity}, TotalValue: ${it.total_value}`);
    });
  });

  const returns = await returnRepo.createQueryBuilder('r')
    .leftJoinAndSelect('r.items', 'items')
    .where('r.return_number LIKE :num', { num: '%012' })
    .getMany();

  console.log(`\nFound ${returns.length} potential returns`);
  returns.forEach(salesReturn => {
    console.log('\n--- SALES RETURN ---');
    console.log(`Return No: ${salesReturn.return_number}`);
    console.log(`Total Return Amount: ${salesReturn.total_return_amount}`);
    console.log(`Items:`);
    salesReturn.items.forEach(it => {
      console.log(`  - Barcode: ${it.barcode_8digit}, Qty: ${it.quantity}, ReturnAmount: ${it.return_amount}`);
    });
  });

  process.exit(0);
}

research().catch(err => {
  console.error(err);
  process.exit(1);
});
