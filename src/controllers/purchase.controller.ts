import { Request, Response } from 'express';
import { purchaseService } from '../services/purchase.service';
import { sendSuccess, sendCreated, sendNotFound, sendError, sendPaginated } from '../utils/response';
import { AuthenticatedRequest } from '../middleware/auth';

export class PurchaseController {
  async getOrders(req: Request, res: Response) {
    try {
      const result = await purchaseService.getOrders(req.query as any);
      sendPaginated(res, result.data, result.total, result.page, result.limit);
    } catch (e: any) { sendError(res, e.message); }
  }
  async getOrderById(req: Request, res: Response) {
    try { const o = await purchaseService.getOrderById(req.params.id); o ? sendSuccess(res, o) : sendNotFound(res, 'Purchase order'); } catch (e: any) { sendError(res, e.message); }
  }
  async createOrder(req: AuthenticatedRequest, res: Response) { try { sendCreated(res, await purchaseService.createOrder(req.body, req.user!.id)); } catch (e: any) { sendError(res, e.message, 400); } }
  async updateOrder(req: Request, res: Response) {
    try { const o = await purchaseService.updateOrder(req.params.id, req.body); o ? sendSuccess(res, o, 'Updated') : sendNotFound(res, 'PO'); } catch (e: any) { sendError(res, e.message, 400); }
  }
  async getInvoices(req: Request, res: Response) { try { sendSuccess(res, await purchaseService.getInvoices(req.query as any)); } catch (e: any) { sendError(res, e.message); } }
  async createInvoice(req: AuthenticatedRequest, res: Response) { try { sendCreated(res, await purchaseService.createInvoice(req.body, req.user!.id)); } catch (e: any) { sendError(res, e.message, 400); } }
  async getOrderItems(req: Request, res: Response) { try { sendSuccess(res, await purchaseService.getOrderItems(req.query as any)); } catch (e: any) { sendError(res, e.message); } }
  async getPurchaseItems(req: Request, res: Response) { try { sendSuccess(res, await purchaseService.getPurchaseItems(req.query as any)); } catch (e: any) { sendError(res, e.message); } }
  async createPurchaseItem(req: Request, res: Response) { try { sendCreated(res, await purchaseService.createPurchaseItem(req.body)); } catch (e: any) { sendError(res, e.message, 400); } }
  async deletePurchaseItems(req: Request, res: Response) { try { await purchaseService.deletePurchaseItems(req.query as any); sendSuccess(res, null, 'Deleted'); } catch (e: any) { sendError(res, e.message); } }
  async createOrderItem(req: Request, res: Response) { try { sendCreated(res, await purchaseService.createOrderItem(req.body)); } catch (e: any) { sendError(res, e.message, 400); } }
}

export const purchaseController = new PurchaseController();
