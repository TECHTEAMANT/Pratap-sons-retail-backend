import { Router } from 'express';
import { discountController } from '../controllers/discount.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';

const router = Router();
router.use(authenticate);
router.use(requirePermission('can_manage_masters'));

router.get('/', (req, res) => discountController.findAll(req, res));
router.post('/', (req, res) => discountController.create(req, res));
router.put('/:id', (req, res) => discountController.update(req, res));
router.delete('/:id', (req, res) => discountController.delete(req, res));

export default router;
