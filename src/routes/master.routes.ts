import { Router } from 'express';
import { masterController } from '../controllers/master.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';

const router = Router();
router.use(authenticate);

// Read endpoints are available to all authenticated users
router.get('/product-groups', (req, res) => masterController.getProductGroups(req, res));
router.get('/sizes', (req, res) => masterController.getSizes(req, res));
router.get('/colors', (req, res) => masterController.getColors(req, res));
router.get('/vendors', (req, res) => masterController.getVendors(req, res));
router.get('/floors', (req, res) => masterController.getFloors(req, res));
router.get('/cities', (req, res) => masterController.getCities(req, res));
router.get('/product-masters', (req, res) => masterController.getProductMasters(req, res));

// Write endpoints require can_manage_masters
router.post('/product-groups', requirePermission('can_manage_masters'), (req, res) => masterController.createProductGroup(req, res));
router.put('/product-groups/:id', requirePermission('can_manage_masters'), (req, res) => masterController.updateProductGroup(req, res));
router.post('/sizes', requirePermission('can_manage_masters'), (req, res) => masterController.createSize(req, res));
router.put('/sizes/:id', requirePermission('can_manage_masters'), (req, res) => masterController.updateSize(req, res));
router.post('/colors', requirePermission('can_manage_masters'), (req, res) => masterController.createColor(req, res));
router.put('/colors/:id', requirePermission('can_manage_masters'), (req, res) => masterController.updateColor(req, res));
router.post('/vendors', requirePermission('can_manage_masters'), (req, res) => masterController.createVendor(req, res));
router.put('/vendors/:id', requirePermission('can_manage_masters'), (req, res) => masterController.updateVendor(req, res));
router.post('/floors', requirePermission('can_manage_masters'), (req, res) => masterController.createFloor(req, res));
router.put('/floors/:id', requirePermission('can_manage_masters'), (req, res) => masterController.updateFloor(req, res));
router.post('/cities', requirePermission('can_manage_masters'), (req, res) => masterController.createCity(req, res));
router.put('/cities/:id', requirePermission('can_manage_masters'), (req, res) => masterController.updateCity(req, res));
router.post('/product-masters', requirePermission('can_manage_masters'), (req, res) => masterController.createProductMaster(req, res));
router.put('/product-masters/:id', requirePermission('can_manage_masters'), (req, res) => masterController.updateProductMaster(req, res));

// Barcode Print Logs
router.get('/barcode-print-logs', (req, res) => masterController.getBarcodePrintLogs(req, res));
router.post('/barcode-print-logs', (req, res) => masterController.createBarcodePrintLog(req, res));

export default router;
