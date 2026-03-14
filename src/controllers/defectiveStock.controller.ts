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
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const data = req.body;
    const batchRepo = queryRunner.manager.getRepository(BarcodeBatch);
    const defectiveRepo = queryRunner.manager.getRepository(DefectiveStock);

    let batchId: string | null = data.barcode_batch_id || data.item_id || null;
    const barcodeAlias: string = data.barcode_alias || data.barcode || '';

    if (!batchId && barcodeAlias) {
      const batch = await batchRepo.findOne({
        where: { barcode_alias_8digit: barcodeAlias },
        select: ['id', 'available_quantity'],
      });
      if (batch) batchId = batch.id;
    }

    if (!batchId) {
      throw new Error('Barcode batch not found');
    }

    const batch = await batchRepo.findOneBy({ id: batchId });
    if (!batch) {
      throw new Error('Barcode batch not found');
    }

    const qty = Number(data.quantity) || 1;
    if (batch.available_quantity < qty) {
      throw new Error(`Insufficient available quantity (Available: ${batch.available_quantity})`);
    }

    // 1. Create defective record
    const newStock = defectiveRepo.create({
      barcode_batch_id: batchId,
      barcode_alias: barcodeAlias || batch.barcode_alias_8digit,
      quantity: qty,
      reason: data.reason || '',
      notes: data.notes || '',
      reported_by: data.reported_by || data.marked_by || null,
    });
    await defectiveRepo.save(newStock);

    // 2. Decrement available quantity in batch
    batch.available_quantity -= qty;
    await batchRepo.save(batch);

    await queryRunner.commitTransaction();
    sendSuccess(res, newStock, 'Created successfully and stock updated');
  } catch (err: any) {
    await queryRunner.rollbackTransaction();
    sendError(res, err.message, 400);
  } finally {
    await queryRunner.release();
  }
};

export const deleteDefectiveStock = async (req: Request, res: Response) => {
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const { id } = req.params;
    const defectiveRepo = queryRunner.manager.getRepository(DefectiveStock);
    const batchRepo = queryRunner.manager.getRepository(BarcodeBatch);

    const record = await defectiveRepo.findOneBy({ id });
    if (!record) {
      throw new Error('Record not found');
    }

    // 1. Restore available quantity if batch still exists
    if (record.barcode_batch_id) {
      const batch = await batchRepo.findOneBy({ id: record.barcode_batch_id });
      if (batch) {
        batch.available_quantity += record.quantity;
        await batchRepo.save(batch);
      }
    }

    // 2. Delete record
    await defectiveRepo.remove(record);

    await queryRunner.commitTransaction();
    sendSuccess(res, null, 'Deleted successfully and stock restored');
  } catch (err: any) {
    await queryRunner.rollbackTransaction();
    sendError(res, err.message, 400);
  } finally {
    await queryRunner.release();
  }
};
