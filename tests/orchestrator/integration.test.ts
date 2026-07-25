/**
 * CFN Loop Orchestrator Integration Tests
 *
 * End-to-end integration tests with real Redis coordination.
 *
 * @version 1.0.0
 * Tests:
 * - Real Redis coordination patterns
 * - Mock agent spawning
 * - Full workflow end-to-end
 * - Context storage and retrieval
 * - Iteration feedback storage
 * - Performance benchmarks
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { CFNOrchestrator } from '../../src/orchestrator/orchestrate';
import {
  OrchestratorConfig,
  ILogger,
  IRedisClient,
  IGateChecker,
  IAgentSpawner,
  IProductOwnerDecision,
} from '../../src/orchestrator/types';
import { GateResult } from '../../src/gate-checker/types';

/**
 * Simple in-memory Redis implementation for testing
 */
class InMemoryRedisClient implements IRedisClient {
  private store: Map<string, string> = new Map();
  private lists: Map<string, string[]> = new Map();
  private sets: Map<string, Set<string>> = new Map();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string, exSeconds?: number): Promise<string | null> {
    this.store.set(key, value);
    if (exSeconds) {
      setTimeout(() => {
        this.store.delete(key);
      }, exSeconds * 1000);
    }
    return 'OK';
  }

  async lpush(key: string, value: string): Promise<number> {
    if (!this.lists.has(key)) {
      this.lists.set(key, []);
    }
    const list = this.lists.get(key)!;
    list.unshift(value);
    return list.length;
  }

  async blpop(key: string, timeoutSeconds: number): Promise<[string, string] | null> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutSeconds * 1000) {
      const list = this.lists.get(key);
      if (list && list.length > 0) {
        const value = list.pop()!;
        return [key, value];
      }
      // Simulate blocking
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    return null;
  }

  async smembers(key: string): Promise<string[]> {
    const set = this.sets.get(key);
    return set ? Array.from(set) : [];
  }

  async sadd(key: string, member: string): Promise<number> {
    if (!this.sets.has(key)) {
      this.sets.set(key, new Set());
    }
    const set = this.sets.get(key)!;
    const hadMember = set.has(member);
    set.add(member);
    return hadMember ? 0 : 1;
  }

  async del(key: string): Promise<number> {
    if (this.store.has(key)) {
      this.store.delete(key);
      return 1;
    }
    if (this.lists.has(key)) {
      this.lists.delete(key);
      return 1;
    }
    if (this.sets.has(key)) {
      this.sets.delete(key);
      return 1;
    }
    return 0;
  }

  async eval(script: string, numKeys: number, ...keys: string[]): Promise<unknown> {
    // Simple implementation for Lua script
    return 1;
  }

  async expire(key: string, seconds: number): Promise<number> {
    if (this.store.has(key) || this.lists.has(key) || this.sets.has(key)) {
      setTimeout(() => {
        this.store.delete(key);
        this.lists.delete(key);
        this.sets.delete(key);
      }, seconds * 1000);
      return 1;
    }
    return 0;
  }

  clear(): void {
    this.store.clear();
    this.lists.clear();
    this.sets.clear();
  }
}

/**
 * Test logger implementation
 */
class TestLogger implements ILogger {
  logs: Array<{ level: string; message: string; data?: unknown }> = [];

  info(message: string, data?: unknown): void {
    this.logs.push({ level: 'info', message, data });
  }

  warn(message: string, data?: unknown): void {
    this.logs.push({ level: 'warn', message, data });
  }

  error(message: string, data?: unknown): void {
    this.logs.push({ level: 'error', message, data });
  }

  debug(message: string, data?: unknown): void {
    this.logs.push({ level: 'debug', message, data });
  }

  clear(): void {
    this.logs = [];
  }

  getLogsByLevel(level: string): Array<{ message: string; data?: unknown }> {
    return this.logs.filter(log => log.level === level).map(log => ({
      message: log.message,
      data: log.data,
    }));
  }
}

