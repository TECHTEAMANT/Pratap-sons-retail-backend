import { Router } from 'express';
import { customerController } from '../controllers/customer.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';

const router = Router();
router.use(authenticate);
router.use(requirePermission('can_manage_masters', 'can_manage_sales'));

router.get('/', (req, res) => customerController.findAll(req, res));
router.get('/:mobile/history', (req, res) => customerController.getPurchaseHistory(req, res));
router.get('/:mobile/credit-balance', (req, res) => customerController.getCreditBalance(req, res));
router.get('/:mobile', (req, res) => customerController.findByMobile(req, res));
router.post('/', (req, res) => customerController.create(req, res));
router.put('/:id', (req, res) => customerController.update(req, res));

export default router;
