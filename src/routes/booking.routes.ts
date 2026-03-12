import { Router } from 'express';
import { bookingController } from '../controllers/booking.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';

const router = Router();
router.use(authenticate);
router.use(requirePermission('can_manage_sales'));

router.get('/', (req, res) => bookingController.findAll(req, res));
router.get('/:id', (req, res) => bookingController.findOne(req, res));
router.post('/', (req, res) => bookingController.create(req, res));
router.put('/:id', (req, res) => bookingController.update(req, res));
router.put('/:id/cancel', (req, res) => bookingController.cancel(req, res));

export default router;
