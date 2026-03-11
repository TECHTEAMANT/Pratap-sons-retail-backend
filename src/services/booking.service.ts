import { AppDataSource } from '../config/data-source';
import { EBooking } from '../entities/EBooking';
import { EBookingItem } from '../entities/EBookingItem';

export class BookingService {
  private repo = AppDataSource.getRepository(EBooking);

  async findAll(filters: { status?: string; floor?: string; customer_identity?: string }) {
    const qb = this.repo.createQueryBuilder('b')
      .leftJoinAndSelect('b.items', 'items')
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
      relations: ['items', 'floor_details', 'created_by_details']
    });
  }

  async create(data: any, userId: string) {
    const count = await this.repo.count();
    const bkNum = `BK${new Date().getFullYear()}${(count + 1).toString().padStart(6, '0')}`;
    
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
      const items = data.items.map((barcode: string) => ({
        e_booking_id: savedBooking.id,
        barcode_8digit: barcode
      }));
      await AppDataSource.getRepository(EBookingItem).insert(items);
    } else if (data.barcode_8digit) {
      // Fallback for single item
      await AppDataSource.getRepository(EBookingItem).insert({
        e_booking_id: savedBooking.id,
        barcode_8digit: data.barcode_8digit
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
