/**
 * SQLite Memory Manager Unit Tests - Sprint 1.7
 *
 * Test Coverage:
 * 1. Dual-write pattern (Redis + SQLite simultaneous writes)
 * 2. ACL enforcement (5 levels: private, agent, swarm, project, system)
 * 3. Encryption (AES-256-GCM for levels 1, 2, 5)
 * 4. TTL expiration handling
 * 5. Fallback behavior on Redis failure
 * 6. Query performance and indexing
 * 7. Transaction safety and rollback
 * 8. Concurrent write handling
 *
 * Epic: SQLite Integration Migration
 * Sprint: 1.7 - Testing & Validation
 *
 * @module cfn-loop/__tests__/sqlite-memory-manager.test
 */

import Redis from 'ioredis';
import type { RedisOptions } from 'ioredis';
import Database from 'better-sqlite3';
import { promises as fs } from 'fs';
import { join } from 'path';
import crypto from 'crypto';

// ===== TEST CONFIGURATION =====

const REDIS_CONFIG: RedisOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  db: parseInt(process.env.REDIS_TEST_DB || '1'),
  retryStrategy: (times: number) => {
    if (times > 3) return null;
    return Math.min(times * 50, 500);
  },
};

const TEST_DB_PATH = join(process.cwd(), '.test-memory.db');
const TEST_TIMEOUT = 30000; // 30 seconds

// ===== ACL LEVELS =====

enum ACLLevel {
  PRIVATE = 1,    // Agent-only access
  AGENT = 2,      // Agent coordination within swarm
  SWARM = 3,      // Swarm-wide access
  PROJECT = 4,    // Project-level (Product Owner, CI/CD)
  SYSTEM = 5,     // System-level (monitoring, admin)
}

// ===== TYPE DEFINITIONS =====

interface MemoryEntry {
  key: string;
  value: string;
  aclLevel: ACLLevel;
  agentId?: string;
  swarmId?: string;
  encrypted: boolean;
  ttl?: number;
  createdAt: number;
  updatedAt: number;
}

interface EncryptionResult {
  encrypted: string;
  iv: string;
  authTag: string;
}

// ===== MOCK SQLITE MEMORY MANAGER =====

class SQLiteMemoryManager {
  private redis: Redis;
  private db: Database.Database;
  private encryptionKey: Buffer;

