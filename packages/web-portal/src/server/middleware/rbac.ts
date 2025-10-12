/**
 * Role-Based Access Control (RBAC) Middleware
 *
 * Checks user roles and permissions for endpoint access control
 */

import { Request, Response, NextFunction } from 'express';
import { APIError } from './error-handler.js';

/**
 * Role hierarchy for access control
 */
export const ROLE_HIERARCHY: Record<string, number> = {
  guest: 0,
  user: 1,
  service: 2,
  admin: 3,
};

/**
 * Check if user has required role
 */
const hasRole = (userRole: string, requiredRole: string): boolean => {
  const userLevel = ROLE_HIERARCHY[userRole] ?? -1;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] ?? 999;

  return userLevel >= requiredLevel;
};

/**
 * Check if user has any of the required roles
 */
const hasAnyRole = (userRole: string, requiredRoles: string[]): boolean => {
  return requiredRoles.some((role) => hasRole(userRole, role));
};

/**
 * Check if user has specific permission
 */
const hasPermission = (userPermissions: string[], requiredPermission: string): boolean => {
  // Check for exact match
  if (userPermissions.includes(requiredPermission)) {
    return true;
  }

  // Check for wildcard permissions
  // e.g., "agents:*" grants "agents:read", "agents:write", etc.
  const parts = requiredPermission.split(':');
  if (parts.length > 1) {
    const wildcardPermission = `${parts[0]}:*`;
    if (userPermissions.includes(wildcardPermission)) {
      return true;
    }
  }

  // Check for admin wildcard
  if (userPermissions.includes('*')) {
    return true;
  }

  return false;
};

/**
 * Audit log for authorization failures
 */
const auditAuthorizationFailure = (req: Request, reason: string, required: string): void => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    ip: req.ip || req.socket.remoteAddress,
    path: req.path,
    method: req.method,
    userId: req.user?.userId,
    userRole: req.user?.role,
    reason,
    required,
  };

  console.warn('🚨 Authorization failed:', logEntry);

  // In production, send to audit logging service
  // auditService.log('AUTHORIZATION_FAILURE', logEntry);
};

/**
 * Require Specific Role Middleware Factory
 *
 * Usage: router.post('/admin', requireRole('admin'), handler)
 *
 * @param role - Required role (admin, user, service, guest)
 * @returns Express middleware
 */
export const requireRole = (role: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Check if user is authenticated
      if (!req.user) {
        throw new APIError(401, 'UNAUTHORIZED', 'Authentication required');
      }

      // Check role
      if (!hasRole(req.user.role, role)) {
        auditAuthorizationFailure(req, 'INSUFFICIENT_ROLE', `role:${role}`);
        throw new APIError(
          403,
          'FORBIDDEN',
          `Insufficient permissions. Required role: ${role}`,
          { requiredRole: role, userRole: req.user.role }
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Require Any of Multiple Roles Middleware Factory
 *
 * Usage: router.post('/moderate', requireAnyRole(['admin', 'moderator']), handler)
 *
 * @param roles - Array of acceptable roles
 * @returns Express middleware
 */
export const requireAnyRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Check if user is authenticated
      if (!req.user) {
        throw new APIError(401, 'UNAUTHORIZED', 'Authentication required');
      }

      // Check if user has any of the required roles
      if (!hasAnyRole(req.user.role, roles)) {
        auditAuthorizationFailure(req, 'INSUFFICIENT_ROLE', `roles:${roles.join(',')}`);
        throw new APIError(
          403,
          'FORBIDDEN',
          `Insufficient permissions. Required roles: ${roles.join(', ')}`,
          { requiredRoles: roles, userRole: req.user.role }
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Require Specific Permission Middleware Factory
 *
 * Usage: router.delete('/agents/:id', requirePermission('agents:delete'), handler)
 *
 * @param permission - Required permission (e.g., 'agents:write', 'metrics:read')
 * @returns Express middleware
 */
export const requirePermission = (permission: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Check if user is authenticated
      if (!req.user) {
        throw new APIError(401, 'UNAUTHORIZED', 'Authentication required');
      }

      // Check permission
      if (!hasPermission(req.user.permissions, permission)) {
        auditAuthorizationFailure(req, 'INSUFFICIENT_PERMISSION', `permission:${permission}`);
        throw new APIError(
          403,
          'FORBIDDEN',
          `Insufficient permissions. Required permission: ${permission}`,
          { requiredPermission: permission, userPermissions: req.user.permissions }
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Require Any of Multiple Permissions Middleware Factory
 *
 * Usage: router.get('/data', requireAnyPermission(['data:read', 'data:admin']), handler)
 *
 * @param permissions - Array of acceptable permissions
 * @returns Express middleware
 */
export const requireAnyPermission = (permissions: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Check if user is authenticated
      if (!req.user) {
        throw new APIError(401, 'UNAUTHORIZED', 'Authentication required');
      }

      // Check if user has any of the required permissions
      const hasAny = permissions.some((permission) =>
        hasPermission(req.user!.permissions, permission)
      );

      if (!hasAny) {
        auditAuthorizationFailure(req, 'INSUFFICIENT_PERMISSION', `permissions:${permissions.join(',')}`);
        throw new APIError(
          403,
          'FORBIDDEN',
          `Insufficient permissions. Required permissions: ${permissions.join(', ')}`,
          { requiredPermissions: permissions, userPermissions: req.user.permissions }
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Require Admin Role (convenience middleware)
 *
 * Usage: router.post('/admin/users', requireAdmin, handler)
 */
export const requireAdmin = requireRole('admin');

/**
 * Allow Public Access (convenience middleware for documentation)
 *
 * Usage: router.get('/public', allowPublic, handler)
 * This is a no-op middleware that just documents public endpoints
 */
export const allowPublic = (req: Request, res: Response, next: NextFunction): void => {
  next();
};
