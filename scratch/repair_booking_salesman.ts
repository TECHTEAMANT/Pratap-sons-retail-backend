import { AppDataSource } from '../src/config/data-source';
import { SalesInvoice } from '../src/entities/SalesInvoice';
import { SalesInvoiceItem } from '../src/entities/SalesInvoiceItem';
import { EBookingItem } from '../src/entities/EBookingItem';
import { EBooking } from '../src/entities/EBooking';

async function runRepair() {
  try {
    console.log("Initializing database connection...");
    await AppDataSource.initialize();
    
    console.log("Searching for invoices created from E-Bookings with missing salesman data...");

    // 1. Find all booking items that are invoiced
    const bookingItems = await AppDataSource.getRepository(EBookingItem).find({
      where: { status: 'invoiced' },
      relations: ['booking']
    });

    console.log(`Found ${bookingItems.length} invoiced booking items.`);

    const invoiceIds = [...new Set(bookingItems.map(bi => bi.invoice_id))].filter(Boolean);
    console.log(`Analyzing ${invoiceIds.length} unique invoices...`);

    let repairedInvoices = 0;
    let repairedItemsCount = 0;

    for (const invoiceId of invoiceIds) {
      const invoice = await AppDataSource.getRepository(SalesInvoice).findOne({
        where: { id: invoiceId },
        relations: ['items']
      });

      if (!invoice) continue;

      // Find all booking items for this specific invoice
      const relatedBookingItems = bookingItems.filter(bi => bi.invoice_id === invoiceId);
      
      // Determine a "primary" salesman for the header if it's missing
      // Prefer header of booking, then first item with a salesman
      const bookingHeaderSalesmanId = relatedBookingItems[0]?.booking?.salesman_id;
      const firstItemSalesmanId = relatedBookingItems.find(bi => bi.salesman_id)?.salesman_id;
      const primarySalesmanId = bookingHeaderSalesmanId || firstItemSalesmanId;

      let changedInvoice = false;

      // 1. Repair Invoice Header if missing
      if (!invoice.salesman_id && primarySalesmanId) {
        invoice.salesman_id = primarySalesmanId;
        await AppDataSource.getRepository(SalesInvoice).save(invoice);
        repairedInvoices++;
        changedInvoice = true;
        console.log(`Repaired header for Invoice: ${invoice.invoice_number} with primary Salesman ID: ${primarySalesmanId}`);
      }

      // 2. Repair Individual Invoice Items if missing
      for (const invItem of invoice.items) {
        if (!invItem.salesman_id) {
          // Find the specific booking item that matches this barcode
          const matchedBI = relatedBookingItems.find(bi => bi.barcode_8digit === invItem.barcode_8digit);
          const itemSalesmanId = matchedBI?.salesman_id || primarySalesmanId;

          if (itemSalesmanId) {
            invItem.salesman_id = itemSalesmanId;
            await AppDataSource.getRepository(SalesInvoiceItem).save(invItem);
            repairedItemsCount++;
            changedInvoice = true;
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
