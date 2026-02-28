import { AppDataSource } from '../config/data-source';
import { PayoutCode } from '../entities/PayoutCode';
import { CommissionSlab } from '../entities/CommissionSlab';

export class CommissionService {
  // ===== Payout Codes =====
  async getPayoutCodes() {
    return AppDataSource.getRepository(PayoutCode).find({ order: { payout_code: 'ASC' } });
  }

  async createPayoutCode(data: Partial<PayoutCode>) {
    const repo = AppDataSource.getRepository(PayoutCode);
    return repo.save(repo.create(data));
  }

  async updatePayoutCode(id: string, data: Partial<PayoutCode>) {
    const repo = AppDataSource.getRepository(PayoutCode);
    const item = await repo.findOneBy({ id });
    if (!item) return null;
    Object.assign(item, data);
    return repo.save(item);
  }

  async deletePayoutCode(id: string) {
    const repo = AppDataSource.getRepository(PayoutCode);
    const item = await repo.findOneBy({ id });
    if (!item) return null;
    await repo.remove(item);
    return item;
  }

  // ===== Commission Slabs =====
  async getSlabs(payoutCodeId?: string) {
    const repo = AppDataSource.getRepository(CommissionSlab);
    const where: any = {};
    if (payoutCodeId) where.payout_code_id = payoutCodeId;
    return repo.find({ where, relations: ['payoutCode'], order: { min_amount: 'ASC' } });
  }

  async createSlab(data: Partial<CommissionSlab>) {
    const repo = AppDataSource.getRepository(CommissionSlab);
    return repo.save(repo.create(data));
  }

  async updateSlab(id: string, data: Partial<CommissionSlab>) {
    const repo = AppDataSource.getRepository(CommissionSlab);
    const item = await repo.findOneBy({ id });
    if (!item) return null;
    Object.assign(item, data);
    return repo.save(item);
  }

  async deleteSlab(id: string) {
    const repo = AppDataSource.getRepository(CommissionSlab);
    const item = await repo.findOneBy({ id });
    if (!item) return null;
    await repo.remove(item);
    return item;
  }
}

export const commissionService = new CommissionService();
