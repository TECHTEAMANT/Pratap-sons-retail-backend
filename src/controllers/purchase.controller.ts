import { Request, Response } from 'express';
import { purchaseService } from '../services/purchase.service';
import { sendSuccess, sendCreated, sendNotFound, sendError, sendPaginated } from '../utils/response';
import { AuthenticatedRequest } from '../middleware/auth';

export class PurchaseController {
  async getOrders(req: AuthenticatedRequest, res: Response) {
    try {
      const filters = req.query as any;
      if (req.user?.role === 'Vendor') {
        filters.vendor_id = req.user.vendorId;
      }
      const result = await purchaseService.getOrders(filters);
      sendPaginated(res, result.data, result.total, result.page, result.limit);
    } catch (e: any) { sendError(res, e.message); }
  }
  async getOrderById(req: AuthenticatedRequest, res: Response) {
    try { 
      const o = await purchaseService.getOrderById(req.params.id); 
      if (o && req.user?.role === 'Vendor' && String(o.vendor_id) !== String(req.user.vendorId)) {
        return sendError(res, 'Access denied', 403);
      }
      o ? sendSuccess(res, o) : sendNotFound(res, 'Purchase order'); 
    } catch (e: any) { sendError(res, e.message); }
  }
  async createOrder(req: AuthenticatedRequest, res: Response) { 
    if (req.user?.role === 'Vendor') return sendError(res, 'Read-only access for vendors', 403);
    try { sendCreated(res, await purchaseService.createOrder(req.body, req.user!.id)); } catch (e: any) { sendError(res, e.message, 400); } 
  }
  async updateOrder(req: AuthenticatedRequest, res: Response) {
    if (req.user?.role === 'Vendor') return sendError(res, 'Read-only access for vendors', 403);
    try { const o = await purchaseService.updateOrder(req.params.id, req.body); o ? sendSuccess(res, o, 'Updated') : sendNotFound(res, 'PO'); } catch (e: any) { sendError(res, e.message, 400); }
  }
  async getInvoices(req: AuthenticatedRequest, res: Response) { 
    try { 
      const filters = req.query as any;
      if (req.user?.role === 'Vendor') {
        filters.vendor_id = req.user.vendorId;
      }
      sendSuccess(res, await purchaseService.getInvoices(filters)); 
    } catch (e: any) { sendError(res, e.message); } 
  }
  async createInvoice(req: AuthenticatedRequest, res: Response) { 
    if (req.user?.role === 'Vendor') return sendError(res, 'Read-only access for vendors', 403);
    try { sendCreated(res, await purchaseService.createInvoice(req.body, req.user!.id)); } catch (e: any) { sendError(res, e.message, 400); } 
  }
  async getOrderItems(req: AuthenticatedRequest, res: Response) { 
    try { 
      const filters = req.query as any;
      if (req.user?.role === 'Vendor') {
        filters.vendor_id = req.user.vendorId;
      }
      sendSuccess(res, await purchaseService.getOrderItems(filters)); 
    } catch (e: any) { sendError(res, e.message); } 
  }
  async getPurchaseItems(req: AuthenticatedRequest, res: Response) { 
    try { 
      const filters = req.query as any;
      if (req.user?.role === 'Vendor') {
        filters.vendor_id = req.user.vendorId;
      }
      sendSuccess(res, await purchaseService.getPurchaseItems(filters)); 
    } catch (e: any) { sendError(res, e.message); } 
  }
  async createPurchaseItem(req: AuthenticatedRequest, res: Response) { 
    if (req.user?.role === 'Vendor') return sendError(res, 'Read-only access for vendors', 403);
    try { sendCreated(res, await purchaseService.createPurchaseItem(req.body)); } catch (e: any) { sendError(res, e.message, 400); } 
  }
  async deletePurchaseItems(req: AuthenticatedRequest, res: Response) { 
    if (req.user?.role === 'Vendor') return sendError(res, 'Read-only access for vendors', 403);
    try { await purchaseService.deletePurchaseItems(req.query as any); sendSuccess(res, null, 'Deleted'); } catch (e: any) { sendError(res, e.message); } 
  }
  async deleteOrderItems(req: AuthenticatedRequest, res: Response) { 
    if (req.user?.role === 'Vendor') return sendError(res, 'Read-only access for vendors', 403);
    try { await purchaseService.deleteOrderItems(req.query as any); sendSuccess(res, null, 'Deleted'); } catch (e: any) { sendError(res, e.message); } 
  }
  async createOrderItem(req: AuthenticatedRequest, res: Response) { 
    if (req.user?.role === 'Vendor') return sendError(res, 'Read-only access for vendors', 403);
    try { sendCreated(res, await purchaseService.createOrderItem(req.body)); } catch (e: any) { sendError(res, e.message, 400); } 
  }
  async getRemainingOrderItems(req: AuthenticatedRequest, res: Response) {
    try {
      if (req.user?.role === 'Vendor') {
        const order = await purchaseService.getOrderById(req.params.id);
        if (order && String(order.vendor_id) !== String(req.user.vendorId)) {
          return sendError(res, 'Access denied', 403);
        }
      }
      const items = await purchaseService.getRemainingOrderItems(req.params.id);
      sendSuccess(res, items);
    } catch (e: any) { sendError(res, e.message); }
  }

  async bulkSaveInvoice(req: AuthenticatedRequest, res: Response) {
    if (req.user?.role === 'Vendor') return sendError(res, 'Read-only access for vendors', 403);
    try {
      const result = await purchaseService.bulkSaveInvoice(req.body, req.user!.id);
      sendCreated(res, result);
    } catch (e: any) { sendError(res, e.message, 400); }
  }

  async bulkUpdateInvoice(req: AuthenticatedRequest, res: Response) {
    if (req.user?.role === 'Vendor') return sendError(res, 'Read-only access for vendors', 403);
    try {
      const result = await purchaseService.bulkUpdateInvoice(req.params.id, req.body, req.user!.id);
      sendSuccess(res, result, 'Invoice updated successfully');
    } catch (e: any) { sendError(res, e.message, 400); }
  }

  async bulkGetItems(req: AuthenticatedRequest, res: Response) {
    try {
      if (req.user?.role === 'Vendor') {
        const order = await purchaseService.getOrderById(req.params.id);
        if (!order) return sendSuccess(res, []);
        
        const orderVendorId = String(order.vendor_id || (order.vendor as any)?.id || '');
        const userVendorId = String(req.user.vendorId || '');
        
        if (orderVendorId !== userVendorId) {
          return sendError(res, 'Access denied', 403);
        }
      }
      sendSuccess(res, await purchaseService.getItemsByOrderId(req.params.id));
    } catch (e: any) { sendError(res, e.message); }
  }

  async deleteInvoice(req: AuthenticatedRequest, res: Response) {
    if (req.user?.role === 'Vendor') return sendError(res, 'Read-only access for vendors', 403);
    try {
      await purchaseService.deleteInvoice(req.params.id);
      sendSuccess(res, null, 'Invoice deleted');
    } catch (e: any) { sendError(res, e.message); }
  }

  async deleteOrder(req: AuthenticatedRequest, res: Response) {
    if (req.user?.role === 'Vendor') return sendError(res, 'Read-only access for vendors', 403);
    try {
      await purchaseService.deleteOrder(req.params.id);
      sendSuccess(res, null, 'Order deleted');
    } catch (e: any) { sendError(res, e.message); }
  }
}

export const purchaseController = new PurchaseController();

