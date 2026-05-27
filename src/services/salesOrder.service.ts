import { AppDataSource } from '../config/data-source';
import { SalesOrder } from '../entities/SalesOrder';
import { SalesOrderItem } from '../entities/SalesOrderItem';
import { SalesOrderAdvance } from '../entities/SalesOrderAdvance';
import { SalesOrderAdvanceApplication } from '../entities/SalesOrderAdvanceApplication';
import { SalesOrderAdvanceRefund } from '../entities/SalesOrderAdvanceRefund';
import { ILike } from 'typeorm';
import { getFiscalYearPrefix } from '../utils/fiscalYear';

export class SalesOrderService {
  private orderRepo = AppDataSource.getRepository(SalesOrder);

  async findAll(filters: { status?: string; customer_id?: string; search?: string }) {
    const qb = this.orderRepo.createQueryBuilder('so')
      .leftJoinAndSelect('so.customer', 'c')
      .leftJoinAndSelect('so.salesman', 's');
    if (filters.status) qb.andWhere('so.status = :status', { status: filters.status });
    if (filters.customer_id) qb.andWhere('so.customer_id = :cid', { cid: filters.customer_id });
    if (filters.search) qb.andWhere('(so.order_number ILIKE :s OR c.name ILIKE :s OR s.name ILIKE :s)', { s: `%${filters.search}%` });
    qb.orderBy('so.created_at', 'DESC');
    return qb.getMany();
  }

  async findById(id: string) {
    return this.orderRepo.findOne({ 
      where: { id }, 
      relations: ['items', 'advances', 'customer', 'salesman', 'items.salesman'] 
    });
  }

  async create(data: any, userId: string) {
    return AppDataSource.transaction(async (manager) => {
      // Generate order number
      let orderNum = data.order_number;
      if (!orderNum) {
        const prefix = `ORD${getFiscalYearPrefix()}`;
        const records = await manager.query(`SELECT order_number FROM sales_orders WHERE order_number LIKE $1 ORDER BY order_number DESC LIMIT 1`, [`${prefix}%`]);
        let nextNum = 1;
        if (records.length > 0 && records[0].order_number) {
          const lastPortion = records[0].order_number.substring(prefix.length);
          const parsed = parseInt(lastPortion, 10);
          if (!isNaN(parsed)) nextNum = parsed + 1;
        }
        orderNum = `${prefix}${nextNum.toString().padStart(6, '0')}`;
      }

      const order = manager.create(SalesOrder, {
        order_number: orderNum,
        customer_id: data.customer_id,
        order_date: data.order_date,
        expected_delivery_date: data.expected_delivery_date || null,
        total_amount: data.total_amount,
        advance_received: data.advance_received || 0,
        balance_amount: data.total_amount - (data.advance_received || 0),
        notes: data.notes || '',
        salesman_id: data.salesman_id || null,
        created_by: userId,
      });
      const savedOrder = await manager.save(order);

      if (data.items) {
        for (const item of data.items) {
          const orderItem = manager.create(SalesOrderItem, {
            sales_order_id: savedOrder.id,
            sr_no: item.sr_no,
            barcode_8digit: item.barcode_8digit,
            design_no: item.design_no,
            hsn_code: item.hsn_code,
            product_description: item.product_description || '',
            quantity: item.quantity || 1,
            mrp: item.mrp,
            discount_percentage: Number(item.discount_percentage) || 0,
            gst_percentage: Number(item.gst_percentage) || 5,
            total: Number(item.total) || 0,
            salesman_id: item.salesman_id || null,
          });
          await manager.save(orderItem);
        }
      }

      if (data.advances && Array.isArray(data.advances)) {
        for (const adv of data.advances) {
          const prefix = `SOA${getFiscalYearPrefix()}`;
          const records = await manager.query(
            `SELECT MAX(CAST(SUBSTRING(receipt_number FROM ${prefix.length + 1}) AS integer)) as max_num 
             FROM sales_order_advances 
             WHERE receipt_number LIKE $1`,
            [`${prefix}%`]
          );
          let nextNum = 1;
          if (records.length > 0 && records[0].max_num) {
            nextNum = parseInt(records[0].max_num, 10) + 1;
          }
          const recNum = `${prefix}${nextNum.toString().padStart(6, '0')}`;

          const orderAdv = manager.create(SalesOrderAdvance, {
            sales_order_id: savedOrder.id,
            amount: adv.amount,
            payment_mode: adv.mode || adv.payment_mode,
            reference_number: adv.reference || adv.reference_number,
            receipt_number: recNum,
            notes: adv.notes || '',
            created_by: userId,
          });
          await manager.save(orderAdv);
        }
      }

      return savedOrder;
    });
  }

