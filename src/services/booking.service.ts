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
    // Use a single optimized query that joins inventory data so the print slip
    // doesn't need to make separate API calls per barcode.
    const rows = await AppDataSource.query(`
      SELECT
        b.id,
        b.booking_number,
        b.customer_mobile      AS customer_identity,
        b.floor,
        b.booking_date,
        b.booking_expiry,
        b.status,
        b.notes,
        b.discount_amount,
        b.discount_type,
        b.created_at,
        b.updated_at,

        -- Floor details
        f.name                 AS floor_name,

        -- Customer name from customers table
        c.name                 AS customer_name,

        -- Salesman (header level)
        sm.name                AS salesman_name,
        sm.salesman_code       AS salesman_code,

        -- Discount given by
        du.name                AS discount_given_by_name,

        -- Items (aggregated as JSON)
        COALESCE(
          json_agg(
            json_build_object(
              'id',              bi.id,
              'barcode_8digit',  bi.barcode_8digit,
              'status',          bi.status,
              'invoice_id',      bi.invoice_id,
              'salesman_id',     bi.salesman_id,
              'salesman_name',   ism.name,
              'salesman_code',   ism.salesman_code,
              -- Inventory enrichment (MRP + product details)
              'mrp',             inv.mrp,
              'design_no',       inv.design_no,
              'product_group_name', pg.name,
              'color_name',      col.name,
              'size_name',       sz.name
            )
          ) FILTER (WHERE bi.id IS NOT NULL),
          '[]'
        ) AS items

      FROM e_bookings b
      -- Compare uuid id TO text column (not the other way — avoids cast errors on empty/null)
      LEFT JOIN floors              f   ON CAST(f.id AS TEXT) = b.floor
      LEFT JOIN customers           c   ON c.mobile = b.customer_mobile
      LEFT JOIN salesmen            sm  ON sm.id = b.salesman_id
      LEFT JOIN users               du  ON du.id = b.discount_given_by
      LEFT JOIN e_booking_items     bi  ON bi.e_booking_id = b.id
      LEFT JOIN salesmen            ism ON ism.id = bi.salesman_id
      LEFT JOIN barcode_batches     inv ON inv.barcode_alias_8digit = bi.barcode_8digit
      -- product_group/color/size are text columns storing uuid — compare by casting id to text
      LEFT JOIN product_groups      pg  ON CAST(pg.id AS TEXT) = inv.product_group
      LEFT JOIN colors              col ON CAST(col.id AS TEXT) = inv.color
      LEFT JOIN sizes               sz  ON CAST(sz.id  AS TEXT) = inv.size

      WHERE b.id = $1
      GROUP BY
        b.id, b.booking_number, b.customer_mobile, b.floor,
        b.booking_date, b.booking_expiry, b.status, b.notes,
        b.discount_amount, b.discount_type, b.created_at, b.updated_at,
        f.name, c.name, sm.name, sm.salesman_code, du.name
    `, [id]);

    if (!rows || rows.length === 0) return null;

    const row = rows[0];
    return {
      id:                    row.id,
      booking_number:        row.booking_number,
      customer_identity:     row.customer_identity,
      customer_name:         row.customer_name || 'Walk-in Customer',
      floor:                 row.floor,
      floor_name:            row.floor_name,
      booking_date:          row.booking_date,
      booking_expiry:        row.booking_expiry,
      status:                row.status,
      notes:                 row.notes,
      discount_amount:       row.discount_amount,
      discount_type:         row.discount_type,
      created_at:            row.created_at,
      updated_at:            row.updated_at,
      salesman_name:         row.salesman_name,
      salesman_code:         row.salesman_code,
      discount_given_by_name: row.discount_given_by_name,
      items: Array.isArray(row.items) ? row.items : [],
    };
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
