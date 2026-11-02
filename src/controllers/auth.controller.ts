import { Request, Response } from 'express';
import { authService } from '../services/auth.service';
import { sendSuccess, sendError, sendUnauthorized } from '../utils/response';
import { AuthenticatedRequest } from '../middleware/auth';
import logger from '../utils/logger';

export class AuthController {
  async login(req: Request, res: Response) {
    try {
      const { mobile, password } = req.body;
      logger.info(`[Auth] Login attempt received for mobile: ${mobile}`);
      const result = await authService.login(mobile, password);
      logger.info(`[Auth] Login SUCCESS for user: ${result.user?.name || mobile} (${result.user?.role_name || result.user?.role || 'User'})`);
      sendSuccess(res, result, 'Login successful');
    } catch (error: any) {
      logger.warn(`[Auth] Login FAILED for mobile ${req.body?.mobile}: ${error.message}`);
      sendUnauthorized(res, error.message);
    }
  }

  async me(req: AuthenticatedRequest, res: Response) {
    try {
      const profile = await authService.getProfile(req.user!.id);
      sendSuccess(res, profile);
    } catch (error: any) {
      sendError(res, error.message);
    }
  }

  async changePassword(req: AuthenticatedRequest, res: Response) {
    try {
      const { currentPassword, newPassword } = req.body;
      await authService.changePassword(req.user!.id, currentPassword, newPassword);
      sendSuccess(res, null, 'Password changed successfully');
    } catch (error: any) {
      sendError(res, error.message, 400);
    }
  }

  async logout(_req: Request, res: Response) {
    sendSuccess(res, null, 'Logged out successfully');
  }
}

export const authController = new AuthController();
