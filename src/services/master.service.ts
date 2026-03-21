import { AppDataSource } from '../config/data-source';
import { ProductGroup } from '../entities/ProductGroup';
import { Size } from '../entities/Size';
import { Color } from '../entities/Color';
import { Vendor } from '../entities/Vendor';
import { Floor } from '../entities/Floor';
import { City } from '../entities/City';
import { ProductMaster } from '../entities/ProductMaster';
import { BarcodePrintLog } from '../entities/BarcodePrintLog';
import { ILike } from 'typeorm';

export class MasterService {
  // ===== Product Groups =====
  async getProductGroups() {
    return AppDataSource.getRepository(ProductGroup).find({ order: { name: 'ASC' } });
  }
  async createProductGroup(data: Partial<ProductGroup>) {
    const repo = AppDataSource.getRepository(ProductGroup);
    return repo.save(repo.create(data));
  }
  async updateProductGroup(id: string, data: Partial<ProductGroup>) {
    const repo = AppDataSource.getRepository(ProductGroup);
    const item = await repo.findOneBy({ id });
    if (!item) return null;
    Object.assign(item, data);
    return repo.save(item);
  }

  // ===== Sizes =====
  async getSizes() {
    return AppDataSource.getRepository(Size).find({ order: { sort_order: 'ASC' } });
  }
  async createSize(data: Partial<Size>) {
    const repo = AppDataSource.getRepository(Size);
    return repo.save(repo.create(data));
  }
  async updateSize(id: string, data: Partial<Size>) {
    const repo = AppDataSource.getRepository(Size);
    const item = await repo.findOneBy({ id });
    if (!item) return null;
    Object.assign(item, data);
    return repo.save(item);
  }

  // ===== Colors =====
  async getColors() {
    return AppDataSource.getRepository(Color).find({ order: { name: 'ASC' } });
  }
  async createColor(data: Partial<Color>) {
    const repo = AppDataSource.getRepository(Color);
    return repo.save(repo.create(data));
  }
  async updateColor(id: string, data: Partial<Color>) {
    const repo = AppDataSource.getRepository(Color);
    const item = await repo.findOneBy({ id });
    if (!item) return null;
    Object.assign(item, data);
    return repo.save(item);
  }

  // ===== Vendors =====
  async getVendors(filters?: { search_vendor_code?: string; tally_sync?: string | boolean }) {
    const repo = AppDataSource.getRepository(Vendor);
    const where: any = {};
    if (filters?.search_vendor_code) {
      where.vendor_code = ILike(`${filters.search_vendor_code}%`);
    }
    if (filters?.tally_sync !== undefined) {
      where.tally_sync = filters.tally_sync === 'true' || filters.tally_sync === true;
    }
    return repo.find({ where, relations: ['city'], order: { vendor_code: 'ASC' } });
  }
  async getVendorById(id: string) {
    return AppDataSource.getRepository(Vendor).findOne({ where: { id }, relations: ['city'] });
  }
  async createVendor(data: Partial<Vendor>) {
    const repo = AppDataSource.getRepository(Vendor);
    return repo.save(repo.create(data));
  }
  async updateVendor(id: string, data: Partial<Vendor>) {
    const repo = AppDataSource.getRepository(Vendor);
    const item = await repo.findOneBy({ id });
    if (!item) return null;
    Object.assign(item, data);
    return repo.save(item);
  }

  async bulkUpdateVendors(query: any, data: Partial<Vendor>) {
    const repo = AppDataSource.getRepository(Vendor);
    const where: any = {};
    if (query.tally_sync === 'true') where.tally_sync = true;
    if (query.tally_sync === 'false') where.tally_sync = false;
    
    if (Object.keys(where).length === 0) {
      throw new Error("Bulk update requires valid query parameters");
    }
    
    await repo.update(where, data);
    return { success: true };
  }

  // ===== Floors =====
  async getFloors() {
    return AppDataSource.getRepository(Floor).find({ order: { name: 'ASC' } });
  }
  async createFloor(data: Partial<Floor>) {
    const repo = AppDataSource.getRepository(Floor);
    return repo.save(repo.create(data));
  }
  async updateFloor(id: string, data: Partial<Floor>) {
    const repo = AppDataSource.getRepository(Floor);
    const item = await repo.findOneBy({ id });
    if (!item) return null;
    Object.assign(item, data);
    return repo.save(item);
  }

