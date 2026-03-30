import { AppDataSource } from '../config/data-source';
import { SalesOrder } from '../entities/SalesOrder';
import { SalesOrderItem } from '../entities/SalesOrderItem';
import { SalesOrderAdvance } from '../entities/SalesOrderAdvance';
import { ILike } from 'typeorm';

export class SalesOrderService {
  private orderRepo = AppDataSource.getRepository(SalesOrder);

  async findAll(filters: { status?: string; customer_id?: string; search?: string }) {
    const qb = this.orderRepo.createQueryBuilder('so')
      .leftJoinAndSelect('so.customer', 'c');
    if (filters.status) qb.andWhere('so.status = :status', { status: filters.status });
    if (filters.customer_id) qb.andWhere('so.customer_id = :cid', { cid: filters.customer_id });
    if (filters.search) qb.andWhere('(so.order_number ILIKE :s OR c.name ILIKE :s)', { s: `%${filters.search}%` });
    qb.orderBy('so.created_at', 'DESC');
    return qb.getMany();
  }

  async findById(id: string) {
    return this.orderRepo.findOne({ where: { id }, relations: ['items', 'advances', 'customer'] });
  }

  async create(data: any, userId: string) {
    return AppDataSource.transaction(async (manager) => {
      // Generate order number
      let orderNum = data.order_number;
      if (!orderNum) {
        const year = new Date().getFullYear();
        const prefix = `ORD${year}`;
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
            product_description: item.product_description || '',
            quantity: item.quantity || 1,
            mrp: item.mrp,
            salesman_id: item.salesman_id || null,
          });
          await manager.save(orderItem);
        }
      }

      if (data.advances && Array.isArray(data.advances)) {
        for (const adv of data.advances) {
          const orderAdv = manager.create(SalesOrderAdvance, {
            sales_order_id: savedOrder.id,
            amount: adv.amount,
            payment_mode: adv.mode || adv.payment_mode,
            reference_number: adv.reference || adv.reference_number,
            notes: adv.notes || '',
            created_by: userId,
          });
          await manager.save(orderAdv);
        }
      }

      return savedOrder;
    });
  }

  async update(id: string, data: Record<string, any>) {
    const order = await this.orderRepo.findOneBy({ id });
    if (!order) return null;
    const allowed = ['expected_delivery_date', 'total_amount', 'notes', 'status'];
    for (const key of allowed) {
      if (data[key] !== undefined) (order as any)[key] = data[key];
    }
    return this.orderRepo.save(order);
  }

  async addAdvance(orderId: string, advances: { amount: number; payment_mode: string; reference_number?: string; notes?: string }[], userId: string) {
    return AppDataSource.transaction(async (manager) => {
      let totalAdded = 0;
      const savedAdvances = [];

      for (const data of advances) {
        const adv = manager.create(SalesOrderAdvance);
        adv.sales_order_id = orderId;
        adv.amount = data.amount;
        adv.payment_mode = (data as any).mode || data.payment_mode;
        adv.reference_number = (data as any).reference || data.reference_number;
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
}

export const salesOrderService = new SalesOrderService();
