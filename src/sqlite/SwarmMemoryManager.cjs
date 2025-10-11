/**
 * SwarmMemoryManager - SQLite-based memory management with 5-level ACL
 * Phase 1 Foundation Infrastructure & Event Bus Architecture
 *
 * ACL Levels:
 * 1. private - Only accessible by the specific agent
 * 2. team - Accessible by agents in the same team
 * 3. swarm - Accessible by all agents in the swarm
 * 4. project - Accessible by agents in the same project (multi-project isolation)
 * 5. public - Accessible by all authenticated agents
 * 6. system - System-level access (administrative)
 */

const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const lz4 = require('lz4');
const { promisify } = require('util');
const EventEmitter = require('events');

class SwarmMemoryManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.dbPath = options.dbPath || ':memory:';
    this.encryptionKey = options.encryptionKey || crypto.randomBytes(32);
    this.compressionThreshold = options.compressionThreshold || 1024; // 1KB
    this.defaultTTL = options.defaultTTL || 86400; // 24 hours

    this.db = null;
    this.isInitialized = false;

    // Cache for frequently accessed ACL checks
    this.aclCache = new Map();
    this.aclCacheTimeout = options.aclCacheTimeout || 300000; // 5 minutes

    // Performance metrics
    this.metrics = {
      operations: 0,
      cacheHits: 0,
      cacheMisses: 0,
      encryptionOperations: 0,
      compressionOperations: 0,
      averageAccessTime: 0,
      totalAccessTime: 0
    };

    // Bind methods
    this.get = promisify(this._get.bind(this));
    this.set = promisify(this._set.bind(this));
    this.delete = promisify(this._delete.bind(this));
    this.has = promisify(this._has.bind(this));
    this.clear = promisify(this._clear.bind(this));
  }

  /**
   * Initialize the SQLite database with schema
   */
  async initialize() {
    if (this.isInitialized) {
      return this;
    }

    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          this.emit('error', err);
          reject(err);
          return;
        }

        // Enable performance optimizations
        this.db.run('PRAGMA foreign_keys = ON');
        this.db.run('PRAGMA journal_mode = WAL');
        this.db.run('PRAGMA synchronous = NORMAL');
        this.db.run('PRAGMA cache_size = -64000');
        this.db.run('PRAGMA temp_store = memory');
        this.db.run('PRAGMA mmap_size = 268435456');

        // Load schema if file path provided
        if (this.dbPath !== ':memory:') {
          const fs = require('fs');
          const path = require('path');
          const schemaPath = path.join(__dirname, 'schema.sql');

          if (fs.existsSync(schemaPath)) {
            const schema = fs.readFileSync(schemaPath, 'utf8');
            this.db.exec(schema, (err) => {
              if (err) {
                this.emit('error', err);
                reject(err);
                return;
              }
              this.isInitialized = true;
              this.emit('initialized');
              resolve(this);
            });
          } else {
            this.isInitialized = true;
            this.emit('initialized');
            resolve(this);
          }
        } else {
          this.isInitialized = true;
          this.emit('initialized');
          resolve(this);
        }
      });
    });
  }

  /**
   * Encrypt data using AES-256-GCM
   */
  _encrypt(data, aclLevel) {
    if (aclLevel <= 2) { // private and team data
      this.metrics.encryptionOperations++;

      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
      cipher.setAAD(Buffer.from(aclLevel.toString()));

      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag();

      return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex')
      };
    }

    return { encrypted: data, iv: null, authTag: null };
  }

  /**
   * Decrypt data using AES-256-GCM
   */
  _decrypt(encryptedData, iv, authTag, aclLevel) {
    if (aclLevel <= 2 && iv && authTag) { // private and team data
      this.metrics.encryptionOperations++;

      const ivBuffer = Buffer.from(iv, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, ivBuffer);
      decipher.setAAD(Buffer.from(aclLevel.toString()));
      decipher.setAuthTag(Buffer.from(authTag, 'hex'));

      let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    }

    return encryptedData;
  }

  /**
   * Compress data using LZ4
   */
  _compress(data) {
    if (Buffer.byteLength(data, 'utf8') > this.compressionThreshold) {
      this.metrics.compressionOperations++;
      const input = Buffer.from(data, 'utf8');
      const compressed = lz4.encode(input);
      return compressed.toString('base64');
    }
    return data;
  }

  /**
   * Decompress data using LZ4
   */
  _decompress(compressedData) {
    try {
      const compressed = Buffer.from(compressedData, 'base64');
      const decompressed = lz4.decode(compressed);
      return decompressed.toString('utf8');
    } catch (error) {
      // If decompression fails, return original data
      return compressedData;
    }
  }

  /**
   * Check ACL permissions with project-level support
   */
  async _checkACL(agentId, aclLevel, action = 'read', context = {}) {
    const cacheKey = `${agentId}:${aclLevel}:${action}:${context.projectId || 'default'}`;
    const cached = this.aclCache.get(cacheKey);

    if (cached && (Date.now() - cached.timestamp < this.aclCacheTimeout)) {
      this.metrics.cacheHits++;
      return cached.allowed;
    }

    this.metrics.cacheMisses++;

    return new Promise((resolve) => {
      // Get agent info with project context
      const agentSql = `
        SELECT a.*, p.id as project_id, p.name as project_name
        FROM agents a
        LEFT JOIN projects p ON (p.id = ? OR a.project_id = ?)
        WHERE a.id = ?
      `;

      this.db.get(agentSql, [context.projectId, context.projectId, agentId], (err, agentRow) => {
        if (err) {
          resolve(false);
          return;
        }

        // Check permissions with project context
        const permSql = `
          SELECT p.permission_level, p.actions, p.resource_id
          FROM permissions p
          WHERE p.entity_id = ? AND p.is_active = 1
          AND (p.expires_at IS NULL OR p.expires_at > datetime('now'))
          ORDER BY p.permission_level DESC
          LIMIT 1
        `;

        this.db.get(permSql, [agentId], (err, permRow) => {
          if (err) {
            resolve(false);
            return;
          }

          let allowed = false;

          if (permRow) {
            // Check if permission level is sufficient
            if (permRow.permission_level >= aclLevel) {
              // Check specific action
              try {
                const actions = JSON.parse(permRow.actions || '[]');
                allowed = actions.includes(action) || actions.includes('*');
              } catch (e) {
                allowed = action === 'read'; // Default read access
              }
            }
          } else {
            // Default access rules with project-level isolation
            switch (aclLevel) {
              case 1: // private
                allowed = false; // Must have explicit permission
                break;
              case 2: // team
                allowed = agentRow && agentRow.team_id; // Agent must be in a team
                break;
              case 3: // swarm
                allowed = agentRow && agentRow.swarm_id; // Agent must be in a swarm
                break;
              case 4: // project
                // Check if agent is in the same project
                if (context.projectId && agentRow) {
                  allowed = agentRow.project_id === context.projectId ||
                           agentRow.id === context.projectId;
                } else {
                  allowed = false; // Project access requires project context
                }
                break;
              case 5: // public
                allowed = agentRow && agentRow.status === 'active'; // Active agents only
                break;
              case 6: // system
                allowed = agentRow && agentRow.type === 'system'; // System agents only
                break;
              default:
                allowed = false;
            }
          }

          // Cache result
          this.aclCache.set(cacheKey, {
            allowed,
            timestamp: Date.now()
          });

          // Clean old cache entries periodically
          if (this.aclCache.size > 1000) {
            const now = Date.now();
            for (const [key, value] of this.aclCache.entries()) {
              if (now - value.timestamp > this.aclCacheTimeout) {
                this.aclCache.delete(key);
              }
            }
          }

          resolve(allowed);
        });
      });
    });
  }

  /**
   * Get memory value with ACL check and project context
   */
  _get(key, options = {}) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const agentId = options.agentId || 'system';
      const namespace = options.namespace || 'default';
      const projectId = options.projectId || null;

      const sql = `
        SELECT m.*, a.acl_level as agent_acl_level, a.project_id as agent_project_id
        FROM memory m
        LEFT JOIN agents a ON a.id = ?
        WHERE m.key = ? AND m.namespace = ?
        AND (m.expires_at IS NULL OR m.expires_at > datetime('now'))
      `;

      this.db.get(sql, [agentId, key, namespace], async (err, row) => {
        const accessTime = Date.now() - startTime;
        this.updateMetrics(accessTime);

        if (err) {
          this.emit('error', err);
          reject(err);
          return;
        }

        if (!row) {
          resolve(null);
          return;
        }

        // Check ACL with project context
        const context = {
          projectId: projectId || row.project_id,
          swarmId: row.swarm_id,
          teamId: row.team_id
        };

        const hasAccess = await this._checkACL(agentId, row.acl_level, 'read', context);
        if (!hasAccess) {
          this.emit('accessDenied', { key, agentId, aclLevel: row.acl_level, context });
          resolve(null);
          return;
        }

        try {
          // Update access count and timestamp
          await this._updateAccessStats(row.id);

          let value = row.value;

          // Decompress if needed
          if (row.compression_type === 'lz4') {
            value = this._decompress(value);
          }

          // Decrypt if needed
          if (row.encryption_type === 'aes-256-gcm' && row.iv) {
            value = this._decrypt(value, row.iv, row.checksum, row.acl_level);
          }

          // Parse JSON if it's JSON data
          if (row.type === 'data') {
            try {
              value = JSON.parse(value);
            } catch (e) {
              // Keep as string if not valid JSON
            }
          }

          this.emit('get', { key, value, namespace, context });
          resolve(value);
        } catch (error) {
          this.emit('error', error);
          reject(error);
        }
      });
    });
  }

  /**
   * Set memory value with ACL and project context
   */
  _set(key, value, options = {}) {
    return new Promise(async (resolve, reject) => {
      const startTime = Date.now();
      const agentId = options.agentId || 'system';
      const namespace = options.namespace || 'default';
      const type = options.type || 'data';
      const aclLevel = options.aclLevel || 2; // Default to team level
      const ttl = options.ttl || this.defaultTTL;
      const projectId = options.projectId || null;

      // Check write permissions with project context
      const context = {
        projectId,
        swarmId: options.swarmId,
        teamId: options.teamId
      };

      const hasWriteAccess = await this._checkACL(agentId, aclLevel, 'write', context);
      if (!hasWriteAccess) {
        this.emit('accessDenied', { key, agentId, aclLevel, action: 'write', context });
        reject(new Error('Access denied'));
        return;
      }

      try {
        // Prepare value
        let processedValue = value;
        let sizeBytes = 0;

        if (typeof value === 'object') {
          processedValue = JSON.stringify(value);
        }

        sizeBytes = Buffer.byteLength(processedValue, 'utf8');

        // Encrypt if needed
        const encryption = this._encrypt(processedValue, aclLevel);

        // Compress if needed
        const compressionType = sizeBytes > this.compressionThreshold ? 'lz4' : 'none';
        let finalValue = encryption.encrypted;
        let iv = encryption.iv;
        let checksum = encryption.authTag;

        if (compressionType === 'lz4') {
          finalValue = this._compress(finalValue);
        }

        // Calculate expiry
        const expiresAt = ttl > 0 ?
          new Date(Date.now() + ttl * 1000).toISOString() : null;

        // Upsert operation with project support
        const sql = `
          INSERT OR REPLACE INTO memory (
            id, key, value, namespace, type, swarm_id, agent_id, team_id, project_id,
            acl_level, compression_type, encryption_type, iv, checksum,
            ttl_seconds, expires_at, size_bytes, version, updated_at
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            COALESCE((SELECT version FROM memory WHERE key = ? AND namespace = ?), 0) + 1,
            CURRENT_TIMESTAMP
          )
        `;

        const memoryId = `${namespace}:${key}`;
        const swarmId = options.swarmId || 'default';
        const teamId = options.teamId || null;

        this.db.run(sql, [
          memoryId, key, finalValue, namespace, type, swarmId, agentId, teamId, projectId,
          aclLevel, compressionType, 'aes-256-gcm', iv, checksum,
          ttl, expiresAt, sizeBytes, key, namespace
        ], function(err) {
          const accessTime = Date.now() - startTime;
          this.updateMetrics(accessTime);

          if (err) {
            this.emit('error', err);
            reject(err);
            return;
          }

          this.emit('set', { key, value, namespace, aclLevel, context });
          resolve({ id: memoryId, key, value, aclLevel, projectId });
        }.bind(this));

      } catch (error) {
        this.emit('error', error);
        reject(error);
      }
    });
  }

  /**
   * Delete memory value with ACL check and project context
   */
  _delete(key, options = {}) {
    return new Promise(async (resolve, reject) => {
      const agentId = options.agentId || 'system';
      const namespace = options.namespace || 'default';
      const projectId = options.projectId || null;

      // First check ACL with project context
      const sql = `
        SELECT acl_level, project_id, swarm_id, team_id FROM memory
        WHERE key = ? AND namespace = ?
      `;

      this.db.get(sql, [key, namespace], async (err, row) => {
        if (err) {
          reject(err);
          return;
        }

        if (!row) {
          resolve(false);
          return;
        }

        const context = {
          projectId: projectId || row.project_id,
          swarmId: row.swarm_id,
          teamId: row.team_id
        };

        const hasDeleteAccess = await this._checkACL(agentId, row.acl_level, 'delete', context);
        if (!hasDeleteAccess) {
          this.emit('accessDenied', { key, agentId, aclLevel: row.acl_level, action: 'delete', context });
          reject(new Error('Access denied'));
          return;
        }

        const deleteSql = `
          DELETE FROM memory WHERE key = ? AND namespace = ?
        `;

        this.db.run(deleteSql, [key, namespace], function(err) {
          if (err) {
            reject(err);
            return;
          }

          resolve(this.changes > 0);
        });
      });
    });
  }

  /**
   * Check if key exists with ACL and project context
   */
  _has(key, options = {}) {
    return new Promise(async (resolve, reject) => {
      const agentId = options.agentId || 'system';
      const namespace = options.namespace || 'default';
      const projectId = options.projectId || null;

      const sql = `
        SELECT acl_level, project_id, swarm_id, team_id FROM memory
        WHERE key = ? AND namespace = ?
        AND (expires_at IS NULL OR expires_at > datetime('now'))
      `;

      this.db.get(sql, [key, namespace], async (err, row) => {
        if (err) {
          reject(err);
          return;
        }

        if (!row) {
          resolve(false);
          return;
        }

        const context = {
          projectId: projectId || row.project_id,
          swarmId: row.swarm_id,
          teamId: row.team_id
        };

        const hasAccess = await this._checkACL(agentId, row.acl_level, 'read', context);
        resolve(hasAccess);
      });
    });
  }

  /**
   * Clear namespace or all memory with 6-level ACL
   */
  _clear(options = {}) {
    return new Promise(async (resolve, reject) => {
      const agentId = options.agentId || 'system';
      const namespace = options.namespace;
      const projectId = options.projectId;

      // Check if agent has system-level access (level 6)
      const context = { projectId };
      const hasSystemAccess = await this._checkACL(agentId, 6, 'delete', context);
      if (!hasSystemAccess) {
        reject(new Error('System-level access required for clear operation'));
        return;
      }

      let sql;
      let params = [];

      if (namespace && projectId) {
        sql = 'DELETE FROM memory WHERE namespace = ? AND project_id = ?';
        params = [namespace, projectId];
      } else if (namespace) {
        sql = 'DELETE FROM memory WHERE namespace = ?';
        params = [namespace];
      } else if (projectId) {
        sql = 'DELETE FROM memory WHERE project_id = ?';
        params = [projectId];
      } else {
        sql = 'DELETE FROM memory';
      }

      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
          return;
        }

        resolve(this.changes);
      });
    });
  }

  /**
   * Update access statistics
   */
  _updateAccessStats(memoryId) {
    return new Promise((resolve) => {
      const sql = `
        UPDATE memory
        SET access_count = access_count + 1, last_accessed_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;

      this.db.run(sql, [memoryId], resolve);
    });
  }

  /**
   * Update performance metrics
   */
  updateMetrics(accessTime) {
    this.metrics.operations++;
    this.metrics.totalAccessTime += accessTime;
    this.metrics.averageAccessTime = this.metrics.totalAccessTime / this.metrics.operations;
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      cacheHitRate: this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) || 0,
      aclCacheSize: this.aclCache.size
    };
  }

  /**
   * Clear ACL cache
   */
  clearACLCache() {
    this.aclCache.clear();
    this.emit('aclCacheCleared');
  }

  /**
   * Backup database
   */
  async backup(backupPath) {
    return new Promise((resolve, reject) => {
      this.db.backup(backupPath, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve(backupPath);
        }
      });
    });
  }

  /**
   * Vacuum database to optimize storage
   */
  async vacuum() {
    return new Promise((resolve, reject) => {
      this.db.run('VACUUM', (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Analyze database for query optimization
   */
  async analyze() {
    return new Promise((resolve, reject) => {
      this.db.run('ANALYZE', (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Get database statistics
   */
  async getStats() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT
          COUNT(*) as total_memory_entries,
          SUM(size_bytes) as total_size_bytes,
          AVG(access_count) as avg_access_count,
          COUNT(CASE WHEN expires_at IS NOT NULL THEN 1 END) as entries_with_ttl,
          COUNT(CASE WHEN compression_type != 'none' THEN 1 END) as compressed_entries,
          COUNT(CASE WHEN encryption_type != 'none' THEN 1 END) as encrypted_entries
        FROM memory
        WHERE expires_at IS NULL OR expires_at > datetime('now')
      `;

      this.db.get(sql, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  /**
   * Close database connection
   */
  async close() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            reject(err);
          } else {
            this.isInitialized = false;
            this.emit('closed');
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = SwarmMemoryManager;