import { Router } from 'express';
import { purchaseController } from '../controllers/purchase.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';

const router = Router();
router.use(authenticate);
router.use(requirePermission('can_manage_purchases'));

router.get('/orders', (req, res) => purchaseController.getOrders(req, res));
router.get('/orders/:id', (req, res) => purchaseController.getOrderById(req, res));
router.get('/orders/:id/remaining-items', (req, res) => purchaseController.getRemainingOrderItems(req, res));
router.post('/orders', (req, res) => purchaseController.createOrder(req, res));
router.put('/orders/:id', (req, res) => purchaseController.updateOrder(req, res));
router.get('/invoices', (req, res) => purchaseController.getInvoices(req, res));
router.post('/invoices', (req, res) => purchaseController.createInvoice(req, res));
router.delete('/invoices/:id', (req, res) => purchaseController.deleteInvoice(req, res));
router.delete('/orders/:id', (req, res) => purchaseController.deleteOrder(req, res));
router.get('/order-items', (req, res) => purchaseController.getOrderItems(req, res));
router.get('/purchase-items', (req, res) => purchaseController.getPurchaseItems(req, res));
router.post('/purchase-items', (req, res) => purchaseController.createPurchaseItem(req, res));
router.delete('/purchase-items', (req, res) => purchaseController.deletePurchaseItems(req, res));
router.delete('/order-items', (req, res) => purchaseController.deleteOrderItems(req, res));
router.post('/order-items', (req, res) => purchaseController.createOrderItem(req, res));

// Bulk save routes — single API call for create/update invoice + full sync
router.post('/bulk-save', (req, res) => purchaseController.bulkSaveInvoice(req, res));
router.put('/bulk-save/:id', (req, res) => purchaseController.bulkUpdateInvoice(req, res));
router.get('/bulk-items/:id', (req, res) => purchaseController.bulkGetItems(req, res));

export default router;

