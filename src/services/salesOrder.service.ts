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
      const count = await manager.count(SalesOrder);
      const orderNum = `ORD${new Date().getFullYear()}${(count + 1).toString().padStart(6, '0')}`;

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

  async addAdvance(orderId: string, data: { amount: number; payment_mode: string; reference_number?: string; notes?: string }, userId: string) {
    return AppDataSource.transaction(async (manager) => {
      const adv = manager.create(SalesOrderAdvance);
      adv.sales_order_id = orderId;
      adv.amount = data.amount;
      adv.payment_mode = data.payment_mode;
      adv.reference_number = data.reference_number;
      adv.notes = data.notes;
      adv.created_by = userId;
      const savedAdv = await manager.save(adv);

      const order = await manager.findOne(SalesOrder, { where: { id: orderId } });
      if (order) {
        order.advance_received = Number(order.advance_received) + data.amount;
        order.balance_amount = Number(order.balance_amount) - data.amount;
        await manager.save(order);
      }
      return savedAdv;
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
    return repo.find({ where: filters, order: { sr_no: 'ASC' } });
  }

  async createItem(data: any) {
    const repo = AppDataSource.getRepository(SalesOrderItem);
    const item = repo.create(data);
    return repo.save(item);
  }

  async getAdvances(filters: any) {
    const repo = AppDataSource.getRepository(SalesOrderAdvance);
    return repo.find({ where: filters, order: { created_at: 'DESC' } });
  }
}

export const salesOrderService = new SalesOrderService();
