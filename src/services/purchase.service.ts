import { In } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { PurchaseOrder } from '../entities/PurchaseOrder';
import { PurchaseInvoice } from '../entities/PurchaseInvoice';
import { PurchaseOrderItem } from '../entities/PurchaseOrderItem';
import { PurchaseItem } from '../entities/PurchaseItem';
import { BarcodeBatch } from '../entities/BarcodeBatch';
import { BarcodeSequence } from '../entities/BarcodeSequence';
import { ProductMaster } from '../entities/ProductMaster';
import { encodeCost } from '../utils/costEncoding';

function ensureId(val: any): string | undefined {
  if (!val) return undefined;
  if (typeof val === 'object' && val.id) return val.id;
  if (typeof val === 'string' && val.startsWith('{')) {
    try {
      const parsed = JSON.parse(val);
      if (parsed.id) return parsed.id;
    } catch (e) {}
  }
  return String(val);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SizeQty {
  size: string;
  quantity: number;
  print_quantity?: number;
}

interface BulkItem {
  design_no: string;
  product_group: string;
  color?: string;
  floor_id?: string;
  sizes: SizeQty[];
  cost_per_item: number;
  mrp: number;
  mrp_markup_percent: number;
  gst_logic: string;
  image_url?: string;
  description?: string;
  order_number?: string;
  barcodes_per_item?: number;
  payout_code?: string;
  hsn_code?: string;
}

interface BulkInvoicePayload {
  vendor: string;
  order_date: string;
  invoice_number: string;
  notes?: string;
  taxable_value: number;
  total_amount: number;
  total_items: number;
  gst_type?: string;
  ledger_discount?: number | null;
  ledger_freight?: number | null;
  ledger_freight_gst_rate?: number | null;
  manual_gst_amount?: number | null;
  vendor_invoice_attachment?: string | null;
  vendor_invoice_date?: string | null;
  items: BulkItem[];
  vendor_code?: string;
  original_quantities?: Record<string, number>; // used only on update
}

// ─── Helper: Atomically reserve N barcode aliases in one DB round-trip ────────

async function reserveBarcodeAliases(manager: any, count: number): Promise<string[]> {
  if (count === 0) return [];

  // Atomically increment last_number by `count` and get the new value
  const result = await manager.query(
    `INSERT INTO barcode_sequence (id, last_number)
     VALUES (1, $1)
     ON CONFLICT (id) DO UPDATE
       SET last_number = CASE
         WHEN barcode_sequence.last_number >= 10000000
           THEN (
             SELECT COALESCE(MAX(CAST(barcode_alias_8digit AS INTEGER)), 0)
             FROM barcode_batches
             WHERE barcode_alias_8digit ~ '^[0-9]+$'
               AND CAST(barcode_alias_8digit AS INTEGER) < 10000000
           ) + $1
         ELSE barcode_sequence.last_number + $1
       END
     RETURNING last_number`,
    [count]
  );

  const lastNumber = Number(result[0].last_number);
  // Aliases are: (lastNumber - count + 1) ... lastNumber
  const start = lastNumber - count + 1;
  return Array.from({ length: count }, (_, i) =>
    (start + i).toString().padStart(8, '0')
  );
}

// ─── Helper: build structured barcode string ──────────────────────────────────

function buildStructuredBarcode(
  groupCode: string,
  designNo: string,
  colorCode: string,
  vendorCode: string,
  mrp: number,
  alias: string
): string {
  const designPart = colorCode ? `${designNo}-${colorCode}` : designNo;
  const costPart = encodeCost ? encodeCost(mrp) : String(mrp);
  return [groupCode, designPart, vendorCode, costPart, alias].filter(Boolean).join('-');
}

// ─── Helper: batch-resolve group/color codes from DB (one query each) ────────

async function batchResolveCodes(
  manager: any,
  productGroupIds: string[],
  colorIds: string[]
): Promise<{
  groupMap: Map<string, { groupCode: string; floorId: string | null }>;
  colorMap: Map<string, string>;
}> {
  const uniqueGroups = [...new Set(productGroupIds.filter(Boolean))];
  const uniqueColors = [...new Set(colorIds.filter(Boolean))];

  const [pgRows, clRows] = await Promise.all([
    uniqueGroups.length
      ? manager.query(
          `SELECT id, group_code, floor FROM product_groups WHERE id = ANY($1)`,
          [uniqueGroups]
        )
      : Promise.resolve([]),
    uniqueColors.length
      ? manager.query(
          `SELECT id, color_code FROM colors WHERE id = ANY($1)`,
          [uniqueColors]
        )
      : Promise.resolve([]),
  ]);

  const groupMap = new Map<string, { groupCode: string; floorId: string | null }>();
  for (const row of pgRows) {
    groupMap.set(row.id, { groupCode: row.group_code || 'PG', floorId: row.floor || null });
  }

  const colorMap = new Map<string, string>();
  for (const row of clRows) {
    colorMap.set(row.id, row.color_code || '');
  }

  return { groupMap, colorMap };
}

export class PurchaseService {
  private poRepo = AppDataSource.getRepository(PurchaseOrder);

  async getOrders(filters: {
    vendor?: string;
    vendor_id?: string;
    status?: string;
    search?: string;
    search_po_number?: string;
    po_number?: string;
    neq_status?: string;
    sort?: string;
    order?: string;
    page?: number;
    limit?: number;
    gte_order_date?: string;
    lte_order_date?: string;
  }) {
    const page = Number(filters.page) || 1;
    const limit = Number(filters.limit) || 20;
    const skip = (page - 1) * limit;

    const qb = this.poRepo.createQueryBuilder('po').leftJoinAndSelect('po.vendor', 'v');

    if (filters.vendor || filters.vendor_id) {
      qb.andWhere('po.vendor_id = :vid', { vid: filters.vendor || filters.vendor_id });
    }
    if (filters.status) qb.andWhere('po.status = :status', { status: filters.status });
    if (filters.neq_status) qb.andWhere('po.status != :neqStatus', { neqStatus: filters.neq_status });
    if (filters.search_po_number) {
      qb.andWhere('po.po_number ILIKE :poNum', { poNum: `${filters.search_po_number}%` });
    }
    if (filters.search) {
      qb.andWhere('(po.po_number ILIKE :s OR v.name ILIKE :s)', { s: `%${filters.search}%` });
    }
    if (filters.po_number) {
      qb.andWhere('po.po_number = :exactPoNum', { exactPoNum: filters.po_number });
    }

    if (filters.gte_order_date) {
      qb.andWhere('DATE(po.order_date) >= :gteOrderDate', { gteOrderDate: filters.gte_order_date });
    }
    if (filters.lte_order_date) {
      qb.andWhere('DATE(po.order_date) <= :lteOrderDate', { lteOrderDate: filters.lte_order_date });
    }

    const sortCol = filters.sort === 'order_date' ? 'po.order_date' : 'po.created_at';
    const sortDir = filters.order?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(sortCol, sortDir);
    qb.skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async getOrderById(id: string) {
    return this.poRepo.findOne({ 
      where: { id }, 
      relations: ['purchase_items', 'purchase_items.product_group', 'order_items', 'vendor'] 
    });
  }

  async createOrder(data: any, userId: string) {
    const count = await this.poRepo.count();
    const defaultPoNum = `PO${new Date().getFullYear()}${(count + 1).toString().padStart(6, '0')}`;
    
    const entityData = { ...data };
    
    // Support either vendor_id or vendor payload formats
    const vendorId = data.vendor || data.vendor_id;
    if (vendorId) {
      entityData.vendor = { id: vendorId };
      delete entityData.vendor_id;
    }
    
    // Don't override frontend po_number if they provide one
    if (!entityData.po_number && !entityData.order_number) {
       entityData.po_number = defaultPoNum;
       entityData.order_number = defaultPoNum;
    }
    
    if (userId && !entityData.created_by) {
        entityData.created_by = userId;
    }

    const po = this.poRepo.create(entityData);
    return this.poRepo.save(po);
  }

  async updateOrder(id: string, data: Record<string, any>) {
    const po = await this.poRepo.findOneBy({ id });
    if (!po) return null;
    const allowed = ['status', 'taxable_value', 'manual_gst_amount', 'total_amount', 'notes', 'vendor_invoice_attachment', 'gst_difference_reason', 'vendor_invoice_date'];
    for (const key of allowed) { if (data[key] !== undefined) (po as any)[key] = data[key]; }
    return this.poRepo.save(po);
  }

  async getInvoices(filters: { vendor_id?: string }) {
    const repo = AppDataSource.getRepository(PurchaseInvoice);
    const where: any = {};
    if (filters.vendor_id) where.vendor_id = filters.vendor_id;
    return repo.find({ where, order: { created_at: 'DESC' } });
  }

  async createInvoice(data: any, userId: string) {
    const repo = AppDataSource.getRepository(PurchaseInvoice);
    const inv = repo.create({
      vendor_id: data.vendor_id,
      invoice_number: data.invoice_number,
      invoice_date: data.invoice_date,
      total_amount: data.total_amount,
      notes: data.notes || null,
      created_by: userId,
    });
    return repo.save(inv);
  }

  async getOrderItems(filters: any) {
    const repo = AppDataSource.getRepository(PurchaseOrderItem);
    const qb = repo.createQueryBuilder('poi');
    
    if (filters.purchase_order_id) {
      const ids = String(filters.purchase_order_id).split(',').map(id => id.trim()).filter(Boolean);
      if (ids.length === 1) {
        qb.andWhere('poi.purchase_order_id = :id', { id: ids[0] });
      } else if (ids.length > 1) {
        qb.andWhere('poi.purchase_order_id IN (:...ids)', { ids });
      }
    }
    
    qb.orderBy('poi.created_at', 'ASC');
    return qb.getMany();
  }

  async getPurchaseItems(filters: any) {
    const repo = AppDataSource.getRepository(PurchaseItem);
    const qb = repo.createQueryBuilder('pi')
      .leftJoinAndSelect('pi.product_group', 'pg')
      .leftJoinAndSelect('pi.color', 'cl')
      .leftJoinAndSelect('pi.size', 'sz')
      .leftJoinAndSelect('pi.purchase_order', 'po')
      .leftJoinAndSelect('po.vendor', 'vd');

    if (filters['gte_purchase_order.order_date']) {
      qb.andWhere('DATE(po.order_date) >= :gteDate', { gteDate: filters['gte_purchase_order.order_date'] });
    }
    if (filters['lte_purchase_order.order_date']) {
      qb.andWhere('DATE(po.order_date) <= :lteDate', { lteDate: filters['lte_purchase_order.order_date'] });
    }
    if (filters.po_id) {
      const ids = String(filters.po_id).split(',').map(id => id.trim()).filter(Boolean);
      if (ids.length === 1) {
        qb.andWhere('pi.po_id = :poId', { poId: ids[0] });
      } else if (ids.length > 1) {
        qb.andWhere('pi.po_id IN (:...poIds)', { poIds: ids });
      }
    }
    if (filters['purchase_order.vendor_id']) {
      qb.andWhere('po.vendor_id = :vid', { vid: filters['purchase_order.vendor_id'] });
    }

    qb.orderBy('pi.created_at', 'ASC');

    return qb.getMany();
  }

  async createPurchaseItem(data: any) {
    const repo = AppDataSource.getRepository(PurchaseItem);
    
    const entityData = { ...data };
    if (data.product_group) {
        entityData.product_group_id = data.product_group;
        delete entityData.product_group;
    }
    if (data.size) {
        entityData.size_id = data.size;
        delete entityData.size;
    }
    if (data.color) {
        entityData.color_id = data.color;
        delete entityData.color;
    }
    
    const item = repo.create(entityData);
    return repo.save(item);
  }

  async deletePurchaseItems(filters: any) {
    const repo = AppDataSource.getRepository(PurchaseItem);
    if (!filters || Object.keys(filters).length === 0) throw new Error('Delete filters required');
    return repo.delete(filters);
  }

  async createOrderItem(data: any) {
    const repo = AppDataSource.getRepository(PurchaseOrderItem);
    const item = repo.create(data);
    return repo.save(item);
  }

  // ─── BULK SAVE — CREATE ────────────────────────────────────────────────────

  async bulkSaveInvoice(payload: BulkInvoicePayload, userId: string) {
    return AppDataSource.transaction(async (manager) => {
      const t0 = Date.now();
      const lap = (label: string, prev: number) => {
        const now = Date.now();
        console.log(`[BULK-SAVE] ${label}: ${now - prev}ms (total: ${now - t0}ms)`);
        return now;
      };
      let t = t0;
      const { items, vendor, vendor_code = 'VND', ...header } = payload;
      console.log(`[BULK-SAVE] START — items: ${items.length}, vendor: ${vendor}`);

      // Clean all items' design_no upfront
      for (const item of items) {
        if (item.design_no) item.design_no = item.design_no.trim();
      }

      // ── 1. Generate PO number ──────────────────────────────────────────────
      const year = new Date().getFullYear();
      const prefix = `PI${year}`;
      const maxRes = await manager.query(
        `SELECT po_number FROM purchase_orders WHERE po_number LIKE $1 ORDER BY po_number DESC LIMIT 1`,
        [`${prefix}%`]
      );
      let nextNum = 1;
      if (maxRes.length > 0) {
        const lastNumPart = parseInt(maxRes[0].po_number.substring(prefix.length), 10);
        if (!isNaN(lastNumPart)) nextNum = lastNumPart + 1;
      }
      const poNumber = `${prefix}${nextNum.toString().padStart(6, '0')}`;
      t = lap('Step 1 — Generate PO number', t);

      // ── 2. Insert purchase_orders ──────────────────────────────────────────
      const poResult = await manager.query(
        `INSERT INTO purchase_orders
           (po_number, vendor, order_date, invoice_number, total_items, total_amount,
            status, notes, taxable_value, ledger_discount, ledger_freight,
            ledger_freight_gst_rate, manual_gst_amount, vendor_invoice_attachment,
            gst_type, created_by, vendor_invoice_date)
         VALUES ($1,$2,$3,$4,$5,$6,'Completed',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         RETURNING id, po_number`,
        [
          poNumber, vendor, header.order_date, header.invoice_number,
          header.total_items, header.total_amount, header.notes ?? null,
          header.taxable_value, header.ledger_discount ?? null,
          header.ledger_freight ?? null, header.ledger_freight_gst_rate ?? null,
          header.manual_gst_amount ?? null, header.vendor_invoice_attachment ?? null,
          header.gst_type ?? null, userId ?? null, header.vendor_invoice_date ?? null,
        ]
      );
      const po = poResult[0];
      t = lap('Step 2 — Insert purchase_order header', t);

      // ── 3. Batch fetch existing product_masters ───────────────────────────
      const designNos = [...new Set(items.map(i => ensureId(i.design_no)?.trim().toUpperCase()))].filter(Boolean) as string[];
      const existingMasters: any[] = designNos.length
        ? await manager.query(
            `SELECT id, design_no, hsn_code FROM product_masters WHERE vendor = $1 AND UPPER(TRIM(design_no)) = ANY($2)`,
            [vendor, designNos]
          )
        : [];
      const masterMap = new Map(existingMasters.map(m => [m.design_no.trim().toUpperCase(), m]));
      t = lap(`Step 3 — Fetch product_masters (${designNos.length} designs, ${existingMasters.length} found)`, t);

      // ── 4. Batch resolve group/color codes (single query each) ────────────
      const allGroupIds = items.map(i => ensureId(i.product_group) || '');
      const allColorIds = items.map(i => ensureId(i.color) || '').filter(Boolean);
      const { groupMap, colorMap } = await batchResolveCodes(manager, allGroupIds, allColorIds);
      t = lap('Step 4 — Batch resolve group/color codes', t);

      // ── 5. Count total size rows that need barcodes ────────────────────────
      const sizeRows = items.flatMap(item =>
        item.sizes.filter(sq => sq.quantity > 0)
      );
      const totalBarcodeCount = sizeRows.length;

      // ── 6. Reserve all barcode aliases in ONE DB call ─────────────────────
      const aliases = await reserveBarcodeAliases(manager, totalBarcodeCount);
      t = lap(`Step 5+6 — Reserve ${totalBarcodeCount} barcode aliases`, t);

      // ── 7. Upsert product_masters (batch: one UPDATE + one multi-row INSERT) ─
      const toUpdate = items.filter(item => masterMap.has(ensureId(item.design_no)?.trim().toUpperCase() || ''));
      const toInsert = items.filter(item => !masterMap.has(ensureId(item.design_no)?.trim().toUpperCase() || ''));

      // Run all product master updates in parallel
      if (toUpdate.length > 0) {
        await Promise.all(toUpdate.map(item => {
          const existing = masterMap.get(ensureId(item.design_no)?.trim().toUpperCase() || '')!;
          return manager.query(
            `UPDATE product_masters SET
               hsn_code = $1, mrp = $2, barcodes_per_item = $3,
               gst_logic = $4, updated_at = NOW()
             WHERE id = $5`,
            [item.hsn_code || existing.hsn_code, item.mrp, item.barcodes_per_item ?? 1, item.gst_logic, existing.id]
          );
        }));
      }

      // Bulk INSERT new product masters
      if (toInsert.length > 0) {
        const insertValues: any[] = [];
        const insertPlaceholders = toInsert.map((item, i) => {
          const base = i * 12;
          insertValues.push(
            ensureId(item.design_no), ensureId(item.product_group),
            ensureId(item.color) || null, vendor, item.mrp, item.gst_logic,
            ensureId(item.floor_id) || null,
            item.image_url ? [item.image_url] : [],
            item.description || '', item.barcodes_per_item ?? 1,
            item.hsn_code || null, userId ?? null,
          );
          return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9},$${base+10},$${base+11},$${base+12})`;
        });
        await manager.query(
          `INSERT INTO product_masters
             (design_no, product_group, color, vendor, mrp, gst_logic, floor,
              photos, description, barcodes_per_item, hsn_code, created_by)
           VALUES ${insertPlaceholders.join(',')}
           ON CONFLICT DO NOTHING`,
          insertValues
        );
      }
      t = lap(`Step 7 — Upsert product_masters (${toUpdate.length} updated, ${toInsert.length} inserted)`, t);

      // ── 8. Bulk-insert purchase_items ─────────────────────────────────────
      const piValues: any[] = [];
      const piPlaceholders: string[] = [];
      let piIdx = 1;
      for (const item of items) {
        const productGroupId = ensureId(item.product_group) || '';
        const colorId = ensureId(item.color) || '';
        const gInfo = groupMap.get(productGroupId);
        const effectiveFloor = ensureId(item.floor_id) || gInfo?.floorId || null;

        for (const sq of item.sizes) {
          if (!sq.quantity || sq.quantity <= 0) continue;
          piPlaceholders.push(
            `($${piIdx},$${piIdx+1},$${piIdx+2},$${piIdx+3},$${piIdx+4},$${piIdx+5},$${piIdx+6},$${piIdx+7},$${piIdx+8},$${piIdx+9},$${piIdx+10},$${piIdx+11},$${piIdx+12},$${piIdx+13},$${piIdx+14})`
          );
          piValues.push(
            po.id, item.design_no, item.product_group,
            item.color || null, sq.size, sq.quantity,
            item.cost_per_item, item.mrp, item.mrp_markup_percent,
            item.gst_logic, item.description || null,
            item.order_number || null, item.hsn_code || null,
            effectiveFloor, item.barcodes_per_item || 1
          );
          piIdx += 15;
        }
      }
      if (piPlaceholders.length > 0) {
        await manager.query(
          `INSERT INTO purchase_items
             (po_id, design_no, product_group, color, size, quantity,
              cost_per_item, mrp, mrp_markup_percent, gst_logic,
              description, order_number, hsn_code, floor_id, barcodes_per_item)
           VALUES ${piPlaceholders.join(',')}`,
          piValues
        );
      }
      t = lap(`Step 8 — Bulk insert ${piPlaceholders.length} purchase_items`, t);

      // ── 9. Bulk-insert barcode_batches ────────────────────────────────────
      const bbValues: any[] = [];
      const bbPlaceholders: string[] = [];
      let bbIdx = 1;
      let aliasIdx = 0;

      for (const item of items) {
        const productGroupId = ensureId(item.product_group) || '';
        const colorId = ensureId(item.color) || '';
        const gInfo = groupMap.get(productGroupId);
        const groupCode = gInfo?.groupCode || 'PG';
        const colorCode = colorMap.get(colorId) || '';
        const effectiveFloor = ensureId(item.floor_id) || gInfo?.floorId || null;
        const costEncoded = encodeCost ? encodeCost(item.cost_per_item) : null;

        for (const sq of item.sizes) {
          if (!sq.quantity || sq.quantity <= 0) continue;
          const alias = aliases[aliasIdx++];
          const structured = buildStructuredBarcode(groupCode, item.design_no, colorCode, vendor_code, item.mrp, alias);
          const printQty = sq.print_quantity ?? sq.quantity * (item.barcodes_per_item ?? 1);

          bbPlaceholders.push(
            `($${bbIdx},$${bbIdx+1},$${bbIdx+2},$${bbIdx+3},$${bbIdx+4},$${bbIdx+5},$${bbIdx+6},$${bbIdx+7},$${bbIdx+8},$${bbIdx+9},$${bbIdx+10},$${bbIdx+11},$${bbIdx+12},$${bbIdx+13},$${bbIdx+14},$${bbIdx+15},'active',$${bbIdx+16},$${bbIdx+17},$${bbIdx+18},$${bbIdx+19},$${bbIdx+20},$${bbIdx+21},$${bbIdx+22})`
          );
          bbValues.push(
            alias, structured, item.design_no, item.product_group,
            sq.size, item.color || null, vendor,
            item.cost_per_item, costEncoded, item.mrp, item.mrp_markup_percent,
            item.gst_logic, sq.quantity, sq.quantity,
            effectiveFloor, printQty,
            po.id,
            item.image_url ? [item.image_url] : [],
            item.description || null, item.order_number || null,
            item.payout_code || null, item.hsn_code || null, userId ?? null,
          );
          bbIdx += 23;
        }
      }
      if (bbPlaceholders.length > 0) {
        await manager.query(
          `INSERT INTO barcode_batches
             (barcode_alias_8digit, barcode_structured, design_no, product_group,
              size, color, vendor, cost_actual, cost_encoded, mrp, mrp_markup_percent,
              gst_logic, total_quantity, available_quantity, floor, print_quantity,
              status, po_id, photos, description, order_number,
              payout_code, hsn_code, created_by)
           VALUES ${bbPlaceholders.join(',')}`,
          bbValues
        );
      }
      t = lap(`Step 9 — Bulk insert ${bbPlaceholders.length} barcode_batches`, t);
      console.log(`[BULK-SAVE] ✅ DONE — total: ${Date.now() - t0}ms`);

      return { id: po.id, po_number: po.po_number };
    });
  }

  // ─── BULK SAVE — UPDATE ────────────────────────────────────────────────────

  async bulkUpdateInvoice(poId: string, payload: BulkInvoicePayload, userId: string) {
    return AppDataSource.transaction(async (manager) => {
      const t0 = Date.now();
      const lap = (label: string, prev: number) => {
        const now = Date.now();
        console.log(`[BULK-UPDATE] ${label}: ${now - prev}ms (total: ${now - t0}ms)`);
        return now;
      };
      let t = t0;
      const { items, vendor, vendor_code = 'VND', original_quantities = {} } = payload;
      console.log(`[BULK-UPDATE] START — poId: ${poId}, items: ${items.length}, vendor: ${vendor}`);

      // Clean all items' design_no upfront
      for (const item of items) {
        if (item.design_no) item.design_no = item.design_no.trim();
      }

      // ── 1. Fetch existing PO + old purchase_items in parallel ─────────────
      const [[currentPO], dbItemsRaw] = await Promise.all([
        manager.query(`SELECT id, po_number, vendor FROM purchase_orders WHERE id = $1`, [poId]),
        manager.query(
          `SELECT design_no, product_group, color, size, quantity FROM purchase_items WHERE po_id = $1`,
          [poId]
        ),
      ]);
      if (!currentPO) throw new Error('Purchase invoice not found');
      t = lap(`Step 1 — Fetch PO + ${dbItemsRaw.length} existing purchase_items (parallel)`, t);

      // ── 2. Update purchase_orders header ──────────────────────────────────
      await manager.query(
        `UPDATE purchase_orders SET
           vendor = $1, order_date = $2, invoice_number = $3,
           total_items = $4, total_amount = $5, status = 'Completed',
           notes = $6, taxable_value = $7, ledger_discount = $8,
           ledger_freight = $9, ledger_freight_gst_rate = $10,
           manual_gst_amount = $11, vendor_invoice_attachment = $12,
           gst_type = $13, modified_by = $14, vendor_invoice_date = $15, updated_at = NOW()
         WHERE id = $16`,
        [
          vendor, payload.order_date, payload.invoice_number,
          payload.total_items, payload.total_amount,
          payload.notes ?? null, payload.taxable_value,
          payload.ledger_discount ?? null, payload.ledger_freight ?? null,
          payload.ledger_freight_gst_rate ?? null, payload.manual_gst_amount ?? null,
          payload.vendor_invoice_attachment ?? null, payload.gst_type ?? null,
          userId ?? null, payload.vendor_invoice_date ?? null, poId,
        ]
      );
      t = lap('Step 2 — Update purchase_order header', t);

      // ── 3. Batch fetch & upsert product_masters ───────────────────────────
      const designNos = [...new Set(items.map(i => ensureId(i.design_no)?.trim().toUpperCase()))].filter(Boolean) as string[];
      const existingMasters: any[] = designNos.length
        ? await manager.query(
            `SELECT id, design_no, hsn_code FROM product_masters WHERE vendor = $1 AND UPPER(TRIM(design_no)) = ANY($2)`,
            [vendor, designNos]
          )
        : [];
      const masterMap = new Map(existingMasters.map(m => [m.design_no.trim().toUpperCase(), m]));

      // ── Bulk UPDATE existing masters (single VALUES query) ────────────────
      const pmToUpdate = items
        .map(item => ({ item, existing: masterMap.get(ensureId(item.design_no)?.trim().toUpperCase() || '') }))
        .filter((x): x is { item: BulkItem; existing: any } => !!x.existing);
      const pmToInsert = items.filter(item => !masterMap.has(ensureId(item.design_no)?.trim().toUpperCase() || ''));

      if (pmToUpdate.length > 0) {
        const pmVals: any[] = [];
        const pmPh = pmToUpdate.map(({ item, existing }, i) => {
          const b = i * 5;
          pmVals.push(
            existing.id,
            item.hsn_code || existing.hsn_code || null,
            item.mrp, item.barcodes_per_item ?? 1, item.gst_logic,
          );
          return `($${b+1}::uuid,$${b+2},$${b+3}::numeric,$${b+4}::int,$${b+5})`;
        });
        await manager.query(
          `UPDATE product_masters AS pm
           SET hsn_code = COALESCE(v.hsn_code, pm.hsn_code),
               mrp = v.mrp::numeric,
               barcodes_per_item = v.bpi::int,
               gst_logic = v.gl,
               updated_at = NOW()
           FROM (VALUES ${pmPh.join(',')}) AS v(id,hsn_code,mrp,bpi,gl)
           WHERE pm.id = v.id::uuid`,
          pmVals
        );
      }

      if (pmToInsert.length > 0) {
        const pmInsVals: any[] = [];
        const pmInsPh = pmToInsert.map((item, i) => {
          const b = i * 12;
          pmInsVals.push(
            item.design_no, item.product_group, item.color || null,
            vendor, item.mrp, item.gst_logic, item.floor_id || null,
            item.image_url ? [item.image_url] : [],
            item.description || '', item.barcodes_per_item ?? 1,
            item.hsn_code || null, userId ?? null,
          );
          return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12})`;
        });
        await manager.query(
          `INSERT INTO product_masters
             (design_no,product_group,color,vendor,mrp,gst_logic,floor,
              photos,description,barcodes_per_item,hsn_code,created_by)
           VALUES ${pmInsPh.join(',')}
           ON CONFLICT DO NOTHING`,
          pmInsVals
        );
      }
      t = lap(`Step 3 — Bulk upsert product_masters (${pmToUpdate.length} updated, ${pmToInsert.length} inserted)`, t);

      // ── 4. Build old/new qty maps ─────────────────────────────────────────
      let oldMap: Record<string, number> = { ...original_quantities };

      if (Object.keys(oldMap).length === 0) {
        for (const r of dbItemsRaw) {
          const key = [
            ensureId(vendor),
            ensureId(r.design_no),
            ensureId(r.product_group),
            ensureId(r.color) || '',
            ensureId(r.size)
          ].join('__');
          oldMap[key] = (oldMap[key] || 0) + (Number(r.quantity) || 0);
        }
      }

      const newMap: Record<string, number> = {};
      for (const item of items) {
        for (const sq of item.sizes) {
          if (!sq.quantity || sq.quantity <= 0) continue;
          const key = [
            ensureId(vendor),
            ensureId(item.design_no),
            ensureId(item.product_group),
            ensureId(item.color) || '',
            ensureId(sq.size)
          ].join('__');
          newMap[key] = (newMap[key] || 0) + sq.quantity;
        }
      }

      const allKeys = [...new Set([...Object.keys(oldMap), ...Object.keys(newMap)])];
      t = lap(`Step 4 — Build qty maps (${allKeys.length} unique keys)`, t);

      // ── 5. Batch resolve codes for all items (one query each) ─────────────
      const allGroupIds = items.map(i => ensureId(i.product_group) || '');
      const allColorIds = items.map(i => ensureId(i.color) || '').filter(Boolean);
      const { groupMap, colorMap } = await batchResolveCodes(manager, allGroupIds, allColorIds);
      t = lap('Step 5 — Batch resolve group/color codes', t);

      // ── 6. Single-query fetch of all relevant barcode_batches ────────────
      // Use ANY() on designNos for a simple index-friendly filter,
      // then do exact (design_no, product_group, size, color) matching in JS.
      const batchRows: any[] = designNos.length > 0
        ? await manager.query(
            `SELECT DISTINCT ON (UPPER(TRIM(design_no)), product_group, size, COALESCE(color::text,''))
                    id, design_no, product_group, size, color,
                    total_quantity, available_quantity, floor, photos, payout_code,
                    cost_actual, mrp, mrp_markup_percent, gst_logic,
                    description, order_number, hsn_code, print_quantity
             FROM barcode_batches
             WHERE status = 'active'
               AND vendor = $1
               AND UPPER(TRIM(design_no)) = ANY($2::text[])
             ORDER BY UPPER(TRIM(design_no)), product_group, size, COALESCE(color::text,''), created_at DESC`,
            [vendor, designNos]
          )
        : [];

      const batchLookup = new Map<string, any>();
      for (const row of batchRows) {
        const k = [row.design_no?.trim().toUpperCase(), row.product_group, row.size, row.color || ''].join('__');
        if (!batchLookup.has(k)) batchLookup.set(k, row);
      }
      t = lap(`Step 6 — Batch fetch barcode_batches (${batchRows.length} rows, 1 query)`, t);

      // ── 7. Count how many new barcode aliases we need for new batches ─────
      let newBatchCount = 0;
      for (const key of allKeys) {
        const [vendorId, designNo, productGroupId, colorId, sizeId] = key.split('__');
        const delta = (newMap[key] || 0) - (oldMap[key] || 0);
        const batchKey = [designNo.trim().toUpperCase(), productGroupId, sizeId, colorId || ''].join('__');
        const existingBatch = batchLookup.get(batchKey);
        if (!existingBatch && delta > 0) newBatchCount++;
      }
      const newAliases = await reserveBarcodeAliases(manager, newBatchCount);
      let newAliasIdx = 0;
      t = lap(`Step 7 — Reserve ${newBatchCount} new barcode aliases`, t);

      // ── 8. Process each key: collect update rows and new-batch inserts ─────
      // Row shape for bulk UPDATE: (id, tq, aq, ca, mrp, mmp, gl, fl, pi, desc, on_val, pc, hc, pq)
      // $1=userId (constant), $2=poId (constant), per-row params start at $3
      type BbUpdateRow = {
        id: string; tq: number; aq: number;
        ca: number|null; mrp: number|null; mmp: number|null; gl: string|null;
        fl: string|null; desc: string|null; onVal: string|null;
        pc: string|null; hc: string|null; pq: number|null; photos: any[]|null;
      };
      const bbUpdateRows: BbUpdateRow[] = [];
      const newBbValues: any[] = [];
      const newBbPlaceholders: string[] = [];
      let newBbIdx = 1;

      for (const key of allKeys) {
        const [vendorId, designNo, productGroupId, colorId, sizeId] = key.split('__');
        const oldQty = oldMap[key] || 0;
        const newQty = newMap[key] || 0;
        const delta = newQty - oldQty;

        const batchKey = [designNo.trim().toUpperCase(), productGroupId, sizeId, colorId || ''].join('__');
        const existingBatch = batchLookup.get(batchKey);

        const itemForCombo = items.find(it =>
          ensureId(it.design_no)?.trim().toUpperCase() === designNo.trim().toUpperCase() &&
          ensureId(it.product_group) === productGroupId &&
          (ensureId(it.color) || '') === (colorId || '') &&
          it.sizes.some(sq => ensureId(sq.size) === sizeId)
        );

        if (existingBatch) {
          const b = existingBatch;
          const tq = Math.max(0, Number(b.total_quantity) + delta);
          const aq = Math.max(0, Number(b.available_quantity) + delta);

          if (itemForCombo) {
            const pgId = ensureId(itemForCombo.product_group) || '';
            const gInfo = groupMap.get(pgId);
            const effectiveFloor = ensureId(itemForCombo.floor_id) || b.floor || gInfo?.floorId || null;
            const sqMatch = itemForCombo.sizes.find(s => ensureId(s.size) === sizeId);
            const printQty = sqMatch
              ? (sqMatch.print_quantity ?? sqMatch.quantity * (itemForCombo.barcodes_per_item ?? 1))
              : null;
            bbUpdateRows.push({
              id: b.id, tq, aq,
              ca: itemForCombo.cost_per_item, mrp: itemForCombo.mrp,
              mmp: itemForCombo.mrp_markup_percent, gl: itemForCombo.gst_logic,
              fl: effectiveFloor, desc: itemForCombo.description || null,
              onVal: itemForCombo.order_number || null,
              pc: itemForCombo.payout_code || b.payout_code || null,
              hc: itemForCombo.hsn_code || null, pq: printQty,
              photos: itemForCombo.image_url ? [itemForCombo.image_url] : null,
            });
          } else {
            // No itemForCombo — only qty changes; COALESCE keeps existing field values
            bbUpdateRows.push({
              id: b.id, tq, aq,
              ca: null, mrp: null, mmp: null, gl: null, fl: null,
              desc: null, onVal: null, pc: null, hc: null, pq: null, photos: null,
            });
          }
        } else if (delta > 0 && itemForCombo) {
          const pgId = ensureId(itemForCombo.product_group) || '';
          const cId = ensureId(itemForCombo.color) || '';
          const gInfo = groupMap.get(pgId);
          const groupCode = gInfo?.groupCode || 'PG';
          const colorCode = colorMap.get(cId) || '';
          const effectiveFloor = ensureId(itemForCombo.floor_id) || gInfo?.floorId || null;
          const alias = newAliases[newAliasIdx++];
          const structured = buildStructuredBarcode(groupCode, designNo, colorCode, vendor_code, itemForCombo.mrp, alias);
          const sqMatch = itemForCombo.sizes.find(s => s.size === sizeId);
          const printQty = sqMatch
            ? (sqMatch.print_quantity ?? delta * (itemForCombo.barcodes_per_item ?? 1))
            : delta;
          const costEncoded = encodeCost ? encodeCost(itemForCombo.cost_per_item) : null;

          newBbPlaceholders.push(
            `($${newBbIdx},$${newBbIdx+1},$${newBbIdx+2},$${newBbIdx+3},$${newBbIdx+4},$${newBbIdx+5},$${newBbIdx+6},$${newBbIdx+7},$${newBbIdx+8},$${newBbIdx+9},$${newBbIdx+10},$${newBbIdx+11},$${newBbIdx+12},$${newBbIdx+13},$${newBbIdx+14},$${newBbIdx+15},'active',$${newBbIdx+16},$${newBbIdx+17},$${newBbIdx+18},$${newBbIdx+19},$${newBbIdx+20},$${newBbIdx+21},$${newBbIdx+22})`
          );
          newBbValues.push(
            alias, structured, designNo, productGroupId,
            sizeId, colorId || null, vendorId,
            itemForCombo.cost_per_item, costEncoded,
            itemForCombo.mrp, itemForCombo.mrp_markup_percent,
            itemForCombo.gst_logic, delta, delta,
            effectiveFloor, printQty, poId,
            itemForCombo.image_url ? [itemForCombo.image_url] : [],
            itemForCombo.description || null, itemForCombo.order_number || null,
            itemForCombo.payout_code || null, itemForCombo.hsn_code || null,
            userId ?? null,
          );
          newBbIdx += 23;
        }
      }

      // Single VALUES-based bulk UPDATE for all existing barcode batches
      // $1=userId, $2=poId are constants; per-row data starts at $3
      const parallelOps: Promise<any>[] = [];
      if (bbUpdateRows.length > 0) {
        const bbVals: any[] = [userId ?? null, poId];
        const bbPh = bbUpdateRows.map((row, i) => {
          const b = i * 14 + 3; // starts at $3
          bbVals.push(
            row.id, row.tq, row.aq,
            row.ca, row.mrp, row.mmp, row.gl, row.fl,
            row.desc, row.onVal, row.pc, row.hc, row.pq,
            row.photos // Pass array directly, avoiding JSON.stringify!
          );
          return `($${b}::uuid,$${b+1}::int,$${b+2}::int,$${b+3}::numeric,$${b+4}::numeric,$${b+5}::numeric,$${b+6},$${b+7}::uuid,$${b+8},$${b+9},$${b+10},$${b+11},$${b+12}::int,$${b+13}::text[])`;
        });
        parallelOps.push(manager.query(
          `UPDATE barcode_batches AS bb
           SET total_quantity      = v.tq,
               available_quantity  = v.aq,
               modified_by         = $1,
               cost_actual         = COALESCE(v.ca,  bb.cost_actual),
               mrp                 = COALESCE(v.mrp, bb.mrp),
               mrp_markup_percent  = COALESCE(v.mmp, bb.mrp_markup_percent),
               gst_logic           = COALESCE(v.gl,  bb.gst_logic),
               floor               = COALESCE(v.fl,  bb.floor),
               po_id               = $2,
               description         = COALESCE(v.desc_val,  bb.description),
               order_number        = COALESCE(v.on_val, bb.order_number),
               payout_code         = COALESCE(v.pc,  bb.payout_code),
               hsn_code            = COALESCE(v.hc,  bb.hsn_code),
               print_quantity      = COALESCE(v.pq,  bb.print_quantity),
               photos              = COALESCE(v.ph, bb.photos),
               updated_at          = NOW()
           FROM (VALUES ${bbPh.join(',')})
             AS v(id,tq,aq,ca,mrp,mmp,gl,fl,desc_val,on_val,pc,hc,pq,ph)
           WHERE bb.id = v.id`,
          bbVals
        ));
      }

      if (newBbPlaceholders.length > 0) {
        parallelOps.push(manager.query(
          `INSERT INTO barcode_batches
             (barcode_alias_8digit, barcode_structured, design_no, product_group,
              size, color, vendor, cost_actual, cost_encoded, mrp, mrp_markup_percent,
              gst_logic, total_quantity, available_quantity, floor, print_quantity,
              status, po_id, photos, description, order_number,
              payout_code, hsn_code, created_by)
           VALUES ${newBbPlaceholders.join(',')}`,
          newBbValues
        ));
      }

      await Promise.all(parallelOps);
      t = lap(`Step 8 — Bulk UPDATE ${bbUpdateRows.length} barcode batches + INSERT ${newBbPlaceholders.length} new (2 queries)`, t);




      // ── 9. Delete old purchase_items and re-insert in bulk ────────────────
      await manager.query(`DELETE FROM purchase_items WHERE po_id = $1`, [poId]);

      const piValues: any[] = [];
      const piPlaceholders: string[] = [];
      let piIdx = 1;

      for (const item of items) {
        const pgId = ensureId(item.product_group) || '';
        const gInfo = groupMap.get(pgId);
        const effectiveFloor = ensureId(item.floor_id) || gInfo?.floorId || null;

        for (const sq of item.sizes) {
          if (!sq.quantity || sq.quantity <= 0) continue;
          piPlaceholders.push(
            `($${piIdx},$${piIdx+1},$${piIdx+2},$${piIdx+3},$${piIdx+4},$${piIdx+5},$${piIdx+6},$${piIdx+7},$${piIdx+8},$${piIdx+9},$${piIdx+10},$${piIdx+11},$${piIdx+12},$${piIdx+13},$${piIdx+14})`
          );
          piValues.push(
            poId, item.design_no, item.product_group,
            item.color || null, sq.size, sq.quantity,
            item.cost_per_item, item.mrp, item.mrp_markup_percent,
            item.gst_logic, item.description || null,
            item.order_number || null, item.hsn_code || null,
            effectiveFloor, item.barcodes_per_item || 1
          );
          piIdx += 15;
        }
      }

      if (piPlaceholders.length > 0) {
        await manager.query(
          `INSERT INTO purchase_items
             (po_id, design_no, product_group, color, size, quantity,
              cost_per_item, mrp, mrp_markup_percent, gst_logic,
              description, order_number, hsn_code, floor_id, barcodes_per_item)
           VALUES ${piPlaceholders.join(',')}`,
          piValues
        );
      }
      t = lap(`Step 9 — Delete + re-insert ${piPlaceholders.length} purchase_items`, t);
      console.log(`[BULK-UPDATE] ✅ DONE — total: ${Date.now() - t0}ms`);

      return { id: poId, po_number: currentPO.po_number };
    });
  }

  async getItemsByOrderId(poId: string) {
    const items = await AppDataSource.getRepository(PurchaseItem).find({
      where: { po_id: poId },
      relations: ['product_group', 'color', 'size', 'floor'],
      order: { created_at: 'ASC' }
    });

    if (items.length === 0) return [];

    const designNos = [...new Set(items.map(i => i.design_no.trim().toUpperCase()))];
    const po = await AppDataSource.getRepository(PurchaseOrder).findOne({ where: { id: poId } });
    const vendorId = po?.vendor_id || (po as any).vendor;

    const masters = await AppDataSource.getRepository(ProductMaster).find({
      where: { design_no: In(designNos) }
    });

    const masterMap = new Map<string, any>();
    masters.forEach(m => {
      const key = m.design_no.toString().trim().toUpperCase();
      const mVendorId = m.vendor_id || (m as any).vendor;
      if (!masterMap.has(key) || mVendorId === vendorId) {
        masterMap.set(key, m);
      }
    });

    return items.map(item => {
      const match = masterMap.get(item.design_no.toString().trim());
      return {
        ...item,
        image_url: Array.isArray(match?.photos) ? match.photos.join(',') : (match?.photos || ''),
        master_description: match?.description || ''
      };
    });
  }

  async deleteInvoice(id: string) {
    const repo = AppDataSource.getRepository(PurchaseInvoice);
    return repo.delete({ id });
  }

  async deleteOrder(id: string) {
    return this.poRepo.delete({ id });
  }
}

export const purchaseService = new PurchaseService();
