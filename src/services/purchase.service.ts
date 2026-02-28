import { AppDataSource } from '../config/data-source';
import { PurchaseOrder } from '../entities/PurchaseOrder';
import { PurchaseInvoice } from '../entities/PurchaseInvoice';
import { PurchaseOrderItem } from '../entities/PurchaseOrderItem';
import { PurchaseItem } from '../entities/PurchaseItem';

export class PurchaseService {
  private poRepo = AppDataSource.getRepository(PurchaseOrder);

  async getOrders(filters: {
    vendor?: string;
    vendor_id?: string;
    status?: string;
    search?: string;
    search_po_number?: string;
    neq_status?: string;
    sort?: string;
    order?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Number(filters.page) || 1;
    const limit = Number(filters.limit) || 20;
    const skip = (page - 1) * limit;

    const qb = this.poRepo.createQueryBuilder('po').leftJoinAndSelect('po.vendor', 'v');

    if (filters.vendor || filters.vendor_id) {
      qb.andWhere('po.vendor_id = :vid', { vid: filters.vendor || filters.vendor_id });
    }
    if (filters.status) qb.andWhere('po.status = :status', { status: filters.status });
    if (filters.neq_status) qb.andWhere('po.status != :neqStatus', { neqStatus: filters.neq_status });
    if (filters.search_po_number) {
      qb.andWhere('po.po_number ILIKE :poNum', { poNum: `${filters.search_po_number}%` });
    }
    if (filters.search) {
      qb.andWhere('(po.po_number ILIKE :s OR v.name ILIKE :s)', { s: `%${filters.search}%` });
    }

    const sortCol = filters.sort === 'order_date' ? 'po.order_date' : 'po.created_at';
    const sortDir = filters.order?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(sortCol, sortDir);
    qb.skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async getOrderById(id: string) {
    return this.poRepo.findOne({ where: { id }, relations: ['purchase_items', 'order_items', 'vendor'] });
  }

  async createOrder(data: any, userId: string) {
    const count = await this.poRepo.count();
    const defaultPoNum = `PO${new Date().getFullYear()}${(count + 1).toString().padStart(6, '0')}`;
    
    const entityData = { ...data };
    
    // Support either vendor_id or vendor payload formats
    const vendorId = data.vendor || data.vendor_id;
    if (vendorId) {
      entityData.vendor = { id: vendorId };
      delete entityData.vendor_id;
    }
    
    // Don't override frontend po_number if they provide one
    if (!entityData.po_number && !entityData.order_number) {
       entityData.po_number = defaultPoNum;
       entityData.order_number = defaultPoNum;
    }
    
    if (userId && !entityData.created_by) {
        entityData.created_by = userId;
    }

    const po = this.poRepo.create(entityData);
    return this.poRepo.save(po);
  }

  async updateOrder(id: string, data: Record<string, any>) {
    const po = await this.poRepo.findOneBy({ id });
    if (!po) return null;
    const allowed = ['status', 'taxable_value', 'manual_gst_amount', 'total_amount', 'notes', 'vendor_invoice_attachment', 'gst_difference_reason'];
    for (const key of allowed) { if (data[key] !== undefined) (po as any)[key] = data[key]; }
    return this.poRepo.save(po);
  }

  async getInvoices(filters: { vendor_id?: string }) {
    const repo = AppDataSource.getRepository(PurchaseInvoice);
    const where: any = {};
    if (filters.vendor_id) where.vendor_id = filters.vendor_id;
    return repo.find({ where, order: { created_at: 'DESC' } });
  }

  async createInvoice(data: any, userId: string) {
    const repo = AppDataSource.getRepository(PurchaseInvoice);
    const inv = repo.create({
      vendor_id: data.vendor_id,
      invoice_number: data.invoice_number,
      invoice_date: data.invoice_date,
      total_amount: data.total_amount,
      notes: data.notes || null,
      created_by: userId,
    });
    return repo.save(inv);
  }

  async getOrderItems(filters: any) {
    const repo = AppDataSource.getRepository(PurchaseOrderItem);
    return repo.find({ where: filters, order: { created_at: 'ASC' } });
  }

  async getPurchaseItems(filters: any) {
    const repo = AppDataSource.getRepository(PurchaseItem);
    return repo.find({ 
      where: filters, 
      relations: ['product_group', 'color', 'size'],
      order: { created_at: 'ASC' } 
    });
  }

  async createPurchaseItem(data: any) {
    const repo = AppDataSource.getRepository(PurchaseItem);
    
    // Map frontend property names to TypeORM relation column keys
    const entityData = { ...data };
    if (data.product_group) {
        entityData.product_group_id = data.product_group;
        delete entityData.product_group;
    }
    if (data.size) {
        entityData.size_id = data.size;
        delete entityData.size;
    }
    if (data.color) {
        entityData.color_id = data.color;
        delete entityData.color;
    }
    
    const item = repo.create(entityData);
    return repo.save(item);
  }

  async deletePurchaseItems(filters: any) {
    const repo = AppDataSource.getRepository(PurchaseItem);
    // Safety check: don't delete everything if no filters
    if (!filters || Object.keys(filters).length === 0) throw new Error('Delete filters required');
    return repo.delete(filters);
  }

  async createOrderItem(data: any) {
    const repo = AppDataSource.getRepository(PurchaseOrderItem);
    const item = repo.create(data);
    return repo.save(item);
  }
}

export const purchaseService = new PurchaseService();
