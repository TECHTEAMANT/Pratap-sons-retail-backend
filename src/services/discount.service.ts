import { AppDataSource } from '../config/data-source';
import { DiscountMaster } from '../entities/DiscountMaster';

export class DiscountService {
  private repo = AppDataSource.getRepository(DiscountMaster);

  async findAll() {
    return this.repo.find({ order: { priority: 'DESC', created_at: 'DESC' } });
  }

  async findById(id: string) {
    return this.repo.findOneBy({ id });
  }

  async create(data: Partial<DiscountMaster>, userId: string) {
    const discount = this.repo.create({ ...data, created_by: userId });
    return this.repo.save(discount);
  }

  async update(id: string, data: Partial<DiscountMaster>) {
    const discount = await this.repo.findOneBy({ id });
    if (!discount) return null;
    Object.assign(discount, data);
    return this.repo.save(discount);
  }

  async delete(id: string) {
    const discount = await this.repo.findOneBy({ id });
    if (!discount) return null;
    await this.repo.remove(discount);
    return discount;
  }
}

export const discountService = new DiscountService();