  async update(id: string, data: any) {
    return AppDataSource.transaction(async (manager) => {
      // 1. Update Header using raw SQL to bypass TypeORM cascades
      // Add 'order_number' and 'balance_amount' to allow manual updates
      const allowed = ['order_number', 'customer_id', 'order_date', 'expected_delivery_date', 'notes', 'status', 'salesman_id', 'attachment_url', 'total_amount', 'advance_received', 'balance_amount'];
      const updates: string[] = [];
      const params: any[] = [];
      
      let paramIdx = 1;
      for (const key of allowed) {
        if (data[key] !== undefined) {
          updates.push(`"${key}" = $${paramIdx++}`);
          params.push(data[key]);
        }
      }

      if (updates.length > 0) {
        params.push(id);
        await manager.query(`
          UPDATE sales_orders 
          SET ${updates.join(', ')}, updated_at = NOW() 
          WHERE id = $${paramIdx}
        `, params);
      }

      // 2. Handle Items using raw SQL
      let itemTotalAmount = 0;
      if (data.items && Array.isArray(data.items)) {
        await manager.query(`DELETE FROM sales_order_items WHERE sales_order_id = $1`, [id]);
   
        for (let i = 0; i < data.items.length; i++) {
          const item = data.items[i];
          const item_total = Number(item.total) || 0;
          itemTotalAmount += item_total;

          const item_id = require('crypto').randomUUID ? require('crypto').randomUUID() : (require('uuid').v4 ? require('uuid').v4() : id + '-' + i);
          await manager.query(`
            INSERT INTO sales_order_items (
              id, sales_order_id, sr_no, barcode_8digit, design_no, hsn_code, 
              product_description, quantity, mrp, discount_percentage, 
              gst_percentage, total, salesman_id, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
          `, [
            item_id, id, Number(item.sr_no) || (i + 1),
            String(item.barcode_8digit || ''), String(item.design_no || ''), String(item.hsn_code || ''),
            String(item.product_description || ''), Number(item.quantity) || 1, Number(item.mrp) || 0,
            Number(item.discount_percentage) || 0, Number(item.gst_percentage) || 5, item_total,
            item.salesman_id || data.salesman_id || null
          ]);
        }
      }

      // 3. Handle NEW Advances if provided
      if (data.advances && Array.isArray(data.advances)) {
        const getFiscalYearPrefix = () => {
          const now = new Date();
          const year = now.getFullYear();
          const fiscalYear = now.getMonth() >= 3 ? `${year % 100}${(year + 1) % 100}` : `${(year - 1) % 100}${year % 100}`;
          return fiscalYear;
        };

        for (const adv of data.advances) {
          if (Number(adv.amount) > 0) {
            const prefix = `SOA${getFiscalYearPrefix()}`;
            // Simple robust counter fetch
            const [{ count }] = await manager.query(`SELECT count(id)::int FROM sales_order_advances WHERE receipt_number LIKE $1`, [`${prefix}%`]);
            const receiptNumber = `${prefix}${String(count + 1).padStart(4, '0')}`;
            
            await manager.query(`
              INSERT INTO sales_order_advances (
                id, sales_order_id, amount, payment_mode, reference_number, notes, receipt_number, created_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            `, [
              require('crypto').randomUUID ? require('crypto').randomUUID() : id + Math.random(),
              id, Number(adv.amount), String(adv.mode || 'Cash'), String(adv.reference || ''), 
              String(adv.notes || ''), receiptNumber
            ]);
          }
        }
      }

      // 4. FINAL RECALCULATION: Update advance_received and balance_amount based on ALL records
      const [{ sum }] = await manager.query(`SELECT SUM(amount) as sum FROM sales_order_advances WHERE sales_order_id = $1`, [id]);
      const totalAdvances = Number(sum || 0);
      
      // Get the order to find the latest total_amount
      const [{ total_amount }] = await manager.query(`SELECT total_amount FROM sales_orders WHERE id = $1`, [id]);
      const finalTotal = Number(total_amount);
      const finalBalance = finalTotal - totalAdvances;

      await manager.query(`
        UPDATE sales_orders 
        SET advance_received = $1, balance_amount = $2 
        WHERE id = $3
      `, [totalAdvances, finalBalance, id]);

      // Re-fetch to return the updated record
      return manager.query(`SELECT * FROM sales_orders WHERE id = $1`, [id]).then(rows => rows[0]);
    });
  }

