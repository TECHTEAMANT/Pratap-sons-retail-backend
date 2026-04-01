import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { sendSuccess, sendError } from '../utils/response';
import { AppDataSource } from '../config/data-source';
import { getFiscalYearPrefix } from '../utils/fiscalYear';

const router = Router();

router.post('/:functionName', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const { functionName } = req.params;
  const args = req.body;

  try {
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
      const fy = getFiscalYearPrefix();
      const prefix = `BK${fy}`;
      const records = await AppDataSource.query(`SELECT booking_number FROM e_bookings WHERE booking_number LIKE $1 ORDER BY booking_number DESC LIMIT 1`, [`${prefix}%`]);
      let nextNum = 1;
      if (records.length > 0 && records[0].booking_number) {
        const lastPortion = records[0].booking_number.substring(prefix.length);
        const parsed = parseInt(lastPortion, 10);
        if (!isNaN(parsed)) nextNum = parsed + 1;
      }
      return sendSuccess(res, `${prefix}${nextNum.toString().padStart(6, '0')}`);
    }

    if (functionName === 'get_next_barcode_number') {
      // Only consider barcodes in the valid 8-digit "0-padded" range (numeric value < 10,000,000)
      // This excludes any wrongly-seeded barcodes in the 10000001+ range from a previous bad seed.
      const maxResult = await AppDataSource.query(
        `SELECT MAX(CAST(barcode_alias_8digit AS INTEGER)) AS max_num
         FROM barcode_batches
         WHERE barcode_alias_8digit ~ '^[0-9]+$'
           AND CAST(barcode_alias_8digit AS INTEGER) < 10000000`
      );
      let nextNum = 1; // initial seed → pads to 00000001
      if (maxResult.length > 0 && maxResult[0].max_num != null) {
        nextNum = parseInt(maxResult[0].max_num, 10) + 1;
      }

      // Safety: if somehow we land back in the bad range, reset to 1
      if (nextNum >= 10000000) {
        nextNum = 1;
      }

      // Collision guard: keep incrementing until the alias is truly unused
      let attempts = 0;
      while (attempts < 100000) {
        const candidate = nextNum.toString().padStart(8, '0');
        const exists = await AppDataSource.query(
          `SELECT 1 FROM barcode_batches WHERE barcode_alias_8digit = $1 LIMIT 1`,
          [candidate]
        );
        if (exists.length === 0) {
          return sendSuccess(res, candidate);
        }
        nextNum++;
        // Skip the bad range entirely
        if (nextNum >= 10000000) {
          return sendError(res, 'Barcode sequence exhausted valid 8-digit range');
        }
        attempts++;
      }
      return sendError(res, 'Could not generate a unique barcode number after 100000 attempts');
    }

    if (functionName === 'generate_payment_receipt_number') {
      const year = new Date().getFullYear();
      const prefix = `RCP${year}`;
      const records = await AppDataSource.query(`SELECT receipt_number FROM payment_receipts WHERE receipt_number LIKE $1 ORDER BY receipt_number DESC LIMIT 1`, [`${prefix}%`]);
      let nextNum = 1;
      if (records.length > 0 && records[0].receipt_number) {
        const lastPortion = records[0].receipt_number.substring(prefix.length);
        const parsed = parseInt(lastPortion, 10);
        if (!isNaN(parsed)) nextNum = parsed + 1;
      }
      return sendSuccess(res, `${prefix}${nextNum.toString().padStart(6, '0')}`);
    }

    if (functionName === 'generate_purchase_return_number') {
      const fy = getFiscalYearPrefix();
      const prefix = `PRET${fy}`;
      const records = await AppDataSource.query(`SELECT return_number FROM purchase_returns WHERE return_number LIKE $1 ORDER BY return_number DESC LIMIT 1`, [`${prefix}%`]);
      let nextNum = 1;
      if (records.length > 0 && records[0].return_number) {
        const lastPortion = records[0].return_number.substring(prefix.length);
        const parsed = parseInt(lastPortion, 10);
        if (!isNaN(parsed)) nextNum = parsed + 1;
      }
      return sendSuccess(res, `${prefix}${nextNum.toString().padStart(6, '0')}`);
    }

    if (functionName === 'generate_sales_return_number') {
      const fy = getFiscalYearPrefix();
      const prefix = `SRET${fy}`;
      const records = await AppDataSource.query(`SELECT return_number FROM sales_returns WHERE return_number LIKE $1 ORDER BY return_number DESC LIMIT 1`, [`${prefix}%`]);
      let nextNum = 1;
      if (records.length > 0 && records[0].return_number) {
        const lastPortion = records[0].return_number.substring(prefix.length);
        const parsed = parseInt(lastPortion, 10);
        if (!isNaN(parsed)) nextNum = parsed + 1;
      }
      return sendSuccess(res, `${prefix}${nextNum.toString().padStart(6, '0')}`);
    }

    if (functionName === 'generate_credit_note_number') {
      const fy = getFiscalYearPrefix();
      const prefix = `CN${fy}`;
      const records = await AppDataSource.query(`SELECT credit_note_number FROM credit_notes WHERE credit_note_number LIKE $1 ORDER BY credit_note_number DESC LIMIT 1`, [`${prefix}%`]);
      let nextNum = 1;
      if (records.length > 0 && records[0].credit_note_number) {
        const lastPortion = records[0].credit_note_number.substring(prefix.length);
        const parsed = parseInt(lastPortion, 10);
        if (!isNaN(parsed)) nextNum = parsed + 1;
      }
      return sendSuccess(res, `${prefix}${nextNum.toString().padStart(6, '0')}`);
    }

    if (functionName === 'generate_sales_invoice_number') {
      const fy = getFiscalYearPrefix();
      const prefix = `INV${fy}`;
      const records = await AppDataSource.query(`SELECT invoice_number FROM sales_invoices WHERE invoice_number LIKE $1 ORDER BY invoice_number DESC LIMIT 1`, [`${prefix}%`]);
      let nextNum = 1;
      if (records.length > 0 && records[0].invoice_number) {
        const lastPortion = records[0].invoice_number.substring(prefix.length);
        const parsed = parseInt(lastPortion, 10);
        if (!isNaN(parsed)) nextNum = parsed + 1;
      }
      return sendSuccess(res, `${prefix}${nextNum.toString().padStart(6, '0')}`);
    }

    if (functionName === 'generate_sales_order_number') {
      const fy = getFiscalYearPrefix();
      const prefix = `ORD${fy}`;
      const records = await AppDataSource.query(`SELECT order_number FROM sales_orders WHERE order_number LIKE $1 ORDER BY order_number DESC LIMIT 1`, [`${prefix}%`]);
      let nextNum = 1;
      if (records.length > 0 && records[0].order_number) {
        const lastPortion = records[0].order_number.substring(prefix.length);
        const parsed = parseInt(lastPortion, 10);
        if (!isNaN(parsed)) nextNum = parsed + 1;
      }
      return sendSuccess(res, `${prefix}${nextNum.toString().padStart(6, '0')}`);
    }

    if (functionName === 'generate_invoice_transaction') {
      const p_invoice_data = args.p_invoice_data;
      const p_items = args.p_items;
      
      // Import salesService at the top of the file if needed, or inline require
      const { salesService } = require('../services/sales.service');
      
      const invoiceDataToCreate = {
        ...p_invoice_data,
        items: p_items
      };
      
      const createdInvoice = await salesService.createInvoice(invoiceDataToCreate, req.user!.id);
      return sendSuccess(res, { invoice_number: createdInvoice.invoice_number, id: createdInvoice.id });
    }

    sendError(res, `RPC function ${functionName} not implemented`, 501);
  } catch (error: any) {
    sendError(res, error.message);
  }
});

export default router;
