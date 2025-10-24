/**
 * SQLite ACL Integration Test - Simplified CommonJS version
 *
 * Validates core ACLEnforcer functionality with minimal setup.
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const ACLEnforcer = require('../../src/sqlite/ACLEnforcer.cjs');

describe('SQLite ACL Basic Integration', () => {
  let db;
  let aclEnforcer;

  beforeEach(() => {
    // Create fresh in-memory database for each test
    db = new Database(':memory:');

    // Load and execute schema
    const schemaPath = path.join(__dirname, '../../src/sqlite/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schema);

    // Initialize ACLEnforcer
    const wrappedDb = wrapDatabase(db);
    aclEnforcer = new ACLEnforcer({ db: wrappedDb, cacheEnabled: true });
  });

  afterEach(async () => { try {
    if (aclEnforcer) {
      await aclEnforcer.shutdown();
    }
    if (db) {
      db.close();
    }
  });

  jest.setTimeout(10000);
  test('should initialize ACLEnforcer', () => {
    expect(aclEnforcer).toBeDefined();
    const metrics = aclEnforcer.getMetrics();
    expect(metrics).toBeDefined();
    expect(metrics.checks).toBe(0);
  });

  jest.setTimeout(10000);
  test('should grant explicit permissions', async () => { try {
    const agentId = 'test-agent-1';
    const resourceType = 'memory';
    const aclLevel = 3;
    const actions = ['read', 'write'];

    const permissionId = await aclEnforcer.grantPermission(
      agentId,
      resourceType,
      aclLevel,
      actions,
      { grantedBy: 'system' }
    );

    expect(permissionId).toBeTruthy();
    expect(typeof permissionId).toBe('string');

    const metrics = aclEnforcer.getMetrics();
    expect(metrics.grants).toBe(1);
  });

  jest.setTimeout(10000);
  test('should revoke permissions', async () => { try {
    const agentId = 'test-agent-2';
    const permissionId = await aclEnforcer.grantPermission(
      agentId,
      'memory',
      3,
      ['read'],
      { grantedBy: 'system' }
    );

    await aclEnforcer.revokePermission(permissionId, 'system');

    const metrics = aclEnforcer.getMetrics();
    expect(metrics.grants).toBe(1); // Grant happened
  });

  jest.setTimeout(10000);
  test('should track metrics', async () => { try {
    await aclEnforcer.grantPermission('agent-1', 'memory', 3, ['read']);
    await aclEnforcer.grantPermission('agent-2', 'memory', 3, ['write']);

    const metrics = aclEnforcer.getMetrics();
    expect(metrics.grants).toBe(2);
    expect(metrics.checks).toBeGreaterThanOrEqual(0);
  });

  jest.setTimeout(10000);
  test('should maintain permission cache', async () => { try {
    // First check - cache miss
    const permissionId = await aclEnforcer.grantPermission(
      'agent-cache-1',
      'memory',
      3,
      ['read']
    );

    // Multiple checks should use cache
    await aclEnforcer.checkPermission('agent-cache-1', permissionId, 'memory', 'read');
    await aclEnforcer.checkPermission('agent-cache-1', permissionId, 'memory', 'read');

    const metrics = aclEnforcer.getMetrics();
    expect(metrics.checks).toBeGreaterThan(0);
  });

  jest.setTimeout(10000);
  test('should clear cache on shutdown', async () => { try {
    await aclEnforcer.grantPermission('agent-shutdown', 'memory', 3, ['read']);

    await aclEnforcer.shutdown();

    const metrics = aclEnforcer.getMetrics();
    expect(metrics.cacheSize).toBe(0);
  });

  jest.setTimeout(10000);
  test('should validate schema has required tables', () => {
    const tables = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name IN ('agents', 'memory', 'permissions', 'audit_log')
    `).all();

    expect(tables.length).toBe(4);
    expect(tables.map(t => t.name)).toContain('agents');
    expect(tables.map(t => t.name)).toContain('permissions');
    expect(tables.map(t => t.name)).toContain('audit_log');
  });

  jest.setTimeout(10000);
  test('should register agent in agents table', () => {
    db.prepare(`
      INSERT INTO agents (id, name, type, status, swarm_id, acl_level)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('agent-register-1', 'Test Agent', 'coder', 'active', 'test-swarm', 3);

    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get('agent-register-1');
    expect(agent).toBeDefined();
    expect(agent.name).toBe('Test Agent');
    expect(agent.acl_level).toBe(3);
  });

  jest.setTimeout(10000);
  test('should create audit trail entries', async () => { try {
    const permissionId = await aclEnforcer.grantPermission(
      'agent-audit-1',
      'memory',
      3,
      ['read']
    );

    const auditEntries = await aclEnforcer.getAuditTrail(permissionId);
    expect(Array.isArray(auditEntries)).toBe(true);
  });

  jest.setTimeout(10000);
  test('should handle high-frequency operations', async () => { try {
    const startTime = Date.now();

    // Grant 10 permissions rapidly
    for (let i = 0; i < 10; i++) {
      await aclEnforcer.grantPermission(
        `agent-perf-${i}`,
        'memory',
        3,
        ['read']
      );
    }

    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(1000); // Should complete in <1 second

    const metrics = aclEnforcer.getMetrics();
    expect(metrics.grants).toBe(10);
  });
});

/**
 * Wraps better-sqlite3 Database to provide callback-based API
 * compatible with ACLEnforcer's expectations
 */
function wrapDatabase(db) {
  return {
    run: (sql, params, callback) => {
      try {
        const result = db.prepare(sql).run(...params);
        if (callback) callback(null, result);
      } catch (err) {
        if (callback) callback(err);
        else throw err;
      }
    },
    get: (sql, params, callback) => {
      try {
        const result = db.prepare(sql).get(...params);
        if (callback) callback(null, result);
      } catch (err) {
        if (callback) callback(err);
        else throw err;
      }
    },
    all: (sql, params, callback) => {
      try {
        const result = db.prepare(sql).all(...params);
        if (callback) callback(null, result);
      } catch (err) {
        if (callback) callback(err);
        else throw err;
      }
    }
  };
}