  async addAdvance(orderId: string, advances: { amount: number; payment_mode: string; reference_number?: string; notes?: string }[], userId: string) {
    return AppDataSource.transaction(async (manager) => {
      let totalAdded = 0;
      const savedAdvances = [];

      for (const data of advances) {
        const prefix = `SOA${getFiscalYearPrefix()}`;
        const records = await manager.query(
          `SELECT MAX(CAST(SUBSTRING(receipt_number FROM ${prefix.length + 1}) AS integer)) as max_num 
           FROM sales_order_advances 
           WHERE receipt_number LIKE $1`,
          [`${prefix}%`]
        );
        let nextNum = 1;
        if (records.length > 0 && records[0].max_num) {
          nextNum = parseInt(records[0].max_num, 10) + 1;
        }
        const recNum = `${prefix}${nextNum.toString().padStart(6, '0')}`;

        const adv = manager.create(SalesOrderAdvance);
        adv.sales_order_id = orderId;
        adv.amount = data.amount;
        adv.payment_mode = (data as any).mode || data.payment_mode;
        adv.reference_number = (data as any).reference || data.reference_number;
        adv.receipt_number = recNum;
        adv.notes = data.notes;
        adv.created_by = userId;
        const saved = await manager.save(adv);
        savedAdvances.push(saved);
        totalAdded += Number(data.amount);
      }

      const order = await manager.findOne(SalesOrder, { where: { id: orderId } });
      if (order) {
        order.advance_received = Number(order.advance_received) + totalAdded;
        order.balance_amount = Number(order.balance_amount) - totalAdded;
        await manager.save(order);
      }
      return savedAdvances;
    });
  }

  async delete(id: string) {
    const order = await this.orderRepo.findOneBy({ id });
    if (!order) return;
    order.status = 'cancelled';
    await this.orderRepo.save(order);
  }

  async getItems(filters: any) {
    const repo = AppDataSource.getRepository(SalesOrderItem);
    const where: any = {};
    if (filters.sales_order_id) where.sales_order_id = filters.sales_order_id;
    if (filters.barcode_8digit) where.barcode_8digit = filters.barcode_8digit;
    
    return repo.find({ 
      where, 
      order: { sr_no: 'ASC' } 
    });
  }

  async createItem(data: any) {
    const repo = AppDataSource.getRepository(SalesOrderItem);
    const item = repo.create(data);
    return repo.save(item);
  }

  async getAdvances(filters: any) {
    const repo = AppDataSource.getRepository(SalesOrderAdvance);
    const where: any = {};
    if (filters.sales_order_id) where.sales_order_id = filters.sales_order_id;
    if (filters.order_id) where.sales_order_id = filters.order_id;
    
    return repo.find({ 
      where, 
      relations: ['salesOrder', 'salesOrder.customer'],
      order: { created_at: 'DESC' } 
    });
  }

  async findAdvanceById(id: string) {
    const repo = AppDataSource.getRepository(SalesOrderAdvance);
    return repo.findOne({
      where: { id },
      relations: ['salesOrder', 'salesOrder.customer']
    });
  }

  async applyAdvance(receiptNumber: string, invoiceId: string, amountToApply: number, manager: any) {
    const advRepo = manager.getRepository(SalesOrderAdvance);
    const appRepo = manager.getRepository(SalesOrderAdvanceApplication);

    let adv = await advRepo.findOne({ where: { receipt_number: receiptNumber } });

    // Fallback: reference may be the advance UUID id
    if (!adv) {
      adv = await advRepo.findOne({ where: { id: receiptNumber } });
    }

    // Fallback: some UIs may pass Sales Order number instead of receipt number.
    // In that case, pick the oldest advance on that order that still has remaining balance.
    if (!adv) {
      const candidates: { id: string }[] = await manager.query(
        `
          SELECT soa.id
          FROM sales_order_advances soa
          INNER JOIN sales_orders so ON so.id = soa.sales_order_id
          LEFT JOIN (
            SELECT advance_id, COALESCE(SUM(amount_applied)::numeric, 0) AS used_amount
            FROM sales_order_advance_applications
            GROUP BY advance_id
          ) used ON used.advance_id = soa.id
          WHERE so.order_number = $1
            AND (soa.amount::numeric - COALESCE(used.used_amount, 0)) > 0
          ORDER BY soa.created_at ASC
          LIMIT 1
        `,
        [receiptNumber]
      );
      if (candidates.length > 0) {
        adv = await advRepo.findOne({ where: { id: candidates[0].id } });
      }
    }

    if (!adv) throw new Error(`Invalid advance reference: ${receiptNumber}`);

    const [{ used }] = await manager.query(
      `SELECT COALESCE(SUM(amount_applied)::numeric, 0) as used FROM sales_order_advance_applications WHERE advance_id = $1`,
      [adv.id]
    );
    const [{ refunded }] = await manager.query(
      `SELECT COALESCE(SUM(amount)::numeric, 0) as refunded FROM sales_order_advance_refunds WHERE advance_id = $1`,
      [adv.id]
    );
    const remaining = Math.max(0, Number(adv.amount) - Number(used || 0) - Number(refunded || 0));

    const amt = Number(amountToApply || 0);
    if (amt <= 0) return;
    if (amt > remaining) {
      throw new Error(`Advance ${receiptNumber} has only ₹${remaining.toFixed(2)} remaining`);
    }

    const existing = await appRepo.findOne({ where: { advance_id: adv.id, invoice_id: invoiceId } });
    if (existing) {
      existing.amount_applied = Number(existing.amount_applied || 0) + amt;
      await appRepo.save(existing);
    } else {
      await appRepo.save(appRepo.create({ advance_id: adv.id, invoice_id: invoiceId, amount_applied: amt }));
    }

    const newRemaining = remaining - amt;
    adv.status = newRemaining <= 0 ? 'redeemed' : 'active';
    adv.redeemed_invoice_id = newRemaining <= 0 ? invoiceId : null;
    await advRepo.save(adv);
  }

