import { AppDataSource } from '../config/data-source';
import { BarcodeBatch } from '../entities/BarcodeBatch';
import { BarcodeSequence } from '../entities/BarcodeSequence';
import { encodeCost } from '../utils/costEncoding';
import { ILike } from 'typeorm';
import logger from '../utils/logger';

export class InventoryService {
  private batchRepo = AppDataSource.getRepository(BarcodeBatch);
  private seqRepo = AppDataSource.getRepository(BarcodeSequence);

  async findAll(filters: {
    status?: string; vendor?: string; product_group?: string; floor?: string;
    search?: string; page?: number; limit?: number; offset?: number;
    po_id?: string; design_no?: string; size?: string; color?: string; is_color?: string;
    search_barcode_alias_8digit?: string; search_design_no?: string;
    barcode_alias_8digit?: string;
    id?: string;
    sort?: string; order?: string;
    gte_created_at?: string; lte_created_at?: string;
    min_quantity?: string | number;
  }) {
    const page = filters.page || 1;
    const limit = filters.limit || 50; 
    // Support both offset (from range()) and page-based pagination
    const skip = filters.offset !== undefined ? filters.offset : (page - 1) * limit;

    const qb = this.batchRepo.createQueryBuilder('bb')
      .leftJoinAndSelect('bb.product_group', 'pg')
      .leftJoinAndSelect('bb.size', 'sz')
      .leftJoinAndSelect('bb.color', 'cl')
      .leftJoinAndSelect('bb.vendor', 'vd')
      .leftJoinAndSelect('bb.floor', 'fl');

    if (filters.id) {
      const ids = filters.id.split(',').filter(Boolean);
      if (ids.length > 0) {
        qb.andWhere('bb.id IN (:...ids)', { ids });
      }
    }

    if (filters.po_id) {
      const ids = filters.po_id.split(',').filter(Boolean);
      if (ids.length > 1) {
        qb.andWhere('bb.po_id IN (:...poIds)', { poIds: ids });
      } else {
        qb.andWhere('bb.po_id = :po_id', { po_id: filters.po_id });
      }
    }
    
    if (filters.status) {
      const statuses = filters.status.split(',').filter(Boolean);
      if (statuses.length > 1) {
        qb.andWhere('bb.status IN (:...statuses)', { statuses });
      } else {
        qb.andWhere('bb.status = :status', { status: filters.status });
      }
    }

    if (filters.vendor) {
      const vendorIds = filters.vendor.split(',').filter(Boolean);
      if (vendorIds.length > 1) {
        qb.andWhere('bb.vendor_id IN (:...vIds)', { vIds: vendorIds });
      } else {
        qb.andWhere('bb.vendor_id = :vendor', { vendor: filters.vendor });
      }
    }
    if (filters.product_group) {
      const ids = filters.product_group.split(',').filter(Boolean);
      if (ids.length > 1) {
        qb.andWhere('bb.product_group_id IN (:...pgIds)', { pgIds: ids });
      } else {
        qb.andWhere('bb.product_group_id = :pg', { pg: filters.product_group });
      }
    }

    if (filters.floor) {
      const ids = filters.floor.split(',').filter(Boolean);
      if (ids.length > 1) {
        qb.andWhere('bb.floor_id IN (:...flIds)', { flIds: ids });
      } else {
        qb.andWhere('bb.floor_id = :floor', { floor: filters.floor });
      }
    }

    if (filters.design_no) qb.andWhere('bb.design_no = :design_no', { design_no: filters.design_no });

    if (filters.size) {
      const ids = filters.size.split(',').filter(Boolean);
      if (ids.length > 1) {
        qb.andWhere('bb.size_id IN (:...szIds)', { szIds: ids });
      } else {
        qb.andWhere('bb.size_id = :size', { size: filters.size });
      }
    }

    if (filters.color) {
      const ids = filters.color.split(',').filter(Boolean);
      if (ids.length > 1) {
        qb.andWhere('bb.color_id IN (:...clIds)', { clIds: ids });
      } else {
        qb.andWhere('bb.color_id = :color', { color: filters.color });
      }
    }
    if (filters.is_color === 'null') qb.andWhere('bb.color_id IS NULL');
    if (filters.barcode_alias_8digit) {
      const barcodes = filters.barcode_alias_8digit.split(',').map((b: string) => b.trim()).filter(Boolean);
      if (barcodes.length === 1) {
        qb.andWhere('bb.barcode_alias_8digit = :exact_bc', { exact_bc: barcodes[0] });
      } else if (barcodes.length > 1) {
        qb.andWhere('bb.barcode_alias_8digit IN (:...barcodes)', { barcodes });
      }
    }

    if (filters.search) {
      qb.andWhere(
        '(bb.barcode_alias_8digit ILIKE :search OR bb.design_no ILIKE :search OR vd.name ILIKE :search)',
        { search: `%${filters.search}%` }
      );
    }

    if (filters.gte_created_at) {
      qb.andWhere('bb.created_at >= :gteCreatedAt', { gteCreatedAt: filters.gte_created_at });
    }
    if (filters.lte_created_at) {
      qb.andWhere('bb.created_at <= :lteCreatedAt', { lteCreatedAt: filters.lte_created_at });
    }

    if (filters.min_quantity !== undefined) {
      qb.andWhere('bb.available_quantity >= :minQty', { minQty: Number(filters.min_quantity) });
    }

    // Specific barcode search from BarcodeManagement .ilike() shim call
    if (filters.search_barcode_alias_8digit) {
      const term = filters.search_barcode_alias_8digit.replace(/%/g, '');
      qb.andWhere(
        '(bb.barcode_alias_8digit ILIKE :bc_search OR bb.design_no ILIKE :bc_search OR vd.name ILIKE :bc_search)',
        { bc_search: `%${term}%` }
      );
    }

    // Dynamic sort: whitelist allowed sort columns to prevent SQL injection
    const SORT_COLS: Record<string, string> = {
      'barcode_alias_8digit': 'bb.barcode_alias_8digit',
      'created_at': 'bb.created_at',
      'design_no': 'bb.design_no',
      'mrp': 'bb.mrp',
    };
    const sortCol = (filters.sort && SORT_COLS[filters.sort]) ? SORT_COLS[filters.sort] : 'bb.created_at';
    const sortDir = filters.order?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    qb.orderBy(sortCol, sortDir);

    qb.skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();

    // Remove heavy photos array from list response to prevent massive JSON payloads
    data.forEach((item: any) => {
      delete item.photos;
    });

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
      ? `AND (bb.design_no ILIKE $1 OR vd.name ILIKE $1 OR vd.vendor_code ILIKE $1 OR pg.name ILIKE $1 OR cl.name ILIKE $1 OR bb.barcode_alias_8digit ILIKE $1)`
      : '';

    // Count distinct groups for pagination
    const countSql = `
      SELECT COUNT(*) AS total FROM (
        SELECT bb.design_no, bb.vendor, bb.product_group, bb.color
        FROM barcode_batches bb
        LEFT JOIN vendors vd ON vd.id = bb.vendor
        LEFT JOIN product_groups pg ON pg.id = bb.product_group
        LEFT JOIN colors cl ON cl.id = bb.color
        WHERE bb.status IN ('active', 'Available', 'returned', 'defective', 'Sold', 'Returned') ${searchCond}
        GROUP BY bb.design_no, bb.vendor, bb.product_group, bb.color
      ) g
    `;

    const dataSql = `
      WITH def_agg AS (
        SELECT COALESCE(ds.barcode_batch_id, bb_link.id) as batch_id, 
               SUM(ds.quantity) AS defective_qty
        FROM defective_stock ds
        LEFT JOIN barcode_batches bb_link ON bb_link.barcode_alias_8digit = ds.barcode_alias
        WHERE ds.reason != 'Returned to vendor' OR ds.reason IS NULL
        GROUP BY batch_id
      ),
      ret_agg AS (
        SELECT item_id, SUM(quantity) AS returned_qty
        FROM purchase_return_items
        GROUP BY item_id
      )
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
        SUM(COALESCE(r.returned_qty, 0)) AS total_returned,
        MAX(bb.mrp)                AS mrp,
        MAX(bb.cost_actual)        AS cost,
        MAX(bb.order_number)       AS order_number,
        MAX(bb.gst_logic)          AS gst_logic,
        MAX(bb.mrp_markup_percent) AS mrp_markup_percent,
        MAX(bb.hsn_code)           AS hsn_code,
        MAX(bb.description)        AS description,
        ARRAY_AGG(DISTINCT ARRAY_TO_STRING(bb.photos, ',')) FILTER (WHERE bb.photos IS NOT NULL AND CARDINALITY(bb.photos) > 0) AS images,
        JSON_AGG(
          JSON_BUILD_OBJECT(
            'batch_id',       bb.id,
            'size_id',        sz.id,
            'size_name',      COALESCE(sz.name, 'Unknown'),
            'barcode_8digit', bb.barcode_alias_8digit,
            'available',      bb.available_quantity,
            'total',          bb.total_quantity,
            'floor_name',     COALESCE(fl.name, 'Unassigned'),
            'floor_id',       COALESCE(fl.id::text, ''),
            'defective_qty',  COALESCE(d.defective_qty, 0),
            'returned_qty',   COALESCE(r.returned_qty, 0),
            'cost',           bb.cost_actual,
            'mrp',            bb.mrp,
            'invoice_no',     COALESCE(po.po_number, ''),
            'vendor_invoice', COALESCE(po.invoice_number, '')
          ) ORDER BY sz.sort_order NULLS LAST
        ) AS sizes
      FROM barcode_batches bb
      LEFT JOIN vendors        vd  ON vd.id  = bb.vendor
      LEFT JOIN product_groups pg  ON pg.id  = bb.product_group
      LEFT JOIN colors         cl  ON cl.id  = bb.color
      LEFT JOIN sizes          sz  ON sz.id  = bb.size
      LEFT JOIN floors         fl  ON fl.id  = bb.floor
      LEFT JOIN purchase_orders po ON po.id  = bb.po_id
      LEFT JOIN def_agg        d   ON d.batch_id = bb.id
      LEFT JOIN ret_agg        r   ON r.item_id = bb.id
      WHERE bb.status IN ('active', 'Available', 'returned', 'defective', 'Sold', 'Returned') ${searchCond}
      GROUP BY bb.design_no, vd.id, vd.name, vd.vendor_code, pg.id, pg.name, cl.id, cl.name
      ORDER BY MAX(bb.created_at) DESC
      LIMIT $${searchParam ? '2' : '1'} OFFSET $${searchParam ? '3' : '2'}
    `;

    const params = searchParam
      ? [searchParam, limit, offset]
      : [limit, offset];

    console.log("SQL QUERY DEBUG:", dataSql);
    console.log("SQL QUERY PARAMS:", params);

    const [countRes, dataRes] = await Promise.all([
      db.query(countSql, searchParam ? [searchParam] : []),
      db.query(dataSql, params),
    ]);

    const total = parseInt(countRes[0]?.total || '0', 10);
    return { data: dataRes, total, page, limit };
  }

