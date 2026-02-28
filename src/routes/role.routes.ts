import { Router } from 'express';
import { roleController } from '../controllers/role.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';

const router = Router();
router.use(authenticate);
router.use(requirePermission('can_manage_users'));

router.get('/', (req, res) => roleController.findAll(req, res));
router.post('/', (req, res) => roleController.create(req, res));
router.put('/:id', (req, res) => roleController.update(req, res));
router.delete('/:id', (req, res) => roleController.delete(req, res));

export default router;
