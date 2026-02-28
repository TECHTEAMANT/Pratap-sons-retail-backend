import { AuthenticatedRequest } from '../middleware/auth';

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedRequest['user'];
    }
  }
}
