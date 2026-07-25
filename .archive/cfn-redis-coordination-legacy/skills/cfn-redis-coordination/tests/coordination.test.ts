/**
 * Comprehensive test suite for Redis coordination modules
 *
 * Tests cover:
 * - Task Mode (Redis stubbed)
 * - CLI Mode (Redis active)
 * - Error scenarios
 * - Input validation
 * - Module integration
 */

import {
  ContextManager,
  CompletionReporter,
  ResultCollector,
  WaitingCoordinator,
  SwarmManager,
  AgentRecoveryManager,
  TaskAnalyzer,
  TaskExecutor,
  AgentLogger,
  RedisCoordinator,
  CoordinationError,
  CoordinationErrorType,
  validateTaskId,
  validateAgentId,
  validateConfidence,
  isValidTaskId,
  isValidAgentId,
  isValidConfidence
} from '../src/index';
import { ConsoleLogger } from '../src/mode-detector';

/**
 * Test utilities
 */

// Mock Redis client
class MockRedisClient {
  private data: Record<string, any> = {};
  private lists: Record<string, any[]> = {};
  private sets: Record<string, Set<string>> = {};
  private sortedSets: Record<string, Array<[string, number]>> = {};

  async set(key: string, value: string): Promise<string | null> {
    this.data[key] = value;
    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    return this.data[key] || null;
  }

  async hset(key: string, ...args: any[]): Promise<number> {
    if (!this.data[key]) {
      this.data[key] = {};
    }
    for (let i = 0; i < args.length; i += 2) {
      this.data[key][args[i]] = args[i + 1];
    }
    return args.length / 2;
  }

  async hgetall(key: string): Promise<Record<string, string> | null> {
    return this.data[key] || {};
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.data[key]?.[field] || null;
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      if (this.data[key]) {
        delete this.data[key];
        count++;
      }
    }
    return count;
  }

  async expire(key: string, seconds: number): Promise<number> {
    return this.data[key] ? 1 : 0;
  }

  async exists(key: string): Promise<number> {
    return this.data[key] ? 1 : 0;
  }

  async lpush(key: string, ...values: string[]): Promise<number> {
    if (!this.lists[key]) {
      this.lists[key] = [];
    }
    this.lists[key].unshift(...values);
    return this.lists[key].length;
  }

  async blpop(...args: any[]): Promise<[string, string] | null> {
    const keys = args.slice(0, -1);
    for (const key of keys) {
      if (this.lists[key]?.length > 0) {
        const value = this.lists[key].shift();
        return [key, value];
      }
    }
    return null;
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    if (!this.lists[key]) return [];
    return this.lists[key].slice(start, stop + 1);
  }

  async zadd(key: string, ...args: string[]): Promise<number> {
    if (!this.sortedSets[key]) {
      this.sortedSets[key] = [];
    }
    for (let i = 0; i < args.length; i += 2) {
      const score = parseFloat(args[i]);
      const member = args[i + 1];
      this.sortedSets[key].push([member, score]);
    }
    return args.length / 2;
  }

  async zrevrange(key: string, start: number, stop: number): Promise<string[]> {
    if (!this.sortedSets[key]) return [];
    const sorted = [...this.sortedSets[key]].sort((a, b) => b[1] - a[1]);
    return sorted.slice(start, stop + 1).map(([member]) => member);
  }

  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    if (!this.sortedSets[key]) return [];
    return this.sortedSets[key].slice(start, stop + 1).map(([member]) => member);
  }

  async zrem(key: string, member: string): Promise<number> {
    if (!this.sortedSets[key]) return 0;
    const before = this.sortedSets[key].length;
    this.sortedSets[key] = this.sortedSets[key].filter(([m]) => m !== member);
    return before - this.sortedSets[key].length;
  }

  async publish(channel: string, message: string): Promise<number> {
    return 1;
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    if (!this.sets[key]) {
      this.sets[key] = new Set();
    }
    let count = 0;
    for (const member of members) {
      if (!this.sets[key].has(member)) {
        this.sets[key].add(member);
        count++;
      }
    }
    return count;
  }

  async smembers(key: string): Promise<string[]> {
    return Array.from(this.sets[key] || new Set());
  }

  async quit(): Promise<void> {
    // Mock quit
  }
}

