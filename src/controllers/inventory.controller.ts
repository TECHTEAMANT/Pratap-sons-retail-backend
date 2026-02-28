import { Request, Response } from 'express';
import { inventoryService } from '../services/inventory.service';
import { sendSuccess, sendCreated, sendNotFound, sendError, sendPaginated } from '../utils/response';
import { AuthenticatedRequest } from '../middleware/auth';

export class InventoryController {
  async findAll(req: Request, res: Response) {
    try {
      const result = await inventoryService.findAll(req.query as any);
      sendPaginated(res, result.data, result.total, result.page, result.limit);
    } catch (e: any) { sendError(res, e.message); }
  }
  async getGrouped(req: Request, res: Response) {
    try {
      const result = await inventoryService.getGrouped(req.query as any);
      sendPaginated(res, result.data, result.total, result.page, result.limit);
    } catch (e: any) { sendError(res, e.message); }
  }
  async findById(req: Request, res: Response) {
    try {
      const item = await inventoryService.findById(req.params.id);
      item ? sendSuccess(res, item) : sendNotFound(res, 'Barcode batch');
    } catch (e: any) { sendError(res, e.message); }
  }
  async search(req: Request, res: Response) {
    try { sendSuccess(res, await inventoryService.searchByBarcode(req.query.barcode as string)); } catch (e: any) { sendError(res, e.message); }
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
}

export const inventoryController = new InventoryController();
