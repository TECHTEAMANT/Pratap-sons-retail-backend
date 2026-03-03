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
  items: BulkItem[];
  vendor_code?: string;
  original_quantities?: Record<string, number>; // used only on update
}

// ─── Helper: get next barcode number inside a transaction ─────────────────────

async function getNextBarcodeAlias(manager: any): Promise<string> {
  let seq = await manager.findOne(BarcodeSequence, { where: { id: 1 } });

  const getValidMax = async (): Promise<number> => {
    const res = await manager.query(
      `SELECT MAX(CAST(barcode_alias_8digit AS INTEGER)) AS max_num
       FROM barcode_batches
       WHERE barcode_alias_8digit ~ '^[0-9]+$'
         AND CAST(barcode_alias_8digit AS INTEGER) < 10000000`
    );
    return res[0]?.max_num ? parseInt(res[0].max_num, 10) : 0;
  };

  if (!seq) {
    const maxNum = await getValidMax();
    seq = manager.create(BarcodeSequence, { id: 1, last_number: maxNum });
  } else if (Number(seq.last_number) >= 10000000) {
    seq.last_number = await getValidMax();
  }

  const nextNumber = Number(seq.last_number) + 1;
  seq.last_number = nextNumber;
  await manager.save(seq);
  return nextNumber.toString().padStart(8, '0');
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

// ─── Helper: resolve group/color codes from DB ────────────────────────────────

async function resolveCodes(
  manager: any,
  productGroupId: string,
  colorId: string | undefined
): Promise<{ groupCode: string; colorCode: string; floorId: string | null }> {
  const [pgRow] = productGroupId
    ? await manager.query(
        `SELECT group_code, floor FROM product_groups WHERE id = $1`,
        [productGroupId]
      )
    : [{}];
  const [clRow] = colorId
    ? await manager.query(`SELECT color_code FROM colors WHERE id = $1`, [colorId])
    : [{}];
  return {
    groupCode: pgRow?.group_code || 'PG',
    colorCode: clRow?.color_code || '',
    floorId: pgRow?.floor || null,
  };
}

export class PurchaseService {
  private poRepo = AppDataSource.getRepository(PurchaseOrder);

  async getOrders(filters: {
    vendor?: string;
    vendor_id?: string;
    status?: string;
    search?: string;
    search_po_number?: string;
    neq_status?: string;
    sort?: string;
    order?: string;
    page?: number;
    limit?: number;
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

    const sortCol = filters.sort === 'order_date' ? 'po.order_date' : 'po.created_at';
    const sortDir = filters.order?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(sortCol, sortDir);
    qb.skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async getOrderById(id: string) {
    return this.poRepo.findOne({ where: { id }, relations: ['purchase_items', 'order_items', 'vendor'] });
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
    const allowed = ['status', 'taxable_value', 'manual_gst_amount', 'total_amount', 'notes', 'vendor_invoice_attachment', 'gst_difference_reason'];
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
    return repo.find({ where: filters, order: { created_at: 'ASC' } });
  }

  async getPurchaseItems(filters: any) {
    const repo = AppDataSource.getRepository(PurchaseItem);
    return repo.find({ 
      where: filters, 
      relations: ['product_group', 'color', 'size'],
      order: { created_at: 'ASC' } 
    });
  }

  async createPurchaseItem(data: any) {
    const repo = AppDataSource.getRepository(PurchaseItem);
    
    // Map frontend property names to TypeORM relation column keys
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
    // Safety check: don't delete everything if no filters
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
      const { items, vendor, vendor_code = 'VND', ...header } = payload;

      // 1. Generate PO number
      const year = new Date().getFullYear();
      const prefix = `PI${year}`;
      const maxRes = await manager.query(
        `SELECT po_number FROM purchase_orders WHERE po_number LIKE $1 ORDER BY po_number DESC LIMIT 1`,
        [`${prefix}%`]
      );
      let nextNum = 1;
      if (maxRes.length > 0) {
        const lastPo = maxRes[0].po_number;
        const lastNumPart = parseInt(lastPo.substring(prefix.length), 10);
        if (!isNaN(lastNumPart)) {
          nextNum = lastNumPart + 1;
        }
      }
      const poNumber = `${prefix}${nextNum.toString().padStart(6, '0')}`;

      // 2. Insert purchase_orders
      const poResult = await manager.query(
        `INSERT INTO purchase_orders
           (po_number, vendor, order_date, invoice_number, total_items, total_amount,
            status, notes, taxable_value, ledger_discount, ledger_freight,
            ledger_freight_gst_rate, manual_gst_amount, vendor_invoice_attachment,
            gst_type, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,'Completed',$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING id, po_number`,
        [
          poNumber, vendor, header.order_date, header.invoice_number,
          header.total_items, header.total_amount, header.notes ?? null,
          header.taxable_value, header.ledger_discount ?? null,
          header.ledger_freight ?? null, header.ledger_freight_gst_rate ?? null,
          header.manual_gst_amount ?? null, header.vendor_invoice_attachment ?? null,
          header.gst_type ?? null, userId ?? null,
        ]
      );
      const po = poResult[0];

      const designNos = [...new Set(items.map(i => ensureId(i.design_no)?.trim().toUpperCase()))].filter(Boolean) as string[];
      const existingMasters: any[] = designNos.length
        ? await manager.query(
            `SELECT id, design_no, hsn_code FROM product_masters WHERE vendor = $1 AND UPPER(TRIM(design_no)) = ANY($2)`,
            [vendor, designNos]
          )
        : [];
      const masterMap = new Map(existingMasters.map(m => [m.design_no.trim().toUpperCase(), m]));

      // 4. Upsert product_masters
      for (const item of items) {
        const itemDesignNo = ensureId(item.design_no)?.trim().toUpperCase() || '';
        const existing = masterMap.get(itemDesignNo);
        if (existing) {
          await manager.query(
            `UPDATE product_masters SET 
               hsn_code = $1, 
               mrp = $2, 
               barcodes_per_item = $3, 
               gst_logic = $4,
               updated_at = NOW() 
             WHERE id = $5`,
            [item.hsn_code || existing.hsn_code, item.mrp, item.barcodes_per_item ?? 1, item.gst_logic, existing.id]
          );
        } else {
          await manager.query(
            `INSERT INTO product_masters
               (design_no, product_group, color, vendor, mrp, gst_logic, floor,
                photos, description, barcodes_per_item, payout_code, hsn_code, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
            [
              ensureId(item.design_no), ensureId(item.product_group),
              ensureId(item.color) || null, vendor, item.mrp, item.gst_logic,
              ensureId(item.floor_id) || null,
              item.image_url ? [item.image_url] : [],
              item.description || '', item.barcodes_per_item ?? 1,
              item.payout_code || null, item.hsn_code || null, userId ?? null,
            ]
          );
        }
      }

      // 5. Bulk-insert purchase_items + upsert barcode_batches
      for (const item of items) {
        const productGroupId = ensureId(item.product_group) || '';
        const colorId = ensureId(item.color);
        const { groupCode, colorCode, floorId } = await resolveCodes(
          manager, productGroupId, colorId
        );
        const effectiveFloor = ensureId(item.floor_id) || floorId;

        for (const sq of item.sizes) {
          if (!sq.quantity || sq.quantity <= 0) continue;

          // Insert purchase_item
          await manager.query(
            `INSERT INTO purchase_items
               (po_id, design_no, product_group, color, size, quantity,
                cost_per_item, mrp, mrp_markup_percent, gst_logic,
                description, order_number, hsn_code, floor_id, barcodes_per_item)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
            [
              po.id, item.design_no, item.product_group,
              item.color || null, sq.size, sq.quantity,
              item.cost_per_item, item.mrp, item.mrp_markup_percent,
              item.gst_logic, item.description || null,
              item.order_number || null, item.hsn_code || null,
              effectiveFloor, item.barcodes_per_item || 1
            ]
          );

          // Check for existing barcode batch
          const colorCondition = (item.color && item.color !== 'null') ? `color = '${item.color}'` : `color IS NULL`;
          const batches = await manager.query(
            `SELECT id, total_quantity, available_quantity
             FROM barcode_batches
             WHERE design_no = $1 AND product_group = $2 AND size = $3
               AND vendor = $4 AND status = 'active' AND ${colorCondition}
             ORDER BY created_at DESC LIMIT 1`,
            [item.design_no, item.product_group, sq.size, vendor]
          );

          const printQty = (sq.print_quantity ?? sq.quantity * (item.barcodes_per_item ?? 1));

          if (batches.length > 0) {
            const b = batches[0];
            const updateFields: string[] = [
              `total_quantity = $1`,
              `available_quantity = $2`,
              `cost_actual = $3`,
              `mrp = $4`,
              `mrp_markup_percent = $5`,
              `gst_logic = $6`,
              `floor = $7`,
              `po_id = $8`,
              `order_number = $9`,
              `print_quantity = $10`,
              `hsn_code = $11`,
              `modified_by = $12`,
              `updated_at = NOW()`
            ];
            const updateParams: any[] = [
              Number(b.total_quantity) + sq.quantity,
              Number(b.available_quantity) + sq.quantity,
              item.cost_per_item, item.mrp, item.mrp_markup_percent,
              item.gst_logic, effectiveFloor, po.id,
              item.order_number || null,
              printQty, item.hsn_code || null, userId ?? null
            ];

            if (item.image_url) {
              updateFields.push(`photos = $${updateParams.length + 1}`);
              updateParams.push([item.image_url]);
            }
            if (item.description) {
              updateFields.push(`description = $${updateParams.length + 1}`);
              updateParams.push(item.description);
            }

            updateParams.push(b.id);
            await manager.query(
              `UPDATE barcode_batches SET ${updateFields.join(', ')} WHERE id = $${updateParams.length}`,
              updateParams
            );
          } else {
            const alias = await getNextBarcodeAlias(manager);
            const structured = buildStructuredBarcode(
              groupCode, item.design_no, colorCode, vendor_code, item.mrp, alias
            );
            const costEncoded = encodeCost ? encodeCost(item.cost_per_item) : null;
            await manager.query(
              `INSERT INTO barcode_batches
                 (barcode_alias_8digit, barcode_structured, design_no, product_group,
                  size, color, vendor, cost_actual, cost_encoded, mrp, mrp_markup_percent,
                  gst_logic, total_quantity, available_quantity, floor, print_quantity,
                  status, po_id, photos, description, order_number,
                  payout_code, hsn_code, created_by)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
                       'active',$17,$18,$19,$20,$21,$22,$23)`,
              [
                alias, structured, item.design_no, item.product_group,
                sq.size, item.color || null, vendor,
                item.cost_per_item, costEncoded, item.mrp, item.mrp_markup_percent,
                item.gst_logic, sq.quantity, sq.quantity,
                effectiveFloor, printQty,
                po.id,
                item.image_url ? [item.image_url] : [],
                item.description || null, item.order_number || null,
                item.payout_code || null, item.hsn_code || null, userId ?? null,
              ]
            );
          }
        }
      }

      return { id: po.id, po_number: po.po_number };
    });
  }

  // ─── BULK SAVE — UPDATE ────────────────────────────────────────────────────

  async bulkUpdateInvoice(poId: string, payload: BulkInvoicePayload, userId: string) {
    return AppDataSource.transaction(async (manager) => {
      const { items, vendor, vendor_code = 'VND', original_quantities = {} } = payload;

      // 1. Fetch existing PO
      const [currentPO] = await manager.query(
        `SELECT id, po_number, vendor FROM purchase_orders WHERE id = $1`, [poId]
      );
      if (!currentPO) throw new Error('Purchase invoice not found');

      // 2. Update purchase_orders header
      await manager.query(
        `UPDATE purchase_orders SET
           vendor = $1, order_date = $2, invoice_number = $3,
           total_items = $4, total_amount = $5, status = 'Completed',
           notes = $6, taxable_value = $7, ledger_discount = $8,
           ledger_freight = $9, ledger_freight_gst_rate = $10,
           manual_gst_amount = $11, vendor_invoice_attachment = $12,
           gst_type = $13, modified_by = $14, updated_at = NOW()
         WHERE id = $15`,
        [
          vendor, payload.order_date, payload.invoice_number,
          payload.total_items, payload.total_amount,
          payload.notes ?? null, payload.taxable_value,
          payload.ledger_discount ?? null, payload.ledger_freight ?? null,
          payload.ledger_freight_gst_rate ?? null, payload.manual_gst_amount ?? null,
          payload.vendor_invoice_attachment ?? null, payload.gst_type ?? null,
          userId ?? null, poId,
        ]
      );

      // 3. Upsert product_masters
      const designNos = [...new Set(items.map(i => ensureId(i.design_no)?.trim().toUpperCase()))].filter(Boolean) as string[];
      const existingMasters: any[] = designNos.length
        ? await manager.query(
            `SELECT id, design_no, hsn_code FROM product_masters WHERE vendor = $1 AND UPPER(TRIM(design_no)) = ANY($2)`,
            [vendor, designNos]
          )
        : [];
      const masterMap = new Map(existingMasters.map(m => [m.design_no.trim().toUpperCase(), m]));

      for (const item of items) {
        const itemDesignNo = ensureId(item.design_no)?.trim().toUpperCase() || '';
        const existing = masterMap.get(itemDesignNo);
        if (existing) {
          const updateFields: string[] = [];
          const updateParams: any[] = [];
          
          if (item.hsn_code && item.hsn_code !== existing.hsn_code) {
            updateFields.push(`hsn_code = $${updateParams.length + 1}`);
            updateParams.push(item.hsn_code);
          }
          if (item.mrp) {
            updateFields.push(`mrp = $${updateParams.length + 1}`);
            updateParams.push(item.mrp);
          }
          if (item.barcodes_per_item) {
            updateFields.push(`barcodes_per_item = $${updateParams.length + 1}`);
            updateParams.push(item.barcodes_per_item);
          }
          if (item.gst_logic) {
            updateFields.push(`gst_logic = $${updateParams.length + 1}`);
            updateParams.push(item.gst_logic);
          }
          if (item.image_url) {
            updateFields.push(`photos = $${updateParams.length + 1}`);
            updateParams.push([item.image_url]);
          }
          if (item.description) {
            updateFields.push(`description = $${updateParams.length + 1}`);
            updateParams.push(item.description);
          }

          if (updateFields.length > 0) {
            updateFields.push(`updated_at = NOW()`);
            updateParams.push(existing.id);
            await manager.query(
              `UPDATE product_masters SET ${updateFields.join(', ')} WHERE id = $${updateParams.length}`,
              updateParams
            );
          }
        } else {
          await manager.query(
            `INSERT INTO product_masters
               (design_no, product_group, color, vendor, mrp, gst_logic, floor,
                photos, description, barcodes_per_item, payout_code, hsn_code, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
             ON CONFLICT DO NOTHING`,
            [
              item.design_no, item.product_group, item.color || null,
              vendor, item.mrp, item.gst_logic, item.floor_id || null,
              item.image_url ? [item.image_url] : [],
              item.description || '', item.barcodes_per_item ?? 1,
              item.payout_code || null, item.hsn_code || null, userId ?? null,
            ]
          );
        }
      }

      // 4. Build old/new qty maps and compute deltas
      let oldMap: Record<string, number> = { ...original_quantities };

      // If no original_quantities were passed, recompute from DB
      if (Object.keys(oldMap).length === 0) {
        const dbItems: any[] = await manager.query(
          `SELECT design_no, product_group, color, size, quantity FROM purchase_items WHERE po_id = $1`,
          [poId]
        );
        for (const r of dbItems) {
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

      const allKeys = new Set([...Object.keys(oldMap), ...Object.keys(newMap)]);

      // 5. Apply barcode_batches adjustments by delta
      for (const key of allKeys) {
        const [vendorId, designNo, productGroupId, colorId, sizeId] = key.split('__');
        const oldQty = oldMap[key] || 0;
        const newQty = newMap[key] || 0;
        const delta = newQty - oldQty;
        // Proceed even if delta is 0 to update metadata (MRP, price, barcode counts, etc.)

        const colorCondition = (colorId && colorId !== 'null' && colorId !== '') ? `color = '${colorId}'` : `color IS NULL`;
        const batches = await manager.query(
          `SELECT id, total_quantity, available_quantity, floor, photos, payout_code
           FROM barcode_batches
           WHERE UPPER(TRIM(design_no)) = UPPER(TRIM($1)) AND product_group = $2 AND size = $3
             AND vendor = $4 AND status = 'active' AND ${colorCondition}
           ORDER BY created_at DESC LIMIT 1`,
          [designNo, productGroupId, sizeId, vendorId]
        );

        // Find the item that matches this combo for metadata updates
        const itemForCombo = items.find(it =>
          ensureId(it.design_no)?.trim().toUpperCase() === designNo.trim().toUpperCase() &&
          ensureId(it.product_group) === productGroupId &&
          (ensureId(it.color) || '') === (colorId || '') &&
          it.sizes.some(sq => ensureId(sq.size) === sizeId)
        );

        if (batches.length > 0) {
          const b = batches[0];
          const newTotal = Math.max(0, Number(b.total_quantity) + delta);
          const newAvail = Math.max(0, Number(b.available_quantity) + delta);

          const updateFields: string[] = [
            `total_quantity = $1`,
            `available_quantity = $2`,
            `modified_by = $3`,
            `updated_at = NOW()`,
          ];
          const updateParams: any[] = [newTotal, newAvail, userId ?? null];

          if (itemForCombo) {
            const productGroupId = ensureId(itemForCombo.product_group) || '';
            const colorId = ensureId(itemForCombo.color);
            const { floorId } = await resolveCodes(manager, productGroupId, colorId);
            const effectiveFloor = ensureId(itemForCombo.floor_id) || b.floor || floorId;
            const sqMatch = itemForCombo.sizes.find(s => ensureId(s.size) === sizeId);
            const printQty = sqMatch
              ? (sqMatch.print_quantity ?? sqMatch.quantity * (itemForCombo.barcodes_per_item ?? 1))
              : undefined;

            updateFields.push(
              `cost_actual = $${updateParams.length + 1}`,
              `mrp = $${updateParams.length + 2}`,
              `mrp_markup_percent = $${updateParams.length + 3}`,
              `gst_logic = $${updateParams.length + 4}`,
              `floor = $${updateParams.length + 5}`,
              `po_id = $${updateParams.length + 6}`,
              `description = $${updateParams.length + 7}`,
              `order_number = $${updateParams.length + 8}`,
              `payout_code = $${updateParams.length + 9}`,
              `hsn_code = $${updateParams.length + 10}`
            );
            updateParams.push(
              itemForCombo.cost_per_item, itemForCombo.mrp,
              itemForCombo.mrp_markup_percent, itemForCombo.gst_logic,
              effectiveFloor, poId,
              itemForCombo.description || null, itemForCombo.order_number || null,
              itemForCombo.payout_code || b.payout_code || null,
              itemForCombo.hsn_code || null
            );
            if (printQty !== undefined) {
              updateFields.push(`print_quantity = $${updateParams.length + 1}`);
              updateParams.push(printQty);
            }
            if (itemForCombo.image_url) {
              updateFields.push(`photos = $${updateParams.length + 1}`);
              updateParams.push([itemForCombo.image_url]);
            }
          }

          updateParams.push(b.id);
          await manager.query(
            `UPDATE barcode_batches SET ${updateFields.join(', ')} WHERE id = $${updateParams.length}`,
            updateParams
          );
        } else if (delta > 0 && itemForCombo) {
          // No existing batch — create new
          const productGroupId = ensureId(itemForCombo.product_group) || '';
          const colorId = ensureId(itemForCombo.color);
          const { groupCode, colorCode, floorId } = await resolveCodes(
            manager, productGroupId, colorId
          );
          const effectiveFloor = ensureId(itemForCombo.floor_id) || floorId;
          const alias = await getNextBarcodeAlias(manager);
          const structured = buildStructuredBarcode(
            groupCode, designNo, colorCode, vendor_code, itemForCombo.mrp, alias
          );
          const sqMatch = itemForCombo.sizes.find(s => s.size === sizeId);
          const printQty = sqMatch
            ? (sqMatch.print_quantity ?? delta * (itemForCombo.barcodes_per_item ?? 1))
            : delta;
          const costEncoded = encodeCost ? encodeCost(itemForCombo.cost_per_item) : null;

          await manager.query(
            `INSERT INTO barcode_batches
               (barcode_alias_8digit, barcode_structured, design_no, product_group,
                size, color, vendor, cost_actual, cost_encoded, mrp, mrp_markup_percent,
                gst_logic, total_quantity, available_quantity, floor, print_quantity,
                status, po_id, photos, description, order_number,
                payout_code, hsn_code, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
                     'active',$17,$18,$19,$20,$21,$22,$23)`,
            [
              alias, structured, designNo, productGroupId,
              sizeId, colorId || null, vendorId,
              itemForCombo.cost_per_item, costEncoded,
              itemForCombo.mrp, itemForCombo.mrp_markup_percent,
              itemForCombo.gst_logic, delta, delta,
              effectiveFloor, printQty,
              poId,
              itemForCombo.image_url ? [itemForCombo.image_url] : [],
              itemForCombo.description || null, itemForCombo.order_number || null,
              itemForCombo.payout_code || null, itemForCombo.hsn_code || null,
              userId ?? null,
            ]
          );
        }
      }

      // 6. Delete old purchase_items and re-insert
      await manager.query(`DELETE FROM purchase_items WHERE po_id = $1`, [poId]);

      for (const item of items) {
        const productGroupId = ensureId(item.product_group) || '';
        const colorId = ensureId(item.color);
        const { floorId } = await resolveCodes(manager, productGroupId, colorId);
        const effectiveFloor = ensureId(item.floor_id) || floorId;

        for (const sq of item.sizes) {
          if (!sq.quantity || sq.quantity <= 0) continue;
          await manager.query(
            `INSERT INTO purchase_items
               (po_id, design_no, product_group, color, size, quantity,
                cost_per_item, mrp, mrp_markup_percent, gst_logic,
                description, order_number, hsn_code, floor_id, barcodes_per_item)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
            [
              poId, item.design_no, item.product_group,
              item.color || null, sq.size, sq.quantity,
              item.cost_per_item, item.mrp, item.mrp_markup_percent,
              item.gst_logic, item.description || null,
              item.order_number || null, item.hsn_code || null,
              effectiveFloor, item.barcodes_per_item || 1
            ]
          );
        }
      }

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
    const vendorId = po?.vendor_id || (po as any).vendor; // Handle both relations and raw columns

    const masters = await AppDataSource.getRepository(ProductMaster).find({
      where: { design_no: In(designNos) } // TypeORM handles In() for exact matches, we trimmed input
    });

    const masterMap = new Map<string, any>();
    masters.forEach(m => {
      // Prefer match with vendor, fallback to any if not present
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
}

export const purchaseService = new PurchaseService();

