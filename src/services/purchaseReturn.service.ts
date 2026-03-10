import { AppDataSource } from '../config/data-source';
import { PurchaseReturn } from '../entities/PurchaseReturn';
import { PurchaseReturnItem } from '../entities/PurchaseReturnItem';
import { In } from 'typeorm';

export class PurchaseReturnService {
  private repo = AppDataSource.getRepository(PurchaseReturn);

  async findAll(filters: { vendor_id?: string; status?: string }) {
    const qb = this.repo.createQueryBuilder('pr')
      .leftJoinAndSelect('pr.vendor', 'v')
      .leftJoinAndSelect('pr.original_po', 'po');
    if (filters.vendor_id) qb.andWhere('pr.vendor_id = :vid', { vid: filters.vendor_id });
    if (filters.status) {
      // Support comma-separated multi-value from shim's .in() call
      const statusValues = filters.status.includes(',')
        ? filters.status.split(',')
        : [filters.status];
      qb.andWhere('pr.status IN (:...statuses)', { statuses: statusValues });
    }
    qb.orderBy('pr.created_at', 'DESC');
    return qb.getMany();
  }

  async findById(id: string) {
    return this.repo.createQueryBuilder('pr')
      .leftJoinAndSelect('pr.vendor', 'v')
      .leftJoinAndSelect('pr.original_po', 'po')
      .leftJoin('users', 'u', 'u.id = pr.created_by')
      .addSelect('u.name', 'pr_created_by_name')
      .where('pr.id = :id', { id })
      .getOne()
      .then(res => {
        if (res && (res as any).pr_created_by_name) {
          (res as any).created_by_user = { name: (res as any).pr_created_by_name };
        }
        return res;
      });
  }

  async findAllItems(filters: any) {
    const qb = AppDataSource.getRepository(PurchaseReturnItem).createQueryBuilder('pri')
      .leftJoinAndSelect('pri.purchase_return', 'pr');
      
    if (filters['gte_purchase_return.return_date']) {
      qb.andWhere('DATE(pr.return_date) >= :gte', { gte: filters['gte_purchase_return.return_date'] });
    }
    if (filters['lte_purchase_return.return_date']) {
      qb.andWhere('DATE(pr.return_date) <= :lte', { lte: filters['lte_purchase_return.return_date'] });
    }
    if (filters.return_id) {
      if (filters.return_id.includes(',')) {
        qb.andWhere('pri.return_id IN (:...returnIds)', { returnIds: filters.return_id.split(',') });
      } else {
        qb.andWhere('pri.return_id = :returnId', { returnId: filters.return_id });
      }
    }

    // Always join item details for returns (often needed for invoices/analysis)
    qb.leftJoinAndSelect('pri.item', 'item')
      .leftJoinAndSelect('item.product_group', 'pg')
      .leftJoinAndSelect('item.color', 'c')
      .leftJoinAndSelect('item.size', 's');
    
    return qb.getMany();
  }

  async create(data: any, userId: string) {
    const count = await this.repo.count();
    const retNum = `PRET${new Date().getFullYear()}${(count + 1).toString().padStart(6, '0')}`;
    const ret = this.repo.create({
      return_number: retNum,
      vendor_id: data.vendor_id,
      original_po_id: data.original_po_id || null,
      return_date: data.return_date,
      total_items: data.total_items || 0,
      total_amount: data.total_amount || 0,
      gst_type: data.gst_type || null,
      cgst_amount: data.cgst_amount || 0,
      sgst_amount: data.sgst_amount || 0,
      igst_amount: data.igst_amount || 0,
      total_return_amount: data.total_return_amount || 0,
      reason: data.reason || null,
      notes: data.notes || null,
      status: data.status || 'sent',
      created_by: userId,
    });
    return this.repo.save(ret);
  }

  async createItem(data: any) {
    const itemRepo = AppDataSource.getRepository(PurchaseReturnItem);
    const item = itemRepo.create({
      return_id: data.return_id,
      item_id: data.item_id,
      barcode_id: data.barcode_id,
      reason: data.reason || null,
      condition: data.condition || null,
      cost: data.cost || 0,
      hsn_code: data.hsn_code || null,
    });
    return itemRepo.save(item);
  }

  async update(id: string, data: Record<string, any>) {
    const ret = await this.repo.findOneBy({ id });
    if (!ret) return null;
    const allowed = [
      'status', 'total_items', 'total_amount', 'reason', 'notes',
      'gst_type', 'cgst_amount', 'sgst_amount', 'igst_amount', 'total_return_amount'
    ];
    for (const key of allowed) { if (data[key] !== undefined) (ret as any)[key] = data[key]; }
    return this.repo.save(ret);
  }
}

export const purchaseReturnService = new PurchaseReturnService();
