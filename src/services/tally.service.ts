import { AppDataSource } from '../config/data-source';
import { TallySync } from '../entities/TallySync';

export class TallyService {
  private repo = AppDataSource.getRepository(TallySync);

  async getPending() {
    return this.findAll({ sync_status: 'pending' });
  }

  async create(data: any) {
    if (data.sync_type && !data.record_type) data.record_type = data.sync_type;
    if (data.purchase_order_id && !data.po_id) data.po_id = data.purchase_order_id;
    const record = this.repo.create(data);
    return this.repo.save(record);
  }

  async createBulk(dataArray: any[]) {
    for (const data of dataArray) {
      if (data.sync_type && !data.record_type) data.record_type = data.sync_type;
      if (data.purchase_order_id && !data.po_id) data.po_id = data.purchase_order_id;
    }
    const records = this.repo.create(dataArray);
    // save() automatically uses a transaction and batch inserts when given an array
    return this.repo.save(records);
  }

  async updateStatus(id: string, status: string, errorMessage?: string) {
    const record = await this.repo.findOneBy({ id });
    if (!record) return null;
    record.sync_status = status;
    if (errorMessage) {
      record.error_message = errorMessage;
    }
    if (status === 'synced') {
      record.synced_at = new Date();
    }
    return this.repo.save(record);
  }

  async findAll(filters: any) {
    const qb = this.repo.createQueryBuilder('ts');
    
    // Support both record_type and sync_type
    const type = filters.record_type || filters.sync_type;
    if (type) {
      if (typeof type === 'string' && type.includes(',')) {
        const types = type.split(',').map(t => t.trim());
        qb.andWhere('ts.record_type IN (:...rts)', { rts: types });
      } else {
        qb.andWhere('ts.record_type = :rt', { rt: type });
      }
    }
    
    // Support both sync_status and status
    const status = filters.sync_status || filters.status;
    if (status) qb.andWhere('ts.sync_status = :ss', { ss: status });
    
    // Support relation IDs for deduplication checks
    if (filters.invoice_id) qb.andWhere('ts.invoice_id = :iid', { iid: filters.invoice_id });
    
    const poId = filters.purchase_order_id || filters.po_id;
    if (poId) qb.andWhere('ts.po_id = :poid', { poid: poId });
    
    if (filters.start_date) qb.andWhere('ts.invoice_date >= :start', { start: filters.start_date });
    if (filters.end_date) qb.andWhere('ts.invoice_date <= :end', { end: filters.end_date });
    
    // Handle dynamic sorting
    if (filters.sort) {
      qb.orderBy(`ts.${filters.sort}`, filters.order?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC');
    } else {
      qb.orderBy('ts.created_at', 'DESC');
    }
    
    return qb.getMany();
  }

  async markSynced(id: string) {
    const record = await this.repo.findOneBy({ id });
    if (!record) return null;
    record.sync_status = 'synced';
    record.synced_at = new Date();
    return this.repo.save(record);
  }

  async markFailed(id: string, errorMessage: string) {
    const record = await this.repo.findOneBy({ id });
    if (!record) return null;
    record.sync_status = 'failed';
    record.error_message = errorMessage;
    return this.repo.save(record);
  }

  async getExportData(filters: { sync_status?: string; record_type?: string }) {
    const records = await this.findAll(filters);
    return {
      records,
      exportDate: new Date().toISOString(),
      totalRecords: records.length,
    };
  }

  async deleteByType(recordType: string) {
    if (recordType.includes(',')) {
      const types = recordType.split(',').map(t => t.trim());
      return this.repo.createQueryBuilder()
        .delete()
        .from(TallySync)
        .where('record_type IN (:...rts)', { rts: types })
        .execute();
    }
    return this.repo.delete({ record_type: recordType });
  }
}

export const tallyService = new TallyService();
