import { Request, Response } from 'express';
import { paymentService } from '../services/payment.service';
import { sendSuccess, sendCreated, sendError } from '../utils/response';
import { AuthenticatedRequest } from '../middleware/auth';

export class PaymentController {
  async findAll(req: Request, res: Response) { try { sendSuccess(res, await paymentService.findAll(req.query as any)); } catch (e: any) { sendError(res, e.message); } }
  async findById(req: Request, res: Response) { try { sendSuccess(res, await paymentService.findOne(req.params.id)); } catch (e: any) { sendError(res, e.message); } }
  async create(req: AuthenticatedRequest, res: Response) { try { sendCreated(res, await paymentService.create(req.body, req.user!.id)); } catch (e: any) { sendError(res, e.message, 400); } }
  async delete(req: Request, res: Response) { try { sendSuccess(res, await paymentService.delete(req.params.id), 'Deleted'); } catch (e: any) { sendError(res, e.message); } }
}

export const paymentController = new PaymentController();