  async releaseInvoiceApplications(invoiceId: string, manager: any) {
    const appRepo = manager.getRepository(SalesOrderAdvanceApplication);
    const advRepo = manager.getRepository(SalesOrderAdvance);

    const apps: SalesOrderAdvanceApplication[] = await appRepo.find({ where: { invoice_id: invoiceId } });
    if (apps.length === 0) return;

    const advanceIds = [...new Set(apps.map((a) => a.advance_id))];
    await appRepo.delete({ invoice_id: invoiceId } as any);

    for (const advanceId of advanceIds) {
      const adv = await advRepo.findOne({ where: { id: advanceId } });
      if (!adv) continue;
      const [{ used }] = await manager.query(
        `SELECT COALESCE(SUM(amount_applied)::numeric, 0) as used FROM sales_order_advance_applications WHERE advance_id = $1`,
        [advanceId]
      );
      const [{ refunded }] = await manager.query(
        `SELECT COALESCE(SUM(amount)::numeric, 0) as refunded FROM sales_order_advance_refunds WHERE advance_id = $1`,
        [advanceId]
      );
      const remaining = Math.max(0, Number(adv.amount) - Number(used || 0) - Number(refunded || 0));
      adv.status = remaining <= 0 ? 'redeemed' : 'active';
      adv.redeemed_invoice_id = remaining <= 0 ? adv.redeemed_invoice_id : null;
      await advRepo.save(adv);
    }
  }

  async adjustAdvance(advanceId: string, amount: number, paymentMode: string, notes: string, userId: string) {
    return AppDataSource.transaction(async (manager) => {
      const advRepo = manager.getRepository(SalesOrderAdvance);
      const refundRepo = manager.getRepository(SalesOrderAdvanceRefund);

      const adv = await advRepo.findOne({ where: { id: advanceId } });
      if (!adv) throw new Error(`Invalid advance ID: ${advanceId}`);

      const [{ used }] = await manager.query(
        `SELECT COALESCE(SUM(amount_applied)::numeric, 0) as used FROM sales_order_advance_applications WHERE advance_id = $1`,
        [adv.id]
      );
      const [{ refunded }] = await manager.query(
        `SELECT COALESCE(SUM(amount)::numeric, 0) as refunded FROM sales_order_advance_refunds WHERE advance_id = $1`,
        [adv.id]
      );
      
      const remaining = Math.max(0, Number(adv.amount) - Number(used || 0) - Number(refunded || 0));
      const amt = Number(amount || 0);

      if (amt <= 0) throw new Error('Adjustment amount must be greater than 0');
      
      const roundedAmt = Math.round(amt * 100);
      const roundedRemaining = Math.round(remaining * 100);

      if (roundedAmt > roundedRemaining) {
        throw new Error(`Advance has only ₹${remaining.toFixed(2)} remaining`);
      }

      await refundRepo.save(refundRepo.create({
        advance_id: adv.id,
        amount: amt,
        payment_mode: paymentMode,
        notes: notes,
        created_by: userId
      }));

      const newRemaining = remaining - amt;
      adv.status = newRemaining <= 0 ? 'redeemed' : 'active';
      await advRepo.save(adv);

      return { success: true, remaining: newRemaining };
    });
  }
}

export const salesOrderService = new SalesOrderService();
