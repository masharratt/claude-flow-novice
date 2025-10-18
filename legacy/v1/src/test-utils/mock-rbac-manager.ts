/**
 * Mock RBAC Manager for Testing
 *
 * Provides a test-safe RBAC manager that enforces actual RBAC rules
 * without requiring database or external dependencies. This prevents
 * test bypasses from shipping to production.
 *
 * Security: Enforces real permission checks based on roles.
 */

import type { CallerIdentity } from '../coordination/validation-schemas';

/**
 * Mock RBAC Manager for testing
 *
 * This manager enforces real RBAC rules based on roles:
 * - admin, system: All permissions
 * - coordinator: Task delegation and result aggregation
 * - observer: Read-only operations
 *
 * This ensures tests validate actual authorization logic.
 */
export class MockRBACManager {
  /**
   * Permission check - enforces real RBAC rules
   *
   * @param caller - Caller identity (must be valid structure)
   * @param resource - Resource being accessed
   * @param action - Action being performed
   * @param context - Additional context
   * @throws Error if caller lacks permission
   */
  requirePermission(
    caller: CallerIdentity,
    resource: string,
    action: string,
    context?: Record<string, any>
  ): void {
    // Validate caller exists and has required structure
    if (!caller) {
      throw new Error('Caller identity is required');
    }

    if (!caller.id || typeof caller.id !== 'string') {
      throw new Error('Caller must have a valid id');
    }

    if (!caller.roles || !Array.isArray(caller.roles) || caller.roles.length === 0) {
      throw new Error('Caller must have at least one role');
    }

    // Validate resource and action
    if (!resource || typeof resource !== 'string') {
      throw new Error('Resource must be a non-empty string');
    }

    if (!action || typeof action !== 'string') {
      throw new Error('Action must be a non-empty string');
    }

    // Enforce real RBAC rules
    const hasPermission = this.checkPermission(caller, resource, action);
    if (!hasPermission) {
      throw new Error(`Forbidden: ${caller.roles.join(', ')} lacks permission for ${resource}:${action}`);
    }
  }

  /**
   * Check if caller has permission for action
   */
  private checkPermission(caller: CallerIdentity, resource: string, action: string): boolean {
    // Admin and system roles have all permissions
    if (caller.roles.includes('admin') || caller.roles.includes('system')) {
      return true;
    }

    // Coordinator role permissions
    if (caller.roles.includes('coordinator')) {
      if (resource === 'queen') {
        // Coordinators can delegate tasks and aggregate results, but not spawn workers
        return action === 'delegate_task' || action === 'aggregate_results';
      }
    }

    // Observer role has no write permissions
    if (caller.roles.includes('observer')) {
      return false; // Read-only, cannot perform write actions
    }

    // No other roles have permissions
    return false;
  }

  /**
   * Check if caller has specific role
   *
   * @param caller - Caller identity
   * @param role - Role to check
   * @returns True if caller has role
   */
  hasRole(caller: CallerIdentity, role: string): boolean {
    if (!caller || !caller.roles) {
      throw new Error('Invalid caller identity');
    }

    if (!role || typeof role !== 'string') {
      throw new Error('Role must be a non-empty string');
    }

    return caller.roles.includes(role);
  }

  /**
   * Check if caller has permission
   *
   * @param caller - Caller identity
   * @param resource - Resource being accessed
   * @param action - Action being performed
   * @returns True if caller has permission
   */
  hasPermission(
    caller: CallerIdentity,
    resource: string,
    action: string
  ): boolean {
    if (!caller || !caller.id || !caller.roles) {
      throw new Error('Invalid caller identity');
    }

    if (!resource || !action) {
      throw new Error('Resource and action are required');
    }

    return this.checkPermission(caller, resource, action);
  }
}
