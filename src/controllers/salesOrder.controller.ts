import { Request, Response } from 'express';
import { salesOrderService } from '../services/salesOrder.service';
import { sendSuccess, sendCreated, sendNotFound, sendError } from '../utils/response';
import { AuthenticatedRequest } from '../middleware/auth';

export class SalesOrderController {
  async findAll(req: Request, res: Response) {
    try { sendSuccess(res, await salesOrderService.findAll(req.query as any)); } catch (e: any) { sendError(res, e.message); }
  }
  async findById(req: Request, res: Response) {
    try {
      const order = await salesOrderService.findById(req.params.id);
      order ? sendSuccess(res, order) : sendNotFound(res, 'Sales order');
    } catch (e: any) { sendError(res, e.message); }
  }
  async create(req: AuthenticatedRequest, res: Response) {
    try { sendCreated(res, await salesOrderService.create(req.body, req.user!.id)); } catch (e: any) { sendError(res, e.message, 400); }
  }
  async update(req: Request, res: Response) {
    try {
      const order = await salesOrderService.update(req.params.id, req.body);
      order ? sendSuccess(res, order, 'Updated') : sendNotFound(res, 'Sales order');
    } catch (e: any) { sendError(res, e.message, 400); }
  }
  async addAdvance(req: AuthenticatedRequest, res: Response) {
    try { sendCreated(res, await salesOrderService.addAdvance(req.params.id, req.body, req.user!.id)); } catch (e: any) { sendError(res, e.message, 400); }
  }
  async delete(req: Request, res: Response) {
    try { await salesOrderService.delete(req.params.id); sendSuccess(res, null, 'Order cancelled'); } catch (e: any) { sendError(res, e.message); }
  }
  async getItems(req: Request, res: Response) { try { sendSuccess(res, await salesOrderService.getItems(req.query as any)); } catch (e: any) { sendError(res, e.message); } }
  async createItem(req: Request, res: Response) { try { sendCreated(res, await salesOrderService.createItem(req.body)); } catch (e: any) { sendError(res, e.message, 400); } }
  async getAdvances(req: Request, res: Response) { try { sendSuccess(res, await salesOrderService.getAdvances(req.query as any)); } catch (e: any) { sendError(res, e.message); } }
}

export const salesOrderController = new SalesOrderController();
