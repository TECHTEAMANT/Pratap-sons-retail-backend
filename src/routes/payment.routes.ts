import { Router } from 'express';
import { paymentController } from '../controllers/payment.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';

const router = Router();
router.use(authenticate);
router.use(requirePermission('can_manage_sales'));

router.get('/', (req, res) => paymentController.findAll(req, res));
router.post('/', (req, res) => paymentController.create(req, res));
router.delete('/:id', (req, res) => paymentController.delete(req, res));

export default router;
