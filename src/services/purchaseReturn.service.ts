import { AppDataSource } from '../config/data-source';
import { PurchaseReturn } from '../entities/PurchaseReturn';
import { PurchaseReturnItem } from '../entities/PurchaseReturnItem';
import { In } from 'typeorm';

export class PurchaseReturnService {
  private repo = AppDataSource.getRepository(PurchaseReturn);

  async findAll(filters: { vendor_id?: string; status?: string }) {
    const qb = this.repo.createQueryBuilder('pr')
      .leftJoinAndSelect('pr.vendor', 'v')
      .leftJoinAndSelect('pr.original_po', 'po');
    if (filters.vendor_id) qb.andWhere('pr.vendor_id = :vid', { vid: filters.vendor_id });
    if (filters.status) {
      // Support comma-separated multi-value from shim's .in() call
      const statusValues = filters.status.includes(',')
        ? filters.status.split(',')
        : [filters.status];
      qb.andWhere('pr.status IN (:...statuses)', { statuses: statusValues });
    }
    qb.orderBy('pr.created_at', 'DESC');
    return qb.getMany();
  }

  async findById(id: string) {
    return this.repo.createQueryBuilder('pr')
      .leftJoinAndSelect('pr.vendor', 'v')
      .leftJoinAndSelect('pr.original_po', 'po')
      .leftJoin('users', 'u', 'u.id = pr.created_by')
      .addSelect('u.name', 'pr_created_by_name')
      .where('pr.id = :id', { id })
      .getOne()
      .then(res => {
        if (res && (res as any).pr_created_by_name) {
          (res as any).created_by_user = { name: (res as any).pr_created_by_name };
        }
        return res;
      });
  }

  async findAllItems(filters: any) {
    const qb = AppDataSource.getRepository(PurchaseReturnItem).createQueryBuilder('pri')
      .leftJoinAndSelect('pri.purchase_return', 'pr');
      
    if (filters['gte_purchase_return.return_date']) {
      qb.andWhere('DATE(pr.return_date) >= :gte', { gte: filters['gte_purchase_return.return_date'] });
    }
    if (filters['lte_purchase_return.return_date']) {
      qb.andWhere('DATE(pr.return_date) <= :lte', { lte: filters['lte_purchase_return.return_date'] });
    }
    if (filters.return_id) {
      if (filters.return_id.includes(',')) {
        qb.andWhere('pri.return_id IN (:...returnIds)', { returnIds: filters.return_id.split(',') });
      } else {
        qb.andWhere('pri.return_id = :returnId', { returnId: filters.return_id });
      }
    }

    // Always join item details for returns (often needed for invoices/analysis)
    qb.leftJoinAndSelect('pri.item', 'item')
      .leftJoinAndSelect('item.product_group', 'pg')
      .leftJoinAndSelect('item.color', 'c')
      .leftJoinAndSelect('item.size', 's');
    
    return qb.getMany();
  }

  async create(data: any, userId: string) {
    const count = await this.repo.count();
    const retNum = `PRET${new Date().getFullYear()}${(count + 1).toString().padStart(6, '0')}`;
    const ret = this.repo.create({
      return_number: retNum,
      vendor_id: data.vendor_id,
      original_po_id: data.original_po_id || null,
      return_date: data.return_date,
      total_items: data.total_items || 0,
      total_amount: data.total_amount || 0,
      gst_type: data.gst_type || null,
      cgst_amount: data.cgst_amount || 0,
      sgst_amount: data.sgst_amount || 0,
      igst_amount: data.igst_amount || 0,
      total_return_amount: data.total_return_amount || 0,
      reason: data.reason || null,
      notes: data.notes || null,
      status: data.status || 'sent',
      created_by: userId,
    });
    return this.repo.save(ret);
  }

  async createItem(data: any) {
    const itemRepo = AppDataSource.getRepository(PurchaseReturnItem);
    const item = itemRepo.create({
      return_id: data.return_id,
      item_id: data.item_id,
      barcode_id: data.barcode_id,
      reason: data.reason || null,
      condition: data.condition || null,
      cost: data.cost || 0,
      hsn_code: data.hsn_code || null,
    });
    return itemRepo.save(item);
  }

  async update(id: string, data: Record<string, any>) {
    const ret = await this.repo.findOneBy({ id });
    if (!ret) return null;
    const allowed = [
      'status', 'total_items', 'total_amount', 'reason', 'notes',
      'gst_type', 'cgst_amount', 'sgst_amount', 'igst_amount', 'total_return_amount'
    ];
    for (const key of allowed) { if (data[key] !== undefined) (ret as any)[key] = data[key]; }
    return this.repo.save(ret);
  }

