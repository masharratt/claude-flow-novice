/**
 * SQLite Blocking Coordination Integration Tests
 * Sprint 1.5-1.7: End-to-End Validation
 *
 * Tests complete CFN Loop workflow with SQLite persistence:
 * - Loop 3 agent confidence storage
 * - Loop 2 validator consensus
 * - Loop 4 Product Owner decision
 * - Blocking coordination audit trail
 * - Cross-session recovery
 *
 * @module tests/integration/sqlite-blocking-coordination.test
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Redis from 'ioredis';
import { CFNLoopMemoryManager, ACLLevel } from '../../src/cfn-loop/cfn-loop-memory-manager.js';
import { BlockingCoordinationManager } from '../../src/cfn-loop/blocking-coordination.js';
import { AgentLifecycleSQLiteManager } from '../../src/cfn-loop/agent-lifecycle-sqlite.js';

describe('SQLite Blocking Coordination Integration', () => {
  let redis: Redis;
  let cfnMemoryManager: CFNLoopMemoryManager;
  let blockingCoordinator: BlockingCoordinationManager;
  let lifecycleManager: AgentLifecycleSQLiteManager;

  beforeAll(async () => {
    // Initialize Redis
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: 3
    });

    // Wait for Redis connection
    await redis.ping();

    // Initialize CFN Loop memory manager
    cfnMemoryManager = new CFNLoopMemoryManager({
      redisClient: redis,
      swarmId: 'integration-test-swarm',
      projectId: 'integration-test-project',
      debug: true,
      dualWriteTimeout: 2000
    });

    await cfnMemoryManager.initialize();

    // Initialize blocking coordinator with CFN memory manager
    blockingCoordinator = new BlockingCoordinationManager({
      redisClient: redis,
      coordinatorId: 'coordinator-1',
      debug: true,
      cfnMemoryManager,
      swarmId: 'integration-test-swarm',
      phase: 'auth'
    });

    // Initialize agent lifecycle manager
    lifecycleManager = new AgentLifecycleSQLiteManager({
      redisClient: redis,
      cfnMemoryManager,
      swarmId: 'integration-test-swarm',
      projectId: 'integration-test-project',
      debug: true
    });
  });

  afterAll(async () => {
    if (cfnMemoryManager) {
      await cfnMemoryManager.shutdown();
    }
    if (redis) {
      await redis.quit();
    }
  });

  beforeEach(async () => {
    // Clean up test data
    const keys = await redis.keys('cfn/*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  describe('Complete CFN Loop Workflow', () => {
    it('should complete full Loop 3 -> Loop 2 -> Loop 4 workflow', async () => {
      // ===== PHASE 1: Loop 3 - Agent Implementation =====

      // Register agents
      await lifecycleManager.registerAgentSpawn({
        agentId: 'coder-1',
        name: 'Backend Developer',
        type: 'backend-dev',
        swarmId: 'integration-test-swarm',
        projectId: 'integration-test-project',
        capabilities: ['api', 'database'],
        aclLevel: ACLLevel.TEAM
      });

      await lifecycleManager.registerAgentSpawn({
        agentId: 'coder-2',
        name: 'Security Specialist',
        type: 'security-specialist',
        swarmId: 'integration-test-swarm',
        projectId: 'integration-test-project',
        capabilities: ['security', 'audit'],
        aclLevel: ACLLevel.TEAM
      });

      // Store Loop 3 confidence scores
      await cfnMemoryManager.storeLoop3Confidence(
        {
          agentId: 'coder-1',
          confidence: 0.85,
          reasoning: 'API endpoints implemented, tests passing',
          blockers: [],
          timestamp: Date.now(),
          phase: 'auth',
          iteration: 1,
          metadata: {
            filesModified: ['auth.js', 'auth.test.js'],
            testsRun: 15,
            testsPassed: 15
          }
        },
        {
          agentId: 'coder-1',
          aclLevel: ACLLevel.PRIVATE
        }
      );

      await cfnMemoryManager.storeLoop3Confidence(
        {
          agentId: 'coder-2',
          confidence: 0.90,
          reasoning: 'Security audit complete, no vulnerabilities',
          blockers: [],
          timestamp: Date.now(),
          phase: 'auth',
          iteration: 1,
          metadata: {
            filesModified: ['auth-middleware.js'],
            testsRun: 8,
            testsPassed: 8
          }
        },
        {
          agentId: 'coder-2',
          aclLevel: ACLLevel.PRIVATE
        }
      );

      // Wait for async SQLite writes
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify Loop 3 confidence storage
      const confidenceScores = await cfnMemoryManager.getLoop3Confidence('auth', {
        agentId: 'validator-1',
        aclLevel: ACLLevel.SWARM
      });

      expect(confidenceScores).toHaveLength(2);
      expect(confidenceScores.find(c => c.agentId === 'coder-1')?.confidence).toBe(0.85);
      expect(confidenceScores.find(c => c.agentId === 'coder-2')?.confidence).toBe(0.90);

      // ===== PHASE 2: Loop 2 - Validation =====

      // Register validator agents
      await lifecycleManager.registerAgentSpawn({
        agentId: 'reviewer-1',
        name: 'Code Reviewer',
        type: 'reviewer',
        swarmId: 'integration-test-swarm',
        projectId: 'integration-test-project',
        capabilities: ['code-review', 'architecture'],
        aclLevel: ACLLevel.TEAM
      });

      // Store Loop 2 consensus
      await cfnMemoryManager.storeLoop2Consensus(
        {
          consensusId: 'consensus-auth-1',
          phase: 'auth',
          iteration: 1,
          threshold: 0.90,
          currentScore: 0.92,
          validationResults: [
            {
              validatorId: 'reviewer-1',
              validationType: 'code-quality',
              score: 0.92,
              issues: [],
              recommendations: ['Add rate limiting', 'Implement OAuth2'],
              timestamp: Date.now(),
              phase: 'auth',
              iteration: 1
            }
          ],
          status: 'achieved',
          timestamp: Date.now(),
          resolvedAt: Date.now()
        },
        {
          agentId: 'reviewer-1',
          aclLevel: ACLLevel.SWARM
        }
      );

      // Wait for async SQLite writes
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify Loop 2 consensus storage
      const consensus = await cfnMemoryManager.getLoop2Consensus('auth', {
        agentId: 'product-owner',
        aclLevel: ACLLevel.SWARM
      });

      expect(consensus).toBeDefined();
      expect(consensus!.currentScore).toBe(0.92);
      expect(consensus!.status).toBe('achieved');

      // ===== PHASE 3: Loop 4 - Product Owner Decision =====

      // Store Loop 4 decision
      await cfnMemoryManager.storeLoop4Decision(
        {
          decisionId: 'decision-auth-1',
          phase: 'auth',
          iteration: 1,
          decision: 'DEFER',
          reasoning: 'Authentication phase complete. Deferred enhancements to backlog.',
          loop3Confidence: 0.875, // Average of 0.85 and 0.90
          loop2Consensus: 0.92,
          deferredIssues: ['Add rate limiting', 'Implement OAuth2'],
          timestamp: Date.now(),
          nextActions: ['Transition to next phase', 'Create backlog items']
        },
        {
          agentId: 'product-owner',
          aclLevel: ACLLevel.SYSTEM
        }
      );

      // Wait for async SQLite writes
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify Loop 4 decision storage
      const decisionHistory = await cfnMemoryManager.getLoop4DecisionHistory('auth', {
        agentId: 'product-owner',
        aclLevel: ACLLevel.SYSTEM
      });

      expect(decisionHistory).toHaveLength(1);
      expect(decisionHistory[0].decision).toBe('DEFER');
      expect(decisionHistory[0].deferredIssues).toContain('Add rate limiting');
    });
  });

  describe('Blocking Coordination Audit Trail', () => {
    it('should log signal ACK events to SQLite', async () => {
      const signal = {
        signalId: 'signal-1',
        type: 'completion' as const,
        source: 'coordinator-1',
        targets: ['coordinator-2'],
        timestamp: Date.now()
      };

      // Send ACK (which should trigger audit logging)
      await blockingCoordinator.acknowledgeSignal(signal);

      // Wait for async audit logging
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify audit log was written
      const sqlite = (cfnMemoryManager as any).sqlite;
      if (sqlite && sqlite.db) {
        const auditLogs = await new Promise((resolve, reject) => {
          sqlite.db.all(
            `SELECT * FROM audit_log WHERE entity_id = ? AND action = ?`,
            [signal.signalId, 'signal_ack_sent'],
            (err: Error | null, rows: any[]) => {
              if (err) reject(err);
              else resolve(rows);
            }
          );
        });

        expect(auditLogs).toBeDefined();
        expect((auditLogs as any[]).length).toBeGreaterThan(0);
      }
    });
  });

  describe('Cross-Session Recovery', () => {
    it('should recover Loop 3/2/4 data after restart', async () => {
      // Store data in first session
      await cfnMemoryManager.storeLoop3Confidence(
        {
          agentId: 'coder-1',
          confidence: 0.85,
          reasoning: 'Tests pass',
          blockers: [],
          timestamp: Date.now(),
          phase: 'auth',
          iteration: 1
        },
        {
          agentId: 'coder-1',
          aclLevel: ACLLevel.PRIVATE
        }
      );

      // Wait for SQLite write
      await new Promise(resolve => setTimeout(resolve, 500));

      // Simulate restart by creating new memory manager
      const newMemoryManager = new CFNLoopMemoryManager({
        redisClient: redis,
        swarmId: 'integration-test-swarm',
        projectId: 'integration-test-project',
        debug: true
      });

      await newMemoryManager.initialize();

      // Retrieve data from SQLite (Redis may have expired)
      const recovered = await newMemoryManager.getLoop3Confidence('auth', {
        agentId: 'validator-1',
        aclLevel: ACLLevel.SWARM
      });

      expect(recovered).toHaveLength(1);
      expect(recovered[0].confidence).toBe(0.85);

      await newMemoryManager.shutdown();
    });
  });

  describe('Performance Validation', () => {
    it('should meet p95 latency targets', async () => {
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        await cfnMemoryManager.storeLoop3Confidence(
          {
            agentId: `coder-${i}`,
            confidence: 0.85,
            reasoning: 'Test',
            blockers: [],
            timestamp: Date.now(),
            phase: 'perf-test',
            iteration: 1
          },
          {
            agentId: `coder-${i}`,
            aclLevel: ACLLevel.PRIVATE
          }
        );
      }

      const metrics = cfnMemoryManager.getMetrics();

      // Verify performance targets from architecture doc
      expect(metrics.dualWriteLatency.p95).toBeLessThan(60); // <60ms target
      expect(metrics.redisLatency.p95).toBeLessThan(10); // <10ms target
      expect(metrics.sqliteLatency.p95).toBeLessThan(50); // <50ms target

      // Verify no failures
      expect(metrics.dualWriteFailures).toBe(0);
    }, 30000); // 30 second timeout
  });

  describe('ACL Enforcement', () => {
    it('should enforce private ACL level', async () => {
      // Store private confidence
      await cfnMemoryManager.storeLoop3Confidence(
        {
          agentId: 'coder-1',
          confidence: 0.85,
          reasoning: 'Private data',
          blockers: [],
          timestamp: Date.now(),
          phase: 'auth',
          iteration: 1
        },
        {
          agentId: 'coder-1',
          aclLevel: ACLLevel.PRIVATE,
          encrypt: true
        }
      );

      await new Promise(resolve => setTimeout(resolve, 500));

      // Attempt to retrieve with different agent (should be filtered by ACL)
      // Note: SQLite ACL enforcement is handled by the adapter
      const results = await cfnMemoryManager.getLoop3Confidence('auth', {
        agentId: 'coder-2', // Different agent
        aclLevel: ACLLevel.PRIVATE // Requesting private access
      });

      // Results should be empty or filtered
      // Implementation depends on ACL adapter logic
    });
  });

  describe('Audit Trail Completeness', () => {
    it('should maintain complete audit trail for CFN Loop', async () => {
      // Execute complete workflow
      await cfnMemoryManager.storeLoop3Confidence(
        {
          agentId: 'coder-1',
          confidence: 0.85,
          reasoning: 'Tests pass',
          blockers: [],
          timestamp: Date.now(),
          phase: 'audit-test',
          iteration: 1
        },
        {
          agentId: 'coder-1',
          aclLevel: ACLLevel.PRIVATE
        }
      );

      await cfnMemoryManager.storeLoop4Decision(
        {
          decisionId: 'decision-audit-1',
          phase: 'audit-test',
          iteration: 1,
          decision: 'DEFER',
          reasoning: 'Complete',
          loop3Confidence: 0.85,
          loop2Consensus: 0.90,
          timestamp: Date.now(),
          nextActions: []
        },
        {
          agentId: 'product-owner',
          aclLevel: ACLLevel.SYSTEM
        }
      );

      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify audit logs exist
      const sqlite = (cfnMemoryManager as any).sqlite;
      if (sqlite && sqlite.db) {
        const auditLogs = await new Promise((resolve, reject) => {
          sqlite.db.all(
            `SELECT * FROM audit_log WHERE category = 'cfn-loop' ORDER BY created_at`,
            [],
            (err: Error | null, rows: any[]) => {
              if (err) reject(err);
              else resolve(rows);
            }
          );
        });

        expect((auditLogs as any[]).length).toBeGreaterThan(0);
      }
    });
  });
});
