import { Request, Response } from 'express';
import { masterService } from '../services/master.service';
import { sendSuccess, sendCreated, sendNotFound, sendError } from '../utils/response';

export class MasterController {
  // Product Groups
  async getProductGroups(_r: Request, res: Response) { try { sendSuccess(res, await masterService.getProductGroups()); } catch (e: any) { sendError(res, e.message); } }
  async createProductGroup(req: Request, res: Response) { try { sendCreated(res, await masterService.createProductGroup(req.body)); } catch (e: any) { sendError(res, e.message, 400); } }
  async updateProductGroup(req: Request, res: Response) { try { const r = await masterService.updateProductGroup(req.params.id, req.body); r ? sendSuccess(res, r) : sendNotFound(res, 'Product group'); } catch (e: any) { sendError(res, e.message, 400); } }
  // Sizes
  async getSizes(_r: Request, res: Response) { try { sendSuccess(res, await masterService.getSizes()); } catch (e: any) { sendError(res, e.message); } }
  async createSize(req: Request, res: Response) { try { sendCreated(res, await masterService.createSize(req.body)); } catch (e: any) { sendError(res, e.message, 400); } }
  async updateSize(req: Request, res: Response) { try { const r = await masterService.updateSize(req.params.id, req.body); r ? sendSuccess(res, r) : sendNotFound(res, 'Size'); } catch (e: any) { sendError(res, e.message, 400); } }
  // Colors
  async getColors(_r: Request, res: Response) { try { sendSuccess(res, await masterService.getColors()); } catch (e: any) { sendError(res, e.message); } }
  async createColor(req: Request, res: Response) { try { sendCreated(res, await masterService.createColor(req.body)); } catch (e: any) { sendError(res, e.message, 400); } }
  async updateColor(req: Request, res: Response) { try { const r = await masterService.updateColor(req.params.id, req.body); r ? sendSuccess(res, r) : sendNotFound(res, 'Color'); } catch (e: any) { sendError(res, e.message, 400); } }
  // Vendors
  async getVendors(req: Request, res: Response) { try { sendSuccess(res, await masterService.getVendors(req.query as any)); } catch (e: any) { sendError(res, e.message); } }
  async createVendor(req: Request, res: Response) { try { sendCreated(res, await masterService.createVendor(req.body)); } catch (e: any) { sendError(res, e.message, 400); } }
  async updateVendor(req: Request, res: Response) { try { const r = await masterService.updateVendor(req.params.id, req.body); r ? sendSuccess(res, r) : sendNotFound(res, 'Vendor'); } catch (e: any) { sendError(res, e.message, 400); } }
  // Floors
  async getFloors(_r: Request, res: Response) { try { sendSuccess(res, await masterService.getFloors()); } catch (e: any) { sendError(res, e.message); } }
  async createFloor(req: Request, res: Response) { try { sendCreated(res, await masterService.createFloor(req.body)); } catch (e: any) { sendError(res, e.message, 400); } }
  async updateFloor(req: Request, res: Response) { try { const r = await masterService.updateFloor(req.params.id, req.body); r ? sendSuccess(res, r) : sendNotFound(res, 'Floor'); } catch (e: any) { sendError(res, e.message, 400); } }
  // Cities
  async getCities(req: Request, res: Response) { try { sendSuccess(res, await masterService.getCities(req.query as any)); } catch (e: any) { sendError(res, e.message); } }
  async createCity(req: Request, res: Response) { try { sendCreated(res, await masterService.createCity(req.body)); } catch (e: any) { sendError(res, e.message, 400); } }
  async updateCity(req: Request, res: Response) { try { const r = await masterService.updateCity(req.params.id, req.body); r ? sendSuccess(res, r) : sendNotFound(res, 'City'); } catch (e: any) { sendError(res, e.message, 400); } }
  // Product Masters
  async getProductMasters(req: Request, res: Response) { try { sendSuccess(res, await masterService.getProductMasters(req.query as any)); } catch (e: any) { sendError(res, e.message); } }
  async createProductMaster(req: Request, res: Response) { try { sendCreated(res, await masterService.createProductMaster(req.body)); } catch (e: any) { sendError(res, e.message, 400); } }
  async updateProductMaster(req: Request, res: Response) { try { const r = await masterService.updateProductMaster(req.params.id, req.body); r ? sendSuccess(res, r) : sendNotFound(res, 'Product master'); } catch (e: any) { sendError(res, e.message, 400); } }
  // Barcode Print Logs
  async getBarcodePrintLogs(_r: Request, res: Response) { try { sendSuccess(res, await masterService.getBarcodePrintLogs()); } catch (e: any) { sendError(res, e.message); } }
  async createBarcodePrintLog(req: Request, res: Response) { try { sendCreated(res, await masterService.createBarcodePrintLog(req.body)); } catch (e: any) { sendError(res, e.message, 400); } }
}

export const masterController = new MasterController();
