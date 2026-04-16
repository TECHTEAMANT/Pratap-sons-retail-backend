import { Router } from 'express';
import { purchaseReturnController } from '../controllers/purchaseReturn.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission, requirePermissionOrVendor } from '../middleware/permission';

const router = Router();
router.use(authenticate);

// GET routes allow Vendor access (filtered by vendor_id in controller)
router.get('/', requirePermissionOrVendor('can_manage_purchases'), (req, res) => purchaseReturnController.findAll(req, res));
router.get('/items', requirePermissionOrVendor('can_manage_purchases'), (req, res) => purchaseReturnController.findAllItems(req, res));
router.get('/:id', requirePermissionOrVendor('can_manage_purchases'), (req, res) => purchaseReturnController.findById(req, res));

// Non-GET routes strictly require permission
router.use(requirePermission('can_manage_purchases'));

router.post('/items', (req, res) => purchaseReturnController.createItem(req, res));
router.post('/bulk-create', (req, res) => purchaseReturnController.bulkCreate(req as any, res));
router.post('/', (req, res) => purchaseReturnController.create(req as any, res));
router.put('/bulk-update/:id', (req, res) => purchaseReturnController.bulkUpdate(req as any, res));
router.put('/:id', (req, res) => purchaseReturnController.update(req, res));
router.delete('/items', (req, res) => purchaseReturnController.deleteItems(req, res));
router.delete('/:id', (req, res) => purchaseReturnController.delete(req, res));

export default router;
