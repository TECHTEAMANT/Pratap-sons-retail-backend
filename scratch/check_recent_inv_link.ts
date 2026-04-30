import { AppDataSource } from '../src/config/data-source';
import { SalesInvoice } from '../src/entities/SalesInvoice';
import { EBookingItem } from '../src/entities/EBookingItem';

async function checkInvoice() {
  await AppDataSource.initialize();
  const invNo = 'INV2627000018';
  const inv = await AppDataSource.getRepository(SalesInvoice).findOne({
    where: { invoice_number: invNo },
    relations: ['items']
  });

  if (inv) {
    console.log(`Invoice ${invNo} ID: ${inv.id}`);
    const bookingItems = await AppDataSource.getRepository(EBookingItem).find({
      where: { invoice_id: inv.id },
      relations: ['booking', 'salesman']
    });

    if (bookingItems.length > 0) {
      console.log(`Linked to Booking: ${bookingItems[0].booking.booking_number}`);
      console.log(`Booking Header Salesman: ${bookingItems[0].booking.salesman_id}`);
      bookingItems.forEach(bi => {
        console.log(`Item Barcode: ${bi.barcode_8digit} | Item Salesman: ${bi.salesman_id}`);
      });
    } else {
      console.log("No linked booking items found.");
    }
  } else {
    console.log("Invoice not found.");
  }

  await AppDataSource.destroy();
}
checkInvoice();
