import { AppDataSource } from '../config/data-source';
import { CreditCoupon } from '../entities/CreditCoupon';
import { CreditCouponApplication } from '../entities/CreditCouponApplication';
import { EntityManager } from 'typeorm';

export class CreditCouponService {
  private repo = AppDataSource.getRepository(CreditCoupon);

  /**
   * Generate a new credit coupon
   */
  async generate(data: { 
    amount: number; 
    customer_mobile: string; 
    return_id: string; 
  }, manager?: EntityManager) {
    const repo = manager ? manager.getRepository(CreditCoupon) : this.repo;
    
    // Generate a unique coupon number: CPN + YYMMDD + 6 random digits
    const date = new Date();
    const dateStr = date.toISOString().slice(2, 10).replace(/-/g, '');
    const randomStr = Math.floor(100000 + Math.random() * 900000).toString();
    const couponNo = `CPN${dateStr}${randomStr}`;

    const coupon = repo.create({
      coupon_no: couponNo,
      amount: data.amount,
      customer_mobile: data.customer_mobile,
      original_sales_return_id: data.return_id,
      status: 'active',
    });

    return repo.save(coupon);
  }

  /**
   * Apply a credit coupon to an invoice (supports partial usage).
   */
  async apply(couponNo: string, invoiceId: string, amountToApply: number, manager: EntityManager) {
    const couponRepo = manager.getRepository(CreditCoupon);
    const appRepo = manager.getRepository(CreditCouponApplication);

    const coupon = await couponRepo.findOne({ where: { coupon_no: couponNo } });
    if (!coupon) throw new Error(`Invalid coupon: ${couponNo}`);

    const [{ used }] = await manager.query(
      `SELECT COALESCE(SUM(amount_applied)::numeric, 0) as used FROM credit_coupon_applications WHERE coupon_id = $1`,
      [coupon.id]
    );
    const remaining = Math.max(0, Number(coupon.amount) - Number(used || 0));

    const amt = Number(amountToApply || 0);
    if (amt <= 0) return;

    // Use a small epsilon or round to 2 decimal places to avoid floating point precision errors
    const roundedAmt = Math.round(amt * 100);
    const roundedRemaining = Math.round(remaining * 100);

    if (roundedAmt > roundedRemaining) {
      throw new Error(`Coupon ${couponNo} has only ₹${remaining.toFixed(2)} remaining`);
    }

    const existing = await appRepo.findOne({ where: { coupon_id: coupon.id, invoice_id: invoiceId } });
    if (existing) {
      existing.amount_applied = Number(existing.amount_applied || 0) + amt;
      await appRepo.save(existing);
    } else {
      await appRepo.save(appRepo.create({ coupon_id: coupon.id, invoice_id: invoiceId, amount_applied: amt }));
    }

    const newRemaining = remaining - amt;
    coupon.status = newRemaining <= 0 ? 'redeemed' : 'active';
    coupon.updated_at = new Date();
    await couponRepo.save(coupon);
  }

  /**
   * Release all coupon applications for an invoice (used when invoice is edited/deleted).
   */
  async releaseInvoiceApplications(invoiceId: string, manager: EntityManager) {
    const appRepo = manager.getRepository(CreditCouponApplication);
    const couponRepo = manager.getRepository(CreditCoupon);

    const apps = await appRepo.find({ where: { invoice_id: invoiceId } });
    if (apps.length === 0) return;

    const couponIds = [...new Set(apps.map(a => a.coupon_id))];
    await appRepo.delete({ invoice_id: invoiceId } as any);

    for (const couponId of couponIds) {
      const coupon = await couponRepo.findOne({ where: { id: couponId } });
      if (!coupon) continue;
      const [{ used }] = await manager.query(
        `SELECT COALESCE(SUM(amount_applied)::numeric, 0) as used FROM credit_coupon_applications WHERE coupon_id = $1`,
        [couponId]
      );
      const remaining = Math.max(0, Number(coupon.amount) - Number(used || 0));
      coupon.status = remaining <= 0 ? 'redeemed' : 'active';
      coupon.updated_at = new Date();
      await couponRepo.save(coupon);
    }
  }

  /**
   * Find coupon by number
   */
  async getByCouponNo(couponNo: string) {
    return this.repo.findOne({ 
      where: { coupon_no: couponNo },
      relations: ['customer']
    });
  }

  /**
   * Find coupons with filters
   */
  async findAll(filters: any) {
    const qb = this.repo.createQueryBuilder('cc')
      .leftJoinAndSelect('cc.customer', 'customer')
      .leftJoinAndSelect('cc.original_return', 'original_return');

    const { search, status, ...otherFilters } = filters;

    if (status && status !== 'all') {
      qb.andWhere('cc.status = :status', { status });
    }

    if (search) {
      qb.andWhere('(cc.coupon_no ILIKE :search OR cc.customer_mobile ILIKE :search OR customer.name ILIKE :search OR original_return.invoice_number ILIKE :search)', { 
        search: `%${search}%` 
      });
    }

    // Apply other filters as exact matches
    Object.entries(otherFilters).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        qb.andWhere(`cc.${key} = :${key}`, { [key]: val });
      }
    });

    qb.orderBy('cc.created_at', 'DESC');
    const coupons = await qb.getMany();

    // Enrich with remaining balance
    return Promise.all(coupons.map(async (coupon) => {
      const [{ used }] = await AppDataSource.query(
        `SELECT COALESCE(SUM(amount_applied)::numeric, 0) as used FROM credit_coupon_applications WHERE coupon_id = $1`,
        [coupon.id]
      );
      const remaining = Math.max(0, Number(coupon.amount) - Number(used || 0));
      return { ...coupon, amount: remaining, original_amount: coupon.amount };
    }));
  }

  /**
   * List coupons for a customer
   */
  async getCustomerCoupons(mobile: string) {
    const coupons = await this.repo.find({ 
      where: { customer_mobile: mobile },
      order: { created_at: 'DESC' }
    });

    return Promise.all(coupons.map(async (coupon) => {
      const [{ used }] = await AppDataSource.query(
        `SELECT COALESCE(SUM(amount_applied)::numeric, 0) as used FROM credit_coupon_applications WHERE coupon_id = $1`,
        [coupon.id]
      );
      const remaining = Math.max(0, Number(coupon.amount) - Number(used || 0));
      return { ...coupon, amount: remaining, original_amount: coupon.amount };
    }));
  }
}

export const creditCouponService = new CreditCouponService();
