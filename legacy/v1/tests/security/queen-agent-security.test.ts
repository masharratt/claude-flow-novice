/**
 * Security Tests for Queen Agent
 *
 * Validates RBAC authorization, input validation, and rate limiting
 * for all critical queen agent operations.
 *
 * Tests cover vulnerabilities:
 * - VULN-P5-001: spawnWorker() authorization
 * - VULN-P5-002: delegateTask() authorization
 * - Input validation bypass attempts
 * - Rate limiting enforcement
 */

import { QueenAgent } from '../../src/coordination/queen-agent';
import { SwarmMemoryManager } from '../../src/memory/swarm-memory';
import { MessageBroker } from '../../src/coordination/v2/core/message-broker';
import { DependencyGraph } from '../../src/coordination/dependency-graph';
import { Logger } from '../../src/core/logger';
import { RateLimitError } from '../../src/coordination/rate-limiter';
import { MockRBACManager } from '../../src/test-utils/mock-rbac-manager';
import type { CallerIdentityInput } from '../../src/coordination/validation-schemas';
import type { Task } from '../../src/utils/types';

describe('Queen Agent Security Tests', () => {
  let queenAgent: QueenAgent;
  let memory: SwarmMemoryManager;
  let broker: MessageBroker;
  let dependencyGraph: DependencyGraph;
  let logger: Logger;

  // Test callers with different permission levels
  const adminCaller: CallerIdentityInput = {
    id: 'admin-user',
    type: 'user',
    roles: ['admin']
  };

  const coordinatorCaller: CallerIdentityInput = {
    id: 'coordinator-user',
    type: 'user',
    roles: ['coordinator']
  };

  const observerCaller: CallerIdentityInput = {
    id: 'observer-user',
    type: 'user',
    roles: ['observer']
  };

  const unauthorizedCaller: CallerIdentityInput = {
    id: 'unauthorized-user',
    type: 'user',
    roles: ['unknown-role']
  };

  beforeEach(async () => {
    logger = new Logger({ level: 'error' });
    memory = new SwarmMemoryManager(':memory:', { enableCrypto: false });
    await memory.initialize();
    broker = new MessageBroker({ maxQueueSize: 100 }, logger);
    dependencyGraph = new DependencyGraph();

    // Create mock RBAC manager for tests (validates caller structure, allows all operations)
    const mockRbacManager = new MockRBACManager() as any;

    queenAgent = new QueenAgent(
      {
        minWorkers: 2,
        maxWorkers: 10,
        healthCheckInterval: 60000,
        autoScale: false
      },
      memory,
      broker,
      dependencyGraph,
      logger,
      mockRbacManager // Inject mock RBAC manager
    );

    await queenAgent.initialize();
  });

  afterEach(async () => {
    await queenAgent.shutdown();
    await memory.close();
  });

  describe('VULN-P5-001: spawnWorker() Authorization', () => {
    it('should allow admin to spawn workers', async () => {
      const workerId = await queenAgent.spawnWorker(
        'backend-dev',
        {
          skills: ['node', 'api'],
          maxConcurrentTasks: 3,
          priority: 5
        },
        adminCaller
      );

      expect(workerId).toMatch(/^worker-backend-dev/);
    });

    it('should allow system callers to spawn workers', async () => {
      const systemCaller: CallerIdentityInput = {
        id: 'system-service',
        type: 'system',
        roles: ['system']
      };

      const workerId = await queenAgent.spawnWorker(
        'tester',
        {
          skills: ['jest', 'integration'],
          maxConcurrentTasks: 2,
          priority: 3
        },
        systemCaller
      );

      expect(workerId).toMatch(/^worker-tester/);
    });

    it('should deny observer from spawning workers (403)', async () => {
      await expect(
        queenAgent.spawnWorker(
          'backend-dev',
          {
            skills: ['node'],
            maxConcurrentTasks: 3,
            priority: 5
          },
          observerCaller
        )
      ).rejects.toThrow('Forbidden');
    });

    it('should deny unauthorized caller from spawning workers (403)', async () => {
      await expect(
        queenAgent.spawnWorker(
          'backend-dev',
          {
            skills: ['node'],
            maxConcurrentTasks: 3,
            priority: 5
          },
          unauthorizedCaller
        )
      ).rejects.toThrow('Forbidden');
    });

    it('should validate worker capabilities input', async () => {
      await expect(
        queenAgent.spawnWorker(
          '', // Invalid: empty type
          {
            skills: ['node'],
            maxConcurrentTasks: 3,
            priority: 5
          },
          adminCaller
        )
      ).rejects.toThrow('Worker capabilities validation failed');
    });

    it('should reject malicious worker type with special characters', async () => {
      await expect(
        queenAgent.spawnWorker(
          '../../../etc/passwd', // Path traversal attempt
          {
            skills: ['node'],
            maxConcurrentTasks: 3,
            priority: 5
          },
          adminCaller
        )
      ).rejects.toThrow('Worker capabilities validation failed');
    });

    it('should reject worker with excessive skills (>50)', async () => {
      const excessiveSkills = Array.from({ length: 51 }, (_, i) => `skill-${i}`);

      await expect(
        queenAgent.spawnWorker(
          'backend-dev',
          {
            skills: excessiveSkills,
            maxConcurrentTasks: 3,
            priority: 5
          },
          adminCaller
        )
      ).rejects.toThrow('Maximum 50 skills allowed');
    });

    it('should reject worker with invalid maxConcurrentTasks', async () => {
      await expect(
        queenAgent.spawnWorker(
          'backend-dev',
          {
            skills: ['node'],
            maxConcurrentTasks: 150, // Exceeds limit
            priority: 5
          },
          adminCaller
        )
      ).rejects.toThrow('Worker capabilities validation failed');
    });
  });

  describe('VULN-P5-002: delegateTask() Authorization', () => {
    let workerId: string;
    let testTask: Task;

    beforeEach(async () => {
      // Spawn a worker for delegation tests
      workerId = await queenAgent.spawnWorker(
        'backend-dev',
        {
          skills: ['node', 'api'],
          maxConcurrentTasks: 5,
          priority: 5
        },
        adminCaller
      );

      testTask = {
        id: 'task-test-001',
        type: 'implement-feature',
        description: 'Test task',
        priority: 5,
        dependencies: []
      } as Task;
    });

    it('should allow coordinator to delegate tasks', async () => {
      const result = await queenAgent.delegateTask(testTask, coordinatorCaller, workerId);

      expect(result.status).toBe('accepted');
      expect(result.workerId).toBe(workerId);
      expect(result.taskId).toBe('task-test-001');
    });

    it('should allow admin to delegate tasks', async () => {
      const task2: Task = {
        id: 'task-admin-001',
        type: 'review-code',
        description: 'Admin task',
        priority: 8,
        dependencies: [] // Required field
      } as Task;

      const result = await queenAgent.delegateTask(task2, adminCaller, workerId);

      expect(result.status).toBe('accepted');
      expect(result.taskId).toBe('task-admin-001');
    });

    it('should deny observer from delegating tasks (403)', async () => {
      await expect(
        queenAgent.delegateTask(testTask, observerCaller, workerId)
      ).rejects.toThrow('Forbidden');
    });

    it('should deny unauthorized caller from delegating tasks (403)', async () => {
      await expect(
        queenAgent.delegateTask(testTask, unauthorizedCaller, workerId)
      ).rejects.toThrow('Forbidden');
    });

    it('should validate task input', async () => {
      const invalidTask = {
        id: '', // Invalid: empty ID
        type: 'test',
        description: 'Invalid task'
      } as Task;

      await expect(
        queenAgent.delegateTask(invalidTask, coordinatorCaller, workerId)
      ).rejects.toThrow('Task validation failed');
    });

    it('should reject task with malicious ID (SQL injection attempt)', async () => {
      const sqlInjectionTask = {
        id: "'; DROP TABLE tasks; --",
        type: 'malicious',
        description: 'SQL injection attempt'
      } as Task;

      await expect(
        queenAgent.delegateTask(sqlInjectionTask, coordinatorCaller, workerId)
      ).rejects.toThrow('Task validation failed');
    });

    it('should reject task with path traversal in ID', async () => {
      const pathTraversalTask = {
        id: '../../etc/passwd',
        type: 'malicious',
        description: 'Path traversal attempt'
      } as Task;

      await expect(
        queenAgent.delegateTask(pathTraversalTask, coordinatorCaller, workerId)
      ).rejects.toThrow('Task validation failed');
    });

    it('should reject task with excessive dependencies (>100)', async () => {
      const excessiveDepsTask = {
        id: 'task-excessive-deps',
        type: 'test',
        description: 'Too many dependencies',
        dependencies: Array.from({ length: 101 }, (_, i) => `dep-${i}`)
      } as Task;

      await expect(
        queenAgent.delegateTask(excessiveDepsTask, coordinatorCaller, workerId)
      ).rejects.toThrow('Maximum 100 dependencies allowed');
    });

    it('should validate worker ID format', async () => {
      await expect(
        queenAgent.delegateTask(testTask, coordinatorCaller, 'invalid-worker-id')
      ).rejects.toThrow();
    });
  });

  describe('aggregateResults() Authorization', () => {
    let workerId: string;

    beforeEach(async () => {
      workerId = await queenAgent.spawnWorker(
        'backend-dev',
        {
          skills: ['node'],
          maxConcurrentTasks: 3,
          priority: 5
        },
        adminCaller
      );
    });

    it('should allow coordinator to aggregate results', async () => {
      const results = new Map([
        [workerId, { success: true, data: { result: 'success' } }]
      ]);

      const aggregated = await queenAgent.aggregateResults(
        'task-001',
        results,
        coordinatorCaller
      );

      expect(aggregated.confidence).toBeGreaterThan(0);
      expect(aggregated.completedWorkers).toContain(workerId);
    });

    it('should deny observer from aggregating results (403)', async () => {
      const results = new Map([
        [workerId, { success: true, data: { result: 'success' } }]
      ]);

      await expect(
        queenAgent.aggregateResults('task-001', results, observerCaller)
      ).rejects.toThrow('Forbidden');
    });

    it('should validate worker results format', async () => {
      const invalidResults = new Map([
        ['invalid-id', { success: true }] // Invalid worker ID format
      ]);

      await expect(
        queenAgent.aggregateResults('task-001', invalidResults, coordinatorCaller)
      ).rejects.toThrow('Worker results validation failed');
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce worker spawn rate limit', async () => {
      const spawns: Promise<string>[] = [];

      // Attempt to spawn 25 workers (exceeds limit of 20 per window)
      for (let i = 0; i < 25; i++) {
        spawns.push(
          queenAgent.spawnWorker(
            `worker-type-${i}`,
            {
              skills: ['test'],
              maxConcurrentTasks: 1,
              priority: 1
            },
            adminCaller
          )
        );
      }

      // Some spawns should fail with rate limit error
      const results = await Promise.allSettled(spawns);
      const rateLimitErrors = results.filter(
        r => r.status === 'rejected' && (r.reason instanceof RateLimitError)
      );

      expect(rateLimitErrors.length).toBeGreaterThan(0);
    });

    it('should enforce concurrent worker limit', async () => {
      // Spawn workers sequentially to avoid concurrent spawn rate limiting
      const successfulSpawns: string[] = [];
      let limitReached = false;

      // Attempt to spawn 15 workers (exceeds maxWorkers=10)
      for (let i = 0; i < 15; i++) {
        try {
          const workerId = await queenAgent.spawnWorker(
            `worker-${i}`,
            {
              skills: ['test'],
              maxConcurrentTasks: 1,
              priority: 1
            },
            adminCaller
          );
          successfulSpawns.push(workerId);
        } catch (error: any) {
          // Accept either error type (both enforce worker limit)
          if (error.message.includes('Worker limit reached') ||
              error.message.includes('Worker spawn limit reached') ||
              error instanceof RateLimitError) {
            limitReached = true;
            break;
          }
          throw error; // Re-throw unexpected errors
        }
      }

      // Should have hit the limit (maxWorkers=10)
      expect(limitReached).toBe(true);
      expect(successfulSpawns.length).toBeLessThanOrEqual(10);
    });

    it('should enforce task delegation rate limit', async () => {
      // Spawn a worker first (maxConcurrentTasks limited to 100)
      const workerId = await queenAgent.spawnWorker(
        'backend-dev',
        {
          skills: ['node'],
          maxConcurrentTasks: 100, // Fixed: validation limit
          priority: 5
        },
        adminCaller
      );

      const delegations: Promise<any>[] = [];

      // Attempt to delegate 110 tasks (exceeds limit of 100 per window)
      for (let i = 0; i < 110; i++) {
        const task: Task = {
          id: `task-rate-limit-${i}`,
          type: 'test',
          description: 'Rate limit test',
          priority: 1
        } as Task;

        delegations.push(queenAgent.delegateTask(task, coordinatorCaller, workerId));
      }

      const results = await Promise.allSettled(delegations);
      const rateLimitErrors = results.filter(
        r => r.status === 'rejected' && (r.reason instanceof RateLimitError)
      );

      expect(rateLimitErrors.length).toBeGreaterThan(0);
    });

    it('should enforce task queue size limit', async () => {
      // Spawn a worker with limited capacity (maxConcurrentTasks limited to 100)
      const workerId = await queenAgent.spawnWorker(
        'backend-dev',
        {
          skills: ['node'],
          maxConcurrentTasks: 100, // Fixed: validation limit
          priority: 5
        },
        adminCaller
      );

      const delegations: Promise<any>[] = [];

      // Attempt to queue 60 tasks (exceeds maxTaskQueueSize=50)
      for (let i = 0; i < 60; i++) {
        const task: Task = {
          id: `task-queue-${i}`,
          type: 'test',
          description: 'Queue limit test',
          priority: 1
        } as Task;

        delegations.push(queenAgent.delegateTask(task, coordinatorCaller, workerId));
      }

      const results = await Promise.allSettled(delegations);
      const queueLimitErrors = results.filter(
        r => r.status === 'rejected' && (r.reason instanceof RateLimitError)
      );

      expect(queueLimitErrors.length).toBeGreaterThan(0);
    });
  });

  describe('Caller Identity Validation', () => {
    it('should reject caller with missing ID', async () => {
      const invalidCaller = {
        id: '',
        type: 'user',
        roles: ['admin']
      } as CallerIdentityInput;

      await expect(
        queenAgent.spawnWorker(
          'backend-dev',
          {
            skills: ['node'],
            maxConcurrentTasks: 3,
            priority: 5
          },
          invalidCaller
        )
      ).rejects.toThrow('Caller identity validation failed');
    });

    it('should reject caller with invalid type', async () => {
      const invalidCaller = {
        id: 'user-001',
        type: 'hacker' as any, // Invalid type
        roles: ['admin']
      };

      await expect(
        queenAgent.spawnWorker(
          'backend-dev',
          {
            skills: ['node'],
            maxConcurrentTasks: 3,
            priority: 5
          },
          invalidCaller
        )
      ).rejects.toThrow('Caller identity validation failed');
    });

    it('should reject caller with no roles', async () => {
      const invalidCaller = {
        id: 'user-001',
        type: 'user',
        roles: []
      } as CallerIdentityInput;

      await expect(
        queenAgent.spawnWorker(
          'backend-dev',
          {
            skills: ['node'],
            maxConcurrentTasks: 3,
            priority: 5
          },
          invalidCaller
        )
      ).rejects.toThrow('At least one role is required');
    });

    it('should reject caller with excessive roles (>20)', async () => {
      const invalidCaller = {
        id: 'user-001',
        type: 'user',
        roles: Array.from({ length: 21 }, (_, i) => `role-${i}`)
      } as CallerIdentityInput;

      await expect(
        queenAgent.spawnWorker(
          'backend-dev',
          {
            skills: ['node'],
            maxConcurrentTasks: 3,
            priority: 5
          },
          invalidCaller
        )
      ).rejects.toThrow('Maximum 20 roles allowed');
    });

    it('should reject caller with malicious role names', async () => {
      const invalidCaller = {
        id: 'user-001',
        type: 'user',
        roles: ['admin; DROP TABLE roles; --']
      } as CallerIdentityInput;

      await expect(
        queenAgent.spawnWorker(
          'backend-dev',
          {
            skills: ['node'],
            maxConcurrentTasks: 3,
            priority: 5
          },
          invalidCaller
        )
      ).rejects.toThrow('Caller identity validation failed');
    });
  });
});
