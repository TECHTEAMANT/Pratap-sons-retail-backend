import { Request, Response } from 'express';
import { salesmanService } from '../services/salesman.service';
import { sendSuccess, sendCreated, sendNotFound, sendError, sendPaginated } from '../utils/response';

export class SalesmanController {
  async findAll(req: Request, res: Response) {
    try {
      const result = await salesmanService.findAll(req.query as any);
      sendPaginated(res, result.data, result.total, result.page, result.limit);
    } catch (e: any) { 
        sendError(res, e.message); 
    }
  }

  async findById(req: Request, res: Response) {
    try {
      const salesman = await salesmanService.findById(req.params.id);
      salesman ? sendSuccess(res, salesman) : sendNotFound(res, 'Salesman');
    } catch (e: any) { 
        sendError(res, e.message); 
    }
  }

  async create(req: Request, res: Response) {
    try { 
        sendCreated(res, await salesmanService.create(req.body)); 
    } catch (e: any) { 
        sendError(res, e.message, 400); 
    }
  }

  async update(req: Request, res: Response) {
    try {
      const salesman = await salesmanService.update(req.params.id, req.body);
      salesman ? sendSuccess(res, salesman, 'Updated') : sendNotFound(res, 'Salesman');
    } catch (e: any) { 
        sendError(res, e.message, 400); 
    }
  }

  async getNextCode(req: Request, res: Response) {
    try {
      const code = await salesmanService.getNextCode();
      sendSuccess(res, { code });
    } catch (e: any) { 
        sendError(res, e.message); 
    }
  }
}

export const salesmanController = new SalesmanController();
