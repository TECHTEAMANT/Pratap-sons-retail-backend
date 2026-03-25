import { Request, Response } from 'express';
import { salesService } from '../services/sales.service';
import { sendSuccess, sendCreated, sendNotFound, sendError, sendPaginated } from '../utils/response';
import { AuthenticatedRequest } from '../middleware/auth';

export class SalesController {
  async getInvoices(req: Request, res: Response) {
    try {
      const result = await salesService.getInvoices(req.query as any);
      sendPaginated(res, result.data, result.total, result.page, result.limit);
    } catch (e: any) { sendError(res, e.message); }
  }
  async getInvoiceById(req: Request, res: Response) {
    try {
      const invoice = await salesService.getInvoiceById(req.params.id);
      invoice ? sendSuccess(res, invoice) : sendNotFound(res, 'Invoice');
    } catch (e: any) { sendError(res, e.message); }
  }
  async createInvoice(req: AuthenticatedRequest, res: Response) {
    try { sendCreated(res, await salesService.createInvoice(req.body, req.user!.id)); } catch (e: any) { sendError(res, e.message, 400); }
  }
  async getInvoiceItems(req: Request, res: Response) {
    try { sendSuccess(res, await salesService.getInvoiceItems(req.query)); } catch (e: any) { sendError(res, e.message); }
  }
  async updateInvoice(req: AuthenticatedRequest, res: Response) {
    try { sendSuccess(res, await salesService.updateInvoice(req.params.id, req.body, req.user!.id)); } catch (e: any) { sendError(res, e.message, 400); }
  }
}

export const salesController = new SalesController();
