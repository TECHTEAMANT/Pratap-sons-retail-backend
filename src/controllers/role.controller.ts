import { Request, Response } from 'express';
import { roleService } from '../services/role.service';
import { sendSuccess, sendCreated, sendNotFound, sendError } from '../utils/response';

export class RoleController {
  async findAll(_req: Request, res: Response) {
    try { sendSuccess(res, await roleService.findAll()); } catch (e: any) { sendError(res, e.message); }
  }
  async create(req: Request, res: Response) {
    try { sendCreated(res, await roleService.create(req.body)); } catch (e: any) { sendError(res, e.message, 400); }
  }
  async update(req: Request, res: Response) {
    try {
      const role = await roleService.update(req.params.id, req.body);
      role ? sendSuccess(res, role, 'Role updated') : sendNotFound(res, 'Role');
    } catch (e: any) { sendError(res, e.message, 400); }
  }
  async delete(req: Request, res: Response) {
    try {
      const role = await roleService.delete(req.params.id);
      role ? sendSuccess(res, role, 'Role deleted') : sendNotFound(res, 'Role');
    } catch (e: any) { sendError(res, e.message, 400); }
  }
}

export const roleController = new RoleController();
