import { Router } from 'express';
import { inventoryController } from '../controllers/inventory.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission, requirePermissionOrVendor } from '../middleware/permission';

const router = Router();
router.use(authenticate);

// GET routes allow Vendor access
router.get('/', requirePermissionOrVendor('can_manage_inventory'), (req, res) => inventoryController.findAll(req, res));
router.get('/search', requirePermissionOrVendor('can_manage_inventory'), (req, res) => inventoryController.search(req, res));
router.get('/grouped', requirePermissionOrVendor('can_manage_inventory'), (req, res) => inventoryController.getGrouped(req, res));
router.get('/:id', requirePermissionOrVendor('can_manage_inventory'), (req, res) => inventoryController.findById(req, res));

// Non-GET routes strictly require permission
router.use(requirePermission('can_manage_inventory'));

router.post('/', (req, res) => inventoryController.create(req, res));
router.put('/', (req, res) => inventoryController.updateByFilter(req, res));
router.put('/:id', (req, res) => inventoryController.update(req, res));
router.put('/:id/adjust-quantity', (req, res) => inventoryController.adjustQuantity(req, res));
router.put('/:id/floor', (req, res) => inventoryController.moveToFloor(req, res));

export default router;
