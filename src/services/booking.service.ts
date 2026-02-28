import { AppDataSource } from '../config/data-source';
import { EBooking } from '../entities/EBooking';

export class BookingService {
  private repo = AppDataSource.getRepository(EBooking);

  async findAll(filters: { status?: string; floor?: string; customer_mobile?: string }) {
    const qb = this.repo.createQueryBuilder('b');
    if (filters.status) qb.andWhere('b.status = :status', { status: filters.status });
    if (filters.floor) qb.andWhere('b.floor = :floor', { floor: filters.floor });
    if (filters.customer_mobile) qb.andWhere('b.customer_mobile = :cm', { cm: filters.customer_mobile });
    qb.orderBy('b.created_at', 'DESC');
    return qb.getMany();
  }

  async findById(id: string) {
    return this.repo.findOneBy({ id });
  }

  async create(data: any, userId: string) {
    const count = await this.repo.count();
    const bkNum = `BK${new Date().getFullYear()}${(count + 1).toString().padStart(6, '0')}`;
    const booking = this.repo.create({
      booking_number: bkNum,
      customer_mobile: data.customer_mobile,
      barcode_8digit: data.barcode_8digit,
      floor: data.floor || null,
      booking_date: data.booking_date || new Date(),
      booking_expiry: data.booking_expiry || null,
      notes: data.notes || null,
      created_by: userId,
    });
    return this.repo.save(booking);
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
