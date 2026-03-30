import { Router } from 'express';
import { reportController } from '../controllers/report.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';

const router = Router();
router.use(authenticate);
router.use(requirePermission('can_view_reports'));

router.get('/sales', (req, res) => reportController.salesReport(req, res));
router.get('/inventory', (req, res) => reportController.inventoryReport(req, res));
router.get('/gst', (req, res) => reportController.gstReport(req, res));
router.get('/salesman', (req, res) => reportController.salesmanReport(req, res));
router.get('/customers', (req, res) => reportController.customerReport(req, res));
router.get('/purchases', (req, res) => reportController.purchaseReport(req, res));
router.get('/profitability', (req, res) => reportController.profitabilityReport(req, res));
router.get('/top-selling', (req, res) => reportController.topSellingReport(req, res));
router.get('/slow-moving', (req, res) => reportController.slowMovingReport(req, res));
router.get('/floorwise-sales', (req, res) => reportController.floorwiseReport(req, res));
router.get('/sales-returns', (req, res) => reportController.salesReturnReport(req, res));
router.get('/cash', (req, res) => reportController.cashReport(req, res));
router.get('/advances', (req, res) => reportController.advanceAnalysis(req, res));

export default router;
