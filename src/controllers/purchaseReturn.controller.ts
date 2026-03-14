import { Request, Response } from 'express';
import { purchaseReturnService } from '../services/purchaseReturn.service';
import { sendSuccess, sendCreated, sendNotFound, sendError } from '../utils/response';
import { AuthenticatedRequest } from '../middleware/auth';

export class PurchaseReturnController {
  async findAll(req: Request, res: Response) { try { sendSuccess(res, await purchaseReturnService.findAll(req.query as any)); } catch (e: any) { sendError(res, e.message); } }
  async findAllItems(req: Request, res: Response) { try { sendSuccess(res, await purchaseReturnService.findAllItems(req.query as any)); } catch (e: any) { sendError(res, e.message); } }
  async findById(req: Request, res: Response) { try { const r = await purchaseReturnService.findById(req.params.id); r ? sendSuccess(res, r) : sendNotFound(res, 'Purchase return'); } catch (e: any) { sendError(res, e.message); } }
  async create(req: AuthenticatedRequest, res: Response) { try { sendCreated(res, await purchaseReturnService.create(req.body, req.user!.id)); } catch (e: any) { sendError(res, e.message, 400); } }
  async createItem(req: Request, res: Response) { try { sendCreated(res, await purchaseReturnService.createItem(req.body)); } catch (e: any) { sendError(res, e.message, 400); } }
  async update(req: Request, res: Response) {
    try { const r = await purchaseReturnService.update(req.params.id, req.body); r ? sendSuccess(res, r, 'Updated') : sendNotFound(res, 'Purchase return'); } catch (e: any) { sendError(res, e.message, 400); }
  }

  async delete(req: Request, res: Response) {
    try {
      await purchaseReturnService.delete(req.params.id);
      sendSuccess(res, null, 'Deleted');
    } catch (e: any) { sendError(res, e.message); }
  }

  async deleteItems(req: Request, res: Response) {
    try {
      await purchaseReturnService.deleteItems(req.query as any);
      sendSuccess(res, null, 'Items deleted');
    } catch (e: any) { sendError(res, e.message); }
  }
}

export const purchaseReturnController = new PurchaseReturnController();
