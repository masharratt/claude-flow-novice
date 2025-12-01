/**
 * RBAC Middleware - Phase 6 #4
 *
 * Role-Based Access Control for team administration.
 * Implements Admin, Operator, and Viewer roles with granular permissions.
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logging';
import { recordMetric } from '../utils/metrics';

// ============================================================================
// Types and Interfaces
// ============================================================================

export enum Role {
  ADMIN = 'admin',
  OPERATOR = 'operator',
  VIEWER = 'viewer'
}

export interface Permission {
  resource: string;
  actions: string[];
}

export interface User {
  id: string;
  teamId: string;
  role: Role;
  email?: string;
}

export interface RBACRequest extends Request {
  user?: User;
}

// ============================================================================
// Permission Definitions
// ============================================================================

export const rolePermissions: Record<Role, Permission[]> = {
  [Role.ADMIN]: [
    { resource: 'agents', actions: ['create', 'read', 'update', 'delete', 'spawn', 'terminate'] },
    { resource: 'quotas', actions: ['create', 'read', 'update', 'delete'] },
    { resource: 'roles', actions: ['create', 'read', 'update', 'delete'] },
    { resource: 'users', actions: ['create', 'read', 'update', 'delete'] },
    { resource: 'teams', actions: ['create', 'read', 'update', 'delete'] },
    { resource: 'logs', actions: ['read'] },
    { resource: 'metrics', actions: ['read'] },
    { resource: 'cost', actions: ['read'] },
    { resource: 'certificates', actions: ['rotate', 'view'] },
    { resource: 'config', actions: ['read', 'update'] }
  ],
  [Role.OPERATOR]: [
    { resource: 'agents', actions: ['read', 'restart'] },
    { resource: 'quotas', actions: ['read'] },
    { resource: 'logs', actions: ['read'] },  // Team-scoped
    { resource: 'metrics', actions: ['read'] },
    { resource: 'cost', actions: ['read'] },  // Team-scoped
    { resource: 'config', actions: ['read'] }
  ],
  [Role.VIEWER]: [
    { resource: 'logs', actions: ['read'] },  // Team-scoped
    { resource: 'metrics', actions: ['read'] },
    { resource: 'cost', actions: ['read'] }  // Team-scoped
  ]
};

// ============================================================================
// Permission Checking
// ============================================================================

/**
 * Check if role has permission for resource action
 */
export function hasPermission(
  role: Role,
  resource: string,
  action: string
): boolean {
  const permissions = rolePermissions[role];

  if (!permissions) {
    return false;
  }

  const resourcePermission = permissions.find(p => p.resource === resource);

  if (!resourcePermission) {
    return false;
  }

  return resourcePermission.actions.includes(action);
}

/**
 * Check if user has permission
 */
export function userHasPermission(
  user: User | undefined,
  resource: string,
  action: string
): boolean {
  if (!user) {
    return false;
  }

  return hasPermission(user.role, resource, action);
}

/**
 * Get all permissions for role
 */
export function getRolePermissions(role: Role): Permission[] {
  return rolePermissions[role] || [];
}

// ============================================================================
// Express Middleware
// ============================================================================

export interface RBACMiddlewareOptions {
  resource: string;
  action: string;
  requireTeamScope?: boolean;  // Require team-scoped access
}

/**
 * RBAC middleware factory
 */
