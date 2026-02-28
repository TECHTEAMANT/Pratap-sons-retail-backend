import { AppDataSource } from '../config/data-source';
import { BarcodeBatch } from '../entities/BarcodeBatch';
import { BarcodeSequence } from '../entities/BarcodeSequence';
import { encodeCost } from '../utils/costEncoding';
import { ILike } from 'typeorm';
import logger from '../utils/logger';

export class InventoryService {
  private batchRepo = AppDataSource.getRepository(BarcodeBatch);
  private seqRepo = AppDataSource.getRepository(BarcodeSequence);

  async findAll(filters: { status?: string; vendor?: string; product_group?: string; floor?: string; search?: string; page?: number; limit?: number; po_id?: string; design_no?: string; size?: string; color?: string; is_color?: string }) {
    const page = filters.page || 1;
    const limit = filters.limit || 1000;
    const skip = (page - 1) * limit;

    const qb = this.batchRepo.createQueryBuilder('bb')
      .leftJoinAndSelect('bb.product_group', 'pg')
      .leftJoinAndSelect('bb.size', 'sz')
      .leftJoinAndSelect('bb.color', 'cl')
      .leftJoinAndSelect('bb.vendor', 'vd')
      .leftJoinAndSelect('bb.floor', 'fl');

    if (filters.po_id) qb.andWhere('bb.po_id = :po_id', { po_id: filters.po_id });
    if (filters.status) qb.andWhere('bb.status = :status', { status: filters.status });
    if (filters.vendor) qb.andWhere('bb.vendor_id = :vendor', { vendor: filters.vendor });
    if (filters.product_group) qb.andWhere('bb.product_group_id = :pg', { pg: filters.product_group });
    if (filters.floor) qb.andWhere('bb.floor_id = :floor', { floor: filters.floor });
    
    // Support exact batch matching for Purchase Invoices 
    if (filters.design_no) qb.andWhere('bb.design_no = :design_no', { design_no: filters.design_no });
    if (filters.size) qb.andWhere('bb.size_id = :size', { size: filters.size });
    if (filters.color) qb.andWhere('bb.color_id = :color', { color: filters.color });
    if (filters.is_color === 'null') qb.andWhere('bb.color_id IS NULL');

    if (filters.search) {
      qb.andWhere('(bb.barcode_alias_8digit ILIKE :search OR bb.design_no ILIKE :search OR vd.name ILIKE :search)', { search: `%${filters.search}%` });
    }

    qb.orderBy('bb.created_at', 'DESC').skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  /**
   * Returns inventory already grouped by (design_no, vendor, product_group, color).
   * The DB does the heavy aggregation — no raw-row fan-out to the frontend.
   */
  async getGrouped(filters: { search?: string; page?: number; limit?: number }) {
    const page = Number(filters.page) || 1;
    const limit = Number(filters.limit) || 20;
    const offset = (page - 1) * limit;

    const db = AppDataSource;

    // Build search condition
    const searchParam = filters.search ? `%${filters.search.toLowerCase()}%` : null;
    const searchCond = searchParam
      ? `AND (LOWER(bb.design_no) LIKE $1 OR LOWER(vd.name) LIKE $1 OR LOWER(vd.vendor_code) LIKE $1 OR LOWER(pg.name) LIKE $1 OR LOWER(cl.name) LIKE $1 OR bb.barcode_alias_8digit LIKE $1)`
      : '';

    // Count distinct groups for pagination
    const countSql = `
      SELECT COUNT(*) AS total FROM (
        SELECT bb.design_no, bb.vendor, bb.product_group, bb.color
        FROM barcode_batches bb
        LEFT JOIN vendors vd ON vd.id = bb.vendor
        LEFT JOIN product_groups pg ON pg.id = bb.product_group
        LEFT JOIN colors cl ON cl.id = bb.color
        WHERE bb.status = 'active' ${searchCond}
        GROUP BY bb.design_no, bb.vendor, bb.product_group, bb.color
      ) g
    `;

    const dataSql = `
      SELECT
        bb.design_no,
        vd.id          AS vendor_id,
        vd.name        AS vendor_name,
        vd.vendor_code AS vendor_code,
        pg.id          AS product_group_id,
        pg.name        AS product_group_name,
        cl.id          AS color_id,
        cl.name        AS color_name,
        SUM(bb.available_quantity) AS total_available,
        SUM(bb.total_quantity)     AS total_quantity,
        MAX(bb.mrp)                AS mrp,
        MAX(bb.cost_actual)        AS cost,
        MAX(bb.order_number)       AS order_number,
        MAX(bb.gst_logic)          AS gst_logic,
        MAX(bb.mrp_markup_percent) AS mrp_markup_percent,
        MAX(bb.hsn_code)           AS hsn_code,
        MAX(bb.description)        AS description,
        ARRAY_AGG(DISTINCT photo_elem) FILTER (WHERE photo_elem IS NOT NULL) AS images,
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'batch_id',      bb.id,
            'size_id',       sz.id,
            'size_name',     COALESCE(sz.name, 'Unknown'),
            'barcode_8digit',bb.barcode_alias_8digit,
            'available',     bb.available_quantity,
            'total',         bb.total_quantity,
            'floor_name',    COALESCE(fl.name, 'Unassigned'),
            'floor_id',      COALESCE(fl.id::text, ''),
            'defective_qty', COALESCE(def_agg.defective_qty, 0)
          ) ORDER BY sz.sort_order NULLS LAST
        ) AS sizes
      FROM barcode_batches bb
      LEFT JOIN vendors        vd  ON vd.id  = bb.vendor
      LEFT JOIN product_groups pg  ON pg.id  = bb.product_group
      LEFT JOIN colors         cl  ON cl.id  = bb.color
      LEFT JOIN sizes          sz  ON sz.id  = bb.size
      LEFT JOIN floors         fl  ON fl.id  = bb.floor
      LEFT JOIN LATERAL UNNEST(COALESCE(bb.photos, ARRAY[]::text[])) AS photo_elem ON TRUE
      LEFT JOIN (
        SELECT barcode_batch_id, SUM(quantity) AS defective_qty
        FROM   defective_stock
        GROUP  BY barcode_batch_id
      ) AS def_agg ON def_agg.barcode_batch_id = bb.id
      WHERE bb.status = 'active' ${searchCond}
      GROUP BY bb.design_no, vd.id, vd.name, vd.vendor_code, pg.id, pg.name, cl.id, cl.name
      ORDER BY MAX(bb.created_at) DESC
      LIMIT $${searchParam ? '2' : '1'} OFFSET $${searchParam ? '3' : '2'}
    `;

    const params = searchParam
      ? [searchParam, limit, offset]
      : [limit, offset];

    const [countRes, dataRes] = await Promise.all([
      db.query(countSql, searchParam ? [searchParam] : []),
      db.query(dataSql, params),
    ]);

    const total = parseInt(countRes[0]?.total || '0', 10);
    return { data: dataRes, total, page, limit };
  }

  async findById(id: string) {
    return this.batchRepo.findOne({ where: { id }, relations: ['printLogs'] });
  }

  async searchByBarcode(barcode: string) {
    if (!barcode) return [];
    return this.batchRepo.find({
      where: [
        { barcode_alias_8digit: ILike(`%${barcode}%`) },
        { barcode_structured: ILike(`%${barcode}%`) },
      ],
      take: 20,
    });
  }

  async create(data: any, userId: string) {
    return AppDataSource.transaction(async (manager) => {
      // Get and increment barcode sequence
      let seq = await manager.findOne(BarcodeSequence, { where: { id: 1 } });
      if (!seq) {
        seq = manager.create(BarcodeSequence, { id: 1, last_number: 10000000 });
      }
      const nextNumber = Number(seq.last_number) + 1;
      seq.last_number = nextNumber;
      await manager.save(seq);

      const alias = nextNumber.toString().padStart(8, '0');

      // Build structured barcode
      const parts = [data.vendor || '', data.design_no || '', data.size || '', data.color || ''];
      const structured = parts.join('-') + `-${alias}`;

      // Encode cost
      const costEncoded = data.cost_actual ? encodeCost(data.cost_actual) : null;

      const batch = manager.create(BarcodeBatch, ({
        barcode_alias_8digit: alias || '',
        barcode_structured: structured,
        design_no: data.design_no || '',
        product_group_id: data.product_group || undefined,
        size_id: data.size || undefined,
        color_id: data.color || undefined,
        vendor_id: data.vendor || undefined,
        payout_code: data.payout_code || undefined,
        cost_actual: data.cost_actual || 0,
        cost_encoded: costEncoded || undefined,
        mrp: data.mrp || 0,
        hsn_code: data.hsn_code || null,
        gst_logic: data.gst_logic || 'AUTO_5_18',
        total_quantity: data.total_quantity || 0,
        available_quantity: data.total_quantity || 0,
        print_quantity: data.print_quantity || null,
        floor_id: data.floor || null,
        po_id: data.po_id || null,
        description: data.description || null,
        created_by: userId,
      } as any));

      const saved = await manager.save(batch);
      logger.info(`Created barcode batch: ${alias}`, { design: data.design_no, qty: data.total_quantity });
      return saved;
    });
  }

  async update(id: string, data: Record<string, any>, userId: string) {
    const batch = await this.batchRepo.findOneBy({ id });
    if (!batch) return null;

    // Handle string IDs safely mapping to TypeORM foreign keys
    if (data.product_group) { batch.product_group_id = data.product_group; delete data.product_group; }
    if (data.size) { batch.size_id = data.size; delete data.size; }
    if (data.color) { batch.color_id = data.color; delete data.color; }
    if (data.vendor) { batch.vendor_id = data.vendor; delete data.vendor; }
    if (data.floor) { batch.floor_id = data.floor; delete data.floor; }

    const allowed = ['design_no', 'payout_code', 'cost_actual', 'mrp', 'mrp_markup_percent', 'hsn_code', 'gst_logic', 'discount_type', 'discount_value', 'discount_start_date', 'discount_end_date', 'status', 'description', 'photos', 'print_quantity', 'order_number', 'po_id', 'total_quantity', 'available_quantity'];
    for (const key of allowed) {
      if (data[key] !== undefined) (batch as any)[key] = data[key];
    }

    if (data.cost_actual !== undefined) {
      batch.cost_encoded = encodeCost(data.cost_actual);
    }
    batch.modified_by = userId;

    return this.batchRepo.save(batch);
  }

  async adjustQuantity(id: string, adjustment: number, userId: string) {
    const batch = await this.batchRepo.findOneBy({ id });
    if (!batch) return null;

    batch.available_quantity += adjustment;
    if (batch.available_quantity < 0) batch.available_quantity = 0;
    batch.modified_by = userId;

    return this.batchRepo.save(batch);
  }

  async moveToFloor(id: string, floorId: string, userId: string) {
    const batch = await this.batchRepo.findOneBy({ id });
    if (!batch) return null;

    batch.floor_id = floorId;
    batch.modified_by = userId;

    return this.batchRepo.save(batch);
  }
}

export const inventoryService = new InventoryService();
