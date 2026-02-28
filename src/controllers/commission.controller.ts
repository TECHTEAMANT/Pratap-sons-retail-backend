import { Request, Response } from 'express';
import { commissionService } from '../services/commission.service';
import { sendSuccess, sendCreated, sendNotFound, sendError } from '../utils/response';

export class CommissionController {
  async getPayoutCodes(_r: Request, res: Response) { try { sendSuccess(res, await commissionService.getPayoutCodes()); } catch (e: any) { sendError(res, e.message); } }
  async createPayoutCode(req: Request, res: Response) { try { sendCreated(res, await commissionService.createPayoutCode(req.body)); } catch (e: any) { sendError(res, e.message, 400); } }
  async updatePayoutCode(req: Request, res: Response) { try { const r = await commissionService.updatePayoutCode(req.params.id, req.body); r ? sendSuccess(res, r) : sendNotFound(res, 'Payout code'); } catch (e: any) { sendError(res, e.message, 400); } }
  async deletePayoutCode(req: Request, res: Response) { try { const r = await commissionService.deletePayoutCode(req.params.id); r ? sendSuccess(res, r, 'Deleted') : sendNotFound(res, 'Payout code'); } catch (e: any) { sendError(res, e.message); } }
  async getSlabs(_r: Request, res: Response) { try { sendSuccess(res, await commissionService.getSlabs()); } catch (e: any) { sendError(res, e.message); } }
  async createSlab(req: Request, res: Response) { try { sendCreated(res, await commissionService.createSlab(req.body)); } catch (e: any) { sendError(res, e.message, 400); } }
  async updateSlab(req: Request, res: Response) { try { const r = await commissionService.updateSlab(req.params.id, req.body); r ? sendSuccess(res, r) : sendNotFound(res, 'Commission slab'); } catch (e: any) { sendError(res, e.message, 400); } }
  async deleteSlab(req: Request, res: Response) { try { const r = await commissionService.deleteSlab(req.params.id); r ? sendSuccess(res, r, 'Deleted') : sendNotFound(res, 'Commission slab'); } catch (e: any) { sendError(res, e.message); } }
}

export const commissionController = new CommissionController();
