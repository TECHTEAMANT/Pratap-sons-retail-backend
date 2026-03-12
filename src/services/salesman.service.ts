import { AppDataSource } from '../config/data-source';
import { Salesman } from '../entities/Salesman';
import { ILike } from 'typeorm';

export class SalesmanService {
  private salesmanRepo = AppDataSource.getRepository(Salesman);

  async findAll(filters: { search?: string; active?: string; page?: number; limit?: number; sort?: string; order?: 'ASC' | 'DESC' }) {
    const page = Number(filters.page) || 1;
    const limit = Number(filters.limit) || 50;
    const skip = (page - 1) * limit;
    const sort = filters.sort || 'name';
    const order = (filters.order || 'ASC').toUpperCase() as 'ASC' | 'DESC';

    const qb = this.salesmanRepo.createQueryBuilder('s');

    if (filters.active !== undefined) {
      qb.andWhere('s.active = :active', { active: filters.active === 'true' });
    }

    if (filters.search) {
      qb.andWhere('(s.name ILIKE :search OR s.salesman_code ILIKE :search)', { search: `%${filters.search}%` });
    }

    qb.orderBy(`s.${sort}`, order).skip(skip).take(limit);
    
    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findById(id: string) {
    return this.salesmanRepo.findOneBy({ id });
  }

  async create(data: Partial<Salesman>) {
    const salesman = this.salesmanRepo.create(data);
    return this.salesmanRepo.save(salesman);
  }

  async update(id: string, data: Partial<Salesman>) {
    const salesman = await this.salesmanRepo.findOneBy({ id });
    if (!salesman) return null;
    Object.assign(salesman, data);
    return this.salesmanRepo.save(salesman);
  }

  async getNextCode(): Promise<string> {
    const lastSalesman = await this.salesmanRepo.find({
      order: { salesman_code: 'DESC' },
      take: 1,
    });

    if (lastSalesman.length === 0) return 'PSHE1';

    const lastCode = lastSalesman[0].salesman_code;
    const match = lastCode.match(/\d+$/);
    const nextNum = match ? parseInt(match[0]) + 1 : 1;
    return `PSHE${nextNum}`;
  }
}

export const salesmanService = new SalesmanService();