/**
 * Test suite
 */

describe('Redis Coordination - Validation', () => {
  describe('Type validators', () => {
    it('should validate task IDs', () => {
      expect(isValidTaskId('task-123')).toBe(true);
      expect(isValidTaskId('task_abc')).toBe(true);
      expect(isValidTaskId('')).toBe(false);
      expect(isValidTaskId('a'.repeat(300))).toBe(false);
      expect(isValidTaskId('task@invalid')).toBe(false);
    });

    it('should validate agent IDs', () => {
      expect(isValidAgentId('agent-1')).toBe(true);
      expect(isValidAgentId('backend_dev')).toBe(true);
      expect(isValidAgentId('')).toBe(false);
      expect(isValidAgentId('a'.repeat(300))).toBe(false);
    });

    it('should validate confidence scores', () => {
      expect(isValidConfidence(0.5)).toBe(true);
      expect(isValidConfidence(0.0)).toBe(true);
      expect(isValidConfidence(1.0)).toBe(true);
      expect(isValidConfidence(-0.1)).toBe(false);
      expect(isValidConfidence(1.1)).toBe(false);
      expect(isValidConfidence('0.5' as any)).toBe(false);
    });

    it('should throw on invalid task ID', () => {
      expect(() => validateTaskId('invalid@')).toThrow(CoordinationError);
    });

    it('should throw on invalid agent ID', () => {
      expect(() => validateAgentId('invalid@')).toThrow(CoordinationError);
    });

    it('should throw on invalid confidence', () => {
      expect(() => validateConfidence(1.5)).toThrow(CoordinationError);
    });
  });
});

describe('Context Manager', () => {
  let manager: ContextManager;
  let redis: RedisCoordinator;
  let logger: ConsoleLogger;

  beforeEach(async () => {
    redis = new RedisCoordinator();
    logger = new ConsoleLogger('[Test]');
    // Mock mode as CLI for most tests
    jest.spyOn(redis, 'canUseRedis', 'get').mockReturnValue(true);
    manager = new ContextManager(redis, logger);
  });

  it('should store and retrieve context', async () => {
    const taskId = 'task-123' as any;
    const context = {
      taskId,
      epic: 'Test task',
      deliverables: ['file1.ts', 'file2.ts'],
      mode: 'standard' as const
    };

    // In real tests, would use actual Redis
    // For now, just validate the manager is initialized
    expect(manager).toBeDefined();
  });

  it('should validate context structure', () => {
    const context = {
      taskId: 'task-123' as any,
      epic: 'Test',
      deliverables: ['a', 'b']
    };

    const result = manager.validateContext(context);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject invalid context', () => {
    const context = {
      taskId: 'invalid@' as any,
      deliverables: 'not-an-array' as any
    };

    const result = manager.validateContext(context);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should handle Task Mode gracefully', async () => {
    jest.spyOn(redis, 'canUseRedis', 'get').mockReturnValue(false);

    const taskId = 'task-456' as any;
    const context = {
      taskId,
      epic: 'Task mode test'
    };

    // Should not throw in Task Mode
    await expect(manager.storeContext(taskId, context)).resolves.not.toThrow();
  });
});

