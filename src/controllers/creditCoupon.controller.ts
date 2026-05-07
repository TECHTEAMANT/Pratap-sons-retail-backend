import { Request, Response } from 'express';
import { creditCouponService } from '../services/creditCoupon.service';
import { sendSuccess, sendNotFound, sendError } from '../utils/response';
import { AppDataSource } from '../config/data-source';

export class CreditCouponController {
  async findAll(req: Request, res: Response) {
    try {
      sendSuccess(res, await creditCouponService.findAll(req.query as any));
    } catch (e: any) {
      sendError(res, e.message);
    }
  }

  async getByCouponNo(req: Request, res: Response) {
    try {
      const coupon = await creditCouponService.getByCouponNo(req.params.coupon_no);
      coupon ? sendSuccess(res, coupon) : sendNotFound(res, 'Credit coupon');
    } catch (e: any) {
      sendError(res, e.message);
    }
  }

  async getByCustomer(req: Request, res: Response) {
    try {
      const mobile = req.params.mobile;
      sendSuccess(res, await creditCouponService.getCustomerCoupons(mobile));
    } catch (e: any) {
      sendError(res, e.message);
    }
  }

  async validate(req: Request, res: Response) {
    try {
      const coupon = await creditCouponService.getByCouponNo(req.params.coupon_no);
      if (!coupon) return sendNotFound(res, 'Coupon');
      if (coupon.status !== 'active') return sendError(res, 'Coupon is not active', 400);

      const [{ used }] = await AppDataSource.query(
        `SELECT COALESCE(SUM(amount_applied)::numeric, 0) as used FROM credit_coupon_applications WHERE coupon_id = $1`,
        [coupon.id]
      );
      const remaining = Math.max(0, Number(coupon.amount) - Number(used || 0));
      
      if (remaining <= 0) return sendError(res, 'Coupon balance is zero', 400);

      sendSuccess(res, { ...coupon, amount: remaining, original_amount: coupon.amount });
    } catch (e: any) {
      sendError(res, e.message);
    }
  }

  async redeem(req: Request, res: Response) {
    try {
      const { coupon_no, invoice_id, amount } = req.body;
      if (!coupon_no || !invoice_id) throw new Error('coupon_no and invoice_id are required');
      await AppDataSource.transaction(async (manager) => {
        if (amount !== undefined && amount !== null) {
          await creditCouponService.apply(coupon_no, invoice_id, Number(amount), manager);
          return;
        }
        const coupon = await creditCouponService.getByCouponNo(coupon_no);
        if (!coupon) throw new Error('Invalid coupon');
        const [{ used }] = await manager.query(
          `SELECT COALESCE(SUM(amount_applied)::numeric, 0) as used FROM credit_coupon_applications WHERE coupon_id = $1`,
          [coupon.id]
        );
        const remaining = Math.max(0, Number(coupon.amount) - Number(used || 0));
        await creditCouponService.apply(coupon_no, invoice_id, remaining, manager);
      });
      sendSuccess(res, null, 'Coupon applied successfully');
    } catch (e: any) {
      sendError(res, e.message, 400);
    }
  }
}

export const creditCouponController = new CreditCouponController();
