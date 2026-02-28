import { Request, Response } from 'express';
import { userService } from '../services/user.service';
import { sendSuccess, sendCreated, sendNotFound, sendError } from '../utils/response';

export class UserController {
  async findAll(_req: Request, res: Response) {
    try { sendSuccess(res, await userService.findAll()); } catch (e: any) { sendError(res, e.message); }
  }
  async findById(req: Request, res: Response) {
    try {
      const user = await userService.findById(req.params.id);
      user ? sendSuccess(res, user) : sendNotFound(res, 'User');
    } catch (e: any) { sendError(res, e.message); }
  }
  async create(req: Request, res: Response) {
    try { sendCreated(res, await userService.create(req.body)); } catch (e: any) { sendError(res, e.message, 400); }
  }
  async update(req: Request, res: Response) {
    try {
      const user = await userService.update(req.params.id, req.body);
      user ? sendSuccess(res, user, 'User updated') : sendNotFound(res, 'User');
    } catch (e: any) { sendError(res, e.message, 400); }
  }
  async deactivate(req: Request, res: Response) {
    try {
      const user = await userService.deactivate(req.params.id);
      user ? sendSuccess(res, user, 'User deactivated') : sendNotFound(res, 'User');
    } catch (e: any) { sendError(res, e.message); }
  }
}

export const userController = new UserController();
