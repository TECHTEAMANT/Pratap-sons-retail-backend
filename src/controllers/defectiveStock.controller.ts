import { Request, Response } from 'express';
import { AppDataSource } from '../config/data-source';
import { DefectiveStock } from '../entities/DefectiveStock';
import { sendSuccess, sendError } from '../utils/response';

export const getDefectiveStock = async (req: Request, res: Response) => {
  try {
    const data = await AppDataSource.getRepository(DefectiveStock).find();
    sendSuccess(res, data);
  } catch (err: any) {
    sendError(res, err.message);
  }
};