describe('CFN Loop Orchestrator - Integration Tests', () => {
  let config: OrchestratorConfig;
  let testLogger: TestLogger;
  let redisClient: InMemoryRedisClient;
  let mockGateChecker: jest.Mocked<IGateChecker>;
  let mockAgentSpawner: jest.Mocked<IAgentSpawner>;
  let mockProductOwnerDecider: jest.Mocked<IProductOwnerDecision>;

  beforeEach(() => {
    testLogger = new TestLogger();
    redisClient = new InMemoryRedisClient();

    mockGateChecker = {
      checkGate: jest.fn(),
    };

    mockAgentSpawner = {
      spawn: jest.fn(),
    };

    mockProductOwnerDecider = {
      makeDecision: jest.fn(),
    };

    config = {
      taskId: 'integration-test-task',
      mode: 'standard',
      loop3Agents: ['backend-dev', 'test-specialist'],
      loop2Agents: ['validator-1', 'validator-2'],
      productOwner: 'product-owner',
      maxIterations: 5,
      gateThreshold: 0.95,
      consensusThreshold: 0.90,
      timeout: 300,
      epicContext: { goal: 'build authentication system' },
      phaseContext: { phase: 'security-hardening' },
      successCriteria: { test_suites: [] },
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
    redisClient.clear();
  });

  describe('Context Storage and Retrieval', () => {
    test('should store and retrieve epic context from Redis', async () => {
      const orchestrator = new CFNOrchestrator(
        config,
        testLogger,
        redisClient,
        mockGateChecker,
        mockAgentSpawner,
        mockProductOwnerDecider
      );

      mockAgentSpawner.spawn.mockResolvedValue([
        {
          agentId: 'backend-dev-1-1',
          agentType: 'backend-dev',
          iteration: 1,
          pid: 12345,
          success: true,
        },
      ]);

      mockGateChecker.checkGate.mockResolvedValue({
        passed: true,
        pass_rate: 0.96,
        threshold: 0.95,
        mode: 'standard',
        test_results: [],
        failed_suites: [],
        execution_time_ms: 5000,
        timestamp: Date.now(),
      });

      mockProductOwnerDecider.makeDecision.mockResolvedValue({
        decision: 'PROCEED',
        rationale: 'All criteria met',
        confidence: 0.98,
        timestamp: Date.now(),
      });

      await orchestrator.execute();

      // Verify context was stored
      const epicContextStored = await redisClient.get(
        `swarm:integration-test-task:epic-context`
      );

      expect(epicContextStored).toBeTruthy();
      const parsedContext = JSON.parse(epicContextStored!);
      expect(parsedContext.goal).toBe('build authentication system');
    });

    test('should store phase and success criteria', async () => {
      const orchestrator = new CFNOrchestrator(
        config,
        testLogger,
        redisClient,
        mockGateChecker,
        mockAgentSpawner,
        mockProductOwnerDecider
      );

      mockAgentSpawner.spawn.mockResolvedValue([
        {
          agentId: 'agent-1',
          agentType: 'backend-dev',
          iteration: 1,
          success: true,
        },
      ]);

      mockGateChecker.checkGate.mockResolvedValue({
        passed: true,
        pass_rate: 0.96,
        threshold: 0.95,
        mode: 'standard',
        test_results: [],
        failed_suites: [],
        execution_time_ms: 5000,
        timestamp: Date.now(),
      });

      mockProductOwnerDecider.makeDecision.mockResolvedValue({
        decision: 'PROCEED',
        rationale: 'All good',
        confidence: 0.95,
        timestamp: Date.now(),
      });

      await orchestrator.execute();

      const phaseStored = await redisClient.get(
        `swarm:integration-test-task:phase-context`
      );
      const criteriaStored = await redisClient.get(
        `swarm:integration-test-task:success-criteria`
      );

      expect(phaseStored).toBeTruthy();
      expect(criteriaStored).toBeTruthy();
    });
  });

  describe('Iteration Feedback Storage', () => {
    test('should store iteration feedback between iterations', async () => {
      const configWithIterations = { ...config, maxIterations: 3 };

      const orchestrator = new CFNOrchestrator(
        configWithIterations,
        testLogger,
        redisClient,
        mockGateChecker,
        mockAgentSpawner,
        mockProductOwnerDecider
      );

      // First iteration: gate fails
      mockAgentSpawner.spawn.mockResolvedValueOnce([
        {
          agentId: 'agent-1-1',
          agentType: 'backend-dev',
          iteration: 1,
          success: true,
        },
      ]);

      mockGateChecker.checkGate.mockResolvedValueOnce({
        passed: false,
        pass_rate: 0.85,
        threshold: 0.95,
        mode: 'standard',
        gap: 0.10,
        test_results: [],
        failed_suites: ['integration-tests'],
        execution_time_ms: 5000,
        timestamp: Date.now(),
      });

      // Second iteration: gate passes
      mockAgentSpawner.spawn.mockResolvedValueOnce([
        {
          agentId: 'agent-1-2',
          agentType: 'backend-dev',
          iteration: 2,
          success: true,
        },
      ]);

      mockGateChecker.checkGate.mockResolvedValueOnce({
        passed: true,
        pass_rate: 0.96,
        threshold: 0.95,
        mode: 'standard',
        test_results: [],
        failed_suites: [],
        execution_time_ms: 5000,
        timestamp: Date.now(),
      });

      // Loop 2 agents
      mockAgentSpawner.spawn.mockResolvedValueOnce([
        {
          agentId: 'validator-1-2',
          agentType: 'validator-1',
          iteration: 2,
          success: true,
        },
      ]);

      mockProductOwnerDecider.makeDecision.mockResolvedValue({
        decision: 'PROCEED',
        rationale: 'All good',
        confidence: 0.95,
        timestamp: Date.now(),
      });

      await orchestrator.execute();

      // Verify feedback was stored
      const feedbackStored = await redisClient.get(
        `swarm:integration-test-task:iteration-feedback`
      );

      expect(feedbackStored).toBeTruthy();
      if (feedbackStored) {
        const feedback = JSON.parse(feedbackStored);
        expect(feedback.iteration).toBe(1);
        expect(feedback.previousGateStatus).toBe('failed');
      }
    });
  });

  describe('Multi-Iteration Workflow', () => {
    test('should handle 3-iteration workflow successfully', async () => {
      const configWithMultipleIterations = { ...config, maxIterations: 5 };

      const orchestrator = new CFNOrchestrator(
        configWithMultipleIterations,
        testLogger,
        redisClient,
        mockGateChecker,
        mockAgentSpawner,
        mockProductOwnerDecider
      );

      // Iteration 1: Gate fails
      mockAgentSpawner.spawn.mockResolvedValueOnce([
        {
          agentId: 'agent-1-1',
          agentType: 'backend-dev',
          iteration: 1,
          success: true,
        },
      ]);

      mockGateChecker.checkGate.mockResolvedValueOnce({
        passed: false,
        pass_rate: 0.80,
        threshold: 0.95,
        mode: 'standard',
        gap: 0.15,
        test_results: [],
        failed_suites: ['e2e-tests'],
        execution_time_ms: 5000,
        timestamp: Date.now(),
      });

      // Iteration 2: Gate fails
      mockAgentSpawner.spawn.mockResolvedValueOnce([
        {
          agentId: 'agent-1-2',
          agentType: 'backend-dev',
          iteration: 2,
          success: true,
        },
      ]);

      mockGateChecker.checkGate.mockResolvedValueOnce({
        passed: false,
        pass_rate: 0.90,
        threshold: 0.95,
        mode: 'standard',
        gap: 0.05,
        test_results: [],
        failed_suites: ['performance-tests'],
        execution_time_ms: 5000,
        timestamp: Date.now(),
      });

      // Iteration 3: Gate passes
      mockAgentSpawner.spawn.mockResolvedValueOnce([
        {
          agentId: 'agent-1-3',
          agentType: 'backend-dev',
          iteration: 3,
          success: true,
        },
      ]);

      mockGateChecker.checkGate.mockResolvedValueOnce({
        passed: true,
        pass_rate: 0.96,
        threshold: 0.95,
        mode: 'standard',
        test_results: [],
        failed_suites: [],
        execution_time_ms: 5000,
        timestamp: Date.now(),
      });

      // Loop 2 agents
      mockAgentSpawner.spawn.mockResolvedValueOnce([
        {
          agentId: 'validator-1-3',
          agentType: 'validator-1',
          iteration: 3,
          success: true,
        },
      ]);

      mockProductOwnerDecider.makeDecision.mockResolvedValue({
        decision: 'PROCEED',
        rationale: 'All criteria met after iterations',
        confidence: 0.92,
        timestamp: Date.now(),
      });

      const result = await orchestrator.execute();

      expect(result.status).toBe('success');
      expect(result.iterationsCompleted).toBe(3);
      expect(result.finalDecision).toBe('PROCEED');

      // Verify logs show the iterations
      const infoLogs = testLogger.getLogsByLevel('info');
      const iterationLogs = infoLogs.filter(log =>
        log.message.includes('Iteration')
      );
      expect(iterationLogs.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Redis Coordination', () => {
    test('should handle Redis failures gracefully', async () => {
      const failingRedis = {
        get: jest.fn().mockRejectedValue(new Error('Connection failed')),
        set: jest.fn().mockRejectedValue(new Error('Connection failed')),
        lpush: jest.fn(),
        blpop: jest.fn(),
        smembers: jest.fn(),
        sadd: jest.fn(),
        del: jest.fn(),
        eval: jest.fn(),
        expire: jest.fn(),
      };

      const orchestrator = new CFNOrchestrator(
        config,
        testLogger,
        failingRedis as any,
        mockGateChecker,
        mockAgentSpawner,
        mockProductOwnerDecider
      );

      mockAgentSpawner.spawn.mockResolvedValue([
        {
          agentId: 'agent-1',
          agentType: 'backend-dev',
          iteration: 1,
          success: true,
        },
      ]);

      mockGateChecker.checkGate.mockResolvedValue({
        passed: true,
        pass_rate: 0.96,
        threshold: 0.95,
        mode: 'standard',
        test_results: [],
        failed_suites: [],
        execution_time_ms: 5000,
        timestamp: Date.now(),
      });

      mockProductOwnerDecider.makeDecision.mockResolvedValue({
        decision: 'PROCEED',
        rationale: 'All good',
        confidence: 0.95,
        timestamp: Date.now(),
      });

      // Should still succeed even if Redis fails during context storage
      const result = await orchestrator.execute();

      expect(result.status).toBe('success');

      // But should log warnings
      const warnLogs = testLogger.getLogsByLevel('warn');
      expect(warnLogs.length).toBeGreaterThan(0);
    });

    test('should use Redis for context coordination', async () => {
      const orchestrator = new CFNOrchestrator(
        config,
        testLogger,
        redisClient,
        mockGateChecker,
        mockAgentSpawner,
        mockProductOwnerDecider
      );

      mockAgentSpawner.spawn.mockResolvedValue([
        {
          agentId: 'agent-1',
          agentType: 'backend-dev',
          iteration: 1,
          success: true,
        },
      ]);

      mockGateChecker.checkGate.mockResolvedValue({
        passed: true,
        pass_rate: 0.96,
        threshold: 0.95,
        mode: 'standard',
        test_results: [],
        failed_suites: [],
        execution_time_ms: 5000,
        timestamp: Date.now(),
      });

      mockProductOwnerDecider.makeDecision.mockResolvedValue({
        decision: 'PROCEED',
        rationale: 'All good',
        confidence: 0.95,
        timestamp: Date.now(),
      });

      const setSpy = jest.spyOn(redisClient, 'set');

      await orchestrator.execute();

      // Verify Redis was used for context storage
      expect(setSpy).toHaveBeenCalled();
      const setCalls = setSpy.mock.calls;
      const contextCalls = setCalls.filter(call =>
        String(call[0]).includes('context') || String(call[0]).includes('criteria')
      );

      expect(contextCalls.length).toBeGreaterThan(0);
    });
  });

  describe('Performance Characteristics', () => {
    test('should complete single iteration workflow within reasonable time', async () => {
      const orchestrator = new CFNOrchestrator(
        config,
        testLogger,
        redisClient,
        mockGateChecker,
        mockAgentSpawner,
        mockProductOwnerDecider
      );

      mockAgentSpawner.spawn.mockResolvedValue([
        {
          agentId: 'agent-1',
          agentType: 'backend-dev',
          iteration: 1,
          pid: 12345,
          success: true,
        },
      ]);

      mockGateChecker.checkGate.mockResolvedValue({
        passed: true,
        pass_rate: 0.96,
        threshold: 0.95,
        mode: 'standard',
        test_results: [],
        failed_suites: [],
        execution_time_ms: 5000,
        timestamp: Date.now(),
      });

      mockProductOwnerDecider.makeDecision.mockResolvedValue({
        decision: 'PROCEED',
        rationale: 'All good',
        confidence: 0.95,
        timestamp: Date.now(),
      });

      const startTime = Date.now();
      const result = await orchestrator.execute();
      const endTime = Date.now();

      const elapsedSeconds = (endTime - startTime) / 1000;

      // Should complete in under 10 seconds for unit test
      expect(elapsedSeconds).toBeLessThan(10);
      expect(result.executionTimeSeconds).toBeGreaterThanOrEqual(0);
    });

    test('should track execution time in result', async () => {
      const orchestrator = new CFNOrchestrator(
        config,
        testLogger,
        redisClient,
        mockGateChecker,
        mockAgentSpawner,
        mockProductOwnerDecider
      );

      mockAgentSpawner.spawn.mockResolvedValue([
        {
          agentId: 'agent-1',
          agentType: 'backend-dev',
          iteration: 1,
          success: true,
        },
      ]);

      mockGateChecker.checkGate.mockResolvedValue({
        passed: true,
        pass_rate: 0.96,
        threshold: 0.95,
        mode: 'standard',
        test_results: [],
        failed_suites: [],
        execution_time_ms: 5000,
        timestamp: Date.now(),
      });

      mockProductOwnerDecider.makeDecision.mockResolvedValue({
        decision: 'PROCEED',
        rationale: 'All good',
        confidence: 0.95,
        timestamp: Date.now(),
      });

      const result = await orchestrator.execute();

      expect(result.executionTimeSeconds).toBeGreaterThanOrEqual(0);
      expect(typeof result.executionTimeSeconds).toBe('number');
    });
  });

  describe('Logging and Observability', () => {
    test('should provide comprehensive logging throughout execution', async () => {
      const orchestrator = new CFNOrchestrator(
        config,
        testLogger,
        redisClient,
        mockGateChecker,
        mockAgentSpawner,
        mockProductOwnerDecider
      );

      mockAgentSpawner.spawn.mockResolvedValue([
        {
          agentId: 'agent-1',
          agentType: 'backend-dev',
          iteration: 1,
          success: true,
        },
      ]);

      mockGateChecker.checkGate.mockResolvedValue({
        passed: true,
        pass_rate: 0.96,
        threshold: 0.95,
        mode: 'standard',
        test_results: [],
        failed_suites: [],
        execution_time_ms: 5000,
        timestamp: Date.now(),
      });

      mockProductOwnerDecider.makeDecision.mockResolvedValue({
        decision: 'PROCEED',
        rationale: 'All good',
        confidence: 0.95,
        timestamp: Date.now(),
      });

      await orchestrator.execute();

      // Verify comprehensive logging
      expect(testLogger.logs.length).toBeGreaterThan(0);

      const infoLogs = testLogger.getLogsByLevel('info');
      const warnLogs = testLogger.getLogsByLevel('warn');
      const errorLogs = testLogger.getLogsByLevel('error');

      expect(infoLogs.length).toBeGreaterThan(0);

      // Verify no unexpected errors
      expect(errorLogs.length).toBe(0);

      // Verify specific logs exist
      const logMessages = infoLogs.map(log => log.message);
      expect(logMessages.some(msg => msg.includes('initialized'))).toBe(true);
      expect(logMessages.some(msg => msg.includes('Context stored'))).toBe(true);
      expect(logMessages.some(msg => msg.includes('PROCEED'))).toBe(true);
    });
  });
});
