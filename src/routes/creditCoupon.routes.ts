import { Router } from 'express';
import { creditCouponController } from '../controllers/creditCoupon.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';

const router = Router();

router.use(authenticate);

router.get('/', (req, res) => creditCouponController.findAll(req, res));
router.get('/customer/:mobile', (req, res) => creditCouponController.getByCustomer(req, res));
router.get('/validate/:coupon_no', (req, res) => creditCouponController.validate(req, res));
router.post('/redeem', (req, res) => creditCouponController.redeem(req, res));
router.post('/adjust/:coupon_no', (req, res) => creditCouponController.adjust(req, res));
router.get('/:coupon_no', (req, res) => creditCouponController.getByCouponNo(req, res));

export default router;
