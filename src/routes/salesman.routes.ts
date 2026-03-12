import { Router } from 'express';
import { salesmanController } from '../controllers/salesman.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';

const router = Router();

router.use(authenticate);

router.get('/', (req, res) => salesmanController.findAll(req, res));
router.get('/next-code', (req, res) => salesmanController.getNextCode(req, res));
router.get('/:id', (req, res) => salesmanController.findById(req, res));

router.post('/', requirePermission('can_manage_masters'), (req, res) => salesmanController.create(req, res));
router.put('/:id', requirePermission('can_manage_masters'), (req, res) => salesmanController.update(req, res));

export default router;
