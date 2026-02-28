import { Router } from 'express';
import { commissionController } from '../controllers/commission.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';

const router = Router();
router.use(authenticate);
router.use(requirePermission('can_manage_masters'));

router.get('/payout-codes', (req, res) => commissionController.getPayoutCodes(req, res));
router.post('/payout-codes', (req, res) => commissionController.createPayoutCode(req, res));
router.put('/payout-codes/:id', (req, res) => commissionController.updatePayoutCode(req, res));
router.delete('/payout-codes/:id', (req, res) => commissionController.deletePayoutCode(req, res));
router.get('/slabs', (req, res) => commissionController.getSlabs(req, res));
router.post('/slabs', (req, res) => commissionController.createSlab(req, res));
router.put('/slabs/:id', (req, res) => commissionController.updateSlab(req, res));
router.delete('/slabs/:id', (req, res) => commissionController.deleteSlab(req, res));

export default router;
