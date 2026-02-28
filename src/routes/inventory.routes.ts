import { Router } from 'express';
import { inventoryController } from '../controllers/inventory.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';

const router = Router();
router.use(authenticate);
router.use(requirePermission('can_manage_inventory'));

router.get('/', (req, res) => inventoryController.findAll(req, res));
router.get('/search', (req, res) => inventoryController.search(req, res));
router.get('/grouped', (req, res) => inventoryController.getGrouped(req, res));
router.get('/:id', (req, res) => inventoryController.findById(req, res));
router.post('/', (req, res) => inventoryController.create(req, res));
router.put('/:id', (req, res) => inventoryController.update(req, res));
router.put('/:id/adjust-quantity', (req, res) => inventoryController.adjustQuantity(req, res));
router.put('/:id/floor', (req, res) => inventoryController.moveToFloor(req, res));

export default router;
