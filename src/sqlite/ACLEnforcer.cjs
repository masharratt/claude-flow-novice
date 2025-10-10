/**
 * ACLEnforcer - Advanced Access Control List enforcement
 * Phase 2 Fleet Manager Features & Advanced Capabilities
 *
 * ACL Levels:
 * 1. private - Only accessible by the specific agent
 * 2. team - Accessible by agents in the same team
 * 3. swarm - Accessible by all agents in the swarm
 * 4. project - Accessible by agents in the same project
 * 5. public - Accessible by all authenticated agents
 * 6. system - System-level access (administrative)
 *
 * Features:
 * - Role-based access control (RBAC)
 * - Attribute-based access control (ABAC)
 * - Time-based access restrictions
 * - IP-based access control
 * - Comprehensive audit logging
 */

const crypto = require('crypto');
const EventEmitter = require('events');

class ACLEnforcer extends EventEmitter {
  constructor(options = {}) {
    super();

    this.db = options.db; // SQLite database instance
    this.cache = options.cache || null; // Optional cache for ACL checks
    this.redis = options.redis || null; // Redis client for multi-instance invalidation

    // ACL level definitions
    this.aclLevels = {
      private: 1,
      team: 2,
      swarm: 3,
      project: 4,
      public: 5,
      system: 6
    };

    // Action definitions
    this.actions = {
      read: 'read',
      write: 'write',
      delete: 'delete',
      execute: 'execute',
      admin: 'admin',
      all: '*'
    };

    // Special system roles
    this.systemRoles = new Set(['system', 'admin', 'superuser']);

    // Cache settings
    this.cacheEnabled = options.cacheEnabled !== false;
    this.cacheTTL = options.cacheTTL || 300000; // 5 minutes
    this.aclCache = new Map();

    // Metrics
    this.metrics = {
      checks: 0,
      grants: 0,
      denials: 0,
      cacheHits: 0,
      cacheMisses: 0,
      errors: 0,
      auditLogs: 0,
      invalidations: 0,
      redisInvalidations: 0
    };

    // IP whitelist/blacklist (optional)
    this.ipWhitelist = new Set(options.ipWhitelist || []);
    this.ipBlacklist = new Set(options.ipBlacklist || []);

    // Setup Redis invalidation listener if Redis is available
    if (this.redis) {
      this._setupRedisInvalidationListener();
    }
  }

  /**
   * Setup Redis pub/sub listener for cache invalidation
   */
  _setupRedisInvalidationListener() {
    if (!this.redis || !this.redis.subscriber) {
      return;
    }

    // Subscribe to ACL invalidation channel
    const channel = 'acl:invalidate';

    this.redis.subscriber.subscribe(channel, (err) => {
      if (err) {
        console.error('Failed to subscribe to ACL invalidation channel:', err);
      } else {
        console.log(`📡 Subscribed to ${channel} for cache invalidation`);
      }
    });

    // Listen for invalidation messages
    this.redis.subscriber.on('message', (receivedChannel, message) => {
      if (receivedChannel === channel) {
        try {
          const data = JSON.parse(message);
          this._handleRedisInvalidation(data);
        } catch (error) {
          console.error('Failed to parse ACL invalidation message:', error);
        }
      }
    });
  }

  /**
   * Handle Redis invalidation message from other instances
   */
  _handleRedisInvalidation(data) {
    this.metrics.redisInvalidations++;

    switch (data.type) {
      case 'agent':
        // Invalidate all cache entries for this agent
        this._clearAgentCache(data.agentId);
        this.emit('cacheInvalidated', { type: 'agent', agentId: data.agentId, source: 'redis' });
        break;

      case 'permission':
        // Invalidate cache for specific permission
        if (data.agentId) {
          this._clearAgentCache(data.agentId);
        } else if (data.permissionId) {
          // Clear all cache as we don't have fine-grained tracking
          this.aclCache.clear();
          this.metrics.invalidations++;
        }
        this.emit('cacheInvalidated', { type: 'permission', ...data, source: 'redis' });
        break;

      case 'role':
        // Invalidate cache for agent with role change
        if (data.agentId) {
          this._clearAgentCache(data.agentId);
        }
        this.emit('cacheInvalidated', { type: 'role', ...data, source: 'redis' });
        break;

      case 'team':
        // Invalidate cache for all team members
        if (data.teamId) {
          // Clear all cache as we don't track team membership in cache keys
          this.aclCache.clear();
          this.metrics.invalidations++;
        }
        this.emit('cacheInvalidated', { type: 'team', ...data, source: 'redis' });
        break;

      default:
        console.warn('Unknown ACL invalidation type:', data.type);
    }
  }

