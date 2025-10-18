/**
 * ACLEnforcer - Access Control List Enforcement System
 * Phase 1 Foundation Infrastructure & Event Bus Architecture
 *
 * Implements 5-level ACL security model:
 * - Level 1 (Private): Only specific agent can access
 * - Level 2 (Team): Same team members
 * - Level 3 (Swarm): Same swarm members
 * - Level 4 (Project): All project agents
 * - Level 5 (System): System-level access
 *
 * Features:
 * - Permission checking with context-aware rules
 * - Permission caching with TTL (5 minutes)
 * - Explicit permission grants and revocations
 * - Audit trail logging
 * - Performance metrics tracking
 */

const EventEmitter = require('events');
const crypto = require('crypto');

class ACLEnforcer extends EventEmitter {
  constructor(options = {}) {
    super();

    this.db = options.db;
    this.cacheEnabled = options.cacheEnabled !== false;
    this.cacheTTL = options.cacheTTL || 300000; // 5 minutes
    this.maxCacheSize = options.maxCacheSize || 10000;

    // Permission cache: Map<cacheKey, { allowed: boolean, timestamp: number }>
    this.permissionCache = new Map();

    // Metrics tracking
    this.metrics = {
      checks: 0,
      grants: 0,
      denials: 0,
      cacheHits: 0,
      cacheMisses: 0,
      auditLogs: 0,
      revocations: 0
    };

    // ACL level names for logging
    this.aclLevelNames = {
      1: 'Private',
      2: 'Team',
      3: 'Swarm',
      4: 'Project',
      5: 'System'
    };
  }

  /**
   * Check if an agent has permission to perform an action on a resource
   *
   * @param {string} agentId - Agent requesting access
   * @param {string} resourceId - Resource being accessed
   * @param {string} resourceType - Type of resource (memory, task, event, etc.)
   * @param {string} action - Action being performed (read, write, delete, etc.)
   * @param {Object} context - Additional context (swarmId, teamId, projectId)
   * @returns {Promise<boolean>} True if permission granted
   */
  async checkPermission(agentId, resourceId, resourceType, action, context = {}) {
    this.metrics.checks++;

    // Check cache first if enabled
    if (this.cacheEnabled) {
      const cacheKey = this._getCacheKey(agentId, resourceId, resourceType, action, context);
      const cached = this.permissionCache.get(cacheKey);

      if (cached && (Date.now() - cached.timestamp < this.cacheTTL)) {
        this.metrics.cacheHits++;
        return cached.allowed;
      }
      this.metrics.cacheMisses++;
    }

    // Perform permission check
    const allowed = await this._performPermissionCheck(
      agentId,
      resourceId,
      resourceType,
      action,
      context
    );

    // Cache result if enabled
    if (this.cacheEnabled) {
      const cacheKey = this._getCacheKey(agentId, resourceId, resourceType, action, context);
      this.permissionCache.set(cacheKey, {
        allowed,
        timestamp: Date.now()
      });

      // Cleanup cache if too large
      if (this.permissionCache.size > this.maxCacheSize) {
        this._cleanupCache();
      }
    }

    // Update metrics
    if (allowed) {
      this.metrics.grants++;
    } else {
      this.metrics.denials++;
    }

    // Log audit trail
    await this._logAuditTrail(agentId, resourceId, resourceType, action, allowed, context);

    return allowed;
  }

