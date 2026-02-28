import { Request, Response } from 'express';
import { bookingService } from '../services/booking.service';
import { sendSuccess, sendCreated, sendError } from '../utils/response';
import { AuthenticatedRequest } from '../middleware/auth';

export class BookingController {
  async findAll(req: Request, res: Response) { try { sendSuccess(res, await bookingService.findAll(req.query as any)); } catch (e: any) { sendError(res, e.message); } }
  async create(req: AuthenticatedRequest, res: Response) { try { sendCreated(res, await bookingService.create(req.body, req.user!.id)); } catch (e: any) { sendError(res, e.message, 400); } }
  async update(req: Request, res: Response) { try { sendSuccess(res, await bookingService.update(req.params.id as string, req.body)); } catch (e: any) { sendError(res, e.message, 400); } }
  async cancel(req: Request, res: Response) { try { sendSuccess(res, await bookingService.cancel(req.params.id), 'Cancelled'); } catch (e: any) { sendError(res, e.message); } }
}

export const bookingController = new BookingController();
