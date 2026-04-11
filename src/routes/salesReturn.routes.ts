import { Router } from 'express';
import { salesReturnController } from '../controllers/salesReturn.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';

const router = Router();
router.use(authenticate);
router.use(requirePermission('can_manage_sales'));

router.get('/', (req, res) => salesReturnController.findAll(req, res));
router.get('/credit-notes', (req, res) => salesReturnController.getCreditNotes(req, res));
router.get('/items', (req, res) => salesReturnController.getReturnItems(req, res));
router.get('/:id', (req, res) => salesReturnController.findById(req, res));
router.post('/', (req, res) => salesReturnController.create(req, res));
router.put('/:id', (req, res) => salesReturnController.update(req as any, res));
router.post('/credit-notes/:id/apply', (req, res) => salesReturnController.applyCreditNote(req, res));

export default router;
