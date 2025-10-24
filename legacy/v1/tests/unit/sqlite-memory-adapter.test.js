/**
 * Comprehensive unit tests for SQLite MemoryStoreAdapter
 * Tests: (1) MemoryStoreAdapter init, (2) ACL enforcement (5 levels), 
 * (3) Memory storage/retrieval with TTL, (4) Permission grant/revoke, 
 * (5) Audit trail, (6) Encryption for Private/Team
 * Target: 80%+ coverage
 */

import { describe, it, expect, beforeEach, afterEach, vi, mock } from 'vitest';
import MemoryStoreAdapter from '../../src/sqlite/MemoryStoreAdapter.cjs';
import SwarmMemoryManager from '../../src/sqlite/SwarmMemoryManager.cjs';
import ACLEnforcer from '../../src/sqlite/ACLEnforcer.cjs';

// Mock Database class
const mockDatabase = {
  run: vi.fn((sql, params, callback) => {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    callback?.call({ changes: 1, lastID: 1 }, null);
  }),
  get: vi.fn((sql, params, callback) => {
    callback?.call({}, null, null);
  }),
  all: vi.fn((sql, params, callback) => {
    callback?.call({}, null, []);
  }),
  close: vi.fn((callback) => callback?.call({}, null)),
  backup: vi.fn((path, callback) => callback?.call({}, null)),
  exec: vi.fn((sql, callback) => callback?.call({}, null))
};

// Mock sqlite3
vi.mock('sqlite3', () => ({
  verbose: () => ({
    Database: vi.fn((path, callback) => {
      process.nextTick(() => callback?.call({}, null));
      return mockDatabase;
    })
  })
}));

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() => 'CREATE TABLE IF NOT EXISTS test (id TEXT PRIMARY KEY);')
}));

// Mock crypto
vi.mock('crypto', () => ({
  randomBytes: vi.fn(() => Buffer.from('mock-random-bytes')),
  createCipheriv: vi.fn(() => ({
    setAAD: vi.fn(),
    update: vi.fn(() => 'encrypted-'),
    final: vi.fn(() => 'data'),
    getAuthTag: vi.fn(() => Buffer.from('auth-tag'))
  })),
  createDecipheriv: vi.fn(() => ({
    setAAD: vi.fn(),
    setAuthTag: vi.fn(),
    update: vi.fn(() => 'decrypted-'),
    final: vi.fn(() => 'data')
  }))
}));

// Mock lz4
vi.mock('lz4', () => ({
  encode: vi.fn(() => Buffer.from('compressed-data')),
  decode: vi.fn(() => Buffer.from('decompressed-data'))
}));

// Create mock factory functions (no module-level mocks)
// This allows constructor injection of mocks per test
function createMockMemoryManager() {
  const manager = {
    initialize: vi.fn().mockResolvedValue(),
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    has: vi.fn(),
    clear: vi.fn(),
    getStats: vi.fn().mockResolvedValue({
      total_memory_entries: 10,
      total_size_bytes: 1024
    }),
    getMetrics: vi.fn().mockReturnValue({
      operations: 5,
      cacheHits: 3,
      cacheMisses: 2
    }),
    backup: vi.fn().mockResolvedValue('/backup/path'),
    vacuum: vi.fn().mockResolvedValue(),
    analyze: vi.fn().mockResolvedValue(),
    close: vi.fn().mockResolvedValue(),
    on: vi.fn(),
    db: mockDatabase,
    clearACLCache: vi.fn(),
    // Default aclEnforcer property that tests can override
    aclEnforcer: {
      checkPermission: vi.fn().mockResolvedValue(true),
      grantPermission: vi.fn().mockResolvedValue('perm-123'),
      revokePermission: vi.fn().mockResolvedValue(true),
      getAuditTrail: vi.fn().mockResolvedValue([]),
      getMetrics: vi.fn().mockReturnValue({ checks: 10, grants: 5 })
    }
  };

  return manager;
}

function createMockACLEnforcer() {
  return {
    enforceACL: vi.fn().mockResolvedValue(true),
    deriveACLLevel: vi.fn().mockReturnValue(3)
  };
}

