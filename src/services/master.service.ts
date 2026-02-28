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
  async getVendors() {
    return AppDataSource.getRepository(Vendor).find({ order: { name: 'ASC' } });
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
  async getCities() {
    return AppDataSource.getRepository(City).find({ order: { name: 'ASC' } });
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
  async getProductMasters(filters: { search?: string; product_group?: string; design_no?: string; vendor?: string }) {
    const repo = AppDataSource.getRepository(ProductMaster);
    const where: any = {};
    if (filters.product_group) where.product_group = { id: filters.product_group };
    if (filters.design_no) where.design_no = filters.design_no;
    if (filters.vendor) where.vendor = { id: filters.vendor };
    if (filters.search) where.design_no = ILike(`%${filters.search}%`);
    return repo.find({ 
      where, 
      relations: ['product_group', 'color', 'vendor', 'floor'],
      order: { created_at: 'DESC' } 
    });
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
