import { Router } from 'express';
import { getDefectiveStock, createDefectiveStock } from '../controllers/defectiveStock.controller';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);
router.get('/', getDefectiveStock);
router.post('/', createDefectiveStock);

export default router;
