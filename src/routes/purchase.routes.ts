import { Router } from 'express';
import { purchaseController } from '../controllers/purchase.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';

const router = Router();
router.use(authenticate);
router.use(requirePermission('can_manage_purchases'));

router.get('/orders', (req, res) => purchaseController.getOrders(req, res));
router.get('/orders/:id', (req, res) => purchaseController.getOrderById(req, res));
router.post('/orders', (req, res) => purchaseController.createOrder(req, res));
router.put('/orders/:id', (req, res) => purchaseController.updateOrder(req, res));
router.get('/invoices', (req, res) => purchaseController.getInvoices(req, res));
router.post('/invoices', (req, res) => purchaseController.createInvoice(req, res));
router.get('/order-items', (req, res) => purchaseController.getOrderItems(req, res));
router.get('/purchase-items', (req, res) => purchaseController.getPurchaseItems(req, res));
router.post('/purchase-items', (req, res) => purchaseController.createPurchaseItem(req, res));
router.delete('/purchase-items', (req, res) => purchaseController.deletePurchaseItems(req, res));
router.post('/order-items', (req, res) => purchaseController.createOrderItem(req, res));

export default router;
