import { Request, Response } from 'express';
import { salesReturnService } from '../services/salesReturn.service';
import { sendSuccess, sendCreated, sendNotFound, sendError } from '../utils/response';
import { AuthenticatedRequest } from '../middleware/auth';

export class SalesReturnController {
  async findAll(req: Request, res: Response) {
    try { sendSuccess(res, await salesReturnService.findAll(req.query as any)); } catch (e: any) { sendError(res, e.message); }
  }
  async findById(req: Request, res: Response) {
    try {
      const ret = await salesReturnService.findById(req.params.id);
      ret ? sendSuccess(res, ret) : sendNotFound(res, 'Sales return');
    } catch (e: any) { sendError(res, e.message); }
  }
  async create(req: AuthenticatedRequest, res: Response) {
    try { sendCreated(res, await salesReturnService.create(req.body, req.user!.id)); } catch (e: any) { sendError(res, e.message, 400); }
  }
  async getCreditNotes(req: Request, res: Response) {
    try { sendSuccess(res, await salesReturnService.getCreditNotes(req.query as any)); } catch (e: any) { sendError(res, e.message); }
  }
  async applyCreditNote(req: Request, res: Response) {
    try {
      const result = await salesReturnService.applyCreditNote(req.params.id, req.body.invoice_id, req.body.amount);
      sendSuccess(res, result, 'Credit note applied');
    } catch (e: any) { sendError(res, e.message, 400); }
  }
  async getReturnItems(req: Request, res: Response) {
    try { sendSuccess(res, await salesReturnService.getReturnItems(req.query)); } catch (e: any) { sendError(res, e.message); }
  }
}

export const salesReturnController = new SalesReturnController();