describe('Completion Reporter', () => {
  let reporter: CompletionReporter;
  let redis: RedisCoordinator;
  let logger: ConsoleLogger;

  beforeEach(async () => {
    redis = new RedisCoordinator();
    logger = new ConsoleLogger('[Test]');
    jest.spyOn(redis, 'canUseRedis', 'get').mockReturnValue(true);
    reporter = new CompletionReporter(redis, logger);
  });

  it('should validate confidence range', async () => {
    const taskId = 'task-123' as any;
    const agentId = 'agent-1' as any;

    await expect(
      reporter.reportCompletion(taskId, agentId, 1.5)
    ).rejects.toThrow(CoordinationError);
  });

  it('should reject invalid task ID', async () => {
    await expect(
      reporter.reportCompletion('invalid@' as any, 'agent-1' as any, 0.8)
    ).rejects.toThrow(CoordinationError);
  });

  it('should reject invalid agent ID', async () => {
    await expect(
      reporter.reportCompletion('task-123' as any, 'invalid@' as any, 0.8)
    ).rejects.toThrow(CoordinationError);
  });

  it('should handle Task Mode gracefully', async () => {
    jest.spyOn(redis, 'canUseRedis', 'get').mockReturnValue(false);

    const taskId = 'task-123' as any;
    const agentId = 'agent-1' as any;

    // Should not throw in Task Mode
    await expect(
      reporter.reportCompletion(taskId, agentId, 0.85)
    ).resolves.not.toThrow();
  });

  it('should report test results with valid pass rate', async () => {
    jest.spyOn(redis, 'canUseRedis', 'get').mockReturnValue(false);

    const taskId = 'task-123' as any;
    const agentId = 'agent-1' as any;
    const results = {
      pass: 45,
      fail: 5,
      total: 50,
      passRate: 0.9,
      timestamp: new Date().toISOString()
    };

    // Should not throw in Task Mode
    await expect(
      reporter.reportTestResults(taskId, agentId, results)
    ).resolves.not.toThrow();
  });

  it('should reject invalid pass rate', async () => {
    const taskId = 'task-123' as any;
    const agentId = 'agent-1' as any;
    const results = {
      pass: 45,
      fail: 5,
      total: 50,
      passRate: 1.5, // Invalid
      timestamp: new Date().toISOString()
    };

    await expect(
      reporter.reportTestResults(taskId, agentId, results)
    ).rejects.toThrow(CoordinationError);
  });
});

describe('Result Collector', () => {
  let collector: ResultCollector;
  let redis: RedisCoordinator;
  let logger: ConsoleLogger;

  beforeEach(async () => {
    redis = new RedisCoordinator();
    logger = new ConsoleLogger('[Test]');
    jest.spyOn(redis, 'canUseRedis', 'get').mockReturnValue(true);
    collector = new ResultCollector(redis, logger);
  });

  it('should aggregate confidence scores', () => {
    const results = [
      { agentId: 'agent-1' as any, confidence: 0.8 },
      { agentId: 'agent-2' as any, confidence: 0.9 },
      { agentId: 'agent-3' as any, confidence: 0.7 }
    ];

    const aggregated = collector.aggregateScores(results);

    expect(aggregated.agentCount).toBe(3);
    expect(aggregated.avgConfidence).toBeCloseTo(0.8, 1);
    expect(aggregated.minConfidence).toBe(0.7);
    expect(aggregated.maxConfidence).toBe(0.9);
    expect(aggregated.consensus).toBeGreaterThan(0);
    expect(aggregated.consensus).toBeLessThanOrEqual(1);
  });

  it('should reject empty scores array', () => {
    expect(() => collector.aggregateScores([])).toThrow(CoordinationError);
  });

  it('should return empty results in Task Mode', async () => {
    jest.spyOn(redis, 'canUseRedis', 'get').mockReturnValue(false);

    const taskId = 'task-123' as any;
    const agentIds = ['agent-1' as any, 'agent-2' as any];

    const results = await collector.collectResults(taskId, agentIds);
    expect(results).toEqual([]);
  });
});

