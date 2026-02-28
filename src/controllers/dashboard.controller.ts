import { Request, Response } from 'express';
import { dashboardService } from '../services/dashboard.service';
import { sendSuccess, sendError } from '../utils/response';

export class DashboardController {
  async getStats(_req: Request, res: Response) {
    try {
      const stats = await dashboardService.getStats();
      sendSuccess(res, stats);
    } catch (error: any) {
      sendError(res, error.message);
    }
  }
}

export const dashboardController = new DashboardController();
