import { AppDataSource } from '../config/data-source';
import { SalesInvoice } from '../entities/SalesInvoice';
import { SalesInvoiceItem } from '../entities/SalesInvoiceItem';

async function fixNetPayable() {
  console.log("Initializing database connection...");
  await AppDataSource.initialize();
  console.log("Database initialized.");

  try {
    console.log("Starting DB Fix for net_payable...");
    
    const invoiceRepo = AppDataSource.getRepository(SalesInvoice);
    const itemRepo = AppDataSource.getRepository(SalesInvoiceItem);

    // Fetch all invoices
    const invoices = await invoiceRepo.find();
    let updatedCount = 0;
    
    for (const inv of invoices) {
      const items = await itemRepo.find({ where: { invoice_id: inv.id } });
      
      const trueTotalMrp = items.reduce((s, i) => s + (Number(i.mrp || 0) * Number(i.quantity || 1)), 0);
      const itemSum = items.reduce((s, i) => s + (Number(i.discount || 0) * Number(i.quantity || 1)), 0);
      
      const headerSum = Number(inv.special_discount || 0) + 
                        Number(inv.loyalty_redemption_amount || 0) + 
                        Number(inv.voucher_discount || 0);

      const finalDiscount = Math.max(Math.round(itemSum), Math.round(headerSum));
      
      const trueNetPayable = Math.round(Math.max(0, 
        trueTotalMrp 
        - finalDiscount 
        + Number(inv.additional_charges_total || 0)
      ));
      
      // If db value is off by more than 1 rupee, update it
      if (Math.abs(Number(inv.net_payable) - trueNetPayable) > 1) {
        inv.net_payable = trueNetPayable;
        await invoiceRepo.save(inv);
        updatedCount++;
        console.log(`Updated invoice ${inv.invoice_number}: ${inv.net_payable} -> ${trueNetPayable}`);
      }
    }
    
    console.log(`Successfully fixed ${updatedCount} corrupted invoices.`);
  } catch(e) {
    console.error("Error running fix:", e);
  } finally {
    await AppDataSource.destroy();
    console.log("Database connection closed.");
    process.exit(0);
  }
}

fixNetPayable();
