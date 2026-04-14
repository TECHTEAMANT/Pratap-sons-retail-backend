import { Request, Response } from 'express';
import { purchaseReturnService } from '../services/purchaseReturn.service';
import { sendSuccess, sendCreated, sendNotFound, sendError } from '../utils/response';
import { AuthenticatedRequest } from '../middleware/auth';

export class PurchaseReturnController {
  async findAll(req: AuthenticatedRequest, res: Response) { 
    try { 
      const filters = req.query as any;
      if (req.user?.role === 'Vendor') {
        filters.vendor_id = req.user.vendorId;
      }
      sendSuccess(res, await purchaseReturnService.findAll(filters)); 
    } catch (e: any) { sendError(res, e.message); } 
  }
  async findAllItems(req: AuthenticatedRequest, res: Response) { 
    try { 
      const filters = req.query as any;
      if (req.user?.role === 'Vendor') {
        filters.vendor_id = req.user.vendorId;
      }
      sendSuccess(res, await purchaseReturnService.findAllItems(filters)); 
    } catch (e: any) { sendError(res, e.message); } 
  }
  async findById(req: AuthenticatedRequest, res: Response) { 
    try { 
      const r = await purchaseReturnService.findById(req.params.id); 
      if (r && req.user?.role === 'Vendor' && r.vendor_id !== req.user.vendorId) {
        return sendError(res, 'Access denied', 403);
      }
      r ? sendSuccess(res, r) : sendNotFound(res, 'Purchase return'); 
    } catch (e: any) { sendError(res, e.message); } 
  }
  async create(req: AuthenticatedRequest, res: Response) { 
    if (req.user?.role === 'Vendor') return sendError(res, 'Read-only access for vendors', 403);
    try { sendCreated(res, await purchaseReturnService.create(req.body, req.user!.id)); } catch (e: any) { sendError(res, e.message, 400); } 
  }
  async createItem(req: AuthenticatedRequest, res: Response) { 
    if (req.user?.role === 'Vendor') return sendError(res, 'Read-only access for vendors', 403);
    try { sendCreated(res, await purchaseReturnService.createItem(req.body)); } catch (e: any) { sendError(res, e.message, 400); } 
  }
  async update(req: AuthenticatedRequest, res: Response) {
    if (req.user?.role === 'Vendor') return sendError(res, 'Read-only access for vendors', 403);
    try { const r = await purchaseReturnService.update(req.params.id, req.body); r ? sendSuccess(res, r, 'Updated') : sendNotFound(res, 'Purchase return'); } catch (e: any) { sendError(res, e.message, 400); }
  }
  async bulkCreate(req: AuthenticatedRequest, res: Response) {
    if (req.user?.role === 'Vendor') return sendError(res, 'Read-only access for vendors', 403);
    try {
      const result = await purchaseReturnService.bulkCreateReturn(req.body, req.user!.id);
      sendCreated(res, result, 'Purchase return created successfully');
    } catch (e: any) { sendError(res, e.message, 400); }
  }

  async bulkUpdate(req: AuthenticatedRequest, res: Response) {
    if (req.user?.role === 'Vendor') return sendError(res, 'Read-only access for vendors', 403);
    try {
      const result = await purchaseReturnService.bulkUpdateReturn(req.params.id, req.body, req.user!.id);
      sendSuccess(res, result, 'Purchase return updated successfully');
    } catch (e: any) { sendError(res, e.message, 400); }
  }

  async delete(req: AuthenticatedRequest, res: Response) {
    if (req.user?.role === 'Vendor') return sendError(res, 'Read-only access for vendors', 403);
    try {
      await purchaseReturnService.delete(req.params.id);
      sendSuccess(res, null, 'Deleted');
    } catch (e: any) { sendError(res, e.message); }
  }

  async deleteItems(req: AuthenticatedRequest, res: Response) {
    if (req.user?.role === 'Vendor') return sendError(res, 'Read-only access for vendors', 403);
    try {
      await purchaseReturnService.deleteItems(req.query as any);
      sendSuccess(res, null, 'Items deleted');
    } catch (e: any) { sendError(res, e.message); }
  }
}

export const purchaseReturnController = new PurchaseReturnController();
