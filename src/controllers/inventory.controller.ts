import { Request, Response } from 'express';
import { inventoryService } from '../services/inventory.service';
import { sendSuccess, sendCreated, sendNotFound, sendError, sendPaginated } from '../utils/response';
import { AuthenticatedRequest } from '../middleware/auth';

export class InventoryController {
  async findAll(req: AuthenticatedRequest, res: Response) {
    try {
      const result = await inventoryService.findAll(req.query as any);
      const canViewCost = req.user?.permissions.can_view_cost;
      
      if (!canViewCost) {
        result.data = result.data.map((item: any) => this.redactCost(item));
      }
      
      sendPaginated(res, result.data, result.total, result.page, result.limit);
    } catch (e: any) { sendError(res, e.message); }
  }
  async getGrouped(req: AuthenticatedRequest, res: Response) {
    try {
      const result = await inventoryService.getGrouped(req.query as any);
      const canViewCost = req.user?.permissions.can_view_cost;

      if (!canViewCost) {
        result.data = result.data.map((group: any) => {
          const redactedGroup = { ...group };
          delete redactedGroup.cost;
          if (redactedGroup.sizes) {
            redactedGroup.sizes = redactedGroup.sizes.map((sz: any) => {
              const redactedSize = { ...sz };
              delete redactedSize.cost;
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
        const canViewCost = req.user?.permissions.can_view_cost;
        const result = !canViewCost ? this.redactCost(item) : item;
        sendSuccess(res, result);
      } else {
        sendNotFound(res, 'Barcode batch');
      }
    } catch (e: any) { sendError(res, e.message); }
  }
  async search(req: AuthenticatedRequest, res: Response) {
    try { 
      const results = await inventoryService.searchByBarcode(req.query.barcode as string);
      const canViewCost = req.user?.permissions.can_view_cost;
      const finalResults = !canViewCost ? results.map((item: any) => this.redactCost(item)) : results;
      sendSuccess(res, finalResults); 
    } catch (e: any) { sendError(res, e.message); }
  }
  async create(req: AuthenticatedRequest, res: Response) {
    try { sendCreated(res, await inventoryService.create(req.body, req.user!.id)); } catch (e: any) { sendError(res, e.message, 400); }
  }
  async update(req: AuthenticatedRequest, res: Response) {
    try {
      const item = await inventoryService.update(req.params.id, req.body, req.user!.id);
      item ? sendSuccess(res, item, 'Updated') : sendNotFound(res, 'Barcode batch');
    } catch (e: any) { sendError(res, e.message, 400); }
  }
  async adjustQuantity(req: AuthenticatedRequest, res: Response) {
    try {
      const item = await inventoryService.adjustQuantity(req.params.id, req.body.adjustment, req.user!.id);
      item ? sendSuccess(res, item, 'Stock adjusted') : sendNotFound(res, 'Barcode batch');
    } catch (e: any) { sendError(res, e.message, 400); }
  }
  async moveToFloor(req: AuthenticatedRequest, res: Response) {
    try {
      const item = await inventoryService.moveToFloor(req.params.id, req.body.floor_id, req.user!.id);
      item ? sendSuccess(res, item, 'Moved to floor') : sendNotFound(res, 'Barcode batch');
    } catch (e: any) { sendError(res, e.message, 400); }
  }

  private redactCost(item: any) {
    const redacted = { ...item };
    delete redacted.cost_actual;
    delete redacted.cost_encoded;
    return redacted;
  }
}

export const inventoryController = new InventoryController();
