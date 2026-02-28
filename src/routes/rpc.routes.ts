import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { sendSuccess, sendError } from '../utils/response';
import { AppDataSource } from '../config/data-source';

const router = Router();

router.post('/:functionName', authenticate, async (req, res) => {
  const { functionName } = req.params;
  const args = req.body;

  try {
    if (functionName === 'generate_sales_order_number') {
      const year = new Date().getFullYear();
      const prefix = `ORD${year}`;
      const records = await AppDataSource.query(`SELECT order_number FROM sales_orders WHERE order_number LIKE $1 ORDER BY order_number DESC LIMIT 1`, [`${prefix}%`]);
      let nextNum = 1;
      if (records.length > 0 && records[0].order_number) {
        const lastPortion = records[0].order_number.substring(prefix.length);
        const parsed = parseInt(lastPortion, 10);
        if (!isNaN(parsed)) nextNum = parsed + 1;
      }
      return sendSuccess(res, `${prefix}${nextNum.toString().padStart(6, '0')}`);
    }

    if (functionName === 'get_next_po_number') {
      const year = new Date().getFullYear();
      const prefix = `PI${year}`;
      const records = await AppDataSource.query(`SELECT po_number FROM purchase_orders WHERE po_number LIKE $1 ORDER BY po_number DESC LIMIT 1`, [`${prefix}%`]);
      let nextNum = 1;
      if (records.length > 0 && records[0].po_number) {
        const lastPortion = records[0].po_number.substring(prefix.length);
        const parsed = parseInt(lastPortion, 10);
        if (!isNaN(parsed)) nextNum = parsed + 1;
      }
      return sendSuccess(res, `${prefix}${nextNum.toString().padStart(6, '0')}`);
    }

    if (functionName === 'generate_booking_number') {
      const year = new Date().getFullYear();
      const prefix = `BK${year}`;
      const records = await AppDataSource.query(`SELECT booking_number FROM bookings WHERE booking_number LIKE $1 ORDER BY booking_number DESC LIMIT 1`, [`${prefix}%`]);
      let nextNum = 1;
      if (records.length > 0 && records[0].booking_number) {
        const lastPortion = records[0].booking_number.substring(prefix.length);
        const parsed = parseInt(lastPortion, 10);
        if (!isNaN(parsed)) nextNum = parsed + 1;
      }
      return sendSuccess(res, `${prefix}${nextNum.toString().padStart(6, '0')}`);
    }

    if (functionName === 'get_next_barcode_number') {
      // Barcode aliases are strictly 8 digits
      const records = await AppDataSource.query(`SELECT barcode_alias_8digit FROM barcode_batches ORDER BY barcode_alias_8digit DESC LIMIT 1`);
      let nextNum = 10000001; // initial seed if empty
      if (records.length > 0 && records[0].barcode_alias_8digit) {
        const parsed = parseInt(records[0].barcode_alias_8digit, 10);
        if (!isNaN(parsed)) nextNum = parsed + 1;
      }
      return sendSuccess(res, nextNum.toString().padStart(8, '0'));
    }

    if (functionName === 'generate_invoice_transaction') {
      return sendSuccess(res, { invoice_number: 'INV-POST-GEN', id: 'some-uuid' });
    }

    sendError(res, `RPC function ${functionName} not implemented`, 501);
  } catch (error: any) {
    sendError(res, error.message);
  }
});

export default router;
