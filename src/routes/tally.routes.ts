import { Router } from 'express';
import { tallyController } from '../controllers/tally.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';

const router = Router();
router.use(authenticate);
router.use(requirePermission('can_manage_purchases'));

router.get('/unsynced-sales', (req, res) => tallyController.findAll(req, res));
router.delete('/unsynced-sales', (req, res) => tallyController.deleteByType(req, res));
router.post('/unsynced-sales', (req, res) => tallyController.create(req, res));
router.get('/pending', (req, res) => tallyController.getPending(req, res));
router.post('/sync', (req, res) => tallyController.create(req, res));
router.put('/:id/status', (req, res) => tallyController.updateStatus(req, res));
router.get('/export', (req, res) => tallyController.getExportData(req, res));

export default router;
