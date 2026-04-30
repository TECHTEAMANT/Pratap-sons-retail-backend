import { AppDataSource } from '../src/config/data-source';
import { SalesInvoice } from '../src/entities/SalesInvoice';
import { SalesInvoiceItem } from '../src/entities/SalesInvoiceItem';
import { EBookingItem } from '../src/entities/EBookingItem';
import { EBooking } from '../src/entities/EBooking';
import { IsNull } from 'typeorm';

async function runRepair() {
  try {
    console.log("Initializing database connection...");
    await AppDataSource.initialize();
    
    console.log("Searching for ALL invoices with missing salesman data...");

    const invoices = await AppDataSource.getRepository(SalesInvoice).find({
      where: { salesman_id: IsNull() },
      relations: ['items']
    });

    console.log(`Found ${invoices.length} invoices with null salesman_id.`);

    let repairedInvoices = 0;
    let repairedItemsCount = 0;

    for (const invoice of invoices) {
      // Try to find if this invoice is linked to any EBookingItem
      const bookingItems = await AppDataSource.getRepository(EBookingItem).find({
        where: { invoice_id: invoice.id },
        relations: ['booking']
      });

      if (bookingItems.length === 0) {
        // console.log(`Invoice ${invoice.invoice_number} is not linked to any booking.`);
        continue;
      }

      // Determine a "primary" salesman from the booking
      const bookingHeaderSalesmanId = bookingItems[0]?.booking?.salesman_id;
      const firstItemSalesmanId = bookingItems.find(bi => bi.salesman_id)?.salesman_id;
      const primarySalesmanId = bookingHeaderSalesmanId || firstItemSalesmanId;

      if (!primarySalesmanId) {
        // console.log(`Invoice ${invoice.invoice_number} linked booking has no salesman.`);
        continue;
      }

      let changedInvoice = false;

      // 1. Repair Invoice Header
      invoice.salesman_id = primarySalesmanId;
      await AppDataSource.getRepository(SalesInvoice).save(invoice);
      repairedInvoices++;
      changedInvoice = true;
      console.log(`[FIXED] Header for Invoice: ${invoice.invoice_number} with Salesman ID: ${primarySalesmanId}`);

      // 2. Repair Individual Invoice Items
      for (const invItem of invoice.items) {
        if (!invItem.salesman_id) {
          const matchedBI = bookingItems.find(bi => bi.barcode_8digit === invItem.barcode_8digit);
          const itemSalesmanId = matchedBI?.salesman_id || primarySalesmanId;

          if (itemSalesmanId) {
            invItem.salesman_id = itemSalesmanId;
            await AppDataSource.getRepository(SalesInvoiceItem).save(invItem);
            repairedItemsCount++;
          }
        }
      }

      if (changedInvoice) {
        console.log(`Completed repair for Invoice: ${invoice.invoice_number}`);
      }
    }

    console.log(`\nRepair completed!`);
    console.log(`Invoices headers repaired: ${repairedInvoices}`);
    console.log(`Invoice items repaired: ${repairedItemsCount}`);
    
    await AppDataSource.destroy();
    process.exit(0);
  } catch (error) {
    console.error("Error during repair:", error);
    process.exit(1);
  }
}

runRepair();
