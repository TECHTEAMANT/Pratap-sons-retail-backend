import { AppDataSource } from '../src/config/data-source';
import { EBookingItem } from '../src/entities/EBookingItem';
import { SalesInvoice } from '../src/entities/SalesInvoice';

async function checkData() {
  await AppDataSource.initialize();
  const items = await AppDataSource.getRepository(EBookingItem).find({
    where: { status: 'invoiced' },
    relations: ['booking', 'booking.salesman_master', 'invoice', 'invoice.salesman', 'salesman']
  });

  console.log("Invoiced Booking Items Data:");
  items.forEach(i => {
    console.log({
      booking_no: i.booking.booking_number,
      booking_salesman: i.booking.salesman_master?.name || 'NONE',
      item_salesman: i.salesman?.name || 'NONE',
      invoice_no: i.invoice?.invoice_number || 'NONE',
      invoice_salesman: i.invoice?.salesman?.name || 'NONE'
    });
  });

  await AppDataSource.destroy();
}
checkData();