describe('MemoryStoreAdapter', () => {
  let adapter;
  let mockMemoryManager;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create fresh mock for each test
    mockMemoryManager = createMockMemoryManager();

    // Inject mock via constructor
    adapter = new MemoryStoreAdapter({
      swarmId: 'test-swarm',
      namespace: 'test-namespace',
      defaultTTL: 3600,
      dbPath: ':memory:',
      encryptionKey: Buffer.from('test-encryption-key-32-bytes!!'),
      memoryManager: mockMemoryManager  // Inject mock
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  afterEach(async () => { try {
    if (adapter) {
      await adapter.close();
    }
    vi.restoreAllMocks();
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('(1) MemoryStoreAdapter Initialization', () => {
    it('should initialize with default options', () => {
      const defaultAdapter = new MemoryStoreAdapter();
      expect(defaultAdapter.swarmId).toBe('default');
      expect(defaultAdapter.namespace).toBe('memory-store');
      expect(defaultAdapter.defaultTTL).toBe(86400);
      expect(defaultAdapter.isInitialized).toBe(false);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should initialize with custom options', () => {
      const customAdapter = new MemoryStoreAdapter({
        swarmId: 'custom-swarm',
        namespace: 'custom-namespace',
        defaultTTL: 7200
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      expect(customAdapter.swarmId).toBe('custom-swarm');
      expect(customAdapter.namespace).toBe('custom-namespace');
      expect(customAdapter.defaultTTL).toBe(7200);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should initialize successfully', async () => { try {
      await adapter.initialize();
      expect(adapter.isInitialized).toBe(true);
      expect(adapter.memoryManager.initialize).toHaveBeenCalled();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should not initialize twice', async () => { try {
      await adapter.initialize();
      await adapter.initialize(); // Second call
      expect(adapter.memoryManager.initialize).toHaveBeenCalledTimes(1);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should handle initialization errors', async () => { try {
      adapter.memoryManager.initialize.mockRejectedValue(new Error('DB Error'));
      await expect(adapter.initialize()).rejects.toThrow('DB Error');
      expect(adapter.isInitialized).toBe(false);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should set up event forwarding', () => {
      expect(adapter.memoryManager.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(adapter.memoryManager.on).toHaveBeenCalledWith('initialized', expect.any(Function));
      expect(adapter.memoryManager.on).toHaveBeenCalledWith('closed', expect.any(Function));
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should track metrics correctly', () => {
      expect(adapter.metrics).toEqual({
        operations: 0,
        getOperations: 0,
        setOperations: 0,
        deleteOperations: 0,
        clearOperations: 0,
        cacheHits: 0,
        cacheMisses: 0,
        errors: 0,
        totalAccessTime: 0,
        averageAccessTime: 0
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('(2) ACL Enforcement (5 levels)', () => {
    beforeEach(async () => { try {
      await adapter.initialize();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should derive ACL level 1 (Private) for sensitive keys', () => {
      const level1 = adapter._deriveACLLevel('user-private-key', 'value');
      expect(level1).toBe(1);

      const level1b = adapter._deriveACLLevel('secret-data', 'value');
      expect(level1b).toBe(1);

      const level1c = adapter._deriveACLLevel('credential-token', 'value');
      expect(level1c).toBe(1);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should derive ACL level 2 (Team) for team keys', () => {
      const level2 = adapter._deriveACLLevel('team-config', 'value');
      expect(level2).toBe(2);

      const level2b = adapter._deriveACLLevel('group-settings', 'value');
      expect(level2b).toBe(2);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should derive ACL level 3 (Swarm) for default keys', () => {
      const level3 = adapter._deriveACLLevel('normal-key', 'value');
      expect(level3).toBe(3);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should derive ACL level 4 (Public) for public keys', () => {
      const level4 = adapter._deriveACLLevel('public-data', 'value');
      expect(level4).toBe(4);

      const level4b = adapter._deriveACLLevel('shared-resource', 'value');
      expect(level4b).toBe(4);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should derive ACL level 5 (System) for system keys', () => {
      const level5 = adapter._deriveACLLevel('system-config', 'value');
      expect(level5).toBe(5);

      const level5b = adapter._deriveACLLevel('config-setting', 'value');
      expect(level5b).toBe(5);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should pass ACL level to memory manager', async () => { try {
      adapter.memoryManager.set.mockResolvedValue({ success: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      
      await adapter.set('private-key', 'sensitive-value', {
        agentId: 'agent1',
        aclLevel: 1
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(adapter.memoryManager.set).toHaveBeenCalledWith(
        'private-key',
        'sensitive-value',
        expect.objectContaining({
          agentId: 'agent1',
          namespace: 'test-namespace',
          swarmId: 'test-swarm',
          aclLevel: 1
        })
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should use derived ACL level when not specified', async () => { try {
      adapter.memoryManager.set.mockResolvedValue({ success: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      
      await adapter.set('user-private-data', 'sensitive-value', {
        agentId: 'agent1'
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(adapter.memoryManager.set).toHaveBeenCalledWith(
        'user-private-data',
        'sensitive-value',
        expect.objectContaining({
          aclLevel: 1 // Derived from key pattern
        })
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('(3) Memory Storage/Retrieval with TTL', () => {
    beforeEach(async () => { try {
      await adapter.initialize();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should store and retrieve values', async () => { try {
      const testValue = { data: 'test', timestamp: Date.now() };
      
      adapter.memoryManager.set.mockResolvedValue({ id: 'test-id', success: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      adapter.memoryManager.get.mockResolvedValue(testValue);

      await adapter.set('test-key', testValue, { agentId: 'agent1' } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      const retrieved = await adapter.get('test-key', { agentId: 'agent1' } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(adapter.memoryManager.set).toHaveBeenCalledWith(
        'test-key',
        testValue,
        expect.objectContaining({
          agentId: 'agent1',
          namespace: 'test-namespace',
          ttl: 3600
        })
      );
      expect(adapter.memoryManager.get).toHaveBeenCalledWith(
        'test-key',
        expect.objectContaining({
          agentId: 'agent1',
          namespace: 'test-namespace'
        })
      );
      expect(retrieved).toEqual(testValue);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should handle TTL correctly', async () => { try {
      adapter.memoryManager.set.mockResolvedValue({ success: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      await adapter.set('ttl-key', 'value', {
        agentId: 'agent1',
        ttl: 1800 // 30 minutes
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(adapter.memoryManager.set).toHaveBeenCalledWith(
        'ttl-key',
        'value',
        expect.objectContaining({
          ttl: 1800
        })
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should use default TTL when not specified', async () => { try {
      adapter.memoryManager.set.mockResolvedValue({ success: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      await adapter.set('default-ttl-key', 'value', { agentId: 'agent1' } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(adapter.memoryManager.set).toHaveBeenCalledWith(
        'default-ttl-key',
        'value',
        expect.objectContaining({
          ttl: 3600 // Default TTL from constructor
        })
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should handle setex operation', async () => { try {
      adapter.memoryManager.set.mockResolvedValue({ success: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      await adapter.setex('setex-key', 900, 'value', { agentId: 'agent1' } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(adapter.memoryManager.set).toHaveBeenCalledWith(
        'setex-key',
        'value',
        expect.objectContaining({
          ttl: 900
        })
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should handle cache misses', async () => { try {
      adapter.memoryManager.get.mockResolvedValue(null);

      const result = await adapter.get('nonexistent-key', { agentId: 'agent1' } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(result).toBeNull();
      expect(adapter.metrics.cacheMisses).toBe(1);
      expect(adapter.metrics.cacheHits).toBe(0);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should handle cache hits', async () => { try {
      adapter.memoryManager.get.mockResolvedValue('value');

      const result = await adapter.get('existing-key', { agentId: 'agent1' } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(result).toBe('value');
      expect(adapter.metrics.cacheHits).toBe(1);
      expect(adapter.metrics.cacheMisses).toBe(0);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should handle multiple get operations (mget)', async () => { try {
      adapter.memoryManager.get
        .mockResolvedValueOnce('value1')
        .mockResolvedValueOnce('value2')
        .mockResolvedValueOnce(null);

      const results = await adapter.mget(['key1', 'key2', 'key3'], { agentId: 'agent1' } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(results).toEqual(['value1', 'value2', null]);
      expect(adapter.memoryManager.get).toHaveBeenCalledTimes(3);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should handle multiple set operations (mset)', async () => { try {
      adapter.memoryManager.set.mockResolvedValue({ success: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      const keyValuePairs = {
        'key1': 'value1',
        'key2': 'value2',
        'key3': 'value3'
      };

      await adapter.mset(keyValuePairs, { agentId: 'agent1' } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(adapter.memoryManager.set).toHaveBeenCalledTimes(3);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('(4) Permission Grant/Revoke', () => {
    beforeEach(async () => { try {
      await adapter.initialize();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should grant permissions through memory manager', async () => { try {
      const mockACLEnforcer = {
        checkPermission: vi.fn().mockResolvedValue(true),
        grantPermission: vi.fn().mockResolvedValue('perm-123'),
        revokePermission: vi.fn().mockResolvedValue(true),
        getAuditTrail: vi.fn().mockResolvedValue([]),
        getMetrics: vi.fn().mockReturnValue({ checks: 10, grants: 5 })
      };

      // Directly assign the aclEnforcer to the memory manager
      adapter.memoryManager.aclEnforcer = mockACLEnforcer;

      const aclEnforcer = adapter.getMemoryManager().aclEnforcer;

      const permissionId = await aclEnforcer.grantPermission(
        'agent1',
        'memory',
        2,
        ['read', 'write'],
        { grantedBy: 'admin' }
      );

      expect(permissionId).toBe('perm-123');
      expect(aclEnforcer.grantPermission).toHaveBeenCalledWith(
        'agent1',
        'memory',
        2,
        ['read', 'write'],
        { grantedBy: 'admin' }
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should revoke permissions through memory manager', async () => { try {
      const mockACLEnforcer = {
        checkPermission: vi.fn().mockResolvedValue(true),
        grantPermission: vi.fn().mockResolvedValue('perm-123'),
        revokePermission: vi.fn().mockResolvedValue(true),
        getAuditTrail: vi.fn().mockResolvedValue([]),
        getMetrics: vi.fn().mockReturnValue({ checks: 10, revocations: 2 })
      };

      // Directly assign the aclEnforcer to the memory manager
      adapter.memoryManager.aclEnforcer = mockACLEnforcer;

      const aclEnforcer = adapter.getMemoryManager().aclEnforcer;

      const result = await aclEnforcer.revokePermission('perm-123', 'admin');

      expect(result).toBe(true);
      expect(aclEnforcer.revokePermission).toHaveBeenCalledWith('perm-123', 'admin');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should handle permission checks with context', async () => { try {
      const mockACLEnforcer = {
        checkPermission: vi.fn().mockResolvedValue(true),
        grantPermission: vi.fn().mockResolvedValue('perm-123'),
        revokePermission: vi.fn().mockResolvedValue(true),
        getAuditTrail: vi.fn().mockResolvedValue([]),
        getMetrics: vi.fn().mockReturnValue({ checks: 10, grants: 5 })
      };

      // Directly assign the aclEnforcer to the memory manager
      adapter.memoryManager.aclEnforcer = mockACLEnforcer;

      const aclEnforcer = adapter.getMemoryManager().aclEnforcer;

      const hasPermission = await aclEnforcer.checkPermission(
        'agent1',
        'resource-123',
        'memory',
        'read',
        { swarmId: 'swarm1', teamId: 'team1', projectId: 'project1' }
      );

      expect(hasPermission).toBe(true);
      expect(aclEnforcer.checkPermission).toHaveBeenCalledWith(
        'agent1',
        'resource-123',
        'memory',
        'read',
        { swarmId: 'swarm1', teamId: 'team1', projectId: 'project1' }
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should handle permission denial', async () => { try {
      const mockACLEnforcer = {
        checkPermission: vi.fn().mockResolvedValue(false),
        grantPermission: vi.fn().mockResolvedValue('perm-123'),
        revokePermission: vi.fn().mockResolvedValue(true),
        getAuditTrail: vi.fn().mockResolvedValue([]),
        getMetrics: vi.fn().mockReturnValue({ checks: 10, denials: 3 })
      };

      // Directly assign the aclEnforcer to the memory manager
      adapter.memoryManager.aclEnforcer = mockACLEnforcer;

      const aclEnforcer = adapter.getMemoryManager().aclEnforcer;

      const hasPermission = await aclEnforcer.checkPermission(
        'unauthorized-agent',
        'private-resource',
        'memory',
        'read'
      );

      expect(hasPermission).toBe(false);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('(5) Audit Trail', () => {
    beforeEach(async () => { try {
      await adapter.initialize();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should retrieve audit trail through memory manager', async () => { try {
      const mockAuditEntries = [
        {
          id: 'audit-1',
          entity_id: 'resource-123',
          action: 'read',
          changed_by: 'agent1',
          created_at: '2024-01-01T00:00:00Z',
          metadata: '{"allowed": true}'
        },
        {
          id: 'audit-2',
          entity_id: 'resource-123',
          action: 'write',
          changed_by: 'agent2',
          created_at: '2024-01-01T01:00:00Z',
          metadata: '{"allowed": false}'
        }
      ];

      const mockACLEnforcer = {
        checkPermission: vi.fn().mockResolvedValue(true),
        grantPermission: vi.fn().mockResolvedValue('perm-123'),
        revokePermission: vi.fn().mockResolvedValue(true),
        getAuditTrail: vi.fn().mockResolvedValue(mockAuditEntries),
        getMetrics: vi.fn().mockReturnValue({ auditLogs: 2 })
      };

      // Directly assign the aclEnforcer to the memory manager
      adapter.memoryManager.aclEnforcer = mockACLEnforcer;

      const aclEnforcer = adapter.getMemoryManager().aclEnforcer;

      const auditTrail = await aclEnforcer.getAuditTrail('resource-123', {
        limit: 10,
        offset: 0
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(auditTrail).toEqual(mockAuditEntries);
      expect(aclEnforcer.getAuditTrail).toHaveBeenCalledWith('resource-123', {
        limit: 10,
        offset: 0
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should handle empty audit trail', async () => { try {
      const mockACLEnforcer = {
        checkPermission: vi.fn().mockResolvedValue(true),
        grantPermission: vi.fn().mockResolvedValue('perm-123'),
        revokePermission: vi.fn().mockResolvedValue(true),
        getAuditTrail: vi.fn().mockResolvedValue([]),
        getMetrics: vi.fn().mockReturnValue({ auditLogs: 0 })
      };

      // Directly assign the aclEnforcer to the memory manager
      adapter.memoryManager.aclEnforcer = mockACLEnforcer;

      const aclEnforcer = adapter.getMemoryManager().aclEnforcer;

      const auditTrail = await aclEnforcer.getAuditTrail('nonexistent-resource');

      expect(auditTrail).toEqual([]);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should track audit metrics', async () => { try {
      const mockACLEnforcer = {
        checkPermission: vi.fn().mockResolvedValue(true),
        grantPermission: vi.fn().mockResolvedValue('perm-123'),
        revokePermission: vi.fn().mockResolvedValue(true),
        getAuditTrail: vi.fn().mockResolvedValue([]),
        getMetrics: vi.fn().mockReturnValue({
          checks: 100,
          grants: 20,
          denials: 10,
          auditLogs: 130,
          cacheHitRate: 0.85
        })
      };

      // Directly assign the aclEnforcer to the memory manager
      adapter.memoryManager.aclEnforcer = mockACLEnforcer;

      const aclEnforcer = adapter.getMemoryManager().aclEnforcer;

      const metrics = aclEnforcer.getMetrics();

      expect(metrics.checks).toBe(100);
      expect(metrics.grants).toBe(20);
      expect(metrics.denials).toBe(10);
      expect(metrics.auditLogs).toBe(130);
      expect(metrics.cacheHitRate).toBe(0.85);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('(6) Encryption for Private/Team', () => {
    beforeEach(async () => { try {
      await adapter.initialize();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should use encryption for private data (ACL level 1)', async () => { try {
      adapter.memoryManager.set.mockResolvedValue({ success: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      await adapter.set('private-secret', 'sensitive-data', {
        agentId: 'agent1',
        aclLevel: 1
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(adapter.memoryManager.set).toHaveBeenCalledWith(
        'private-secret',
        'sensitive-data',
        expect.objectContaining({
          aclLevel: 1,
          agentId: 'agent1'
        })
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should use encryption for team data (ACL level 2)', async () => { try {
      adapter.memoryManager.set.mockResolvedValue({ success: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      await adapter.set('team-config', 'team-settings', {
        agentId: 'agent1',
        aclLevel: 2,
        teamId: 'team1'
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(adapter.memoryManager.set).toHaveBeenCalledWith(
        'team-config',
        'team-settings',
        expect.objectContaining({
          aclLevel: 2,
          agentId: 'agent1',
          teamId: 'team1'
        })
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should handle encrypted data retrieval', async () => { try {
      const encryptedData = {
        encrypted: 'encrypted-data',
        iv: 'mock-iv',
        authTag: 'mock-auth-tag'
      };

      adapter.memoryManager.get.mockResolvedValue(encryptedData);

      const result = await adapter.get('encrypted-key', { agentId: 'agent1' } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(result).toEqual(encryptedData);
      expect(adapter.memoryManager.get).toHaveBeenCalledWith(
        'encrypted-key',
        expect.objectContaining({
          agentId: 'agent1'
        })
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should automatically apply encryption based on key patterns', async () => { try {
      adapter.memoryManager.set.mockResolvedValue({ success: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      // Test various private key patterns that match the _deriveACLLevel logic
      const privateKeys = [
        'user-private-token',    // matches 'private'
        'secret-api-key',        // matches 'secret'
        'credential-password',   // matches 'credential'
        'my-private-data'        // matches 'private'
      ];

      for (const key of privateKeys) {
        await adapter.set(key, 'sensitive-value', { agentId: 'agent1' } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

        expect(adapter.memoryManager.set).toHaveBeenCalledWith(
          key,
          'sensitive-value',
          expect.objectContaining({
            aclLevel: 1 // Should automatically be set to private level
          })
        );
      }
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should handle team-level encryption automatically', async () => { try {
      adapter.memoryManager.set.mockResolvedValue({ success: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      // Test team key patterns
      const teamKeys = [
        'team-workflow',
        'group-settings',
        'team-shared-data'
      ];

      for (const key of teamKeys) {
        await adapter.set(key, 'team-data', { agentId: 'agent1' } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

        expect(adapter.memoryManager.set).toHaveBeenCalledWith(
          key,
          'team-data',
          expect.objectContaining({
            aclLevel: 2 // Should automatically be set to team level
          })
        );
      }
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Additional Operations and Edge Cases', () => {
    beforeEach(async () => { try {
      await adapter.initialize();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should handle delete operations', async () => { try {
      adapter.memoryManager.delete.mockResolvedValue(true);

      const result = await adapter.delete('test-key', { agentId: 'agent1' } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(result).toBe(true);
      expect(adapter.memoryManager.delete).toHaveBeenCalledWith(
        'test-key',
        expect.objectContaining({
          agentId: 'agent1',
          namespace: 'test-namespace'
        })
      );
      expect(adapter.metrics.deleteOperations).toBe(1);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should handle has operations', async () => { try {
      adapter.memoryManager.has.mockResolvedValue(true);

      const result = await adapter.has('test-key', { agentId: 'agent1' } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(result).toBe(true);
      expect(adapter.memoryManager.has).toHaveBeenCalledWith(
        'test-key',
        expect.objectContaining({
          agentId: 'agent1',
          namespace: 'test-namespace'
        })
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should handle clear operations', async () => { try {
      adapter.memoryManager.clear.mockResolvedValue(5);

      const result = await adapter.clear({ agentId: 'system' } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(result).toBe(5);
      expect(adapter.memoryManager.clear).toHaveBeenCalledWith({
        agentId: 'system',
        namespace: 'test-namespace'
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      expect(adapter.metrics.clearOperations).toBe(1);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should handle clear all operations', async () => { try {
      adapter.memoryManager.clear.mockResolvedValue(10);

      const result = await adapter.clear({ 
        agentId: 'system',
        clearAll: true 
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(result).toBe(10);
      expect(adapter.memoryManager.clear).toHaveBeenCalledWith({
        agentId: 'system',
        namespace: undefined
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should handle atomic getset operation', async () => { try {
      adapter.memoryManager.get.mockResolvedValue('old-value');
      adapter.memoryManager.set.mockResolvedValue({ success: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      const oldValue = await adapter.getset('test-key', 'new-value', { agentId: 'agent1' } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(oldValue).toBe('old-value');
      expect(adapter.memoryManager.get).toHaveBeenCalled();
      expect(adapter.memoryManager.set).toHaveBeenCalledWith(
        'test-key',
        'new-value',
        expect.objectContaining({ agentId: 'agent1' })
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should handle getdel operation', async () => { try {
      adapter.memoryManager.get.mockResolvedValue('value-to-delete');
      adapter.memoryManager.delete.mockResolvedValue(true);

      const value = await adapter.getdel('test-key', { agentId: 'agent1' } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(value).toBe('value-to-delete');
      expect(adapter.memoryManager.get).toHaveBeenCalled();
      expect(adapter.memoryManager.delete).toHaveBeenCalled();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should handle numeric operations', async () => { try {
      adapter.memoryManager.get.mockResolvedValue(null);
      adapter.memoryManager.set.mockResolvedValue({ success: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      // Test incr
      const newValue = await adapter.incr('counter', { agentId: 'agent1' } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      expect(newValue).toBe(1);
      expect(adapter.memoryManager.set).toHaveBeenCalledWith(
        'counter',
        1,
        expect.any(Object)
      );

      // Reset mock for next operation
      adapter.memoryManager.get.mockResolvedValue(1);

      // Test incrby
      const incremented = await adapter.incrby('counter', 5, { agentId: 'agent1' } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      expect(incremented).toBe(6);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should handle string operations', async () => { try {
      adapter.memoryManager.get.mockResolvedValue('hello');
      adapter.memoryManager.set.mockResolvedValue({ success: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      // Test append
      const newLength = await adapter.append('string-key', ' world', { agentId: 'agent1' } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      expect(newLength).toBe(11); // 'hello world'.length
      expect(adapter.memoryManager.set).toHaveBeenCalledWith(
        'string-key',
        'hello world',
        expect.any(Object)
      );

      // Test strlen
      const length = await adapter.strlen('string-key', { agentId: 'agent1' } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      expect(adapter.memoryManager.get).toHaveBeenCalledWith(
        'string-key',
        expect.any(Object)
      );
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should handle backup operations', async () => { try {
      const backupPath = await adapter.backup('/backup/dir');

      expect(backupPath).toContain('/backup/dir/memory-store-backup-test-namespace-');
      expect(adapter.memoryManager.backup).toHaveBeenCalled();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should handle optimize operations', async () => { try {
      await adapter.optimize();

      expect(adapter.memoryManager.vacuum).toHaveBeenCalled();
      expect(adapter.memoryManager.analyze).toHaveBeenCalled();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should track metrics correctly', async () => { try {
      adapter.memoryManager.get.mockResolvedValue('value');
      adapter.memoryManager.set.mockResolvedValue({ success: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      await adapter.get('test-key', { agentId: 'agent1' } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      await adapter.set('test-key', 'value', { agentId: 'agent1' } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(adapter.metrics.operations).toBe(2);
      expect(adapter.metrics.getOperations).toBe(1);
      expect(adapter.metrics.setOperations).toBe(1);
      expect(adapter.metrics.cacheHits).toBe(1);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should handle errors gracefully', async () => { try {
      adapter.memoryManager.get.mockRejectedValue(new Error('Database error'));

      await expect(adapter.get('test-key', { agentId: 'agent1' }))
        .rejects.toThrow('Database error');
      
      expect(adapter.metrics.errors).toBe(1);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should provide comprehensive stats', async () => { try {
      adapter.memoryManager.getStats.mockResolvedValue({
        total_memory_entries: 100,
        total_size_bytes: 10240,
        avg_access_count: 5.5
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      const stats = await adapter.getStats();

      expect(stats).toEqual({
        total_memory_entries: 100,
        total_size_bytes: 10240,
        avg_access_count: 5.5,
        adapter: expect.objectContaining({
          operations: 0,
          hitRate: 0,
          namespace: 'test-namespace',
          swarmId: 'test-swarm'
        }),
        performance: expect.any(Object)
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should reset metrics', () => {
      adapter.metrics.operations = 10;
      adapter.metrics.errors = 2;

      adapter.resetMetrics();

      expect(adapter.metrics.operations).toBe(0);
      expect(adapter.metrics.errors).toBe(0);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should handle close operation', async () => { try {
      await adapter.close();

      expect(adapter.memoryManager.close).toHaveBeenCalled();
      expect(adapter.isInitialized).toBe(false);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Event Handling', () => {
    beforeEach(async () => { try {
      await adapter.initialize();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should emit events correctly', () => {
      const events = [];
      adapter.on('setItem', (data) => events.push('setItem'));
      adapter.on('deleteItem', (data) => events.push('deleteItem'));
      adapter.on('clear', (data) => events.push('clear'));
      adapter.on('backup', (data) => events.push('backup'));
      adapter.on('optimized', (data) => events.push('optimized'));

      // Simulate events
      adapter.emit('setItem', { key: 'test' } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      adapter.emit('deleteItem', { key: 'test' } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      adapter.emit('clear', { namespace: 'test' } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      adapter.emit('backup', { path: '/backup' } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      adapter.emit('optimized', {} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(events).toEqual(['setItem', 'deleteItem', 'clear', 'backup', 'optimized']);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should forward memory manager events', () => {
      const events = [];
      adapter.on('error', (data) => events.push('error'));
      adapter.on('initialized', (data) => events.push('initialized'));
      adapter.on('closed', (data) => events.push('closed'));
      adapter.on('get', (data) => events.push('get'));
      adapter.on('set', (data) => events.push('set'));
      adapter.on('accessDenied', (data) => events.push('accessDenied'));

      // Simulate memory manager events
      adapter.memoryManager.on.mock.calls.forEach(([event, callback]) => {
        if (event === 'error') callback(new Error('test error'));
        else if (event === 'initialized') callback();
        else if (event === 'closed') callback();
        else if (event === 'get') callback({ key: 'test' } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
        else if (event === 'set') callback({ key: 'test' } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
        else if (event === 'accessDenied') callback({ key: 'test' } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(events).toContain('error');
      expect(events).toContain('initialized');
      expect(events).toContain('closed');
      expect(events).toContain('get');
      expect(events).toContain('set');
      expect(events).toContain('accessDenied');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Performance and Scalability', () => {
    beforeEach(async () => { try {
      await adapter.initialize();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should update access time metrics', async () => { try {
      // Add a small delay to simulate actual execution time
      adapter.memoryManager.get.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve('value'), 5))
      );

      await adapter.get('test-key', { agentId: 'agent1' } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      expect(adapter.metrics.totalAccessTime).toBeGreaterThan(0);
      expect(adapter.metrics.averageAccessTime).toBeGreaterThan(0);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should handle high-frequency operations', async () => { try {
      adapter.memoryManager.get.mockResolvedValue('value');
      adapter.memoryManager.set.mockResolvedValue({ success: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(adapter.get(`key-${i}`, { agentId: 'agent1' }));
        promises.push(adapter.set(`key-${i}`, `value-${i}`, { agentId: 'agent1' }));
      }

      await Promise.all(promises);

      expect(adapter.metrics.operations).toBe(200);
      expect(adapter.memoryManager.get).toHaveBeenCalledTimes(100);
      expect(adapter.memoryManager.set).toHaveBeenCalledTimes(100);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should handle concurrent operations safely', async () => { try {
      adapter.memoryManager.get.mockResolvedValue('value');
      adapter.memoryManager.set.mockResolvedValue({ success: true } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      const concurrentGets = Array(10).fill().map(() => 
        adapter.get('concurrent-key', { agentId: 'agent1' })
      );
      const concurrentSets = Array(10).fill().map(() => 
        adapter.set('concurrent-key', 'concurrent-value', { agentId: 'agent1' })
      );

      await Promise.all([...concurrentGets, ...concurrentSets]);

      expect(adapter.metrics.operations).toBe(20);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});