  async findById(id: string) {
    return this.batchRepo.findOne({
      where: { id },
      relations: ['product_group', 'size', 'color', 'vendor', 'floor', 'printLogs'],
    });
  }

  async searchByBarcode(barcode: string) {
    if (!barcode) return [];
    return this.batchRepo.find({
      where: [
        { barcode_alias_8digit: ILike(`%${barcode}%`) },
        { barcode_structured: ILike(`%${barcode}%`) },
      ],
      relations: ['product_group', 'size', 'color', 'vendor'],
      take: 20,
    });
  }

  async create(data: any, userId: string) {
    return AppDataSource.transaction(async (manager) => {
      // Get and increment barcode sequence
      let seq = await manager.findOne(BarcodeSequence, { where: { id: 1 } });

      // Helper: find the real max valid barcode (< 10,000,000) from actual data
      const getValidMax = async (): Promise<number> => {
        const maxRes = await manager.query(
          `SELECT MAX(CAST(barcode_alias_8digit AS INTEGER)) AS max_num
           FROM barcode_batches
           WHERE barcode_alias_8digit ~ '^[0-9]+$'
             AND CAST(barcode_alias_8digit AS INTEGER) < 10000000`
        );
        return maxRes[0]?.max_num ? parseInt(maxRes[0].max_num, 10) : 0;
      };

      if (!seq) {
        // No sequence row at all — create from real max
        const maxNum = await getValidMax();
        seq = manager.create(BarcodeSequence, { id: 1, last_number: maxNum });
      } else if (Number(seq.last_number) >= 10000000) {
        // Sequence was wrongly seeded (e.g. 10000000) — correct it silently
        const maxNum = await getValidMax();
        seq.last_number = maxNum;
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
        photos: Array.isArray(data.photos) ? data.photos.filter(Boolean) : [],
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
    // Never allow available to go below 0 or above total
    if (batch.available_quantity < 0) batch.available_quantity = 0;
    if (batch.available_quantity > batch.total_quantity) batch.available_quantity = batch.total_quantity;
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