  /**
   * Publish cache invalidation to other instances via Redis
   */
  async _publishInvalidation(type, data) {
    if (!this.redis || !this.redis.publisher) {
      return;
    }

    const message = JSON.stringify({
      type,
      ...data,
      timestamp: Date.now()
    });

    try {
      await this.redis.publisher.publish('acl:invalidate', message);
      this.emit('invalidationPublished', { type, data });
    } catch (error) {
      console.error('Failed to publish ACL invalidation:', error);
      this.metrics.errors++;
    }
  }

  /**
   * Check if agent has permission to access resource
   */
  async checkPermission(agentId, resourceId, resourceType, action, context = {}) {
    this.metrics.checks++;

    try {
      // Check cache first
      if (this.cacheEnabled) {
        const cached = this._getCachedPermission(agentId, resourceId, action);
        if (cached !== null) {
          this.metrics.cacheHits++;
          return cached;
        }
        this.metrics.cacheMisses++;
      }

      // Get agent information
      const agent = await this._getAgent(agentId);
      if (!agent) {
        this.metrics.denials++;
        await this._auditLog(agentId, resourceId, action, false, 'Agent not found', context);
        return false;
      }

      // Check if agent is active
      if (agent.status !== 'active') {
        this.metrics.denials++;
        await this._auditLog(agentId, resourceId, action, false, 'Agent not active', context);
        return false;
      }

      // System roles have full access
      if (this.systemRoles.has(agent.type)) {
        this.metrics.grants++;
        await this._auditLog(agentId, resourceId, action, true, 'System role', context);
        this._cachePermission(agentId, resourceId, action, true);
        return true;
      }

      // IP-based restrictions (if context has IP)
      if (context.ipAddress) {
        if (this.ipBlacklist.has(context.ipAddress)) {
          this.metrics.denials++;
          await this._auditLog(agentId, resourceId, action, false, 'IP blacklisted', context);
          return false;
        }

        if (this.ipWhitelist.size > 0 && !this.ipWhitelist.has(context.ipAddress)) {
          this.metrics.denials++;
          await this._auditLog(agentId, resourceId, action, false, 'IP not whitelisted', context);
          return false;
        }
      }

      // Get resource information
      const resource = await this._getResource(resourceId, resourceType);
      if (!resource) {
        this.metrics.denials++;
        await this._auditLog(agentId, resourceId, action, false, 'Resource not found', context);
        return false;
      }

      // Check ACL level
      const hasAccess = await this._checkACLLevel(
        agent,
        resource,
        action,
        context
      );

      // Check explicit permissions
      const hasExplicitPermission = await this._checkExplicitPermission(
        agentId,
        resourceId,
        resourceType,
        action,
        context
      );

      const allowed = hasAccess || hasExplicitPermission;

      // Update metrics
      if (allowed) {
        this.metrics.grants++;
      } else {
        this.metrics.denials++;
      }

      // Audit log
      await this._auditLog(
        agentId,
        resourceId,
        action,
        allowed,
        allowed ? 'Access granted' : 'Access denied',
        context
      );

      // Cache result
      if (this.cacheEnabled) {
        this._cachePermission(agentId, resourceId, action, allowed);
      }

      this.emit('permissionCheck', {
        agentId,
        resourceId,
        action,
        allowed,
        aclLevel: resource.acl_level
      });

      return allowed;

    } catch (error) {
      console.error('ACL check error:', error);
      this.metrics.errors++;
      this.emit('error', { agentId, resourceId, action, error });
      return false;
    }
  }

  /**
   * Check ACL level access
   */
  async _checkACLLevel(agent, resource, action, context) {
    const aclLevel = resource.acl_level;

    switch (aclLevel) {
      case this.aclLevels.private:
        // Only the owner can access
        return resource.agent_id === agent.id;

      case this.aclLevels.team:
        // Same team members can access
        return agent.team_id && agent.team_id === resource.team_id;

      case this.aclLevels.swarm:
        // Same swarm members can access
        return agent.swarm_id && agent.swarm_id === resource.swarm_id;

      case this.aclLevels.project:
        // Same project members can access
        if (!context.projectId) {
          return agent.project_id && agent.project_id === resource.project_id;
        }
        return context.projectId === resource.project_id;

      case this.aclLevels.public:
        // All active agents can access
        return agent.status === 'active';

      case this.aclLevels.system:
        // Only system roles can access
        return this.systemRoles.has(agent.type);

      default:
        return false;
    }
  }