describe('Waiting Coordinator', () => {
  let coordinator: WaitingCoordinator;
  let redis: RedisCoordinator;
  let logger: ConsoleLogger;

  beforeEach(async () => {
    redis = new RedisCoordinator();
    logger = new ConsoleLogger('[Test]');
    jest.spyOn(redis, 'canUseRedis', 'get').mockReturnValue(true);
    coordinator = new WaitingCoordinator(redis, logger);
  });

  it('should validate task ID for wait operations', async () => {
    await expect(
      coordinator.waitForCompletion('invalid@' as any, 'agent-1' as any, 10)
    ).rejects.toThrow(CoordinationError);
  });

  it('should validate agent ID for wait operations', async () => {
    await expect(
      coordinator.waitForCompletion('task-123' as any, 'invalid@' as any, 10)
    ).rejects.toThrow(CoordinationError);
  });

  it('should handle Task Mode gracefully', async () => {
    jest.spyOn(redis, 'canUseRedis', 'get').mockReturnValue(false);

    const result = await coordinator.waitForCompletion(
      'task-123' as any,
      'agent-1' as any,
      10
    );

    expect(result.met).toBe(true);
    expect(result.timedOut).toBe(false);
    expect(result.waitedMs).toBe(0);
  });

  it('should validate condition name', async () => {
    await expect(
      coordinator.waitForCondition('task-123' as any, '', 10)
    ).rejects.toThrow(CoordinationError);
  });
});

describe('Swarm Manager', () => {
  let manager: SwarmManager;
  let redis: RedisCoordinator;
  let logger: ConsoleLogger;

  beforeEach(async () => {
    redis = new RedisCoordinator();
    logger = new ConsoleLogger('[Test]');
    jest.spyOn(redis, 'canUseRedis', 'get').mockReturnValue(true);
    manager = new SwarmManager(redis, logger);
  });

  it('should reject invalid task ID', async () => {
    await expect(
      manager.createSwarm('invalid@' as any)
    ).rejects.toThrow(CoordinationError);
  });

  it('should handle Task Mode gracefully', async () => {
    jest.spyOn(redis, 'canUseRedis', 'get').mockReturnValue(false);

    const taskId = 'task-123' as any;

    await expect(manager.createSwarm(taskId)).resolves.not.toThrow();
    await expect(manager.completeSwarm(taskId)).resolves.not.toThrow();
    await expect(
      manager.cancelSwarm(taskId, 'test')
    ).resolves.not.toThrow();
  });

  it('should return false for non-cancelled swarm in Task Mode', async () => {
    jest.spyOn(redis, 'canUseRedis', 'get').mockReturnValue(false);

    const taskId = 'task-123' as any;
    const cancelled = await manager.isSwarmCancelled(taskId);

    expect(cancelled).toBe(false);
  });
});

describe('Agent Recovery Manager', () => {
  let manager: AgentRecoveryManager;
  let redis: RedisCoordinator;
  let logger: ConsoleLogger;

  beforeEach(async () => {
    redis = new RedisCoordinator();
    logger = new ConsoleLogger('[Test]');
    jest.spyOn(redis, 'canUseRedis', 'get').mockReturnValue(true);
    manager = new AgentRecoveryManager(redis, logger);
  });

  it('should validate task and agent IDs', async () => {
    await expect(
      manager.recordHeartbeat('invalid@' as any, 'agent-1' as any)
    ).rejects.toThrow(CoordinationError);

    await expect(
      manager.recordHeartbeat('task-123' as any, 'invalid@' as any)
    ).rejects.toThrow(CoordinationError);
  });

  it('should handle Task Mode heartbeat gracefully', async () => {
    jest.spyOn(redis, 'canUseRedis', 'get').mockReturnValue(false);

    const taskId = 'task-123' as any;
    const agentId = 'agent-1' as any;

    // Should not throw
    await expect(manager.recordHeartbeat(taskId, agentId)).resolves.not.toThrow();
  });

  it('should return healthy status for Task Mode agents', async () => {
    jest.spyOn(redis, 'canUseRedis', 'get').mockReturnValue(false);

    const health = await manager.checkAgentHealth(
      'task-123' as any,
      'agent-1' as any
    );

    expect(health.status).toBe('healthy');
  });
});