  // ===== Cities =====
  async getCities(filters?: { sort?: string; order?: string; active?: string; city_code?: string }) {
    const repo = AppDataSource.getRepository(City);
    const where: any = {};

    // Filter by active if explicitly requested
    if (filters?.active === 'true') where.active = true;

    // Filter by city_code if provided (used for duplicate-checking from frontend)
    if (filters?.city_code) where.city_code = filters.city_code.toUpperCase();

    // Safe sort column whitelist
    const allowedSortCols = ['name', 'city_code', 'state', 'created_at'];
    const sortCol = (filters?.sort && allowedSortCols.includes(filters.sort)) ? filters.sort : 'name';
    const sortDir = filters?.order?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    try {
      return await repo.find({ where, order: { [sortCol]: sortDir } as any });
    } catch {
      // Fallback if column doesn't exist in DB yet (e.g. city_code on older production)
      return repo.find({ where: { active: true }, order: { name: 'ASC' } });
    }
  }
  async createCity(data: Partial<City>) {
    const repo = AppDataSource.getRepository(City);
    return repo.save(repo.create(data));
  }
  async updateCity(id: string, data: Partial<City>) {
    const repo = AppDataSource.getRepository(City);
    const item = await repo.findOneBy({ id });
    if (!item) return null;
    Object.assign(item, data);
    return repo.save(item);
  }

  // ===== Product Masters =====
  async getProductMasters(filters: { search?: string; product_group?: string; design_no?: string; vendor?: string; page?: string | number; limit?: string | number }) {
    const repo = AppDataSource.getRepository(ProductMaster);
    const page = parseInt(filters.page?.toString() || '1', 10);
    const limit = parseInt(filters.limit?.toString() || '50', 10);
    const skip = (page - 1) * limit;

    const query = repo.createQueryBuilder('pm')
      .leftJoinAndSelect('pm.product_group', 'pg')
      .leftJoinAndSelect('pm.color', 'cl')
      .leftJoinAndSelect('pm.vendor', 'vd')
      .leftJoinAndSelect('pm.floor', 'fl');

    if (filters.product_group) query.andWhere('pm.product_group = :pg', { pg: filters.product_group });
    if (filters.design_no) query.andWhere('pm.design_no = :design', { design: filters.design_no });
    if (filters.vendor) query.andWhere('pm.vendor = :vendor', { vendor: filters.vendor });
    if (filters.search) query.andWhere('pm.design_no ILIKE :search', { search: `%${filters.search}%` });

    query.orderBy('pm.created_at', 'DESC')
         .skip(skip)
         .take(limit);

    const [data, total] = await query.getManyAndCount();
    return { data, total, page, limit };
  }
  async createProductMaster(data: any) {
    const repo = AppDataSource.getRepository(ProductMaster);
    const entityData = { ...data };
    if (typeof data.product_group === 'string') entityData.product_group = { id: data.product_group };
    if (typeof data.vendor === 'string') entityData.vendor = { id: data.vendor };
    if (typeof data.color === 'string') entityData.color = { id: data.color };
    if (typeof data.floor === 'string') entityData.floor = { id: data.floor };
    return repo.save(repo.create(entityData));
  }
  async updateProductMaster(id: string, data: any) {
    const repo = AppDataSource.getRepository(ProductMaster);
    const item = await repo.findOneBy({ id });
    if (!item) return null;
    
    const entityData = { ...data };
    if (typeof data.product_group === 'string') entityData.product_group = { id: data.product_group };
    if (typeof data.vendor === 'string') entityData.vendor = { id: data.vendor };
    if (typeof data.color === 'string') entityData.color = { id: data.color };
    if (typeof data.floor === 'string') entityData.floor = { id: data.floor };
    
    Object.assign(item, entityData);
    return repo.save(item);
  }

  // ===== Barcode Print Logs =====
  async getBarcodePrintLogs() {
    return AppDataSource.getRepository(BarcodePrintLog).find({ order: { printed_at: 'DESC' }, take: 100 });
  }
  async createBarcodePrintLog(data: Partial<BarcodePrintLog>) {
    const repo = AppDataSource.getRepository(BarcodePrintLog);
    return repo.save(repo.create(data));
  }
}

export const masterService = new MasterService();