  /**
   * Check explicit permission grants
   */
  async _checkExplicitPermission(agentId, resourceId, resourceType, action, context) {
    return new Promise((resolve) => {
      const sql = `
        SELECT p.* FROM permissions p
        WHERE p.entity_id = ?
        AND p.resource_type = ?
        AND (p.resource_id = ? OR p.resource_id IS NULL)
        AND p.is_active = 1
        AND (p.expires_at IS NULL OR p.expires_at > datetime('now'))
        ${context.projectId ? 'AND (p.project_id = ? OR p.project_id IS NULL)' : ''}
        ORDER BY p.permission_level DESC, p.resource_id DESC
        LIMIT 1
      `;

      const params = context.projectId ?
        [agentId, resourceType, resourceId, context.projectId] :
        [agentId, resourceType, resourceId];

      this.db.get(sql, params, (err, row) => {
        if (err || !row) {
          resolve(false);
          return;
        }

        try {
          const actions = JSON.parse(row.actions || '[]');
          const hasAction = actions.includes(action) || actions.includes('*');

          // Check conditions if present
          if (row.conditions && hasAction) {
            const conditions = JSON.parse(row.conditions);
            const conditionsMet = this._evaluateConditions(conditions, context);
            resolve(conditionsMet);
          } else {
            resolve(hasAction);
          }
        } catch (error) {
          console.error('Permission parsing error:', error);
          resolve(false);
        }
      });
    });
  }

