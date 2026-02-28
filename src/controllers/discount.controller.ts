import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { discountService } from '../services/discount.service';
import { sendSuccess, sendCreated, sendNotFound, sendError } from '../utils/response';

export class DiscountController {
  async findAll(_r: AuthenticatedRequest, res: Response) {
    try { sendSuccess(res, await discountService.findAll()); } catch (e: any) { sendError(res, e.message); }
  }
  async create(req: AuthenticatedRequest, res: Response) {
    try { sendCreated(res, await discountService.create(req.body, req.user!.id)); } catch (e: any) { sendError(res, e.message, 400); }
  }
  async update(req: AuthenticatedRequest, res: Response) {
    try {
      const d = await discountService.update(req.params.id, req.body);
      d ? sendSuccess(res, d) : sendNotFound(res, 'Discount');
    } catch (e: any) { sendError(res, e.message, 400); }
  }
  async delete(req: AuthenticatedRequest, res: Response) {
    try {
      const d = await discountService.delete(req.params.id);
      d ? sendSuccess(res, d, 'Deleted') : sendNotFound(res, 'Discount');
    } catch (e: any) { sendError(res, e.message); }
  }
}

export const discountController = new DiscountController();
