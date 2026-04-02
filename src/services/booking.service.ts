import { AppDataSource } from '../config/data-source';
import { EBooking } from '../entities/EBooking';
import { EBookingItem } from '../entities/EBookingItem';
import { LessThan } from 'typeorm';
import { getFiscalYearPrefix } from '../utils/fiscalYear';
import { customerService } from './customer.service';

export class BookingService {
  private repo = AppDataSource.getRepository(EBooking);

  /** Mark all past-expiry 'booked' bookings as 'expired' in the DB */
  private async expireStaleBookings() {
    try {
      const now = new Date();
      await this.repo
        .createQueryBuilder()
        .update(EBooking)
        .set({ status: 'expired' })
        .where('status = :status', { status: 'booked' })
        .andWhere('booking_expiry IS NOT NULL')
        .andWhere('booking_expiry < :now', { now })
        .execute();
    } catch (err) {
      // Non-fatal — don't block the main query
      console.error('Error expiring stale bookings:', err);
    }
  }

  async findAll(filters: { status?: string; floor?: string; customer_identity?: string }) {
    // Expire any overdue bookings before returning results
    await this.expireStaleBookings();

    const qb = this.repo.createQueryBuilder('b')
      .leftJoinAndSelect('b.items', 'items')
      .leftJoinAndSelect('items.salesman', 'item_salesman')
      .leftJoinAndSelect('b.floor_details', 'floor')
      .leftJoinAndSelect('b.created_by_details', 'user')
      .leftJoinAndSelect('b.discount_given_by_details', 'discount_user');
    
    if (filters.status) qb.andWhere('b.status = :status', { status: filters.status });
    if (filters.floor) qb.andWhere('b.floor = :floor', { floor: filters.floor });
    const identity = filters.customer_identity || (filters as any).customer_mobile;
    if (identity) qb.andWhere('b.customer_identity = :ci', { ci: identity });
    
    qb.orderBy('b.created_at', 'DESC');
    return qb.getMany();
  }

  async findById(id: string) {
    return this.repo.findOne({
      where: { id },
      relations: ['items', 'items.salesman', 'floor_details', 'created_by_details', 'salesman_master']
    });
  }

  async create(data: any, userId: string) {
    let bkNum = data.booking_number;
    if (!bkNum) {
      const prefix = `BK${getFiscalYearPrefix()}`;
      const records = await this.repo.query(`SELECT booking_number FROM e_bookings WHERE booking_number LIKE $1 ORDER BY booking_number DESC LIMIT 1`, [`${prefix}%`]);
      let nextNum = 1;
      if (records.length > 0 && records[0].booking_number) {
        const lastPortion = records[0].booking_number.substring(prefix.length);
        const parsed = parseInt(lastPortion, 10);
        if (!isNaN(parsed)) nextNum = parsed + 1;
      }
      bkNum = `${prefix}${nextNum.toString().padStart(6, '0')}`;
    }

    // Auto-link or Create Customer (identity is mobile)
    if (data.customer_identity) {
        const customer = await customerService.ensureCustomerExists({
            mobile: data.customer_identity,
            name: data.customer_name || 'Walk-in Customer'
        });
        // We still keep customer_identity string as the primary key reference in e_bookings table
        // But the customer record is now guaranteed to exist.
    }

    
    const booking = this.repo.create({
      booking_number: data.booking_number || bkNum,
      customer_identity: data.customer_identity,
      floor: data.floor || null,
      booking_date: data.booking_date || new Date(),
      booking_expiry: data.booking_expiry || null,
      notes: data.notes || null,
      salesman_id: data.salesman_id || null,
      discount_amount: data.discount_amount || 0,
      discount_type: data.discount_type || 'amount',
      discount_given_by: data.discount_given_by || null,
      created_by: userId,
    });

    const savedBooking = await this.repo.save(booking);

    if (data.items && Array.isArray(data.items)) {
      const items = data.items.map((item: any) => {
        if (typeof item === 'string') {
          return {
            e_booking_id: savedBooking.id,
            barcode_8digit: item,
            salesman_id: data.salesman_id || null
          };
        }
        return {
          e_booking_id: savedBooking.id,
          barcode_8digit: item.barcode_8digit,
          salesman_id: item.salesman_id || data.salesman_id || null
        };
      });
      await AppDataSource.getRepository(EBookingItem).insert(items);
    } else if (data.barcode_8digit) {
      // Fallback for single item
      await AppDataSource.getRepository(EBookingItem).insert({
        e_booking_id: savedBooking.id,
        barcode_8digit: data.barcode_8digit,
        salesman_id: data.salesman_id || null
      });
    }

    return this.findById(savedBooking.id);
  }

  async cancel(id: string) {
    const booking = await this.repo.findOneBy({ id });
    if (!booking) return null;
    booking.status = 'cancelled';
    return this.repo.save(booking);
  }

  async update(id: string, data: any) {
    const booking = await this.repo.findOneBy({ id });
    if (!booking) return null;
    Object.assign(booking, data);
    return this.repo.save(booking);
  }
}

export const bookingService = new BookingService();
