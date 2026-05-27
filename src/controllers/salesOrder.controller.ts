import { Request, Response } from 'express';
import { salesOrderService } from '../services/salesOrder.service';
import { sendSuccess, sendCreated, sendNotFound, sendError } from '../utils/response';
import { AuthenticatedRequest } from '../middleware/auth';

export class SalesOrderController {
  async findAll(req: Request, res: Response) {
    try { sendSuccess(res, await salesOrderService.findAll(req.query as any)); } catch (e: any) { console.error('findAll error:', e); sendError(res, e.message); }
  }
  async findById(req: Request, res: Response) {
    try {
      const order = await salesOrderService.findById(req.params.id);
      order ? sendSuccess(res, order) : sendNotFound(res, 'Sales order');
    } catch (e: any) { console.error('findById error:', e); sendError(res, e.message); }
  }
  async create(req: AuthenticatedRequest, res: Response) {
    try { sendCreated(res, await salesOrderService.create(req.body, req.user!.id)); } catch (e: any) { console.error('create error:', e); sendError(res, e.message, 400); }
  }
  async update(req: Request, res: Response) {
    try {
      const order = await salesOrderService.update(req.params.id, req.body);
      order ? sendSuccess(res, order, 'Updated') : sendNotFound(res, 'Sales order');
    } catch (e: any) { console.error('update error:', e); sendError(res, e.message, 400); }
  }
  async addAdvance(req: AuthenticatedRequest, res: Response) {
    try { 
      const id = req.params.id || req.body.sales_order_id;
      if (!id) throw new Error('Sales order ID is required');
      
      const advances = Array.isArray(req.body) ? req.body : (req.body.advances || [req.body]);
      sendCreated(res, await salesOrderService.addAdvance(id, advances, req.user!.id)); 
    } catch (e: any) { console.error('addAdvance error:', e); sendError(res, e.message, 400); }
  }
  async delete(req: Request, res: Response) {
    try { await salesOrderService.delete(req.params.id); sendSuccess(res, null, 'Order cancelled'); } catch (e: any) { console.error('delete error:', e); sendError(res, e.message); }
  }
  async getItems(req: Request, res: Response) { try { sendSuccess(res, await salesOrderService.getItems(req.query as any)); } catch (e: any) { console.error('GET ITEMS ERROR:', e); sendError(res, e.message); } }
  async createItem(req: Request, res: Response) { try { sendCreated(res, await salesOrderService.createItem(req.body)); } catch (e: any) { sendError(res, e.message, 400); } }
  async getAdvances(req: Request, res: Response) { try { sendSuccess(res, await salesOrderService.getAdvances(req.query as any)); } catch (e: any) { sendError(res, e.message); } }
  async findAdvanceById(req: Request, res: Response) { 
    try { 
      const advance = await salesOrderService.findAdvanceById(req.params.id);
      advance ? sendSuccess(res, advance) : sendNotFound(res, 'Advance record');
    } catch (e: any) { sendError(res, e.message); } 
  }
  async adjustAdvance(req: AuthenticatedRequest, res: Response) {
    try {
      const advanceId = req.params.id;
      const { amount, payment_mode, notes } = req.body;
      const userId = req.user!.id;

      if (!amount || !payment_mode) {
        return sendError(res, 'Amount and payment mode are required', 400);
      }

      const result = await salesOrderService.adjustAdvance(advanceId, Number(amount), payment_mode, notes, userId);
      sendSuccess(res, result, 'Advance adjusted successfully');
    } catch (e: any) {
      sendError(res, e.message, 400);
    }
  }
}

export const salesOrderController = new SalesOrderController();
