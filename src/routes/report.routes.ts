import { Router } from 'express';
import { reportController } from '../controllers/report.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission, requirePermissionOrVendor } from '../middleware/permission';

const router = Router();
router.use(authenticate);

// Specific exception for Vendor analysis
router.get('/vendor-analysis', requirePermissionOrVendor('can_view_reports'), (req, res) => reportController.vendorAnalysisReport(req, res));
router.get('/design-analysis', requirePermissionOrVendor('can_view_reports'), (req, res) => reportController.designAnalysisReport(req, res));

// All other reports strictly require permission
router.use(requirePermission('can_view_reports'));

router.get('/sales', (req, res) => reportController.salesReport(req, res));
router.get('/sales-analysis', (req, res) => reportController.salesAnalysisReport(req, res));
router.get('/inventory', (req, res) => reportController.inventoryReport(req, res));
router.get('/inventory/photo/:barcode', (req, res) => reportController.getInventoryPhoto(req, res));
router.get('/gst', (req, res) => reportController.gstReport(req, res));
router.get('/salesman', (req, res) => reportController.salesmanReport(req, res));
router.get('/customers', (req, res) => reportController.customerReport(req, res));
router.get('/purchases', (req, res) => reportController.purchaseReport(req, res));
router.get('/profitability', (req, res) => reportController.profitabilityReport(req, res));
router.get('/purchase-analysis', (req, res) => reportController.purchaseAnalysisReport(req, res));
router.get('/vendor-profitability', (req, res) => reportController.vendorProfitability(req, res));
router.get('/top-selling', (req, res) => reportController.topSellingReport(req, res));
router.get('/slow-moving', (req, res) => reportController.slowMovingReport(req, res));
router.get('/floorwise-sales', (req, res) => reportController.floorwiseReport(req, res));
router.get('/sales-returns', (req, res) => reportController.salesReturnReport(req, res));
router.get('/cash', (req, res) => reportController.cashReport(req, res));
router.get('/vendor-analysis', (req, res) => reportController.vendorAnalysisReport(req, res));
router.get('/advances', (req, res) => reportController.advanceAnalysis(req, res));
router.get('/loyalty-analysis', (req, res) => reportController.loyaltyAnalysis(req, res));
router.get('/approval', (req, res) => reportController.approvalReport(req, res));
router.get('/wallet-ledger', (req, res) => reportController.walletLedgerReport(req, res));
router.get('/pending-payments', (req, res) => reportController.pendingPayments(req, res));
router.get('/customer-credits', (req, res) => reportController.customerCreditReport(req, res));
router.get('/customer-ledger/:customerId', (req, res) => reportController.customerLedger(req, res));
router.get('/barcode-reconciliation', (req, res) => reportController.barcodeReconciliationReport(req, res));
router.get('/stock-ledger', (req, res) => reportController.stockLedgerReport(req, res));

export default router;
