import { Request, Response } from 'express';
import { walletService } from '../services/wallet.service';
import { sendSuccess, sendError, sendNotFound } from '../utils/response';

export class WalletController {
  async getWallet(req: Request, res: Response) {
    try {
      const mobile = req.params.mobile;
      if (!mobile) return sendError(res, 'Mobile number is required', 400);
      
      const wallet = await walletService.getWallet(mobile);
      if (!wallet) return sendNotFound(res, 'Customer');
      
      sendSuccess(res, wallet);
    } catch (e: any) {
      sendError(res, e.message);
    }
  }
}

export const walletController = new WalletController();
