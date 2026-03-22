import { AppDataSource } from '../config/data-source';
import { CreditCoupon } from '../entities/CreditCoupon';
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
   * Redeem a credit coupon
   */
  async redeem(couponNo: string, invoiceId: string, manager?: EntityManager) {
    const repo = manager ? manager.getRepository(CreditCoupon) : this.repo;
    
    const coupon = await repo.findOne({ 
      where: { coupon_no: couponNo, status: 'active' } 
    });

    if (!coupon) {
      throw new Error(`Invalid or inactive coupon: ${couponNo}`);
    }

    coupon.status = 'redeemed';
    coupon.redeemed_invoice_id = invoiceId;
    coupon.updated_at = new Date();

    return repo.save(coupon);
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
  async findAll(filters: { search?: string; status?: string }) {
    const qb = this.repo.createQueryBuilder('cc')
      .leftJoinAndSelect('cc.customer', 'customer');

    if (filters.status && filters.status !== 'all') {
      qb.andWhere('cc.status = :status', { status: filters.status });
    }

    if (filters.search) {
      qb.andWhere('(cc.coupon_no ILIKE :search OR cc.customer_mobile ILIKE :search OR customer.name ILIKE :search)', { 
        search: `%${filters.search}%` 
      });
    }

    qb.orderBy('cc.created_at', 'DESC');
    return qb.getMany();
  }

  /**
   * List coupons for a customer
   */
  async getCustomerCoupons(mobile: string) {
    return this.repo.find({ 
      where: { customer_mobile: mobile },
      order: { created_at: 'DESC' }
    });
  }
}

export const creditCouponService = new CreditCouponService();
