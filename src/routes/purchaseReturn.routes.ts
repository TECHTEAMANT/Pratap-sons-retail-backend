import { Router } from 'express';
import { purchaseReturnController } from '../controllers/purchaseReturn.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';

const router = Router();
router.use(authenticate);
router.use(requirePermission('can_manage_purchases'));

router.get('/', (req, res) => purchaseReturnController.findAll(req, res));
router.get('/items', (req, res) => purchaseReturnController.findAllItems(req, res));
router.get('/:id', (req, res) => purchaseReturnController.findById(req, res));
  router.post('/items', (req, res) => purchaseReturnController.createItem(req, res));
router.post('/', (req, res) => purchaseReturnController.create(req, res));
router.put('/bulk-update/:id', (req, res) => purchaseReturnController.bulkUpdate(req as any, res));
router.put('/:id', (req, res) => purchaseReturnController.update(req, res));
router.delete('/items', (req, res) => purchaseReturnController.deleteItems(req, res));
router.delete('/:id', (req, res) => purchaseReturnController.delete(req, res));

export default router;
