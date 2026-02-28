import { Router } from 'express';
import { getDefectiveStock } from '../controllers/defectiveStock.controller';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);
router.get('/', getDefectiveStock);

export default router;
