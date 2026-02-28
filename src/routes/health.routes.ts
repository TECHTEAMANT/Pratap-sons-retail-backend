import { Router, Request, Response } from 'express';
import { AppDataSource } from '../config/data-source';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  let dbConnected = false;
  try {
    if (AppDataSource.isInitialized) {
      await AppDataSource.query('SELECT 1');
      dbConnected = true;
    }
  } catch (_) {
    dbConnected = false;
  }

  res.status(dbConnected ? 200 : 503).json({
    success: dbConnected,
    message: dbConnected ? 'API is healthy' : 'Database connection failed',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

export default router;
