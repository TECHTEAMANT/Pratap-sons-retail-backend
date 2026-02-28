import { Router } from 'express';
import { purchaseReturnController } from '../controllers/purchaseReturn.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';

const router = Router();
router.use(authenticate);
router.use(requirePermission('can_manage_purchases'));

router.get('/', (req, res) => purchaseReturnController.findAll(req, res));
router.post('/', (req, res) => purchaseReturnController.create(req, res));
router.put('/:id', (req, res) => purchaseReturnController.update(req, res));

export default router;
