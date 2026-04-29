import { AppDataSource } from '../src/config/data-source';
import { Customer } from '../src/entities/Customer';
import { SalesInvoice } from '../src/entities/SalesInvoice';
import { PaymentReceipt } from '../src/entities/PaymentReceipt';

async function findAnita() {
  try {
    await AppDataSource.initialize();
    
    // 1. Find Customer
    const customer = await AppDataSource.getRepository(Customer).findOne({
      where: { name: 'anita jain' }
    });
    console.log("CUSTOMER:", customer);
    
    if (customer) {
       // 2. Find Invoices for this customer
       const invoices = await AppDataSource.getRepository(SalesInvoice).find({
         where: { customer_mobile: customer.mobile },
         relations: ['items', 'receipt_items', 'advance_applications']
       });
       console.log("INVOICES FOR ANITA:", JSON.stringify(invoices.map(i => ({num: i.invoice_number, paid: i.amount_paid, net: i.net_payable})), null, 2));
    }
    
    // 3. Search for the specific invoice number with LIKE again but very loose
    const invLoose = await AppDataSource.getRepository(SalesInvoice).find({
      where: [
        { invoice_number: 'INV2627000334' },
        { invoice_number: ' INV2627000334' },
        { invoice_number: 'INV2627000334 ' }
      ]
    });
    console.log("INV LOOSE MATCH:", invLoose);

    await AppDataSource.destroy();
  } catch (error) {
    console.error(error);
  }
}

findAnita();
