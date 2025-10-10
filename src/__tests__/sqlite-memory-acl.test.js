/**
 * SQLite Memory Management with 5-Level ACL - Comprehensive Tests
 * Phase 2 Fleet Manager Features & Advanced Capabilities
 */

const { SQLiteMemorySystem, SwarmMemoryManager } = require('../sqlite/index');
const EncryptionKeyManager = require('../sqlite/EncryptionKeyManager');
const MultiLayerCache = require('../sqlite/MultiLayerCache');
const ACLEnforcer = require('../sqlite/ACLEnforcer');
const path = require('path');
const fs = require('fs');

describe('SQLite Memory Management with 5-Level ACL', () => {
  let memorySystem;
  let testDbPath;

  beforeAll(async () => {
    testDbPath = path.join(__dirname, '../../test-memory-acl.db');

    // Clean up any existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Initialize memory system
    memorySystem = new SQLiteMemorySystem({
      swarmId: 'test-swarm-acl',
      agentId: 'test-agent-system',
      dbPath: testDbPath,
      enableRedisCoordination: false,
      enablePerformanceMonitoring: false
    });

    await memorySystem.initialize();
  });

  afterAll(async () => {
    await memorySystem.gracefulShutdown();

    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('5-Level ACL System', () => {
    test('should enforce private (level 1) access', async () => {
      const agent1 = {
        id: 'agent-private-1',
        name: 'Agent 1',
        type: 'coder',
        swarmId: 'test-swarm-acl',
        teamId: 'team-1',
        aclLevel: 1
      };

      await memorySystem.registerAgent(agent1);

      // Set private data
      const memoryManager = memorySystem.memoryManager;
      await memoryManager.set('private-key', 'private-value', {
        agentId: agent1.id,
        aclLevel: 1,
        swarmId: 'test-swarm-acl',
        teamId: 'team-1'
      });

      // Same agent should be able to read
      const value = await memoryManager.get('private-key', {
        agentId: agent1.id
      });
      expect(value).toBe('private-value');

      // Different agent should NOT be able to read
      const agent2 = {
        id: 'agent-private-2',
        name: 'Agent 2',
        type: 'tester',
        swarmId: 'test-swarm-acl',
        teamId: 'team-1',
        aclLevel: 1
      };

      await memorySystem.registerAgent(agent2);

      const deniedValue = await memoryManager.get('private-key', {
        agentId: agent2.id
      });
      expect(deniedValue).toBeNull();
    });

    test('should enforce team (level 2) access', async () => {
      const agent1 = {
        id: 'agent-team-1',
        name: 'Team Agent 1',
        type: 'coder',
        swarmId: 'test-swarm-acl',
        teamId: 'team-alpha',
        aclLevel: 2
      };

      const agent2 = {
        id: 'agent-team-2',
        name: 'Team Agent 2',
        type: 'tester',
        swarmId: 'test-swarm-acl',
        teamId: 'team-alpha',
        aclLevel: 2
      };

      const agent3 = {
        id: 'agent-team-3',
        name: 'Team Agent 3',
        type: 'reviewer',
        swarmId: 'test-swarm-acl',
        teamId: 'team-beta',
        aclLevel: 2
      };

      await memorySystem.registerAgent(agent1);
      await memorySystem.registerAgent(agent2);
      await memorySystem.registerAgent(agent3);

      const memoryManager = memorySystem.memoryManager;

      // Set team-level data
      await memoryManager.set('team-key', 'team-value', {
        agentId: agent1.id,
        aclLevel: 2,
        swarmId: 'test-swarm-acl',
        teamId: 'team-alpha'
      });

      // Same team should be able to read
      const value1 = await memoryManager.get('team-key', {
        agentId: agent1.id
      });
      expect(value1).toBe('team-value');

      const value2 = await memoryManager.get('team-key', {
        agentId: agent2.id
      });
      expect(value2).toBe('team-value');

      // Different team should NOT be able to read
      const deniedValue = await memoryManager.get('team-key', {
        agentId: agent3.id
      });
      expect(deniedValue).toBeNull();
    });

    test('should enforce swarm (level 3) access', async () => {
      const agent1 = {
        id: 'agent-swarm-1',
        name: 'Swarm Agent 1',
        type: 'coder',
        swarmId: 'test-swarm-acl',
        teamId: 'team-gamma',
        aclLevel: 3
      };

      const agent2 = {
        id: 'agent-swarm-2',
        name: 'Swarm Agent 2',
        type: 'tester',
        swarmId: 'test-swarm-acl',
        teamId: 'team-delta',
        aclLevel: 3
      };

      await memorySystem.registerAgent(agent1);
      await memorySystem.registerAgent(agent2);

      const memoryManager = memorySystem.memoryManager;

      // Set swarm-level data
      await memoryManager.set('swarm-key', 'swarm-value', {
        agentId: agent1.id,
        aclLevel: 3,
        swarmId: 'test-swarm-acl',
        teamId: 'team-gamma'
      });

      // All agents in swarm should be able to read
      const value1 = await memoryManager.get('swarm-key', {
        agentId: agent1.id
      });
      expect(value1).toBe('swarm-value');

      const value2 = await memoryManager.get('swarm-key', {
        agentId: agent2.id
      });
      expect(value2).toBe('swarm-value');
    });

    test('should enforce public (level 5) access', async () => {
      const agent1 = {
        id: 'agent-public-1',
        name: 'Public Agent 1',
        type: 'coder',
        status: 'active',
        swarmId: 'test-swarm-acl',
        aclLevel: 5
      };

      await memorySystem.registerAgent(agent1);

      const memoryManager = memorySystem.memoryManager;

      // Set public data
      await memoryManager.set('public-key', 'public-value', {
        agentId: agent1.id,
        aclLevel: 5,
        swarmId: 'test-swarm-acl'
      });

      // Any active agent should be able to read
      const value = await memoryManager.get('public-key', {
        agentId: agent1.id
      });
      expect(value).toBe('public-value');
    });
  });

  describe('Encryption Key Management', () => {
    let keyManager;
    let testDb;

    beforeEach(async () => {
      const sqlite3 = require('sqlite3').verbose();
      testDb = new sqlite3.Database(':memory:');

      keyManager = new EncryptionKeyManager({
        db: testDb,
        rotationDays: 1, // Short rotation for testing
        rotationCheckInterval: 1000 // 1 second for testing
      });

      await keyManager.initialize();
    });

    afterEach(async () => {
      await keyManager.shutdown();
      testDb.close();
    });

    test('should generate and store encryption keys', async () => {
      expect(keyManager.activeKey).toBeTruthy();
      expect(keyManager.activeKeyId).toBeTruthy();
      expect(keyManager.activeKeyGeneration).toBeGreaterThan(0);

      const metrics = keyManager.getMetrics();
      expect(metrics.keysGenerated).toBeGreaterThan(0);
    });

    test('should retrieve encryption key for encryption', () => {
      const key = keyManager.getEncryptionKey();
      expect(key).toBeTruthy();
      expect(Buffer.isBuffer(key)).toBe(true);
      expect(key.length).toBe(32); // 256 bits
    });

    test('should retrieve decryption key by ID', async () => {
      const keyId = keyManager.activeKeyId;
      const key = await keyManager.getDecryptionKey(keyId);
      expect(key).toBeTruthy();
      expect(Buffer.isBuffer(key)).toBe(true);
      expect(key.length).toBe(32);
    });

    test('should rotate encryption keys', async () => {
      const oldKeyId = keyManager.activeKeyId;
      const oldGeneration = keyManager.activeKeyGeneration;

      await keyManager.rotateKey('manual');

      expect(keyManager.activeKeyId).not.toBe(oldKeyId);
      expect(keyManager.activeKeyGeneration).toBeGreaterThan(oldGeneration);

      const metrics = keyManager.getMetrics();
      expect(metrics.keyRotations).toBeGreaterThan(0);
    });

    test('should maintain audit trail', async () => {
      const auditTrail = await keyManager.getAuditTrail();
      expect(auditTrail).toBeTruthy();
      expect(Array.isArray(auditTrail)).toBe(true);
      expect(auditTrail.length).toBeGreaterThan(0);
    });

    test('should handle key compromise', async () => {
      const keyId = keyManager.activeKeyId;

      await keyManager.markKeyCompromised(keyId, 'test compromise');

      // Should have generated new key
      expect(keyManager.activeKeyId).not.toBe(keyId);

      const metrics = keyManager.getMetrics();
      expect(metrics.keyRotations).toBeGreaterThan(0);
    });
  });

  describe('Multi-Layer Cache', () => {
    let cache;
    let testDb;

    beforeEach(async () => {
      const sqlite3 = require('sqlite3').verbose();
      testDb = new sqlite3.Database(':memory:');

      // Load schema
      const schema = fs.readFileSync(
        path.join(__dirname, '../sqlite/schema.sql'),
        'utf8'
      );
      await new Promise((resolve, reject) => {
        testDb.exec(schema, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      cache = new MultiLayerCache({
        db: testDb,
        l1MaxSize: 100,
        l1TTL: 5000,
        l2TTL: 10000,
        l3TTL: 20000,
        redisClient: null // No Redis for testing
      });
    });

    afterEach(async () => {
      await cache.shutdown();
      testDb.close();
    });

    test('should store and retrieve from L1 cache', async () => {
      await cache.set('test-key-l1', 'test-value-l1');

      const value = await cache.get('test-key-l1');
      expect(value).toBe('test-value-l1');

      const stats = cache.getStats();
      expect(stats.l1.hits).toBeGreaterThan(0);
    });

    test('should promote data from L3 to L1', async () => {
      // Set with write-through to L3
      await cache.set('test-key-promote', 'test-value-promote', {
        writeThrough: true,
        swarmId: 'test-swarm'
      });

      // Clear L1
      await cache.clear('l1');

      // Get should promote from L3 to L1
      const value = await cache.get('test-key-promote');
      expect(value).toBe('test-value-promote');

      const stats = cache.getStats();
      expect(stats.l3.hits).toBeGreaterThan(0);
    });

    test('should track cache hit rates', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      await cache.set('key3', 'value3');

      await cache.get('key1'); // hit
      await cache.get('key2'); // hit
      await cache.get('key3'); // hit
      await cache.get('key4'); // miss

      const stats = cache.getStats();
      expect(stats.overallHitRate).toBeGreaterThan(0);
      expect(stats.l1.hitRate).toBeGreaterThan(0);
    });

    test('should handle cache deletion', async () => {
      await cache.set('delete-key', 'delete-value');

      let value = await cache.get('delete-key');
      expect(value).toBe('delete-value');

      await cache.delete('delete-key');

      value = await cache.get('delete-key');
      expect(value).toBeNull();
    });

    test('should support cache clearing', async () => {
      await cache.set('clear-key-1', 'value1');
      await cache.set('clear-key-2', 'value2');

      await cache.clear('all');

      const value1 = await cache.get('clear-key-1');
      const value2 = await cache.get('clear-key-2');

      expect(value1).toBeNull();
      expect(value2).toBeNull();
    });
  });

  describe('ACL Enforcer', () => {
    let aclEnforcer;
    let testDb;

    beforeEach(async () => {
      const sqlite3 = require('sqlite3').verbose();
      testDb = new sqlite3.Database(':memory:');

      // Load schema
      const schema = fs.readFileSync(
        path.join(__dirname, '../sqlite/schema.sql'),
        'utf8'
      );
      await new Promise((resolve, reject) => {
        testDb.exec(schema, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      aclEnforcer = new ACLEnforcer({
        db: testDb,
        cacheEnabled: true
      });

      // Register test agents
      await new Promise((resolve, reject) => {
        const sql = `
          INSERT INTO agents (id, name, type, status, swarm_id, team_id, acl_level)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        testDb.run(sql, [
          'test-agent-1',
          'Test Agent 1',
          'coder',
          'active',
          'test-swarm',
          'test-team',
          3
        ], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Register test memory resource
      await new Promise((resolve, reject) => {
        const sql = `
          INSERT INTO memory (
            id, key, value, namespace, type, swarm_id,
            agent_id, team_id, acl_level
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        testDb.run(sql, [
          'test-memory-1',
          'test-key',
          'test-value',
          'default',
          'data',
          'test-swarm',
          'test-agent-1',
          'test-team',
          3
        ], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });

    afterEach(async () => {
      await aclEnforcer.shutdown();
      testDb.close();
    });

    test('should check permissions correctly', async () => {
      const hasPermission = await aclEnforcer.checkPermission(
        'test-agent-1',
        'test-memory-1',
        'memory',
        'read',
        { swarmId: 'test-swarm' }
      );

      expect(hasPermission).toBe(true);

      const metrics = aclEnforcer.getMetrics();
      expect(metrics.checks).toBeGreaterThan(0);
      expect(metrics.grants).toBeGreaterThan(0);
    });

    test('should grant explicit permissions', async () => {
      const permissionId = await aclEnforcer.grantPermission(
        'test-agent-1',
        'memory',
        4, // project level
        ['read', 'write'],
        { grantedBy: 'system' }
      );

      expect(permissionId).toBeTruthy();

      const hasPermission = await aclEnforcer.checkPermission(
        'test-agent-1',
        'test-memory-1',
        'memory',
        'write'
      );

      expect(hasPermission).toBe(true);
    });

    test('should revoke permissions', async () => {
      const permissionId = await aclEnforcer.grantPermission(
        'test-agent-1',
        'memory',
        4,
        ['read', 'write']
      );

      await aclEnforcer.revokePermission(permissionId, 'system');

      // Permission should no longer be active
      const hasPermission = await aclEnforcer.checkPermission(
        'test-agent-1',
        'test-resource',
        'memory',
        'write'
      );

      // This will be false because the resource doesn't exist
      expect(hasPermission).toBe(false);
    });

    test('should cache permission checks', async () => {
      // First check - cache miss
      await aclEnforcer.checkPermission(
        'test-agent-1',
        'test-memory-1',
        'memory',
        'read'
      );

      // Second check - cache hit
      await aclEnforcer.checkPermission(
        'test-agent-1',
        'test-memory-1',
        'memory',
        'read'
      );

      const metrics = aclEnforcer.getMetrics();
      expect(metrics.cacheHits).toBeGreaterThan(0);
      expect(metrics.cacheHitRate).toBeGreaterThan(0);
    });

    test('should maintain audit trail', async () => {
      await aclEnforcer.checkPermission(
        'test-agent-1',
        'test-memory-1',
        'memory',
        'read'
      );

      const auditTrail = await aclEnforcer.getAuditTrail('test-memory-1');
      expect(auditTrail).toBeTruthy();
      expect(Array.isArray(auditTrail)).toBe(true);

      const metrics = aclEnforcer.getMetrics();
      expect(metrics.auditLogs).toBeGreaterThan(0);
    });
  });

  describe('Integration Tests', () => {
    test('should integrate all components', async () => {
      const metrics = memorySystem.getSystemMetrics();

      expect(metrics).toBeTruthy();
      expect(metrics.isInitialized).toBe(true);
      expect(metrics.components.memoryManager).toBeTruthy();
      expect(metrics.components.memoryAdapter).toBeTruthy();
      expect(metrics.components.agentRegistry).toBeTruthy();
    });

    test('should handle memory operations with ACL', async () => {
      const agent = {
        id: 'integration-agent-1',
        name: 'Integration Agent',
        type: 'coder',
        swarmId: 'test-swarm-acl',
        teamId: 'integration-team',
        aclLevel: 3
      };

      await memorySystem.registerAgent(agent);

      const memoryManager = memorySystem.memoryManager;

      // Set data
      await memoryManager.set('integration-key', { data: 'test' }, {
        agentId: agent.id,
        aclLevel: 3,
        swarmId: 'test-swarm-acl',
        teamId: 'integration-team'
      });

      // Get data
      const value = await memoryManager.get('integration-key', {
        agentId: agent.id
      });

      expect(value).toEqual({ data: 'test' });

      // Check metrics
      const stats = await memorySystem.getMemoryStats();
      expect(stats).toBeTruthy();
      expect(stats.total_memory_entries).toBeGreaterThan(0);
    });
  });
});
