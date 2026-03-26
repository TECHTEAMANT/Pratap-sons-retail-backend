import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { voucherService } from '../services/voucher.service';
import { sendSuccess, sendCreated, sendError, sendNotFound } from '../utils/response';

export class VoucherController {
  async findAll(req: AuthenticatedRequest, res: Response) {
    try {
      const data = await voucherService.findAll(req.query);
      sendSuccess(res, data);
    } catch (e: any) {
      sendError(res, e.message);
    }
  }

  async validate(req: AuthenticatedRequest, res: Response) {
    try {
      const { code } = req.params;
      const voucher = await voucherService.validateVoucher(code);
      sendSuccess(res, voucher);
    } catch (e: any) {
      sendError(res, e.message, 400);
    }
  }

  async getByCode(req: AuthenticatedRequest, res: Response) {
    try {
      const { code } = req.params;
      const voucher = await voucherService.findByCode(code);
      voucher ? sendSuccess(res, voucher) : sendNotFound(res, 'Voucher');
    } catch (e: any) {
      sendError(res, e.message);
    }
  }

  async generate(req: AuthenticatedRequest, res: Response) {
    try {
      const vouchers = await voucherService.generateVouchers(req.body);
      sendCreated(res, vouchers);
    } catch (e: any) {
      sendError(res, e.message, 400);
    }
  }
}

export const voucherController = new VoucherController();
