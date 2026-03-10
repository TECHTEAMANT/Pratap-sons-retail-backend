import { AuthenticatedRequest } from '../middleware/auth';

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedRequest['user'];
    }
  }
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthenticatedRequest['user'];
  }
}