  /**
   * Grant explicit permission to an agent
   *
   * @param {string} agentId - Agent to grant permission to
   * @param {string} resourceType - Type of resource
   * @param {number} aclLevel - ACL level (1-5)
   * @param {Array<string>} actions - Array of actions to grant
   * @param {Object} options - Additional options (grantedBy, expiresAt, resourceId)
   * @returns {Promise<string>} Permission ID
   */
  async grantPermission(agentId, resourceType, aclLevel, actions, options = {}) {
    return new Promise((resolve, reject) => {
      const permissionId = `perm-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
      const now = new Date().toISOString();
      const grantedBy = options.grantedBy || 'system';
      const expiresAt = options.expiresAt || null;
      const resourceId = options.resourceId || null;
      const projectId = options.projectId || null;

      const sql = `
        INSERT INTO permissions (
          id, entity_id, entity_type, resource_type, resource_id, project_id,
          permission_level, actions, granted_by, expires_at, is_active,
          created_at, updated_at
        ) VALUES (?, ?, 'agent', ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `;

      this.db.run(sql, [
        permissionId,
        agentId,
        resourceType,
        resourceId,
        projectId,
        aclLevel,
        JSON.stringify(actions),
        grantedBy,
        expiresAt,
        now,
        now
      ], (err) => {
        if (err) {
          this.emit('error', { operation: 'grantPermission', error: err });
          reject(err);
          return;
        }

        this.metrics.grants++;

        // Clear cache for this agent
        this._clearCacheForAgent(agentId);

        // Log audit trail
        this._logAuditTrail(
          agentId,
          resourceId || resourceType,
          'permission',
          'grant',
          true,
          { aclLevel, actions, grantedBy }
        );

        this.emit('permissionGranted', {
          permissionId,
          agentId,
          resourceType,
          aclLevel,
          actions
        });

        resolve(permissionId);
      });
    });
  }

  /**
   * Revoke a permission
   *
   * @param {string} permissionId - Permission ID to revoke
   * @param {string} revokedBy - Agent revoking the permission
   * @returns {Promise<boolean>} True if revoked successfully
   */
  async revokePermission(permissionId, revokedBy) {
    return new Promise((resolve, reject) => {
      // First get permission details for audit log
      const getSql = 'SELECT * FROM permissions WHERE id = ?';

      this.db.get(getSql, [permissionId], (err, permission) => {
        if (err) {
          reject(err);
          return;
        }

        if (!permission) {
          resolve(false);
          return;
        }

        // Update permission to inactive
        const updateSql = `
          UPDATE permissions
          SET is_active = 0, updated_at = ?
          WHERE id = ?
        `;

        this.db.run(updateSql, [new Date().toISOString(), permissionId], (err) => {
          if (err) {
            reject(err);
            return;
          }

          this.metrics.revocations++;

          // Clear cache for this agent
          this._clearCacheForAgent(permission.entity_id);

          // Log audit trail
          this._logAuditTrail(
            permission.entity_id,
            permission.resource_id || permission.resource_type,
            'permission',
            'revoke',
            true,
            { permissionId, revokedBy, resourceType: permission.resource_type }
          );

          this.emit('permissionRevoked', {
            permissionId,
            agentId: permission.entity_id,
            revokedBy
          });

          resolve(true);
        });
      });
    });
  }

  /**
   * Get audit trail for a resource
   *
   * @param {string} resourceId - Resource ID to get audit trail for
   * @param {Object} options - Query options (limit, offset)
   * @returns {Promise<Array>} Array of audit log entries
   */
  async getAuditTrail(resourceId, options = {}) {
    return new Promise((resolve, reject) => {
      const limit = options.limit || 100;
      const offset = options.offset || 0;

      const sql = `
        SELECT * FROM audit_log
        WHERE entity_id = ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `;

      this.db.all(sql, [resourceId, limit, offset], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }

        resolve(rows || []);
      });
    });
  }

  /**
   * Get current metrics
   *
   * @returns {Object} Metrics object
   */
  getMetrics() {
    const cacheHitRate = this.metrics.cacheHits + this.metrics.cacheMisses > 0
      ? this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses)
      : 0;

    return {
      ...this.metrics,
      cacheHitRate,
      cacheSize: this.permissionCache.size
    };
  }

  /**
   * Shutdown and cleanup resources
   *
   * @returns {Promise<void>}
   */
  async shutdown() {
    this.permissionCache.clear();
    this.emit('shutdown');
    return Promise.resolve();
  }

  // ==================== Private Methods ====================

  /**
   * Perform the actual permission check logic
   *
   * @private
   */
  async _performPermissionCheck(agentId, resourceId, resourceType, action, context) {
    return new Promise((resolve) => {
      // Get agent information
      const agentSql = 'SELECT * FROM agents WHERE id = ? AND status = "active"';

      this.db.get(agentSql, [agentId], (err, agent) => {
        if (err || !agent) {
          resolve(false);
          return;
        }

        // Get resource information (from memory table or other resource tables)
        let resourceSql;
        if (resourceType === 'memory') {
          resourceSql = 'SELECT * FROM memory WHERE id = ?';
        } else {
          // For non-memory resources, check if agent has explicit permission
          this._checkExplicitPermission(agentId, resourceType, action, context, resolve);
          return;
        }

        this.db.get(resourceSql, [resourceId], (err, resource) => {
          if (err || !resource) {
            // Resource doesn't exist, check explicit permissions
            this._checkExplicitPermission(agentId, resourceType, action, context, resolve);
            return;
          }

          // Check ACL level based permission
          const allowed = this._checkAclLevelPermission(
            agent,
            resource,
            action,
            context
          );

          if (allowed) {
            resolve(true);
            return;
          }

          // If ACL check fails, try explicit permission
          this._checkExplicitPermission(agentId, resourceType, action, context, resolve);
        });
      });
    });
  }

  /**
   * Check ACL level based permission
   *
   * @private
   */
  _checkAclLevelPermission(agent, resource, action, context) {
    const aclLevel = resource.acl_level;

    switch (aclLevel) {
      case 1: // Private - only the specific agent
        return agent.id === resource.agent_id;

      case 2: // Team - same team members
        return agent.team_id && agent.team_id === resource.team_id;

      case 3: // Swarm - same swarm members
        return agent.swarm_id && agent.swarm_id === resource.swarm_id;

      case 4: // Project - all project agents
        if (context.projectId) {
          return agent.project_id === context.projectId;
        }
        return agent.project_id && agent.project_id === resource.project_id;

      case 5: // System - system-level agents
        return agent.type === 'system' || agent.acl_level >= 5;

      default:
        return false;
    }
  }

  /**
   * Check explicit permission grants
   *
   * @private
   */
  _checkExplicitPermission(agentId, resourceType, action, context, callback) {
    const sql = `
      SELECT * FROM permissions
      WHERE entity_id = ?
        AND resource_type = ?
        AND is_active = 1
        AND (expires_at IS NULL OR expires_at > datetime('now'))
      ORDER BY permission_level DESC
      LIMIT 1
    `;

    this.db.get(sql, [agentId, resourceType], (err, permission) => {
      if (err || !permission) {
        callback(false);
        return;
      }

      try {
        const actions = JSON.parse(permission.actions || '[]');
        const allowed = actions.includes(action) || actions.includes('*');
        callback(allowed);
      } catch (e) {
        callback(false);
      }
    });
  }

  /**
   * Log audit trail entry
   *
   * @private
   */
  async _logAuditTrail(agentId, resourceId, resourceType, action, allowed, context) {
    return new Promise((resolve) => {
      const auditId = `audit-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
      const now = new Date().toISOString();

      const sql = `
        INSERT INTO audit_log (
          id, entity_id, entity_type, action, changed_by,
          swarm_id, acl_level, risk_level, metadata, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const metadata = JSON.stringify({
        resourceType,
        allowed,
        context,
        timestamp: Date.now()
      });

      this.db.run(sql, [
        auditId,
        resourceId,
        resourceType,
        action,
        agentId,
        context.swarmId || null,
        context.aclLevel || 3,
        allowed ? 'low' : 'medium',
        metadata,
        now
      ], (err) => {
        if (!err) {
          this.metrics.auditLogs++;
        }
        resolve();
      });
    });
  }

  /**
   * Generate cache key
   *
   * @private
   */
  _getCacheKey(agentId, resourceId, resourceType, action, context) {
    const contextKey = `${context.swarmId || ''}:${context.teamId || ''}:${context.projectId || ''}`;
    return `${agentId}:${resourceId}:${resourceType}:${action}:${contextKey}`;
  }

  /**
   * Clear cache for a specific agent
   *
   * @private
   */
  _clearCacheForAgent(agentId) {
    if (!this.cacheEnabled) return;

    for (const [key, _] of this.permissionCache.entries()) {
      if (key.startsWith(`${agentId}:`)) {
        this.permissionCache.delete(key);
      }
    }
  }

  /**
   * Cleanup expired cache entries
   *
   * @private
   */
  _cleanupCache() {
    const now = Date.now();
    const toDelete = [];

    for (const [key, value] of this.permissionCache.entries()) {
      if (now - value.timestamp > this.cacheTTL) {
        toDelete.push(key);
      }
    }

    // Delete oldest entries if still too large
    if (this.permissionCache.size - toDelete.length > this.maxCacheSize) {
      const entries = Array.from(this.permissionCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      const numToDelete = this.permissionCache.size - this.maxCacheSize;
      for (let i = 0; i < numToDelete; i++) {
        toDelete.push(entries[i][0]);
      }
    }

    toDelete.forEach(key => this.permissionCache.delete(key));
  }
}

module.exports = ACLEnforcer;
