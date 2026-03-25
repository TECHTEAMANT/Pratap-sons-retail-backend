import { Router } from 'express';
import { salesController } from '../controllers/sales.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';

const router = Router();

router.use(authenticate);
router.use(requirePermission('can_manage_sales'));

router.get('/invoices', (req, res) => salesController.getInvoices(req, res));
router.get('/invoices/:id', (req, res) => salesController.getInvoiceById(req, res));
router.post('/invoices', (req, res) => salesController.createInvoice(req, res));
router.put('/invoices/:id', (req, res) => salesController.updateInvoice(req as any, res));
router.get('/invoice-items', (req, res) => salesController.getInvoiceItems(req, res));

export default router;
