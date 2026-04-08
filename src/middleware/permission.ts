import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';
import { sendForbidden } from '../utils/response';

type PermissionKey =
  | 'can_view_cost'
  | 'can_view_mrp'
  | 'can_manage_purchases'
  | 'can_manage_sales'
  | 'can_view_reports'
  | 'can_manage_inventory'
  | 'can_manage_masters'
  | 'can_manage_users';

/**
 * Middleware factory: require one or more permissions (OR logic — any match passes)
 */
export function requirePermission(...permissions: PermissionKey[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendForbidden(res, 'Authentication required');
      return;
    }

    const hasPermission = permissions.some(
      (perm) => req.user!.permissions[perm] === true
    );

    if (!hasPermission) {
      sendForbidden(
        res,
        `Insufficient permissions. Required: ${permissions.join(' or ')}`
      );
      return;
    }

    next();
  };
}

/**
 * Middleware factory: require ALL listed permissions (AND logic)
 */
export function requireAllPermissions(...permissions: PermissionKey[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendForbidden(res, 'Authentication required');
      return;
    }

    const hasAll = permissions.every(
      (perm) => req.user!.permissions[perm] === true
    );

    if (!hasAll) {
      sendForbidden(
        res,
        `Insufficient permissions. Required all: ${permissions.join(', ')}`
      );
      return;
    }

    next();
  };
}

/**
 * Middleware: require Admin or Sub-Admin role specifically
 */
export function requireAdminOrSubAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    sendForbidden(res, 'Authentication required');
    return;
  }

  const role = req.user.role;
  if (role !== 'Admin' && role !== 'Sub-Admin') {
    sendForbidden(res, 'Admin or Sub-Admin access required');
    return;
  }

  next();
}
