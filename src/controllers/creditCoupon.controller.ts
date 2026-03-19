import { Request, Response } from 'express';
import { creditCouponService } from '../services/creditCoupon.service';
import { sendSuccess, sendNotFound, sendError } from '../utils/response';

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
      sendSuccess(res, coupon);
    } catch (e: any) {
      sendError(res, e.message);
    }
  }

  async redeem(req: Request, res: Response) {
    try {
      const { coupon_no, invoice_id } = req.body;
      if (!coupon_no || !invoice_id) throw new Error('coupon_no and invoice_id are required');
      const result = await creditCouponService.redeem(coupon_no, invoice_id);
      sendSuccess(res, result, 'Coupon redeemed successfully');
    } catch (e: any) {
      sendError(res, e.message, 400);
    }
  }
}

export const creditCouponController = new CreditCouponController();