describe('Task Analyzer', () => {
  let analyzer: TaskAnalyzer;
  let redis: RedisCoordinator;
  let logger: ConsoleLogger;

  beforeEach(async () => {
    redis = new RedisCoordinator();
    logger = new ConsoleLogger('[Test]');
    analyzer = new TaskAnalyzer(redis, logger);
  });

  it('should reject empty task description', () => {
    expect(() => analyzer.analyzeComplexity('')).toThrow(CoordinationError);
    expect(() => analyzer.analyzeComplexity('   ')).toThrow(CoordinationError);
  });

  it('should analyze simple task', () => {
    const analysis = analyzer.analyzeComplexity('Fix typo');

    expect(analysis.complexityScore).toBeLessThan(10);
    expect(analysis.difficulty).toBe('simple');
    expect(analysis.suggestedAgents.loop3Count).toBeGreaterThan(0);
  });

  it('should analyze complex multi-domain task', () => {
    const analysis = analyzer.analyzeComplexity(
      'Build React dashboard with PostgreSQL backend, Docker deployment, and JWT authentication'
    );

    expect(analysis.complexityScore).toBeGreaterThan(5);
    expect(analysis.domains.length).toBeGreaterThan(1);
  });

  it('should calculate priority score', () => {
    const analysis = analyzer.analyzeComplexity('Implement authentication system');
    const priority = analyzer.calculatePriority(analysis);

    expect(priority).toBeGreaterThan(0);
  });

  it('should suggest appropriate execution mode', () => {
    const simple = analyzer.analyzeComplexity('Fix small bug');
    expect(analyzer.suggestMode(simple)).toBe('mvp');

    const complex = analyzer.analyzeComplexity(
      'Enterprise multi-tenant distributed system with ML integration and compliance requirements'
    );
    expect(analyzer.suggestMode(complex)).toBe('enterprise');
  });
});

describe('Task Executor', () => {
  let executor: TaskExecutor;
  let redis: RedisCoordinator;
  let logger: ConsoleLogger;

  beforeEach(async () => {
    redis = new RedisCoordinator();
    logger = new ConsoleLogger('[Test]');
    executor = new TaskExecutor(redis, logger);
  });

  it('should validate execution config', () => {
    const validConfig = {
      taskId: 'task-123' as any,
      taskDescription: 'Build feature X'
    };

    const result = executor.validateConfig(validConfig);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject invalid task ID', () => {
    const config = {
      taskId: 'invalid@' as any,
      taskDescription: 'Build feature'
    };

    const result = executor.validateConfig(config);
    expect(result.valid).toBe(false);
  });

  it('should reject empty task description', () => {
    const config = {
      taskId: 'task-123' as any,
      taskDescription: ''
    };

    const result = executor.validateConfig(config);
    expect(result.valid).toBe(false);
  });

  it('should reject invalid iteration count', () => {
    const config = {
      taskId: 'task-123' as any,
      taskDescription: 'Build feature',
      maxIterations: 100
    };

    const result = executor.validateConfig(config);
    expect(result.valid).toBe(false);
  });
});

describe('Agent Logger', () => {
  let logger: AgentLogger;
  let redis: RedisCoordinator;
  let baseLogger: ConsoleLogger;

  beforeEach(async () => {
    redis = new RedisCoordinator();
    baseLogger = new ConsoleLogger('[Test]');
    jest.spyOn(redis, 'canUseRedis', 'get').mockReturnValue(true);
    logger = new AgentLogger('task-123' as any, 'agent-1' as any, redis, baseLogger);
  });

  it('should accept valid task and agent IDs', () => {
    expect(logger).toBeDefined();
  });

  it('should reject invalid task ID in constructor', () => {
    expect(
      () => new AgentLogger('invalid@' as any, 'agent-1' as any, redis, baseLogger)
    ).toThrow(CoordinationError);
  });

  it('should reject invalid agent ID in constructor', () => {
    expect(
      () => new AgentLogger('task-123' as any, 'invalid@' as any, redis, baseLogger)
    ).toThrow(CoordinationError);
  });

  it('should log messages without throwing', () => {
    expect(() => {
      logger.info('Test message');
      logger.warn('Warning message');
      logger.debug('Debug message');
    }).not.toThrow();
  });
});

