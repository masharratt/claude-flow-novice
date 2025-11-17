/**
 * Skill Deployment Transaction Integration Tests
 *
 * Tests Task 3.2: Skill Deployment Transaction refactoring
 * - Cross-database transaction atomicity
 * - Distributed locking
 * - Automatic rollback on failure
 * - Version conflict detection within transactions
 * - Audit trail atomicity
 * - Concurrent deployment prevention
 *
 * Target coverage: 100% of transaction-related code paths
 */

import * as fs from 'fs';
import * as path from 'path';
import { DatabaseService } from '../src/lib/database-service';
import { TransactionManager } from '../src/lib/database-service/transaction-manager';
import { DistributedLock } from '../src/lib/distributed-lock';
import { SkillDeploymentPipeline, DeploymentRequest, DeploymentResult } from '../src/services/skill-deployment';
import { StandardError, ErrorCode } from '../src/lib/errors';

// Mock implementations for testing
class MockRedisClient {
  private store: Map<string, any> = new Map();

  async set(key: string, value: string, ...args: any[]): Promise<string> {
    const hasNX = args.includes('NX');
    if (hasNX && this.store.has(key)) {
      return null as any; // Lock already exists
    }
    this.store.set(key, { value, ttl: args[args.indexOf('PX') + 1] || 60000 });
    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    return entry ? entry.value : null;
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }
}

