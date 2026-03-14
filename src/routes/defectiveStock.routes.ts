import { Router } from 'express';
import { getDefectiveStock, createDefectiveStock, deleteDefectiveStock } from '../controllers/defectiveStock.controller';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);
router.get('/', getDefectiveStock);
router.post('/', createDefectiveStock);
router.delete('/:id', deleteDefectiveStock);

export default router;
