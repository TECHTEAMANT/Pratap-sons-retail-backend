import { Response } from 'express';
import { reportService } from '../services/report.service';
import { sendSuccess, sendError } from '../utils/response';
import { AuthenticatedRequest } from '../middleware/auth';

export class ReportController {
  async salesReport(req: AuthenticatedRequest, res: Response) { 
    if (req.user?.role === 'Vendor') return sendError(res, 'Access denied', 403);
    try { sendSuccess(res, await reportService.salesReport(req.query as any)); } catch (e: any) { sendError(res, e.message); } 
  }
  async inventoryReport(req: AuthenticatedRequest, res: Response) { 
    try { 
      const filters = req.query as any;
      if (req.user?.role === 'Vendor') filters.vendorId = req.user.vendorId || undefined;
      sendSuccess(res, await reportService.inventoryReport(filters)); 
    } catch (e: any) { sendError(res, e.message); } 
  }
  async gstReport(req: AuthenticatedRequest, res: Response) { 
    if (req.user?.role === 'Vendor') return sendError(res, 'Access denied', 403);
    try { const { startDate, endDate } = req.query as any; sendSuccess(res, await reportService.gstReport(startDate, endDate)); } catch (e: any) { sendError(res, e.message); } 
  }
  async salesmanReport(req: AuthenticatedRequest, res: Response) { 
    if (req.user?.role === 'Vendor') return sendError(res, 'Access denied', 403);
    try { sendSuccess(res, await reportService.salesmanReport(req.query as any)); } catch (e: any) { sendError(res, e.message); } 
  }
  async customerReport(req: AuthenticatedRequest, res: Response) { 
    if (req.user?.role === 'Vendor') return sendError(res, 'Access denied', 403);
    try { sendSuccess(res, await reportService.customerReport()); } catch (e: any) { sendError(res, e.message); } 
  }
  async purchaseReport(req: AuthenticatedRequest, res: Response) { 
    if (req.user?.role === 'Vendor') return sendError(res, 'Access denied', 403);
    try { sendSuccess(res, await reportService.purchaseReport(req.query as any)); } catch (e: any) { sendError(res, e.message); } 
  }
  async profitabilityReport(req: AuthenticatedRequest, res: Response) { 
    try { 
      const filters = req.query as any;
      if (req.user?.role === 'Vendor') filters.vendorId = req.user.vendorId || undefined;
      sendSuccess(res, await reportService.profitabilityReport(filters)); 
    } catch (e: any) { sendError(res, e.message); } 
  }
  async purchaseAnalysisReport(req: AuthenticatedRequest, res: Response) { 
    try { 
      const filters = req.query as any;
      if (req.user?.role === 'Vendor') filters.vendorId = req.user.vendorId || undefined;
      sendSuccess(res, await reportService.purchaseAnalysisReport(filters)); 
    } catch (e: any) { sendError(res, e.message); } 
  }
  async vendorProfitability(req: AuthenticatedRequest, res: Response) { 
    try { 
      const filters = req.query as any;
      if (req.user?.role === 'Vendor') filters.vendorId = req.user.vendorId || undefined;
      sendSuccess(res, await reportService.vendorProfitabilityReport(filters)); 
    } catch (e: any) { sendError(res, e.message); } 
  }
  async topSellingReport(req: AuthenticatedRequest, res: Response) { 
    try { 
      const filters = req.query as any;
      if (req.user?.role === 'Vendor') filters.vendorId = req.user.vendorId || undefined;
      sendSuccess(res, await reportService.topSellingReport(filters)); 
    } catch (e: any) { sendError(res, e.message); } 
  }
  async slowMovingReport(req: AuthenticatedRequest, res: Response) { 
    try { 
      const { days } = req.query as any; 
      const vendorId = req.user?.role === 'Vendor' ? (req.user.vendorId || undefined) : undefined;
      sendSuccess(res, await reportService.slowMovingReport(days ? parseInt(days) : undefined, vendorId)); 
    } catch (e: any) { sendError(res, e.message); } 
  }
  async floorwiseReport(req: AuthenticatedRequest, res: Response) { 
    if (req.user?.role === 'Vendor') return sendError(res, 'Access denied', 403);
    try { sendSuccess(res, await reportService.floorwiseSalesReport(req.query as any)); } catch (e: any) { sendError(res, e.message); } 
  }
  async salesReturnReport(req: AuthenticatedRequest, res: Response) { 
    try { 
      const filters = req.query as any;
      if (req.user?.role === 'Vendor') filters.vendorId = req.user.vendorId || undefined;
      sendSuccess(res, await reportService.salesReturnReport(filters)); 
    } catch (e: any) { sendError(res, e.message); } 
  }
  async cashReport(req: AuthenticatedRequest, res: Response) { 
    if (req.user?.role === 'Vendor') return sendError(res, 'Access denied', 403);
    try { sendSuccess(res, await reportService.cashReport(req.query as any)); } catch (e: any) { sendError(res, e.message); } 
  }
  async vendorAnalysisReport(req: AuthenticatedRequest, res: Response) {
    try {
      const filters = req.query as any;
      if (req.user?.role === 'Vendor') filters.vendorId = req.user.vendorId;
      
      const data = await reportService.vendorAnalysisReport(filters);
      
      // Permission Redaction
      if (req.user?.role === 'Vendor' && !req.user.permissions.can_view_cost) {
        const redacted = data.map((item: any) => ({
          ...item,
          unit_cost: 0,
          total_cost: 0
        }));
        return sendSuccess(res, redacted);
      }

      sendSuccess(res, data);
    } catch (e: any) { sendError(res, e.message); }
  }
  async designAnalysisReport(req: AuthenticatedRequest, res: Response) { 
    try { 
      const filters = req.query as any;
      if (req.user?.role === 'Vendor') {
        filters.vendorId = req.user.vendorId;
      }
      sendSuccess(res, await reportService.designAnalysisReport(filters)); 
    } catch (e: any) { sendError(res, e.message); } 
  }
  async advanceAnalysis(req: AuthenticatedRequest, res: Response) { 
    if (req.user?.role === 'Vendor') return sendError(res, 'Access denied', 403);
    try { sendSuccess(res, await reportService.advanceAnalysis(req.query as any)); } catch (e: any) { sendError(res, e.message); } 
  }
  async approvalReport(req: AuthenticatedRequest, res: Response) { 
    if (req.user?.role === 'Vendor') return sendError(res, 'Access denied', 403);
    try { sendSuccess(res, await reportService.approvalReport(req.query as any)); } catch (e: any) { sendError(res, e.message); } 
  }
  async walletLedgerReport(req: AuthenticatedRequest, res: Response) {
    if (req.user?.role === 'Vendor') return sendError(res, 'Access denied', 403);
    try { sendSuccess(res, await reportService.walletLedgerReport(req.query as any)); } catch (e: any) { sendError(res, e.message); }
  }
  async pendingPayments(req: AuthenticatedRequest, res: Response) {
    if (req.user?.role === 'Vendor') return sendError(res, 'Access denied', 403);
    try { sendSuccess(res, await reportService.pendingPaymentsReport()); } catch (e: any) { sendError(res, e.message); }
  }
}

export const reportController = new ReportController();