describe('Skill Deployment Transaction Integration', () => {
  let dbService: DatabaseService;
  let txManager: TransactionManager;
  let lockManager: DistributedLock;
  let pipeline: SkillDeploymentPipeline;
  let mockRedis: MockRedisClient;
  let testSkillPath: string;

  beforeAll(async () => {
    // Initialize database service
    dbService = new DatabaseService({
      sqlite: { filename: ':memory:' },
    });
    await dbService.initialize();

    // Create test schema
    const sqliteAdapter = dbService.getAdapter('sqlite');
    await sqliteAdapter.raw(`
      CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        version TEXT NOT NULL,
        content_path TEXT NOT NULL,
        status TEXT NOT NULL,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await sqliteAdapter.raw(`
      CREATE TABLE IF NOT EXISTS deployment_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        skill_id TEXT NOT NULL,
        from_status TEXT,
        to_status TEXT NOT NULL,
        version TEXT NOT NULL,
        success INTEGER NOT NULL,
        deployed_by TEXT NOT NULL,
        error_message TEXT,
        metadata TEXT,
        deployed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Initialize transaction manager
    const adapters = new Map();
    adapters.set('sqlite', sqliteAdapter);
    txManager = new TransactionManager(adapters);

    // Initialize distributed lock manager
    mockRedis = new MockRedisClient();
    lockManager = new DistributedLock(mockRedis);

    // Initialize deployment pipeline
    pipeline = new SkillDeploymentPipeline(dbService, txManager, lockManager);

    // Create test skill directory
    testSkillPath = path.join(__dirname, 'fixtures', 'test-skill');
    fs.mkdirSync(testSkillPath, { recursive: true });

    // Create SKILL.md
    fs.writeFileSync(
      path.join(testSkillPath, 'SKILL.md'),
      `---
name: test-authentication
description: Test authentication skill
version: 1.0.0
author: Test Author
---

# Test Authentication Skill

This is a test skill for transaction testing.
`
    );

    // Create execute.sh
    fs.writeFileSync(
      path.join(testSkillPath, 'execute.sh'),
      `#!/bin/bash\necho "Test skill execution"\n`
    );
    fs.chmodSync(path.join(testSkillPath, 'execute.sh'), 0o755);
  });

  afterAll(async () => {
    // Cleanup
    await dbService.close();
    if (fs.existsSync(testSkillPath)) {
      fs.rmSync(testSkillPath, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    // Clear database before each test
    const adapter = dbService.getAdapter('sqlite');
    await adapter.raw('DELETE FROM skills');
    await adapter.raw('DELETE FROM deployment_audit');
  });

  describe('Atomic Deployment Operations', () => {
    it('should deploy skill with transaction commit', async () => {
      const request: DeploymentRequest = {
        skillPath: testSkillPath,
        deployedBy: 'test-user',
        explicitVersion: '1.0.0',
        skipValidation: true,
      };

      const result = await pipeline.deploySkill(request);

      expect(result.success).toBe(true);
      expect(result.skillId).toBeDefined();
      expect(result.skillName).toBe('test-authentication');
      expect(result.version).toBe('1.0.0');
      expect(result.transactionId).toBeDefined();
      expect(result.lockId).toBeDefined();
      expect(result.deploymentId).toBeGreaterThan(0);

      // Verify skill was inserted
      const adapter = dbService.getAdapter('sqlite');
      const skills: any = await adapter.raw('SELECT * FROM skills');
      expect(skills.length).toBe(1);
      expect(skills[0].name).toBe('test-authentication');
      expect(skills[0].status).toBe('DEPLOYED');

      // Verify audit trail was created
      const audits: any = await adapter.raw('SELECT * FROM deployment_audit');
      expect(audits.length).toBe(1);
      expect(audits[0].success).toBe(1);
      expect(audits[0].to_status).toBe('DEPLOYED');
    });

    it('should rollback transaction on database error', async () => {
      // First deployment succeeds
      await pipeline.deploySkill({
        skillPath: testSkillPath,
        deployedBy: 'test-user',
        explicitVersion: '1.0.0',
        skipValidation: true,
      });

      // Second deployment with same version should fail and rollback
      const result = await pipeline.deploySkill({
        skillPath: testSkillPath,
        deployedBy: 'test-user',
        explicitVersion: '1.0.0', // Duplicate version
        skipValidation: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');

      // Verify only one skill exists (second deployment rolled back)
      const adapter = dbService.getAdapter('sqlite');
      const skills: any = await adapter.raw('SELECT * FROM skills');
      expect(skills.length).toBe(1); // Only first deployment
    });

    it('should rollback all operations if audit trail fails', async () => {
      // Mock audit failure by corrupting database mid-transaction
      const originalRecordAudit = (pipeline as any).recordDeploymentAudit;
      (pipeline as any).recordDeploymentAudit = jest.fn().mockRejectedValue(
        new Error('Audit database unavailable')
      );

      const result = await pipeline.deploySkill({
        skillPath: testSkillPath,
        deployedBy: 'test-user',
        explicitVersion: '1.0.0',
        skipValidation: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Audit database unavailable');

      // Verify skill was NOT inserted (transaction rolled back)
      const adapter = dbService.getAdapter('sqlite');
      const skills: any = await adapter.raw('SELECT * FROM skills');
      expect(skills.length).toBe(0);

      // Restore original method
      (pipeline as any).recordDeploymentAudit = originalRecordAudit;
    });
  });

  describe('Distributed Locking', () => {
    it('should acquire lock before deployment', async () => {
      const acquireSpy = jest.spyOn(lockManager, 'acquire');
      const releaseSpy = jest.spyOn(lockManager, 'release');

      const result = await pipeline.deploySkill({
        skillPath: testSkillPath,
        deployedBy: 'test-user',
        explicitVersion: '1.0.0',
        skipValidation: true,
      });

      expect(result.success).toBe(true);
      expect(acquireSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          database: 'skills',
          table: 'skills',
          key: 'test-authentication',
        }),
        expect.any(Object)
      );
      expect(releaseSpy).toHaveBeenCalledWith(expect.any(String));

      acquireSpy.mockRestore();
      releaseSpy.mockRestore();
    });

    it('should release lock even if deployment fails', async () => {
      const releaseSpy = jest.spyOn(lockManager, 'release');

      // Force failure by using invalid version
      await pipeline.deploySkill({
        skillPath: testSkillPath,
        deployedBy: 'test-user',
        explicitVersion: '1.0.0',
        skipValidation: true,
      });

      // Try to deploy same version again (will fail)
      await pipeline.deploySkill({
        skillPath: testSkillPath,
        deployedBy: 'test-user',
        explicitVersion: '1.0.0',
        skipValidation: true,
      });

      // Lock should be released both times (once in success, once in failure)
      expect(releaseSpy).toHaveBeenCalledTimes(2);

      releaseSpy.mockRestore();
    });

    it('should prevent concurrent deployments of same skill', async () => {
      // Simulate concurrent deployments by manually acquiring lock
      const lockResource = {
        database: 'skills',
        table: 'skills',
        key: 'test-authentication',
      };

      const firstLock = await lockManager.acquire(lockResource, {
        timeout: 5000,
        ttl: 10000,
      });

      // Try to deploy while lock is held (should timeout)
      const startTime = Date.now();
      const result = await pipeline.deploySkill({
        skillPath: testSkillPath,
        deployedBy: 'test-user',
        explicitVersion: '1.0.0',
        skipValidation: true,
      });
      const duration = Date.now() - startTime;

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to acquire lock');
      expect(duration).toBeGreaterThanOrEqual(9000); // Should timeout after ~10s

      // Release the lock
      await lockManager.release(firstLock.id);
    }, 30000); // Increase test timeout to 15s
  });

  describe('Version Conflict Detection', () => {
    it('should detect version conflict within transaction', async () => {
      // First deployment
      const result1 = await pipeline.deploySkill({
        skillPath: testSkillPath,
        deployedBy: 'test-user',
        explicitVersion: '1.0.0',
        skipValidation: true,
      });

      expect(result1.success).toBe(true);

      // Second deployment with same version
      const result2 = await pipeline.deploySkill({
        skillPath: testSkillPath,
        deployedBy: 'test-user',
        explicitVersion: '1.0.0',
        skipValidation: true,
      });

      expect(result2.success).toBe(false);
      expect(result2.error).toContain('already exists');

      // Verify only one version exists
      const adapter = dbService.getAdapter('sqlite');
      const skills: any = await adapter.raw(
        'SELECT COUNT(*) as count FROM skills WHERE version = ?',
        ['1.0.0']
      );
      expect(skills[0].count).toBe(1);
    });

    it('should allow different versions to deploy successfully', async () => {
      const result1 = await pipeline.deploySkill({
        skillPath: testSkillPath,
        deployedBy: 'test-user',
        explicitVersion: '1.0.0',
        skipValidation: true,
      });

      const result2 = await pipeline.deploySkill({
        skillPath: testSkillPath,
        deployedBy: 'test-user',
        explicitVersion: '1.0.1',
        skipValidation: true,
      });

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      // Verify both versions exist
      const adapter = dbService.getAdapter('sqlite');
      const skills: any = await adapter.raw('SELECT * FROM skills');
      expect(skills.length).toBe(2);
    });
  });

  describe('Audit Trail Atomicity', () => {
    it('should create audit trail atomically with deployment', async () => {
      const result = await pipeline.deploySkill({
        skillPath: testSkillPath,
        deployedBy: 'test-user',
        explicitVersion: '1.0.0',
        skipValidation: true,
      });

      expect(result.success).toBe(true);

      const adapter = dbService.getAdapter('sqlite');

      // Verify skill and audit trail created together
      const skills: any = await adapter.raw('SELECT * FROM skills');
      const audits: any = await adapter.raw('SELECT * FROM deployment_audit');

      expect(skills.length).toBe(1);
      expect(audits.length).toBe(1);
      expect(audits[0].skill_id).toBe(skills[0].id);

      // Verify audit metadata includes transaction and lock IDs
      const auditMetadata = JSON.parse(audits[0].metadata);
      expect(auditMetadata.transactionId).toBe(result.transactionId);
      expect(auditMetadata.lockId).toBe(result.lockId);
    });

    it('should not create partial audit trail on failure', async () => {
      // First deployment succeeds
      await pipeline.deploySkill({
        skillPath: testSkillPath,
        deployedBy: 'test-user',
        explicitVersion: '1.0.0',
        skipValidation: true,
      });

      // Second deployment fails (duplicate version)
      const result = await pipeline.deploySkill({
        skillPath: testSkillPath,
        deployedBy: 'test-user',
        explicitVersion: '1.0.0',
        skipValidation: true,
      });

      expect(result.success).toBe(false);

      const adapter = dbService.getAdapter('sqlite');

      // Verify only one successful audit entry exists
      const successAudits: any = await adapter.raw(
        'SELECT * FROM deployment_audit WHERE success = 1'
      );
      expect(successAudits.length).toBe(1);

      // No partial audit trails from failed deployment
      const allAudits: any = await adapter.raw('SELECT * FROM deployment_audit');
      expect(allAudits.length).toBe(1);
    });
  });

  describe('Rollback Deployment', () => {
    it('should rollback deployment with transaction', async () => {
      // Deploy skill
      const deployResult = await pipeline.deploySkill({
        skillPath: testSkillPath,
        deployedBy: 'test-user',
        explicitVersion: '1.0.0',
        skipValidation: true,
      });

      expect(deployResult.success).toBe(true);
      const deploymentId = deployResult.deploymentId!;

      // Rollback deployment
      const rollbackSuccess = await pipeline.rollbackDeployment(deploymentId);

      expect(rollbackSuccess).toBe(true);

      // Verify skill was removed
      const adapter = dbService.getAdapter('sqlite');
      const skills: any = await adapter.raw('SELECT * FROM skills');
      expect(skills.length).toBe(0);

      // Verify rollback audit entry was created
      const audits: any = await adapter.raw(
        'SELECT * FROM deployment_audit WHERE to_status = ?',
        ['ROLLED_BACK']
      );
      expect(audits.length).toBe(1);
      expect(audits[0].skill_id).toBe(deployResult.skillId);
    });

    it('should acquire lock during rollback', async () => {
      // Deploy skill
      const deployResult = await pipeline.deploySkill({
        skillPath: testSkillPath,
        deployedBy: 'test-user',
        explicitVersion: '1.0.0',
        skipValidation: true,
      });

      const acquireSpy = jest.spyOn(lockManager, 'acquire');
      const releaseSpy = jest.spyOn(lockManager, 'release');

      // Rollback deployment
      const rollbackSuccess = await pipeline.rollbackDeployment(deployResult.deploymentId!);

      expect(rollbackSuccess).toBe(true);
      expect(acquireSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          database: 'skills',
          table: 'skills',
          key: 'test-authentication',
        }),
        expect.any(Object)
      );
      expect(releaseSpy).toHaveBeenCalled();

      acquireSpy.mockRestore();
      releaseSpy.mockRestore();
    });

    it('should rollback transaction if rollback operation fails', async () => {
      // Deploy skill
      const deployResult = await pipeline.deploySkill({
        skillPath: testSkillPath,
        deployedBy: 'test-user',
        explicitVersion: '1.0.0',
        skipValidation: true,
      });

      // Mock rollback failure
      const adapter = dbService.getAdapter('sqlite');
      const originalRaw = adapter.raw.bind(adapter);
      adapter.raw = jest.fn().mockImplementation((query: string, params?: any[]) => {
        if (query.includes('DELETE FROM skills')) {
          throw new Error('Database deletion failed');
        }
        return originalRaw(query, params);
      });

      // Attempt rollback
      const rollbackSuccess = await pipeline.rollbackDeployment(deployResult.deploymentId!);

      expect(rollbackSuccess).toBe(false);

      // Verify skill still exists (rollback transaction failed)
      adapter.raw = originalRaw;
      const skills: any = await adapter.raw('SELECT * FROM skills');
      expect(skills.length).toBe(1); // Still deployed
    });
  });

  describe('Deployment History Queries', () => {
    it('should retrieve deployment history', async () => {
      // Deploy multiple versions
      await pipeline.deploySkill({
        skillPath: testSkillPath,
        deployedBy: 'user1',
        explicitVersion: '1.0.0',
        skipValidation: true,
      });

      await pipeline.deploySkill({
        skillPath: testSkillPath,
        deployedBy: 'user2',
        explicitVersion: '1.0.1',
        skipValidation: true,
      });

      // Get history
      const history = await pipeline.getDeploymentHistory('test-authentication', 10);

      expect(history.length).toBe(2);
      expect(history[0].version).toBe('1.0.1'); // Most recent first
      expect(history[1].version).toBe('1.0.0');
    });

    it('should retrieve deployments by status', async () => {
      // Deploy and rollback
      const deployResult = await pipeline.deploySkill({
        skillPath: testSkillPath,
        deployedBy: 'test-user',
        explicitVersion: '1.0.0',
        skipValidation: true,
      });

      await pipeline.rollbackDeployment(deployResult.deploymentId!);

      // Get deployed status
      const deployed = await pipeline.getDeploymentsByStatus('DEPLOYED', 50);
      expect(deployed.length).toBe(1);

      // Get rolled back status
      const rolledBack = await pipeline.getDeploymentsByStatus('ROLLED_BACK', 50);
      expect(rolledBack.length).toBe(1);
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain same API surface as original implementation', () => {
      // Verify constructor signature
      expect(pipeline).toBeInstanceOf(SkillDeploymentPipeline);

      // Verify method signatures exist
      expect(typeof pipeline.deploySkill).toBe('function');
      expect(typeof pipeline.rollbackDeployment).toBe('function');
      expect(typeof pipeline.getDeploymentHistory).toBe('function');
      expect(typeof pipeline.getDeploymentsByStatus).toBe('function');
    });

    it('should return same result structure as original', async () => {
      const result = await pipeline.deploySkill({
        skillPath: testSkillPath,
        deployedBy: 'test-user',
        explicitVersion: '1.0.0',
        skipValidation: true,
      });

      // Verify result structure (original fields + new transaction fields)
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('deploymentId');
      expect(result).toHaveProperty('skillId');
      expect(result).toHaveProperty('skillName');
      expect(result).toHaveProperty('version');
      expect(result).toHaveProperty('deployedAt');
      expect(result).toHaveProperty('rollbackPath');
      // New fields
      expect(result).toHaveProperty('transactionId');
      expect(result).toHaveProperty('lockId');
    });
  });
});