  /**
   * Evaluate permission conditions
   */
  _evaluateConditions(conditions, context) {
    // Time-based conditions
    if (conditions.timeRange) {
      const now = new Date();
      const start = new Date(conditions.timeRange.start);
      const end = new Date(conditions.timeRange.end);
      if (now < start || now > end) {
        return false;
      }
    }

    // Day of week conditions
    if (conditions.daysOfWeek) {
      const today = new Date().getDay();
      if (!conditions.daysOfWeek.includes(today)) {
        return false;
      }
    }

    // IP range conditions
    if (conditions.ipRanges && context.ipAddress) {
      const inRange = conditions.ipRanges.some(range =>
        this._ipInRange(context.ipAddress, range)
      );
      if (!inRange) {
        return false;
      }
    }

    // Custom attribute conditions
    if (conditions.attributes && context.attributes) {
      for (const [key, value] of Object.entries(conditions.attributes)) {
        if (context.attributes[key] !== value) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Check if IP is in range (simple CIDR check)
   */
  _ipInRange(ip, range) {
    // Simplified implementation - would need full CIDR support in production
    if (range.includes('/')) {
      const [subnet] = range.split('/');
      return ip.startsWith(subnet.split('.').slice(0, -1).join('.'));
    }
    return ip === range;
  }

  /**
   * Get agent from database
   */
  async _getAgent(agentId) {
    return new Promise((resolve) => {
      const sql = `SELECT * FROM agents WHERE id = ?`;

      this.db.get(sql, [agentId], (err, row) => {
        if (err) {
          console.error('Get agent error:', err);
          this.metrics.errors++;
          this.emit('error', { agentId, error: err, context: 'getAgent' });
          resolve(null);
        } else {
          resolve(row);
        }
      });
    });
  }

  /**
   * Get resource from database
   */
  async _getResource(resourceId, resourceType) {
    return new Promise((resolve) => {
      let sql;
      const params = [resourceId];

      switch (resourceType) {
        case 'memory':
          sql = `SELECT * FROM memory WHERE id = ? OR key = ?`;
          params.push(resourceId);
          break;
        case 'task':
          sql = `SELECT * FROM tasks WHERE id = ?`;
          break;
        case 'event':
          sql = `SELECT * FROM events WHERE id = ?`;
          break;
        case 'project':
          sql = `SELECT * FROM projects WHERE id = ?`;
          break;
        default:
          resolve(null);
          return;
      }

      this.db.get(sql, params, (err, row) => {
        if (err) {
          console.error('Get resource error:', err);
          resolve(null);
        } else {
          resolve(row);
        }
      });
    });
  }

  /**
   * Grant permission to agent
   */
  async grantPermission(agentId, resourceType, permissionLevel, actions, options = {}) {
    try {
      const permissionId = `perm-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const expiresAt = options.expiresAt || null;
      const conditions = options.conditions || null;
      const projectId = options.projectId || null;
      const resourceId = options.resourceId || null;

      const sql = `
        INSERT INTO permissions (
          id, entity_id, entity_type, resource_type, resource_id, project_id,
          permission_level, actions, conditions, granted_by, expires_at,
          is_active, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await new Promise((resolve, reject) => {
        this.db.run(sql, [
          permissionId,
          agentId,
          'agent',
          resourceType,
          resourceId,
          projectId,
          permissionLevel,
          JSON.stringify(actions),
          conditions ? JSON.stringify(conditions) : null,
          options.grantedBy || 'system',
          expiresAt,
          1,
          options.metadata ? JSON.stringify(options.metadata) : null
        ], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Clear cache for this agent (local)
      this._clearAgentCache(agentId);
      this.metrics.invalidations++;

      // Notify other instances via Redis
      await this._publishInvalidation('permission', {
        agentId,
        permissionId,
        resourceType,
        permissionLevel,
        action: 'granted'
      });

      // Audit log
      await this._auditLog(
        options.grantedBy || 'system',
        permissionId,
        'grant_permission',
        true,
        'Permission granted',
        { agentId, resourceType, permissionLevel }
      );

      this.emit('permissionGranted', {
        permissionId,
        agentId,
        resourceType,
        permissionLevel,
        actions
      });

      return permissionId;

    } catch (error) {
      console.error('Grant permission error:', error);
      this.metrics.errors++;
      throw error;
    }
  }

  /**
   * Revoke permission
   */
  async revokePermission(permissionId, revokedBy = 'system') {
    try {
      // First, get permission details to know which agent to invalidate
      const permission = await new Promise((resolve, reject) => {
        const sql = `SELECT entity_id, resource_type FROM permissions WHERE id = ?`;
        this.db.get(sql, [permissionId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      // Update permission status
      const sql = `UPDATE permissions SET is_active = 0 WHERE id = ?`;

      await new Promise((resolve, reject) => {
        this.db.run(sql, [permissionId], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Clear cache for affected agent if known
      if (permission && permission.entity_id) {
        this._clearAgentCache(permission.entity_id);
        this.metrics.invalidations++;

        // Notify other instances via Redis
        await this._publishInvalidation('permission', {
          agentId: permission.entity_id,
          permissionId,
          resourceType: permission.resource_type,
          action: 'revoked'
        });
      } else {
        // Clear all cache if agent unknown
        this.aclCache.clear();
        this.metrics.invalidations++;

        // Notify other instances
        await this._publishInvalidation('permission', {
          permissionId,
          action: 'revoked',
          fullInvalidation: true
        });
      }

      // Audit log
      await this._auditLog(
        revokedBy,
        permissionId,
        'revoke_permission',
        true,
        'Permission revoked',
        { permissionId }
      );

      this.emit('permissionRevoked', { permissionId, revokedBy });

      return true;

    } catch (error) {
      console.error('Revoke permission error:', error);
      this.metrics.errors++;
      throw error;
    }
  }

  /**
   * Cache permission check result
   */
  _cachePermission(agentId, resourceId, action, allowed) {
    const key = `${agentId}:${resourceId}:${action}`;
    this.aclCache.set(key, {
      allowed,
      timestamp: Date.now()
    });

    // Clean old cache entries
    if (this.aclCache.size > 10000) {
      const now = Date.now();
      for (const [k, v] of this.aclCache.entries()) {
        if (now - v.timestamp > this.cacheTTL) {
          this.aclCache.delete(k);
        }
      }
    }
  }

  /**
   * Get cached permission
   */
  _getCachedPermission(agentId, resourceId, action) {
    const key = `${agentId}:${resourceId}:${action}`;
    const cached = this.aclCache.get(key);

    if (cached && (Date.now() - cached.timestamp < this.cacheTTL)) {
      return cached.allowed;
    }

    return null;
  }

  /**
   * Update agent permissions
   */
  async updateAgentPermissions(agentId, newPermissions) {
    try {
      // Update permissions in database
      const sql = `
        UPDATE permissions
        SET actions = ?, updated_at = datetime('now')
        WHERE entity_id = ? AND entity_type = 'agent' AND is_active = 1
      `;

      await new Promise((resolve, reject) => {
        this.db.run(sql, [JSON.stringify(newPermissions), agentId], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Invalidate cache for this agent (local)
      this._clearAgentCache(agentId);
      this.metrics.invalidations++;

      // Notify other instances via Redis
      await this._publishInvalidation('permission', {
        agentId,
        action: 'updated',
        permissions: newPermissions
      });

      this.emit('permissionsUpdated', { agentId, permissions: newPermissions });

      return true;
    } catch (error) {
      console.error('Update agent permissions error:', error);
      this.metrics.errors++;
      throw error;
    }
  }

  /**
   * Update agent role (type)
   */
  async updateAgentRole(agentId, newRole) {
    try {
      // Update agent role in database
      const sql = `
        UPDATE agents
        SET type = ?, updated_at = datetime('now')
        WHERE id = ?
      `;

      await new Promise((resolve, reject) => {
        this.db.run(sql, [newRole, agentId], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Invalidate cache for this agent (local)
      this._clearAgentCache(agentId);
      this.metrics.invalidations++;

      // Notify other instances via Redis
      await this._publishInvalidation('role', {
        agentId,
        newRole,
        action: 'updated'
      });

      this.emit('roleUpdated', { agentId, role: newRole });

      return true;
    } catch (error) {
      console.error('Update agent role error:', error);
      this.metrics.errors++;
      throw error;
    }
  }

  /**
   * Update team permissions
   */
  async updateTeamPermissions(teamId, newPermissions) {
    try {
      // Update team permissions in database
      const sql = `
        UPDATE permissions
        SET actions = ?, updated_at = datetime('now')
        WHERE entity_id = ? AND entity_type = 'team' AND is_active = 1
      `;

      await new Promise((resolve, reject) => {
        this.db.run(sql, [JSON.stringify(newPermissions), teamId], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Clear all cache as team changes affect multiple agents
      this.aclCache.clear();
      this.metrics.invalidations++;

      // Notify other instances via Redis
      await this._publishInvalidation('team', {
        teamId,
        action: 'updated',
        permissions: newPermissions
      });

      this.emit('teamPermissionsUpdated', { teamId, permissions: newPermissions });

      return true;
    } catch (error) {
      console.error('Update team permissions error:', error);
      this.metrics.errors++;
      throw error;
    }
  }

  /**
   * Clear agent cache
   */
  _clearAgentCache(agentId) {
    for (const [key] of this.aclCache.entries()) {
      if (key.startsWith(`${agentId}:`)) {
        this.aclCache.delete(key);
      }
    }
  }

  /**
   * Clear all cache
   */
  clearCache() {
    this.aclCache.clear();
    this.emit('cacheCleared');
  }

  /**
   * Audit log
   */
  async _auditLog(agentId, resourceId, action, allowed, reason, context = {}) {
    try {
      const auditId = `audit-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const sql = `
        INSERT INTO audit_log (
          id, entity_id, entity_type, action, changed_by,
          swarm_id, session_id, ip_address, user_agent,
          acl_level, risk_level, category, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const metadata = {
        resourceId,
        allowed,
        reason,
        ...context
      };

      await new Promise((resolve, reject) => {
        this.db.run(sql, [
          auditId,
          resourceId,
          'permission_check',
          action,
          agentId,
          context.swarmId || null,
          context.sessionId || null,
          context.ipAddress || null,
          context.userAgent || null,
          context.aclLevel || 3,
          allowed ? 'low' : 'medium',
          'acl',
          JSON.stringify(metadata)
        ], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      this.metrics.auditLogs++;

    } catch (error) {
      console.error('Audit log error:', error);
      // Don't throw - audit logging failure shouldn't block operations
    }
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      cacheSize: this.aclCache.size,
      cacheHitRate: this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) || 0,
      grantRate: this.metrics.grants / this.metrics.checks || 0,
      denialRate: this.metrics.denials / this.metrics.checks || 0
    };
  }

  /**
   * Get audit trail for resource
   */
  async getAuditTrail(resourceId, limit = 100) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM audit_log
        WHERE entity_id = ? AND category = 'acl'
        ORDER BY created_at DESC
        LIMIT ?
      `;

      this.db.all(sql, [resourceId, limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * Shutdown ACL enforcer
   */
  async shutdown() {
    console.log('🛑 Shutting down ACLEnforcer...');
    this.aclCache.clear();
    this.emit('shutdown');
    console.log('✅ ACLEnforcer shut down');
  }
}

module.exports = ACLEnforcer;
