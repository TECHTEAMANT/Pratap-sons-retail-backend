import { Request, Response } from 'express';
import { inventoryService } from '../services/inventory.service';
import { sendSuccess, sendCreated, sendNotFound, sendError, sendPaginated } from '../utils/response';
import { AuthenticatedRequest } from '../middleware/auth';

export class InventoryController {
  async findAll(req: AuthenticatedRequest, res: Response) {
    try {
      const filters = req.query as any;
      if (req.user?.role === 'Vendor') {
        filters.vendor_id = req.user.vendorId || undefined;
      }
      const result = await inventoryService.findAll(filters);
      const canViewCost = req.user?.permissions.can_view_cost;
      const canViewMrp = req.user?.permissions.can_view_mrp;
      
      if (!canViewCost || !canViewMrp) {
        result.data = result.data.map((item: any) => this.redactSensitiveData(item, canViewCost || false, canViewMrp || false));
      }
      
      sendPaginated(res, result.data, result.total, result.page, result.limit);
    } catch (e: any) { sendError(res, e.message); }
  }
  async getGrouped(req: AuthenticatedRequest, res: Response) {
    try {
      const filters = req.query as any;
      if (req.user?.role === 'Vendor') {
        filters.vendor_id = req.user.vendorId || undefined;
      }
      const result = await inventoryService.getGrouped(filters);
      const canViewCost = req.user?.permissions.can_view_cost;
      const canViewMrp = req.user?.permissions.can_view_mrp;

      if (!canViewCost || !canViewMrp) {
        result.data = result.data.map((group: any) => {
          const redactedGroup = { ...group };
          if (!canViewCost) {
            delete redactedGroup.cost;
            delete redactedGroup.cost_actual;
          }
          if (!canViewMrp) {
            delete redactedGroup.mrp;
            delete redactedGroup.mrp_markup_percent;
          }
          if (redactedGroup.sizes) {
            redactedGroup.sizes = redactedGroup.sizes.map((sz: any) => {
              const redactedSize = { ...sz };
              if (!canViewCost) {
                delete redactedSize.cost;
                delete redactedSize.cost_actual;
              }
              if (!canViewMrp) {
                delete redactedSize.mrp;
                delete redactedSize.mrp_markup_percent;
              }
              return redactedSize;
            });
          }
          return redactedGroup;
        });
      }

      sendPaginated(res, result.data, result.total, result.page, result.limit);
    } catch (e: any) { sendError(res, e.message); }
  }
  async findById(req: AuthenticatedRequest, res: Response) {
    try {
      const item = await inventoryService.findById(req.params.id);
      if (item) {
        if (req.user?.role === 'Vendor' && item.vendor_id !== req.user.vendorId) {
          return sendError(res, 'Access denied', 403);
        }
        const canViewCost = req.user?.permissions.can_view_cost || false;
        const canViewMrp = req.user?.permissions.can_view_mrp || false;
        const result = (!canViewCost || !canViewMrp) ? this.redactSensitiveData(item, canViewCost, canViewMrp) : item;
        sendSuccess(res, result);
      } else {
        sendNotFound(res, 'Barcode batch');
      }
    } catch (e: any) { sendError(res, e.message); }
  }
  async search(req: AuthenticatedRequest, res: Response) {
    try { 
      const vId = req.user?.role === 'Vendor' ? (req.user.vendorId || undefined) : undefined;
      const results = await inventoryService.searchByBarcode(req.query.barcode as string, vId);
      
      const canViewCost = req.user?.permissions.can_view_cost || false;
      const canViewMrp = req.user?.permissions.can_view_mrp || false;

      let finalResults = results;

      if (!canViewCost || !canViewMrp) {
        finalResults = finalResults.map((item: any) => this.redactSensitiveData(item, canViewCost, canViewMrp));
      }

      sendSuccess(res, finalResults); 
    } catch (e: any) { sendError(res, e.message); }
  }
  async create(req: AuthenticatedRequest, res: Response) {
    if (req.user?.role === 'Vendor') return sendError(res, 'Read-only access for vendors', 403);
    try { sendCreated(res, await inventoryService.create(req.body, req.user!.id)); } catch (e: any) { sendError(res, e.message, 400); }
  }
  async update(req: AuthenticatedRequest, res: Response) {
    if (req.user?.role === 'Vendor') return sendError(res, 'Read-only access for vendors', 403);
    try {
      const item = await inventoryService.update(req.params.id, req.body, req.user!.id);
      item ? sendSuccess(res, item, 'Updated') : sendNotFound(res, 'Barcode batch');
    } catch (e: any) { sendError(res, e.message, 400); }
  }
  async updateByFilter(req: AuthenticatedRequest, res: Response) {
    if (req.user?.role === 'Vendor') return sendError(res, 'Read-only access for vendors', 403);
    try {
      const result = await inventoryService.updateByFilter(req.query, req.body, req.user!.id);
      sendSuccess(res, result, 'Bulk update completed');
    } catch (e: any) { sendError(res, e.message, 400); }
  }
  async adjustQuantity(req: AuthenticatedRequest, res: Response) {
    if (req.user?.role === 'Vendor') return sendError(res, 'Read-only access for vendors', 403);
    try {
      const item = await inventoryService.adjustQuantity(req.params.id, req.body.adjustment, req.user!.id);
      item ? sendSuccess(res, item, 'Stock adjusted') : sendNotFound(res, 'Barcode batch');
    } catch (e: any) { sendError(res, e.message, 400); }
  }
  async moveToFloor(req: AuthenticatedRequest, res: Response) {
    if (req.user?.role === 'Vendor') return sendError(res, 'Read-only access for vendors', 403);
    try {
      const item = await inventoryService.moveToFloor(req.params.id, req.body.floor_id, req.user!.id);
      item ? sendSuccess(res, item, 'Moved to floor') : sendNotFound(res, 'Barcode batch');
    } catch (e: any) { sendError(res, e.message, 400); }
  }

  private redactSensitiveData(item: any, canViewCost: boolean, canViewMrp: boolean) {
    const redacted = { ...item };
    if (!canViewCost) {
      delete redacted.cost_actual;
      delete redacted.cost_encoded;
      delete redacted.cost;
    }
    if (!canViewMrp) {
      delete redacted.mrp;
      delete redacted.mrp_markup_percent;
    }
    return redacted;
  }
}

export const inventoryController = new InventoryController();
