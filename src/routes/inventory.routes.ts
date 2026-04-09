import { Router } from 'express';
import { inventoryController } from '../controllers/inventory.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission, requireAdminOrSubAdmin } from '../middleware/permission';

const router = Router();
router.use(authenticate);

router.get('/', (req, res) => inventoryController.findAll(req, res));
router.get('/search', (req, res) => inventoryController.search(req, res));
router.get('/grouped', (req, res) => inventoryController.getGrouped(req, res));
router.get('/:id', (req, res) => inventoryController.findById(req, res));

// Write operations require can_manage_inventory AND Admin/Sub-Admin role
router.post('/', requireAdminOrSubAdmin, requirePermission('can_manage_inventory'), (req, res) => inventoryController.create(req, res));
router.put('/:id', requireAdminOrSubAdmin, requirePermission('can_manage_inventory'), (req, res) => inventoryController.update(req, res));
router.put('/:id/adjust-quantity', requireAdminOrSubAdmin, requirePermission('can_manage_inventory'), (req, res) => inventoryController.adjustQuantity(req, res));
router.put('/:id/floor', requireAdminOrSubAdmin, requirePermission('can_manage_inventory'), (req, res) => inventoryController.moveToFloor(req, res));

export default router;
