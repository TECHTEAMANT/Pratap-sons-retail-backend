import { Router } from 'express';
import { voucherController } from '../controllers/voucher.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('can_manage_masters'), (req, res) => voucherController.findAll(req, res));
router.get('/validate/:code', (req, res) => voucherController.validate(req, res));
router.post('/generate', requirePermission('can_manage_masters'), (req, res) => voucherController.generate(req, res));

export default router;