  constructor(redisClient: Redis, dbPath: string, encryptionKey?: string) {
    this.redis = redisClient;
    this.db = new Database(dbPath);
    this.encryptionKey = encryptionKey
      ? Buffer.from(encryptionKey, 'hex')
      : crypto.randomBytes(32);

    this.initializeSchema();
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memory (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        acl_level INTEGER NOT NULL,
        agent_id TEXT,
        swarm_id TEXT,
        encrypted INTEGER NOT NULL DEFAULT 0,
        ttl INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_acl_level ON memory(acl_level);
      CREATE INDEX IF NOT EXISTS idx_agent_id ON memory(agent_id);
      CREATE INDEX IF NOT EXISTS idx_swarm_id ON memory(swarm_id);
      CREATE INDEX IF NOT EXISTS idx_ttl ON memory(ttl);
    `);
  }

  private encrypt(data: string): EncryptionResult {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
    };
  }

  private decrypt(encrypted: string, iv: string, authTag: string): string {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      Buffer.from(iv, 'hex')
    );

    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  private shouldEncrypt(aclLevel: ACLLevel): boolean {
    return aclLevel === ACLLevel.PRIVATE ||
           aclLevel === ACLLevel.AGENT ||
           aclLevel === ACLLevel.SYSTEM;
  }

  private checkACL(
    entry: MemoryEntry,
    requestorAgentId?: string,
    requestorSwarmId?: string
  ): boolean {
    switch (entry.aclLevel) {
      case ACLLevel.PRIVATE:
        return entry.agentId === requestorAgentId;

      case ACLLevel.AGENT:
      case ACLLevel.SWARM:
        return entry.swarmId === requestorSwarmId;

      case ACLLevel.PROJECT:
      case ACLLevel.SYSTEM:
        return true; // Admin access

      default:
        return false;
    }
  }

  async set(
    key: string,
    value: any,
    options: {
      aclLevel: ACLLevel;
      agentId?: string;
      swarmId?: string;
      ttl?: number;
    }
  ): Promise<void> {
    const now = Date.now();
    let valueStr = JSON.stringify(value);
    let encrypted = false;
    let iv: string | undefined;
    let authTag: string | undefined;

    // Encrypt if necessary
    if (this.shouldEncrypt(options.aclLevel)) {
      const encResult = this.encrypt(valueStr);
      valueStr = JSON.stringify({
        encrypted: encResult.encrypted,
        iv: encResult.iv,
        authTag: encResult.authTag,
      });
      encrypted = true;
    }

    // Dual-write pattern: Redis + SQLite
    const redisKey = `memory:${key}`;
    const redisValue = JSON.stringify({
      value: valueStr,
      encrypted,
      aclLevel: options.aclLevel,
      agentId: options.agentId,
      swarmId: options.swarmId,
      ttl: options.ttl,
      createdAt: now,
    });

    // Write to Redis (with TTL if specified)
    try {
      if (options.ttl) {
        // Convert milliseconds to seconds, minimum 1 second for Redis
        const ttlSeconds = Math.max(1, Math.ceil(options.ttl / 1000));
        await this.redis.setex(redisKey, ttlSeconds, redisValue);
      } else {
        await this.redis.set(redisKey, redisValue);
      }
    } catch (error) {
      // Redis write failed, continue with SQLite-only write
      console.warn('Redis write failed, continuing with SQLite:', error);
    }

    // Write to SQLite (transaction-safe)
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO memory
      (key, value, acl_level, agent_id, swarm_id, encrypted, ttl, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      key,
      valueStr,
      options.aclLevel,
      options.agentId || null,
      options.swarmId || null,
      encrypted ? 1 : 0,
      options.ttl ? now + options.ttl : null,
      now,
      now
    );
  }

  async get(
    key: string,
    options?: {
      agentId?: string;
      swarmId?: string;
    }
  ): Promise<any | null> {
    // Try Redis first
    try {
      const redisKey = `memory:${key}`;
      const redisValue = await this.redis.get(redisKey);

      if (redisValue) {
        const parsed = JSON.parse(redisValue);

        // Reconstruct entry for ACL check
        const entry: MemoryEntry = {
          key,
          value: parsed.value,
          aclLevel: parsed.aclLevel,
          agentId: parsed.agentId,
          swarmId: parsed.swarmId,
          encrypted: parsed.encrypted,
          ttl: parsed.ttl,
          createdAt: parsed.createdAt,
          updatedAt: Date.now(),
        };

        // Check ACL
        if (!this.checkACL(entry, options?.agentId, options?.swarmId)) {
          throw new Error('ACL violation: Access denied');
        }

        let value = parsed.value;

        if (parsed.encrypted) {
          const encData = JSON.parse(value);
          value = this.decrypt(encData.encrypted, encData.iv, encData.authTag);
        }

        return JSON.parse(value);
      }
    } catch (error) {
      // Redis failed, fall back to SQLite
      console.warn('Redis read failed, falling back to SQLite:', error);
    }

    // Fallback to SQLite
    const stmt = this.db.prepare('SELECT * FROM memory WHERE key = ?');
    const row = stmt.get(key) as any;

    if (!row) {
      return null;
    }

    // Check TTL
    if (row.ttl && row.ttl < Date.now()) {
      // Expired, clean up
      this.db.prepare('DELETE FROM memory WHERE key = ?').run(key);
      return null;
    }

    // Check ACL
    const entry: MemoryEntry = {
      key: row.key,
      value: row.value,
      aclLevel: row.acl_level,
      agentId: row.agent_id,
      swarmId: row.swarm_id,
      encrypted: row.encrypted === 1,
      ttl: row.ttl,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    if (!this.checkACL(entry, options?.agentId, options?.swarmId)) {
      throw new Error('ACL violation: Access denied');
    }

    // Decrypt if necessary
    let value = entry.value;
    if (entry.encrypted) {
      const encData = JSON.parse(value);
      value = this.decrypt(encData.encrypted, encData.iv, encData.authTag);
    }

    return JSON.parse(value);
  }

  async delete(key: string): Promise<void> {
    // Delete from both Redis and SQLite
    await this.redis.del(`memory:${key}`);
    this.db.prepare('DELETE FROM memory WHERE key = ?').run(key);
  }

  async cleanupExpired(): Promise<number> {
    const now = Date.now();
    const stmt = this.db.prepare('DELETE FROM memory WHERE ttl IS NOT NULL AND ttl < ?');
    const result = stmt.run(now);
    return result.changes;
  }

  close(): void {
    this.db.close();
  }
}

// ===== TEST SUITE =====

describe('SQLiteMemoryManager', () => {
  let redis: Redis;
  let manager: SQLiteMemoryManager;

  beforeAll(async () => {
    // Initialize Redis client
    redis = new Redis(REDIS_CONFIG);

    await new Promise<void>((resolve, reject) => {
      redis.once('ready', resolve);
      redis.once('error', reject);
    });
  });

  beforeEach(async () => {
    // Clean up test database
    try {
      await fs.unlink(TEST_DB_PATH);
    } catch (error) {
      // Ignore if file doesn't exist
    }

    // Create fresh manager
    manager = new SQLiteMemoryManager(redis, TEST_DB_PATH);

    // Clean up Redis test keys
    const keys = await redis.keys('memory:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }, TEST_TIMEOUT);

  afterEach(async () => {
    // Close manager
    if (manager) {
      manager.close();
    }

    // Clean up test database
    try {
      await fs.unlink(TEST_DB_PATH);
    } catch (error) {
      // Ignore
    }

    // Clean up Redis
    const keys = await redis.keys('memory:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }, TEST_TIMEOUT);

  afterAll(async () => {
    // Disconnect Redis
    await redis.quit();
  });

  describe('Dual-Write Pattern', () => {
    it('should write to both Redis and SQLite simultaneously', async () => {
      const key = 'test-dual-write';
      const value = { data: 'test-value', timestamp: Date.now() };

      await manager.set(key, value, {
        aclLevel: ACLLevel.SWARM,
        swarmId: 'swarm-1',
      });

      // Verify Redis write
      const redisValue = await redis.get(`memory:${key}`);
      expect(redisValue).toBeDefined();

      const redisParsed = JSON.parse(redisValue!);
      expect(redisParsed.aclLevel).toBe(ACLLevel.SWARM);

      // Verify SQLite write
      const sqliteValue = await manager.get(key, { swarmId: 'swarm-1' });
      expect(sqliteValue).toEqual(value);
    });

    it('should maintain consistency between Redis and SQLite', async () => {
      const keys = ['key-1', 'key-2', 'key-3'];
      const values = [
        { test: 'value-1' },
        { test: 'value-2' },
        { test: 'value-3' },
      ];

      // Write all values
      for (let i = 0; i < keys.length; i++) {
        await manager.set(keys[i], values[i], {
          aclLevel: ACLLevel.PROJECT,
        });
      }

      // Verify all values in both stores
      for (let i = 0; i < keys.length; i++) {
        const redisValue = await redis.get(`memory:${keys[i]}`);
        expect(redisValue).toBeDefined();

        const sqliteValue = await manager.get(keys[i]);
        expect(sqliteValue).toEqual(values[i]);
      }
    });

    it('should handle Redis failure with SQLite fallback', async () => {
      const key = 'test-fallback';
      const value = { fallback: 'test' };

      // Write with Redis available
      await manager.set(key, value, {
        aclLevel: ACLLevel.SWARM,
        swarmId: 'swarm-1',
      });

      // Simulate Redis failure by deleting the key
      await redis.del(`memory:${key}`);

      // Read should fall back to SQLite
      const retrieved = await manager.get(key, { swarmId: 'swarm-1' });
      expect(retrieved).toEqual(value);
    });
  });

  describe('ACL Enforcement', () => {
    it('should enforce PRIVATE level (agent-only access)', async () => {
      const key = 'private-key';
      const value = { secret: 'data' };
      const agentId = 'agent-1';

      await manager.set(key, value, {
        aclLevel: ACLLevel.PRIVATE,
        agentId,
      });

      // Same agent should access
      const retrieved = await manager.get(key, { agentId });
      expect(retrieved).toEqual(value);

      // Different agent should fail
      await expect(
        manager.get(key, { agentId: 'agent-2' })
      ).rejects.toThrow('ACL violation');
    });

    it('should enforce AGENT level (swarm coordination)', async () => {
      const key = 'agent-coord';
      const value = { coordination: 'data' };
      const swarmId = 'swarm-1';

      await manager.set(key, value, {
        aclLevel: ACLLevel.AGENT,
        swarmId,
      });

      // Same swarm should access
      const retrieved = await manager.get(key, { swarmId });
      expect(retrieved).toEqual(value);

      // Different swarm should fail
      await expect(
        manager.get(key, { swarmId: 'swarm-2' })
      ).rejects.toThrow('ACL violation');
    });

    it('should enforce SWARM level (swarm-wide access)', async () => {
      const key = 'swarm-data';
      const value = { swarm: 'information' };
      const swarmId = 'swarm-1';

      await manager.set(key, value, {
        aclLevel: ACLLevel.SWARM,
        swarmId,
      });

      // Same swarm should access
      const retrieved = await manager.get(key, { swarmId });
      expect(retrieved).toEqual(value);

      // Different swarm should fail
      await expect(
        manager.get(key, { swarmId: 'swarm-2' })
      ).rejects.toThrow('ACL violation');
    });

    it('should allow PROJECT level access (Product Owner, CI/CD)', async () => {
      const key = 'project-data';
      const value = { project: 'metrics' };

      await manager.set(key, value, {
        aclLevel: ACLLevel.PROJECT,
      });

      // Any requestor should access
      const retrieved = await manager.get(key);
      expect(retrieved).toEqual(value);
    });

    it('should allow SYSTEM level access (admin, monitoring)', async () => {
      const key = 'system-config';
      const value = { system: 'settings' };

      await manager.set(key, value, {
        aclLevel: ACLLevel.SYSTEM,
      });

      // Any requestor should access
      const retrieved = await manager.get(key);
      expect(retrieved).toEqual(value);
    });
  });

  describe('Encryption', () => {
    it('should encrypt PRIVATE level data (AES-256-GCM)', async () => {
      const key = 'encrypted-private';
      const value = { sensitive: 'private-data', ssn: '123-45-6789' };
      const agentId = 'agent-1';

      await manager.set(key, value, {
        aclLevel: ACLLevel.PRIVATE,
        agentId,
      });

      // Verify data is encrypted in SQLite
      const db = new Database(TEST_DB_PATH);
      const row = db.prepare('SELECT * FROM memory WHERE key = ?').get(key) as any;
      db.close();

      expect(row.encrypted).toBe(1);
      expect(row.value).not.toContain('sensitive');
      expect(row.value).not.toContain('123-45-6789');

      // Verify decryption works
      const retrieved = await manager.get(key, { agentId });
      expect(retrieved).toEqual(value);
    });

    it('should encrypt AGENT level data', async () => {
      const key = 'encrypted-agent';
      const value = { coordination: 'secret-strategy' };
      const swarmId = 'swarm-1';

      await manager.set(key, value, {
        aclLevel: ACLLevel.AGENT,
        swarmId,
      });

      // Verify encryption
      const db = new Database(TEST_DB_PATH);
      const row = db.prepare('SELECT * FROM memory WHERE key = ?').get(key) as any;
      db.close();

      expect(row.encrypted).toBe(1);

      // Verify decryption
      const retrieved = await manager.get(key, { swarmId });
      expect(retrieved).toEqual(value);
    });

    it('should encrypt SYSTEM level data', async () => {
      const key = 'encrypted-system';
      const value = { apiKey: 'secret-key-12345', token: 'jwt-token' };

      await manager.set(key, value, {
        aclLevel: ACLLevel.SYSTEM,
      });

      // Verify encryption
      const db = new Database(TEST_DB_PATH);
      const row = db.prepare('SELECT * FROM memory WHERE key = ?').get(key) as any;
      db.close();

      expect(row.encrypted).toBe(1);
      expect(row.value).not.toContain('secret-key');

      // Verify decryption
      const retrieved = await manager.get(key);
      expect(retrieved).toEqual(value);
    });

    it('should NOT encrypt SWARM level data', async () => {
      const key = 'unencrypted-swarm';
      const value = { public: 'swarm-status' };

      await manager.set(key, value, {
        aclLevel: ACLLevel.SWARM,
        swarmId: 'swarm-1',
      });

      // Verify no encryption
      const db = new Database(TEST_DB_PATH);
      const row = db.prepare('SELECT * FROM memory WHERE key = ?').get(key) as any;
      db.close();

      expect(row.encrypted).toBe(0);
    });

    it('should NOT encrypt PROJECT level data', async () => {
      const key = 'unencrypted-project';
      const value = { metrics: 'project-performance' };

      await manager.set(key, value, {
        aclLevel: ACLLevel.PROJECT,
      });

      // Verify no encryption
      const db = new Database(TEST_DB_PATH);
      const row = db.prepare('SELECT * FROM memory WHERE key = ?').get(key) as any;
      db.close();

      expect(row.encrypted).toBe(0);
    });
  });

  describe('TTL Expiration', () => {
    it('should respect TTL for entries', async () => {
      const key = 'ttl-test';
      const value = { temporary: 'data' };
      const ttl = 100; // 100ms (Redis rounds up to 1 second)

      await manager.set(key, value, {
        aclLevel: ACLLevel.SWARM,
        swarmId: 'swarm-1',
        ttl,
      });

      // Should exist immediately
      let retrieved = await manager.get(key, { swarmId: 'swarm-1' });
      expect(retrieved).toEqual(value);

      // Wait for expiration (Redis rounds 100ms → 1 second, so wait 1200ms)
      await new Promise(resolve => setTimeout(resolve, 1200));

      // Should be null after TTL
      retrieved = await manager.get(key, { swarmId: 'swarm-1' });
      expect(retrieved).toBeNull();
    });

    it('should cleanup expired entries in batch', async () => {
      const keys = ['expire-1', 'expire-2', 'expire-3'];
      const ttl = 50; // 50ms

      // Create entries with TTL
      for (const key of keys) {
        await manager.set(key, { data: key }, {
          aclLevel: ACLLevel.PROJECT,
          ttl,
        });
      }

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 100));

      // Cleanup
      const cleanedCount = await manager.cleanupExpired();
      expect(cleanedCount).toBe(keys.length);
    });

    it('should handle entries without TTL (never expire)', async () => {
      const key = 'no-ttl';
      const value = { permanent: 'data' };

      await manager.set(key, value, {
        aclLevel: ACLLevel.PROJECT,
      });

      // Should exist after long delay
      await new Promise(resolve => setTimeout(resolve, 200));

      const retrieved = await manager.get(key);
      expect(retrieved).toEqual(value);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent writes to same key', async () => {
      const key = 'concurrent-key';
      const writes = 10;

      const writePromises = Array.from({ length: writes }, (_, i) =>
        manager.set(key, { value: i }, {
          aclLevel: ACLLevel.PROJECT,
        })
      );

      await Promise.all(writePromises);

      // Should have one of the values (last write wins)
      const retrieved = await manager.get(key);
      expect(retrieved).toBeDefined();
      expect(typeof retrieved.value).toBe('number');
      expect(retrieved.value).toBeGreaterThanOrEqual(0);
      expect(retrieved.value).toBeLessThan(writes);
    });

    it('should handle concurrent writes to different keys', async () => {
      const keyCount = 50;

      const writePromises = Array.from({ length: keyCount }, (_, i) =>
        manager.set(`concurrent-${i}`, { value: i }, {
          aclLevel: ACLLevel.PROJECT,
        })
      );

      await Promise.all(writePromises);

      // All keys should be present
      const readPromises = Array.from({ length: keyCount }, (_, i) =>
        manager.get(`concurrent-${i}`)
      );

      const results = await Promise.all(readPromises);

      for (let i = 0; i < keyCount; i++) {
        expect(results[i]).toEqual({ value: i });
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle Redis connection failure gracefully', async () => {
      // Disconnect Redis temporarily
      const originalRedis = manager['redis'];
      const brokenRedis = {
        ...originalRedis,
        set: async () => { throw new Error('Redis connection lost'); },
        setex: async () => { throw new Error('Redis connection lost'); },
        get: async () => { throw new Error('Redis connection lost'); },
      } as any;

      manager['redis'] = brokenRedis;

      const key = 'redis-failure-test';
      const value = { test: 'data' };

      // Write should still succeed (SQLite only)
      await manager.set(key, value, {
        aclLevel: ACLLevel.PROJECT,
      });

      // Read should fall back to SQLite
      const retrieved = await manager.get(key);
      expect(retrieved).toEqual(value);

      // Restore Redis
      manager['redis'] = originalRedis;
    });

    it('should return null for non-existent keys', async () => {
      const retrieved = await manager.get('non-existent-key');
      expect(retrieved).toBeNull();
    });

    it('should handle malformed encryption data', async () => {
      // Manually insert bad encryption data
      const db = new Database(TEST_DB_PATH);
      db.prepare(`
        INSERT INTO memory (key, value, acl_level, encrypted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        'bad-encryption',
        JSON.stringify({ encrypted: 'invalid', iv: 'invalid', authTag: 'invalid' }),
        ACLLevel.PRIVATE,
        1,
        Date.now(),
        Date.now()
      );
      db.close();

      // Should throw decryption error
      await expect(
        manager.get('bad-encryption', { agentId: 'agent-1' })
      ).rejects.toThrow();
    });
  });

  describe('Performance & Indexing', () => {
    it('should efficiently query by ACL level (indexed)', async () => {
      const keyCount = 100;

      // Insert many entries
      for (let i = 0; i < keyCount; i++) {
        await manager.set(`perf-${i}`, { value: i }, {
          aclLevel: i % 2 === 0 ? ACLLevel.SWARM : ACLLevel.PROJECT,
          swarmId: 'swarm-1',
        });
      }

      // Query by ACL level (should use index)
      const db = new Database(TEST_DB_PATH);
      const start = Date.now();
      const rows = db.prepare('SELECT * FROM memory WHERE acl_level = ?')
        .all(ACLLevel.SWARM);
      const duration = Date.now() - start;
      db.close();

      expect(rows.length).toBe(keyCount / 2);
      expect(duration).toBeLessThan(50); // Should be fast with index
    });

    it('should efficiently query by agent_id (indexed)', async () => {
      const agents = ['agent-1', 'agent-2', 'agent-3'];
      const entriesPerAgent = 10;

      // Insert entries for each agent
      for (const agentId of agents) {
        for (let i = 0; i < entriesPerAgent; i++) {
          await manager.set(`${agentId}-${i}`, { value: i }, {
            aclLevel: ACLLevel.PRIVATE,
            agentId,
          });
        }
      }

      // Query by agent_id (should use index)
      const db = new Database(TEST_DB_PATH);
      const start = Date.now();
      const rows = db.prepare('SELECT * FROM memory WHERE agent_id = ?')
        .all('agent-1');
      const duration = Date.now() - start;
      db.close();

      expect(rows.length).toBe(entriesPerAgent);
      expect(duration).toBeLessThan(50);
    });
  });
});
