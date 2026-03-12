import { Request, Response } from 'express';
import { customerService } from '../services/customer.service';
import { sendSuccess, sendCreated, sendNotFound, sendError, sendPaginated } from '../utils/response';

export class CustomerController {
  async findAll(req: Request, res: Response) {
    try {
      const result = await customerService.findAll(req.query as any);
      sendPaginated(res, result.data, result.total, result.page, result.limit);
    } catch (e: any) { sendError(res, e.message); }
  }
  async findByMobile(req: Request, res: Response) {
    try {
      const cust = await customerService.findByMobile(req.params.mobile);
      cust ? sendSuccess(res, cust) : sendNotFound(res, 'Customer');
    } catch (e: any) { sendError(res, e.message); }
  }
  async findByCard(req: Request, res: Response) {
    try {
      const cust = await customerService.findByCard(req.params.card_no);
      cust ? sendSuccess(res, cust) : sendNotFound(res, 'Customer not found');
    } catch (e: any) { sendError(res, e.message); }
  }
  async create(req: Request, res: Response) {
    try { sendCreated(res, await customerService.create(req.body)); } catch (e: any) { sendError(res, e.message, 400); }
  }
  async update(req: Request, res: Response) {
    try {
      const cust = await customerService.update(req.params.id, req.body);
      cust ? sendSuccess(res, cust, 'Updated') : sendNotFound(res, 'Customer');
    } catch (e: any) { sendError(res, e.message, 400); }
  }
  async getPurchaseHistory(req: Request, res: Response) {
    try { sendSuccess(res, await customerService.getPurchaseHistory(req.params.mobile)); } catch (e: any) { sendError(res, e.message); }
  }
  async getCreditBalance(req: Request, res: Response) {
    try { sendSuccess(res, await customerService.getCreditBalance(req.params.mobile)); } catch (e: any) { sendError(res, e.message); }
  }
}

export const customerController = new CustomerController();