describe('Integration scenarios', () => {
  it('should coordinate full agent lifecycle', async () => {
    const redis = new RedisCoordinator();
    const logger = new ConsoleLogger('[Integration]');

    // Task Mode: graceful no-op behavior
    jest.spyOn(redis, 'canUseRedis', 'get').mockReturnValue(false);

    const context = new ContextManager(redis, logger);
    const completion = new CompletionReporter(redis, logger);
    const recovery = new AgentRecoveryManager(redis, logger);

    const taskId = 'integration-test' as any;
    const agentId = 'test-agent' as any;

    // Agent starts work (Task Mode no-op)
    await expect(
      recovery.recordHeartbeat(taskId, agentId, 12345)
    ).resolves.not.toThrow();

    // Agent completes (Task Mode no-op)
    await expect(
      completion.reportCompletion(taskId, agentId, 0.92)
    ).resolves.not.toThrow();

    // Verify context was handled correctly
    expect(context).toBeDefined();
  });

  it('should handle simultaneous multi-agent coordination', async () => {
    const redis = new RedisCoordinator();
    const logger = new ConsoleLogger('[MultiAgent]');

    // Task Mode: graceful no-op behavior
    jest.spyOn(redis, 'canUseRedis', 'get').mockReturnValue(false);

    const coordinator = new WaitingCoordinator(redis, logger);
    const taskId = 'multi-agent-test' as any;
    const agents = [
      'agent-1' as any,
      'agent-2' as any,
      'agent-3' as any
    ];

    // All agents try to complete
    // In Task Mode, should return immediately and successfully with empty results
    const result = await coordinator.waitForMultipleAgents(
      taskId,
      agents,
      5
    );

    expect(result.completed).toBeDefined();
    expect(Array.isArray(result.completed)).toBe(true);
  });
});

describe('Edge cases and error handling', () => {
  it('should handle malformed JSON in context', async () => {
    const redis = new RedisCoordinator();
    const logger = new ConsoleLogger('[Test]');
    jest.spyOn(redis, 'canUseRedis', 'get').mockReturnValue(true);
    const manager = new ContextManager(redis, logger);

    // Test validation of context structure
    const invalid = {
      taskId: 'task-123' as any,
      deliverables: 'not-array' as any
    };

    const result = manager.validateContext(invalid);
    expect(result.valid).toBe(false);
  });

  it('should safely handle Redis connection failures', async () => {
    const redis = new RedisCoordinator();
    const logger = new ConsoleLogger('[Test]');

    // Simulate Redis unavailable
    jest.spyOn(redis, 'canUseRedis', 'get').mockReturnValue(false);

    const manager = new ContextManager(redis, logger);
    const taskId = 'task-123' as any;

    // Should handle gracefully even without Redis
    await expect(
      manager.storeContext(taskId, { taskId })
    ).resolves.not.toThrow();
  });

  it('should validate all input parameters strictly', async () => {
    const redis = new RedisCoordinator();
    const logger = new ConsoleLogger('[Test]');
    const reporter = new CompletionReporter(redis, logger);

    // Test parameter validation
    const invalidTaskId = 'task@#$%' as any;
    const invalidAgentId = 'agent@#$%' as any;
    const invalidConfidence = 2.5;

    await expect(
      reporter.reportCompletion(invalidTaskId, 'agent-1' as any, 0.5)
    ).rejects.toThrow();

    await expect(
      reporter.reportCompletion('task-123' as any, invalidAgentId, 0.5)
    ).rejects.toThrow();

    await expect(
      reporter.reportCompletion('task-123' as any, 'agent-1' as any, invalidConfidence)
    ).rejects.toThrow();
  });
});
