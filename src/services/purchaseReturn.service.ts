import { AppDataSource } from '../config/data-source';
import { PurchaseReturn } from '../entities/PurchaseReturn';

export class PurchaseReturnService {
  private repo = AppDataSource.getRepository(PurchaseReturn);

  async findAll(filters: { vendor_id?: string; status?: string }) {
    const qb = this.repo.createQueryBuilder('pr').leftJoinAndSelect('pr.vendor', 'v');
    if (filters.vendor_id) qb.andWhere('pr.vendor_id = :vid', { vid: filters.vendor_id });
    if (filters.status) qb.andWhere('pr.status = :status', { status: filters.status });
    qb.orderBy('pr.created_at', 'DESC');
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
      reason: data.reason || null,
      notes: data.notes || null,
      created_by: userId,
    });
    return this.repo.save(ret);
  }

  async update(id: string, data: Record<string, any>) {
    const ret = await this.repo.findOneBy({ id });
    if (!ret) return null;
    const allowed = ['status', 'total_items', 'total_amount', 'reason', 'notes'];
    for (const key of allowed) { if (data[key] !== undefined) (ret as any)[key] = data[key]; }
    return this.repo.save(ret);
  }
}

export const purchaseReturnService = new PurchaseReturnService();
