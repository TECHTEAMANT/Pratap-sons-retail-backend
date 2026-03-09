import { Request, Response } from 'express';
import { tallyService } from '../services/tally.service';
import { sendSuccess, sendCreated, sendNotFound, sendError } from '../utils/response';

export class TallyController {
  async getPending(_r: Request, res: Response) { try { sendSuccess(res, await tallyService.getPending()); } catch (e: any) { sendError(res, e.message); } }
  async findAll(req: Request, res: Response) { try { sendSuccess(res, await tallyService.findAll(req.query as any)); } catch (e: any) { sendError(res, e.message); } }
  async create(req: Request, res: Response) { 
    try { 
      if (Array.isArray(req.body)) {
        sendCreated(res, await tallyService.createBulk(req.body));
      } else {
        sendCreated(res, await tallyService.create(req.body));
      }
    } catch (e: any) { 
      sendError(res, e.message, 400); 
    } 
  }
  async updateStatus(req: Request, res: Response) {
    try { const r = await tallyService.updateStatus(req.params.id, req.body.status, req.body.error_message); r ? sendSuccess(res, r) : sendNotFound(res, 'Tally sync'); } catch (e: any) { sendError(res, e.message, 400); }
  }
  async getExportData(req: Request, res: Response) { try { sendSuccess(res, await tallyService.getExportData(req.query as any)); } catch (e: any) { sendError(res, e.message); } }
}

export const tallyController = new TallyController();
