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
  async updateInvoiceItems(req: Request, res: Response) {
    try {
      const id = req.query.id as string;
      if (!id) throw new Error('Item IDs are required');
      const ids = id.split(',').map(i => i.trim()).filter(Boolean);
      await salesService.updateInvoiceItems(ids, req.body);
      sendSuccess(res, { message: 'Items updated successfully' });
    } catch (e: any) { sendError(res, e.message); }
  }
  async getGroundTruth(req: Request, res: Response) {
    try {
      const data = await salesService.getGroundTruth(req.params.id);
      data ? sendSuccess(res, data) : sendNotFound(res, 'Invoice');
    } catch (e: any) { sendError(res, e.message); }
  }
}

export const salesController = new SalesController();