  /**
   * Bulk update a purchase return:
   * - Reverses inventory effect of old items
   * - Applies inventory effect of new items
   * - Replaces purchase_return_items
   * - Updates header fields
   */
  async bulkUpdateReturn(returnId: string, payload: any, userId: string) {
    return AppDataSource.transaction(async (manager) => {
      // 1. Fetch existing return header
      const [existingReturn] = await manager.query(
        `SELECT id, return_number, vendor_id FROM purchase_returns WHERE id = $1`,
        [returnId]
      );
      if (!existingReturn) throw new Error('Purchase return not found');

      // 2. Fetch existing return items
      const oldItems: any[] = await manager.query(
        `SELECT item_id, barcode_id, quantity FROM purchase_return_items WHERE return_id = $1`,
        [returnId]
      );

      // 3. Build old quantity map (item_id -> qty)
      const oldQtyMap: Record<string, number> = {};
      for (const item of oldItems) {
        oldQtyMap[item.item_id] = (oldQtyMap[item.item_id] || 0) + (Number(item.quantity) || 1);
      }

      // 4. Build new quantity map from payload
      const newItems: any[] = payload.items || [];
      const newQtyMap: Record<string, number> = {};
      for (const item of newItems) {
        newQtyMap[item.item_id] = (newQtyMap[item.item_id] || 0) + (Number(item.quantity) || 1);
      }

      // 5. Collect all unique item_ids from old and new
      const allItemIds = [...new Set([...Object.keys(oldQtyMap), ...Object.keys(newQtyMap)])];

      // 6. Process each item_id delta
      for (const itemId of allItemIds) {
        const oldQty = oldQtyMap[itemId] || 0;
        const newQty = newQtyMap[itemId] || 0;
        const delta = newQty - oldQty; // positive = more items returned, negative = fewer items returned

        if (delta === 0) continue;

        // Fetch current barcode batch
        const [batch] = await manager.query(
          `SELECT id, available_quantity, total_quantity, status FROM barcode_batches WHERE id = $1`,
          [itemId]
        );
        if (!batch) continue;

        const currentAvail = Number(batch.available_quantity) || 0;
        const currentTotal = Number(batch.total_quantity) || 0;

        // delta > 0: more items returned => reduce available/total
        // delta < 0: fewer items returned => restore available/total
        const newAvail = Math.max(0, currentAvail - delta);
        const newTotal = Math.max(0, currentTotal - delta);
        const newStatus = (newAvail === 0 && newTotal === 0) ? 'returned' : 'active';

        await manager.query(
          `UPDATE barcode_batches SET available_quantity = $1, total_quantity = $2, status = $3, updated_at = NOW() WHERE id = $4`,
          [newAvail, newTotal, newStatus, itemId]
        );

        // 7. Adjust defective_stock for delta
        const newItemData = newItems.find((it: any) => it.item_id === itemId);
        const barcodeId = newItemData?.barcode_id || oldItems.find(it => it.item_id === itemId)?.barcode_id || null;

        if (delta !== 0) {
          await manager.query(
            `INSERT INTO defective_stock (barcode_batch_id, barcode_alias, quantity, reason, notes, reported_by)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              itemId,
              barcodeId,
              -delta, // negative delta means restoring to stock
              newItemData?.reason || payload.reason || 'Purchase return edit adjustment',
              `Edit of purchase return ${existingReturn.return_number}`,
              userId || null,
            ]
          );
        }
      }

      // 8. Delete old return items and insert new ones
      await manager.query(`DELETE FROM purchase_return_items WHERE return_id = $1`, [returnId]);

      for (const item of newItems) {
        await manager.query(
          `INSERT INTO purchase_return_items (return_id, item_id, barcode_id, reason, condition, cost, discount, quantity, hsn_code)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            returnId,
            item.item_id,
            item.barcode_id,
            item.reason || null,
            item.condition || null,
            item.cost || 0,
            item.discount || 0,
            item.quantity || 1,
            item.hsn_code || null,
          ]
        );
      }

      // 9. Compute totals
      const totalItems = newItems.reduce((sum: number, i: any) => sum + (Number(i.quantity) || 1), 0);
      const totalAmount = newItems.reduce((sum: number, i: any) => sum + (Number(i.cost) * (Number(i.quantity) || 1)), 0);

      const ledgerDiscount = Number(payload.ledger_discount) || 0;
      const ledgerFreight = Number(payload.ledger_freight) || 0;
      const ledgerFreightGstRate = Number(payload.ledger_freight_gst_rate) || 5;
      const taxableValue = Math.max(0, totalAmount - ledgerDiscount);
      const totalGstAmount = Number(payload.gst_amount) || 0;
      const freightGst = ledgerFreight > 0 ? (ledgerFreight * ledgerFreightGstRate) / 100 : 0;
      const combinedGst = totalGstAmount + freightGst;
      const grandTotal = Math.round(taxableValue + ledgerFreight + combinedGst);

      // Simple GST breakdown
      const gstType = payload.gst_type || 'CGST_SGST';
      let cgst = 0, sgst = 0, igst = 0;
      if (gstType === 'IGST') {
        igst = combinedGst;
      } else {
        cgst = combinedGst / 2;
        sgst = combinedGst / 2;
      }

      // 10. Update the return header
      await manager.query(
        `UPDATE purchase_returns SET
           return_date = $1, total_items = $2, total_amount = $3,
           ledger_discount = $4, ledger_freight = $5, ledger_freight_gst_rate = $6,
           gst_type = $7, cgst_amount = $8, sgst_amount = $9, igst_amount = $10,
           total_return_amount = $11, reason = $12, notes = $13, updated_at = NOW()
         WHERE id = $14`,
        [
          payload.return_date, totalItems, totalAmount,
          ledgerDiscount > 0 ? ledgerDiscount : null,
          ledgerFreight > 0 ? ledgerFreight : null,
          ledgerFreight > 0 ? ledgerFreightGstRate : null,
          gstType, cgst, sgst, igst,
          grandTotal,
          payload.reason || null, payload.notes || null,
          returnId,
        ]
      );

      return { id: returnId, return_number: existingReturn.return_number };
    });
  }

  async delete(id: string) {
    return this.repo.delete({ id });
  }

  async deleteItems(filters: any) {
    const repo = AppDataSource.getRepository(PurchaseReturnItem);
    return repo.delete(filters);
  }
}

export const purchaseReturnService = new PurchaseReturnService();
