import { Request, Response } from 'express';
import { AppDataSource } from '../config/data-source';
import { DefectiveStock } from '../entities/DefectiveStock';
import { BarcodeBatch } from '../entities/BarcodeBatch';
import { sendSuccess, sendError } from '../utils/response';

export const getDefectiveStock = async (req: Request, res: Response) => {
  try {
    const qb = AppDataSource.getRepository(DefectiveStock).createQueryBuilder('ds')
      .leftJoinAndSelect('ds.barcodeBatch', 'barcodeBatch')
      .leftJoinAndSelect('barcodeBatch.product_group', 'product_group')
      .leftJoinAndSelect('barcodeBatch.size', 'size')
      .leftJoinAndSelect('barcodeBatch.color', 'color');

    const filters: any = req.query;
    if (filters.gte_marked_at) qb.andWhere('ds.created_at >= :gte', { gte: filters.gte_marked_at });
    if (filters.lte_marked_at) qb.andWhere('ds.created_at <= :lte', { lte: filters.lte_marked_at });
    qb.orderBy('ds.created_at', 'DESC');

    const data = await qb.getMany();
    sendSuccess(res, data);
  } catch (err: any) {
    sendError(res, err.message);
  }
};

export const createDefectiveStock = async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const repo = AppDataSource.getRepository(DefectiveStock);
    const batchRepo = AppDataSource.getRepository(BarcodeBatch);

    // Accept both old field names (item_id/barcode) and new names (barcode_batch_id/barcode_alias)
    let batchId: string | null = data.barcode_batch_id || data.item_id || null;
    const barcodeAlias: string = data.barcode_alias || data.barcode || '';

    // If no batch ID provided but we have a barcode alias, look up the batch
    if (!batchId && barcodeAlias) {
      const batch = await batchRepo.findOne({
        where: { barcode_alias_8digit: barcodeAlias },
        select: ['id'],
      });
      if (batch) batchId = batch.id;
    }

    const newStock = repo.create({
      barcode_batch_id: batchId ?? undefined,
      barcode_alias: barcodeAlias,
      quantity: data.quantity || 1,
      reason: data.reason || '',
      notes: data.notes || '',
      reported_by: data.reported_by || data.marked_by || null,
    });
    const saved = await repo.save(newStock);
    sendSuccess(res, saved, 'Created successfully');
  } catch (err: any) {
    sendError(res, err.message, 400);
  }
};
