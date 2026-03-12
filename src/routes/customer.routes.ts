import { Router } from 'express';
import { customerController } from '../controllers/customer.controller';
import { customerService } from '../services/customer.service';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { loyaltyService } from '../services/loyalty.service';

const router = Router();
router.use(authenticate);
router.use(requirePermission('can_manage_masters', 'can_manage_sales'));

router.get('/', (req, res) => customerController.findAll(req, res));
router.get('/:mobile/history', (req, res) => customerController.getPurchaseHistory(req, res));
router.get('/:mobile/credit-balance', (req, res) => customerController.getCreditBalance(req, res));
router.get('/card/:card_no', (req, res) => customerController.findByCard(req, res));

// Process loyalty special day points for a given month
router.post('/process-loyalty', async (req, res) => {
  try {
    const now = new Date();
    const month = Number(req.body.month) || (now.getMonth() + 1);
    const year = Number(req.body.year) || now.getFullYear();
    const result = await loyaltyService.processMonthPoints(month, year);
    const expiredCount = await loyaltyService.processExpiredPoints();
    res.json({ 
      success: true, 
      data: { ...result, expiredCount }, 
      message: `Processed loyalty points for ${month}/${year}. ${expiredCount} expired records processed.` 
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Backfill card numbers for all existing customers
router.post('/backfill-cards', async (req, res) => {
  try {
    const result = await customerService.backfillCardNumbers();
    res.json({ success: true, data: result, message: `Assigned card numbers to ${result.count} customers` });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/:mobile', (req, res) => customerController.findByMobile(req, res));
router.post('/', (req, res) => customerController.create(req, res));
router.put('/:id', (req, res) => customerController.update(req, res));

export default router;