export function rbacMiddleware(options: RBACMiddlewareOptions) {
  return async (req: RBACRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user;

      // Check if user is authenticated
      if (!user) {
        logger.warn('RBAC: Unauthenticated access attempt', {
          path: req.path,
          method: req.method,
          resource: options.resource,
          action: options.action
        });

        recordMetric('rbac.auth_required', 1, {
          resource: options.resource,
          action: options.action
        });

        return res.status(401).json({
          error: 'Authentication required',
          code: 'UNAUTHENTICATED'
        });
      }

      // Check permission
      const allowed = hasPermission(user.role, options.resource, options.action);

      if (!allowed) {
        logger.warn('RBAC: Permission denied', {
          userId: user.id,
          role: user.role,
          resource: options.resource,
          action: options.action,
          path: req.path
        });

        recordMetric('rbac.permission_denied', 1, {
          role: user.role,
          resource: options.resource,
          action: options.action
        });

        return res.status(403).json({
          error: 'Insufficient permissions',
          code: 'FORBIDDEN',
          required: {
            resource: options.resource,
            action: options.action
          },
          userRole: user.role
        });
      }

      // Check team scope if required
      if (options.requireTeamScope) {
        const teamId = extractTeamId(req);

        if (!teamId) {
          logger.warn('RBAC: Team scope required but not provided', {
            userId: user.id,
            path: req.path
          });

          return res.status(400).json({
            error: 'Team ID required',
            code: 'TEAM_REQUIRED'
          });
        }

        // Non-admin users can only access their own team
        if (user.role !== Role.ADMIN && user.teamId !== teamId) {
          logger.warn('RBAC: Team access denied', {
            userId: user.id,
            userTeamId: user.teamId,
            requestedTeamId: teamId
          });

          recordMetric('rbac.team_access_denied', 1, {
            role: user.role
          });

          return res.status(403).json({
            error: 'Access denied to team resources',
            code: 'TEAM_ACCESS_DENIED'
          });
        }
      }

      // Permission granted
      recordMetric('rbac.permission_granted', 1, {
        role: user.role,
        resource: options.resource,
        action: options.action
      });

      next();
    } catch (error) {
      logger.error('RBAC middleware error', {
        error: (error as Error).message,
        resource: options.resource,
        action: options.action
      });

      return res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
      });
    }
  };
}

/**
 * Require specific role
 */
export function requireRole(...roles: Role[]) {
  return async (req: RBACRequest, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'UNAUTHENTICATED'
      });
    }

    if (!roles.includes(user.role)) {
      logger.warn('RBAC: Role requirement not met', {
        userId: user.id,
        userRole: user.role,
        requiredRoles: roles,
        path: req.path
      });

      recordMetric('rbac.role_denied', 1, {
        userRole: user.role,
        requiredRoles: roles.join(',')
      });

      return res.status(403).json({
        error: 'Insufficient role',
        code: 'ROLE_REQUIRED',
        required: roles,
        userRole: user.role
      });
    }

    next();
  };
}

/**
 * Admin-only middleware
 */
export const requireAdmin = requireRole(Role.ADMIN);

/**
 * Admin or Operator middleware
 */
export const requireOperator = requireRole(Role.ADMIN, Role.OPERATOR);

// ============================================================================
// Helper Functions
// ============================================================================

function extractTeamId(req: Request): string | null {
  // Try path parameter
  if (req.params.teamId) {
    return req.params.teamId;
  }

  // Try query parameter
  if (req.query.teamId) {
    return req.query.teamId as string;
  }

  // Try request body
  if (req.body && req.body.teamId) {
    return req.body.teamId;
  }

  // Try user context
  if ((req as RBACRequest).user?.teamId) {
    return (req as RBACRequest).user!.teamId;
  }

  return null;
}

// ============================================================================
// Role Assignment (for testing/setup)
// ============================================================================

const userRoles = new Map<string, Role>();

/**
 * Assign role to user (in-memory for demonstration)
 */
export function assignRole(userId: string, role: Role): void {
  userRoles.set(userId, role);

  logger.info('Role assigned', {
    userId,
    role
  });

  recordMetric('rbac.role_assigned', 1, {
    role
  });
}

/**
 * Get user role
 */
export function getUserRole(userId: string): Role | undefined {
  return userRoles.get(userId);
}

/**
 * Remove user role
 */
export function removeUserRole(userId: string): void {
  userRoles.delete(userId);

  logger.info('Role removed', {
    userId
  });
}

// ============================================================================
// Permission Matrix Helper
// ============================================================================

/**
 * Get permission matrix for all roles
 */
export function getPermissionMatrix(): Record<Role, Record<string, string[]>> {
  const matrix: Record<Role, Record<string, string[]>> = {
    [Role.ADMIN]: {},
    [Role.OPERATOR]: {},
    [Role.VIEWER]: {}
  };

  for (const [role, permissions] of Object.entries(rolePermissions)) {
    for (const permission of permissions) {
      matrix[role as Role][permission.resource] = permission.actions;
    }
  }

  return matrix;
}

/**
 * Check if action requires admin role
 */
export function isAdminOnlyAction(resource: string, action: string): boolean {
  const operatorAllowed = hasPermission(Role.OPERATOR, resource, action);
  const viewerAllowed = hasPermission(Role.VIEWER, resource, action);

  return !operatorAllowed && !viewerAllowed;
}
