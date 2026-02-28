import { Router } from 'express';
import { dashboardController } from '../controllers/dashboard.controller';
import { authenticate } from '../middleware/auth';

const router = Router();
router.get('/', authenticate, (req, res) => dashboardController.getStats(req, res));

export default router;
