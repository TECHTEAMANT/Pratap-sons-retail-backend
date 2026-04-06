import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AppDataSource } from '../config/data-source';
import { User } from '../entities/User';
import { sendUnauthorized } from '../utils/response';
import logger from '../utils/logger';

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  roleId: string;
  tokenVersion: number;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    mobile: string;
    role: string;
    roleId: string;
    mappedFloor: string | null;
    mappedSalesman: string | null;
    active: boolean;
    permissions: {
      can_view_cost: boolean;
      can_view_mrp: boolean;
      can_manage_purchases: boolean;
      can_manage_sales: boolean;
      can_view_reports: boolean;
      can_manage_inventory: boolean;
      can_manage_masters: boolean;
      can_manage_users: boolean;
    };
  };
}

/**
 * Middleware to authenticate JWT tokens and load user + permissions
 */
export async function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      sendUnauthorized(res, 'No token provided');
      return;
    }

    const token = authHeader.split(' ')[1];

    let decoded: JwtPayload;
    try {
      decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;
    } catch (err: any) {
      if (err.name === 'TokenExpiredError') {
        sendUnauthorized(res, 'Token expired');
      } else {
        sendUnauthorized(res, 'Invalid token');
      }
      return;
    }

    // Load full user with role permissions using TypeORM
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({
      where: { id: decoded.userId, active: true },
      relations: ['roles'],
    });

    if (!user) {
      sendUnauthorized(res, 'User not found or inactive');
      return;
    }

    // Check if the token is for an older password version
    if (decoded.tokenVersion !== user.token_version) {
      sendUnauthorized(res, 'Session invalidated. Please log in again.');
      return;
    }

    // If user is Admin role, grant all permissions
    const isAdmin = user.role === 'Admin';
    const role = user.roles;

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      mobile: user.mobile,
      role: user.role,
      roleId: user.role_id,
      mappedFloor: user.mapped_floor,
      mappedSalesman: user.mapped_salesman,
      active: user.active,
      permissions: {
        can_view_cost: isAdmin || role?.can_view_cost || false,
        can_view_mrp: isAdmin || role?.can_view_mrp || false,
        can_manage_purchases: isAdmin || role?.can_manage_purchases || false,
        can_manage_sales: isAdmin || role?.can_manage_sales || false,
        can_view_reports: isAdmin || role?.can_view_reports || false,
        can_manage_inventory: isAdmin || role?.can_manage_inventory || false,
        can_manage_masters: isAdmin || role?.can_manage_masters || false,
        can_manage_users: isAdmin || role?.can_manage_users || false,
      },
    };

    next();
  } catch (error: any) {
    logger.error('Authentication error', { error: error.message });
    sendUnauthorized(res, 'Authentication failed');
  }
}

/**
 * Generate a JWT token for a user
 */
export function generateToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  } as jwt.SignOptions);
}
