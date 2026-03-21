import { Request, Response } from 'express';
import { reportService } from '../services/report.service';
import { sendSuccess, sendError } from '../utils/response';

export class ReportController {
  async salesReport(req: Request, res: Response) { try { sendSuccess(res, await reportService.salesReport(req.query as any)); } catch (e: any) { sendError(res, e.message); } }
  async inventoryReport(req: Request, res: Response) { try { sendSuccess(res, await reportService.inventoryReport(req.query as any)); } catch (e: any) { sendError(res, e.message); } }
  async gstReport(req: Request, res: Response) { try { const { startDate, endDate } = req.query as any; sendSuccess(res, await reportService.gstReport(startDate, endDate)); } catch (e: any) { sendError(res, e.message); } }
  async salesmanReport(req: Request, res: Response) { try { sendSuccess(res, await reportService.salesmanReport(req.query as any)); } catch (e: any) { sendError(res, e.message); } }
  async customerReport(_r: Request, res: Response) { try { sendSuccess(res, await reportService.customerReport()); } catch (e: any) { sendError(res, e.message); } }
  async purchaseReport(req: Request, res: Response) { try { sendSuccess(res, await reportService.purchaseReport(req.query as any)); } catch (e: any) { sendError(res, e.message); } }
  async profitabilityReport(req: Request, res: Response) { try { sendSuccess(res, await reportService.profitabilityReport(req.query as any)); } catch (e: any) { sendError(res, e.message); } }
  async topSellingReport(req: Request, res: Response) { try { sendSuccess(res, await reportService.topSellingReport(req.query as any)); } catch (e: any) { sendError(res, e.message); } }
  async slowMovingReport(req: Request, res: Response) { try { const { days } = req.query as any; sendSuccess(res, await reportService.slowMovingReport(days ? parseInt(days) : undefined)); } catch (e: any) { sendError(res, e.message); } }
  async floorwiseReport(req: Request, res: Response) { try { sendSuccess(res, await reportService.floorwiseSalesReport(req.query as any)); } catch (e: any) { sendError(res, e.message); } }
}

export const reportController = new ReportController();
