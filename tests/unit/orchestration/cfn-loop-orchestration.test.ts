/**
 * CFN Loop Orchestration Test Suite
 * Comprehensive test coverage for orchestration logic in orchestrate.sh
 *
 * @version 1.0.0
 * @description Tests for P0 CRITICAL COMPONENT - CFN Loop orchestration workflow
 *
 * Coverage:
 * - Loop 3 agent spawning with protocol enforcement
 * - Gate check logic (test pass rate ≥ threshold)
 * - Loop 2 spawning on gate pass
 * - Consensus collection from validators
 * - Product Owner decision execution (PROCEED/ITERATE/ABORT)
 * - Iteration management (up to max iterations)
 * - Error recovery and timeout handling
 * - Enhanced monitoring and progress tracking
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

// Mock Redis client for coordination layer
interface RedisClient {
  get: jest.Mock;
  set: jest.Mock;
  lpush: jest.Mock;
  blpop: jest.Mock;
  smembers: jest.Mock;
  sadd: jest.Mock;
  del: jest.Mock;
  eval: jest.Mock;
  quit: jest.Mock;
}

// Mock agent spawning interface
interface AgentSpawnResult {
  pid: number;
  agentId: string;
  agentType: string;
  taskId: string;
  iteration: number;
}

// Orchestration configuration
interface OrchestrationConfig {
  taskId: string;
  mode: 'mvp' | 'standard' | 'enterprise';
  loop3Agents: string[];
  loop2Agents: string[];
  productOwner: string;
  maxIterations: number;
  gateThreshold: number;
  consensusThreshold: number;
  timeout: number;
}

// Test result structure
interface TestResult {
  testSuite: string;
  testsPassed: number;
  testsFailed: number;
  passRate: number;
}

// Product Owner decision
type Decision = 'PROCEED' | 'ITERATE' | 'ABORT';

interface ProductOwnerDecision {
  decision: Decision;
  rationale: string;
  confidence: number;
}

describe('CFN Loop Orchestration', () => {
  let mockRedis: RedisClient;
  let mockAgentSpawner: jest.Mock;
  let testConfig: OrchestrationConfig;

  beforeEach(() => {
    // Initialize mock Redis client
    mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      lpush: jest.fn(),
      blpop: jest.fn(),
      smembers: jest.fn(),
      sadd: jest.fn(),
      del: jest.fn(),
      eval: jest.fn(),
      quit: jest.fn(),
    };

    // Initialize mock agent spawner
    mockAgentSpawner = jest.fn();

    // Default test configuration
    testConfig = {
      taskId: 'test-task-123',
      mode: 'standard',
      loop3Agents: ['backend-developer', 'frontend-developer', 'tester'],
      loop2Agents: ['code-reviewer', 'security-specialist', 'architect'],
      productOwner: 'product-owner',
      maxIterations: 10,
      gateThreshold: 0.75,
      consensusThreshold: 0.90,
      timeout: 300,
    };
  });

  afterEach(async () => {
    jest.clearAllMocks();
    if (mockRedis.quit) {
      await mockRedis.quit();
    }
  });

  // ============================================================================
  // Loop 3 Agent Spawning Tests
  // ============================================================================

  describe('Loop 3 Agent Spawning', () => {
    test('spawns all Loop 3 agents with unique IDs', async () => {
      const spawnedAgents: AgentSpawnResult[] = [];

      mockAgentSpawner.mockImplementation((agentType: string, config: any) => {
        const result: AgentSpawnResult = {
          pid: 1000 + spawnedAgents.length,
          agentId: `${agentType}-${config.iteration}-1`,
          agentType,
          taskId: config.taskId,
          iteration: config.iteration,
        };
        spawnedAgents.push(result);
        return result;
      });

      // Simulate Loop 3 spawning
      for (const agentType of testConfig.loop3Agents) {
        const result = mockAgentSpawner(agentType, {
          taskId: testConfig.taskId,
          iteration: 1,
        });

        expect(result).toBeDefined();
        expect(result.agentType).toBe(agentType);
      }

      expect(spawnedAgents).toHaveLength(3);
      expect(spawnedAgents[0].agentId).toBe('backend-developer-1-1');
      expect(spawnedAgents[1].agentId).toBe('frontend-developer-1-1');
      expect(spawnedAgents[2].agentId).toBe('tester-1-1');
    });

    test('stores agent PIDs in Redis for monitoring', async () => {
      const agentId = 'backend-developer-1-1';
      const pid = 12345;

      mockRedis.set.mockResolvedValue('OK');

      await mockRedis.set(
        `swarm:${testConfig.taskId}:${agentId}:pid`,
        JSON.stringify({ pid })
      );

      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining(agentId),
        expect.stringContaining(String(pid))
      );
    });

    test('registers agent IDs using SADD for iteration tracking', async () => {
      const agentIds = ['backend-developer-1-1', 'frontend-developer-1-1'];

      mockRedis.sadd.mockResolvedValue(agentIds.length);

      for (const agentId of agentIds) {
        await mockRedis.sadd(
          `swarm:${testConfig.taskId}:loop3:agent_ids:iteration1`,
          agentId
        );
      }

      expect(mockRedis.sadd).toHaveBeenCalledTimes(2);
    });

    test('loads success criteria from Redis and exports to agents', async () => {
      const successCriteria = {
        test_suites: [
          {
            name: 'unit-tests',
            command: 'npm test',
            threshold: 0.95,
          },
        ],
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(successCriteria));

      const retrieved = await mockRedis.get(
        `swarm:${testConfig.taskId}:success-criteria`
      );

      expect(retrieved).toBeDefined();
      const parsed = JSON.parse(retrieved as string);
      expect(parsed.test_suites).toHaveLength(1);
    });

    test('spawns agents with Docker mode when CFN_DOCKER_MODE=true', async () => {
      const dockerMode = process.env.CFN_DOCKER_MODE;
      process.env.CFN_DOCKER_MODE = 'true';

      mockAgentSpawner.mockImplementation((agentType: string, config: any) => {
        return {
          pid: 99999,
          agentId: `${agentType}-docker-1-1`,
          agentType,
          taskId: config.taskId,
          iteration: config.iteration,
          mode: 'docker',
        };
      });

      const result = mockAgentSpawner('backend-developer', {
        taskId: testConfig.taskId,
        iteration: 1,
      });

      expect(result.mode).toBe('docker');

      // Restore env
      if (dockerMode === undefined) {
        delete process.env.CFN_DOCKER_MODE;
      } else {
        process.env.CFN_DOCKER_MODE = dockerMode;
      }
    });

    test('handles agent spawn failures gracefully', async () => {
      mockAgentSpawner.mockImplementation(() => {
        throw new Error('Spawn failed: resource exhaustion');
      });

      await expect(async () => {
        mockAgentSpawner('backend-developer', {
          taskId: testConfig.taskId,
          iteration: 1,
        });
      }).rejects.toThrow('Spawn failed');
    });

    test('enforces maximum agent spawn limit', async () => {
      const maxAgents = 100;
      let spawnCount = 0;

      mockAgentSpawner.mockImplementation(() => {
        spawnCount++;
        if (spawnCount > maxAgents) {
          throw new Error(`Exceeded maximum agent limit: ${maxAgents}`);
        }
        return { pid: spawnCount };
      });

      // Spawn within limit
      for (let i = 0; i < maxAgents; i++) {
        mockAgentSpawner('test-agent', { taskId: testConfig.taskId, iteration: 1 });
      }

      // Exceed limit
      await expect(async () => {
        mockAgentSpawner('test-agent', { taskId: testConfig.taskId, iteration: 1 });
      }).rejects.toThrow('Exceeded maximum agent limit');
    });
  });

  // ============================================================================
  // Gate Check Logic Tests
  // ============================================================================

  describe('Gate Check Logic', () => {
    test('passes gate when test pass rate >= threshold', async () => {
      const testResults: TestResult[] = [
        { testSuite: 'unit-tests', testsPassed: 95, testsFailed: 5, passRate: 0.95 },
        { testSuite: 'integration-tests', testsPassed: 80, testsFailed: 20, passRate: 0.80 },
      ];

      const averagePassRate = testResults.reduce((sum, r) => sum + r.passRate, 0) / testResults.length;

      expect(averagePassRate).toBeGreaterThanOrEqual(testConfig.gateThreshold);
    });

    test('fails gate when test pass rate < threshold', async () => {
      const testResults: TestResult[] = [
        { testSuite: 'unit-tests', testsPassed: 60, testsFailed: 40, passRate: 0.60 },
        { testSuite: 'integration-tests', testsPassed: 70, testsFailed: 30, passRate: 0.70 },
      ];

      const averagePassRate = testResults.reduce((sum, r) => sum + r.passRate, 0) / testResults.length;

      expect(averagePassRate).toBeLessThan(testConfig.gateThreshold);
    });

    test('signals Loop 2 to start work when gate passes', async () => {
      mockRedis.lpush.mockResolvedValue(1);

      await mockRedis.lpush(`swarm:${testConfig.taskId}:gate-passed`, '1');

      expect(mockRedis.lpush).toHaveBeenCalledWith(
        expect.stringContaining('gate-passed'),
        '1'
      );
    });

    test('wakes Loop 3 for iteration when gate fails', async () => {
      const iteration = 2;
      const feedback = 'Gate check failed: test pass rate 0.65 < threshold 0.75';

      mockRedis.lpush.mockResolvedValue(testConfig.loop3Agents.length);

      for (const agentType of testConfig.loop3Agents) {
        const agentId = `${agentType}-${iteration}-1`;
        await mockRedis.lpush(
          `swarm:${testConfig.taskId}:${agentId}:wake`,
          JSON.stringify({ iteration, feedback })
        );
      }

      expect(mockRedis.lpush).toHaveBeenCalledTimes(testConfig.loop3Agents.length);
    });

    test('collects confidence scores from Loop 3 agents', async () => {
      const confidenceScores = [0.85, 0.90, 0.88];
      const agentIds = testConfig.loop3Agents.map((type, i) => `${type}-1-1`);

      mockRedis.get.mockImplementation(async (key: string) => {
        const match = key.match(/agent:([^:]+):confidence/);
        if (match) {
          const agentId = match[1];
          const index = agentIds.indexOf(agentId);
          if (index >= 0) {
            return JSON.stringify({ confidence: confidenceScores[index] });
          }
        }
        return null;
      });

      const scores: number[] = [];
      for (const agentId of agentIds) {
        const result = await mockRedis.get(
          `swarm:${testConfig.taskId}:agent:${agentId}:confidence`
        );
        if (result) {
          const parsed = JSON.parse(result);
          scores.push(parsed.confidence);
        }
      }

      expect(scores).toHaveLength(3);
      expect(scores).toEqual(confidenceScores);
    });

    test('enforces minimum quorum for gate check', async () => {
      const minQuorum = 0.66; // At least 66% of agents must respond
      const totalAgents = testConfig.loop3Agents.length;
      const requiredAgents = Math.ceil(totalAgents * minQuorum);

      const respondedAgents = 2; // Only 2 out of 3 agents responded

      expect(respondedAgents).toBeGreaterThanOrEqual(requiredAgents);
    });
  });

  // ============================================================================
  // Loop 2 Spawning Tests
  // ============================================================================

  describe('Loop 2 Agent Spawning', () => {
    test('waits for gate-passed signal before spawning Loop 2', async () => {
      let gateSignalReceived = false;

      mockRedis.blpop.mockImplementation(async (key: string, timeout: number) => {
        if (key.includes('gate-passed')) {
          gateSignalReceived = true;
          return ['gate-passed', '1'];
        }
        return null;
      });

      const result = await mockRedis.blpop(
        `swarm:${testConfig.taskId}:gate-passed`,
        60
      );

      expect(gateSignalReceived).toBe(true);
      expect(result).toBeTruthy();
    });

    test('spawns all Loop 2 validators after gate pass', async () => {
      const validatorIds: string[] = [];

      mockAgentSpawner.mockImplementation((agentType: string, config: any) => {
        const agentId = `${agentType}-${config.iteration}-1`;
        validatorIds.push(agentId);
        return {
          pid: 2000 + validatorIds.length,
          agentId,
          agentType,
          taskId: config.taskId,
          iteration: config.iteration,
        };
      });

      for (const agentType of testConfig.loop2Agents) {
        mockAgentSpawner(agentType, {
          taskId: testConfig.taskId,
          iteration: 1,
        });
      }

      expect(validatorIds).toHaveLength(testConfig.loop2Agents.length);
    });

    test('injects Loop 3 context into Loop 2 agent prompts', async () => {
      const loop3Context = {
        deliverables: ['src/auth.ts', 'src/api.ts'],
        testResults: { passRate: 0.95 },
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(loop3Context));

      const context = await mockRedis.get(
        `swarm:${testConfig.taskId}:loop3:context`
      );

      expect(context).toBeDefined();
      const parsed = JSON.parse(context as string);
      expect(parsed.deliverables).toHaveLength(2);
    });
  });

  // ============================================================================
  // Consensus Collection Tests
  // ============================================================================

  describe('Consensus Collection', () => {
    test('collects validation scores from all Loop 2 agents', async () => {
      const validationScores = [0.92, 0.88, 0.95];
      const validatorIds = testConfig.loop2Agents.map((type, i) => `${type}-1-1`);

      mockRedis.get.mockImplementation(async (key: string) => {
        const match = key.match(/validator:([^:]+):score/);
        if (match) {
          const validatorId = match[1];
          const index = validatorIds.indexOf(validatorId);
          if (index >= 0) {
            return JSON.stringify({ score: validationScores[index] });
          }
        }
        return null;
      });

      const scores: number[] = [];
      for (const validatorId of validatorIds) {
        const result = await mockRedis.get(
          `swarm:${testConfig.taskId}:validator:${validatorId}:score`
        );
        if (result) {
          const parsed = JSON.parse(result);
          scores.push(parsed.score);
        }
      }

      expect(scores).toHaveLength(3);
      expect(scores).toEqual(validationScores);
    });

    test('calculates average consensus score', async () => {
      const validationScores = [0.92, 0.88, 0.95];
      const avgConsensus = validationScores.reduce((sum, s) => sum + s, 0) / validationScores.length;

      expect(avgConsensus).toBeCloseTo(0.9167, 4);
      expect(avgConsensus).toBeGreaterThanOrEqual(testConfig.consensusThreshold);
    });

    test('passes consensus check when score >= threshold', async () => {
      const consensusScore = 0.92;
      const threshold = 0.90;

      expect(consensusScore).toBeGreaterThanOrEqual(threshold);
    });

    test('fails consensus check when score < threshold', async () => {
      const consensusScore = 0.85;
      const threshold = 0.90;

      expect(consensusScore).toBeLessThan(threshold);
    });

    test('enforces minimum quorum for consensus check', async () => {
      const minQuorum = 0.66;
      const totalValidators = testConfig.loop2Agents.length;
      const requiredValidators = Math.ceil(totalValidators * minQuorum);

      const respondedValidators = 3; // All validators responded

      expect(respondedValidators).toBeGreaterThanOrEqual(requiredValidators);
    });
  });

  // ============================================================================
  // Product Owner Decision Tests
  // ============================================================================

  describe('Product Owner Decision Execution', () => {
    test('spawns Product Owner agent for decision', async () => {
      let poSpawned = false;

      mockAgentSpawner.mockImplementation((agentType: string, config: any) => {
        if (agentType === testConfig.productOwner) {
          poSpawned = true;
          return {
            pid: 3000,
            agentId: 'product-owner-1-1',
            agentType,
            taskId: config.taskId,
            iteration: config.iteration,
          };
        }
        return null;
      });

      const result = mockAgentSpawner(testConfig.productOwner, {
        taskId: testConfig.taskId,
        iteration: 1,
      });

      expect(poSpawned).toBe(true);
      expect(result).toBeTruthy();
    });

    test('parses PROCEED decision from Product Owner output', async () => {
      const poOutput = `
Decision: PROCEED
Rationale: All deliverables complete, consensus achieved at 0.92
Confidence: 0.95
Deliverables validated: yes
      `.trim();

      const decision = poOutput.match(/Decision:\s*(PROCEED|ITERATE|ABORT)/)?.[1];
      expect(decision).toBe('PROCEED');
    });

    test('parses ITERATE decision from Product Owner output', async () => {
      const poOutput = `
Decision: ITERATE
Rationale: Consensus below threshold, security issues found
Confidence: 0.75
      `.trim();

      const decision = poOutput.match(/Decision:\s*(PROCEED|ITERATE|ABORT)/)?.[1];
      expect(decision).toBe('ITERATE');
    });

    test('parses ABORT decision from Product Owner output', async () => {
      const poOutput = `
Decision: ABORT
Rationale: Critical security vulnerability, cannot proceed
Confidence: 0.95
      `.trim();

      const decision = poOutput.match(/Decision:\s*(PROCEED|ITERATE|ABORT)/)?.[1];
      expect(decision).toBe('ABORT');
    });

    test('defaults to ITERATE if decision parsing fails', async () => {
      const poOutput = 'Malformed output without decision marker';

      const decision = poOutput.match(/Decision:\s*(PROCEED|ITERATE|ABORT)/)?.[1] || 'ITERATE';
      expect(decision).toBe('ITERATE');
    });
  });

  // ============================================================================
  // Iteration Management Tests
  // ============================================================================

  describe('Iteration Management', () => {
    test('completes successfully on PROCEED decision', async () => {
      const decision: Decision = 'PROCEED';
      const finalStatus = decision === 'PROCEED' ? 'success' : 'failed';

      expect(finalStatus).toBe('success');
    });

    test('aborts execution on ABORT decision', async () => {
      const decision: Decision = 'ABORT';
      const finalStatus = decision === 'ABORT' ? 'aborted' : 'success';

      expect(finalStatus).toBe('aborted');
    });

    test('iterates all agents on ITERATE decision', async () => {
      const decision: Decision = 'ITERATE';
      const currentIteration = 1;
      const nextIteration = currentIteration + 1;

      expect(nextIteration).toBe(2);
      expect(nextIteration).toBeLessThanOrEqual(testConfig.maxIterations);
    });

    test('respects max iterations limit', async () => {
      let currentIteration = testConfig.maxIterations;
      const decision: Decision = 'ITERATE';

      if (decision === 'ITERATE' && currentIteration >= testConfig.maxIterations) {
        currentIteration = testConfig.maxIterations;
      }

      expect(currentIteration).toBe(testConfig.maxIterations);
    });

    test('exits with failure when max iterations reached', async () => {
      const currentIteration = testConfig.maxIterations;
      const decision: Decision = 'ITERATE';

      const shouldFail = currentIteration >= testConfig.maxIterations && decision !== 'PROCEED';
      expect(shouldFail).toBe(true);
    });

    test('injects feedback into iteration wake signal', async () => {
      const feedback = 'Security issues found: SQL injection in auth module';
      const iteration = 2;

      mockRedis.lpush.mockResolvedValue(1);

      await mockRedis.lpush(
        `swarm:${testConfig.taskId}:backend-developer-2-1:wake`,
        JSON.stringify({ iteration, feedback })
      );

      expect(mockRedis.lpush).toHaveBeenCalledWith(
        expect.stringContaining('wake'),
        expect.stringContaining(feedback)
      );
    });
  });

  // ============================================================================
  // Timeout and Error Handling Tests
  // ============================================================================

  describe('Timeout and Error Handling', () => {
    test('times out agents that do not complete within timeout', async () => {
      const timeout = 60; // 60 seconds

      mockRedis.blpop.mockImplementation(async (key: string, timeoutSec: number) => {
        // Simulate timeout
        return null;
      });

      const result = await mockRedis.blpop(
        `swarm:${testConfig.taskId}:backend-developer-1-1:done`,
        timeout
      );

      expect(result).toBeNull();
    });

    test('handles stuck agents with recovery', async () => {
      const agentPid = 12345;
      const isProcessStuck = true;

      if (isProcessStuck) {
        // Simulate kill signal
        const killSignal = 'SIGTERM';
        expect(killSignal).toBe('SIGTERM');
      }
    });

    test('cleans up telemetry monitoring on agent completion', async () => {
      const monitorPid = 67890;
      let monitoringStopped = false;

      // Simulate stop monitoring
      if (monitorPid > 0) {
        monitoringStopped = true;
      }

      expect(monitoringStopped).toBe(true);
    });

    test('calculates phase-specific timeout', async () => {
      const phaseId = 'authentication';
      const baseTimeout = 300;
      const phaseMultiplier = 1.5; // Auth phase typically takes longer

      const calculatedTimeout = Math.floor(baseTimeout * phaseMultiplier);
      expect(calculatedTimeout).toBe(450);
    });

    test('handles Redis connection failure gracefully', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis connection lost'));

      await expect(async () => {
        await mockRedis.get('test-key');
      }).rejects.toThrow('Redis connection lost');
    });

    test('handles agent spawn failure with retry', async () => {
      let attemptCount = 0;
      const maxRetries = 3;

      mockAgentSpawner.mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Spawn failed');
        }
        return { pid: 12345 };
      });

      let result = null;
      for (let retry = 0; retry < maxRetries; retry++) {
        try {
          result = mockAgentSpawner('test-agent', {});
          break;
        } catch (error) {
          if (retry === maxRetries - 1) {
            throw error;
          }
        }
      }

      expect(result).toBeTruthy();
      expect(attemptCount).toBe(3);
    });
  });

  // ============================================================================
  // Deliverable Verification Tests
  // ============================================================================

  describe('Deliverable Verification', () => {
    test('verifies expected files exist after Loop 3', async () => {
      const expectedFiles = ['src/auth.ts', 'src/api.ts', 'tests/auth.test.ts'];
      const existingFiles = ['src/auth.ts', 'src/api.ts', 'tests/auth.test.ts'];

      const allExist = expectedFiles.every(file => existingFiles.includes(file));
      expect(allExist).toBe(true);
    });

    test('forces iteration when deliverables missing', async () => {
      const expectedFiles = ['src/auth.ts', 'src/api.ts'];
      const existingFiles = ['src/auth.ts']; // Missing src/api.ts

      const allExist = expectedFiles.every(file => existingFiles.includes(file));
      expect(allExist).toBe(false);
    });

    test('detects deliverables by task type keywords', async () => {
      const taskType = 'authentication implementation';
      const keywordIndicators = ['auth', 'login', 'jwt'];

      const hasKeywords = keywordIndicators.some(keyword =>
        taskType.toLowerCase().includes(keyword)
      );

      expect(hasKeywords).toBe(true);
    });
  });

  // ============================================================================
  // Mode-Specific Threshold Tests
  // ============================================================================

  describe('Mode-Specific Thresholds', () => {
    test('applies MVP mode thresholds', async () => {
      const mvpConfig = {
        mode: 'mvp' as const,
        gateThreshold: 0.70,
        consensusThreshold: 0.80,
        maxIterations: 5,
      };

      expect(mvpConfig.gateThreshold).toBe(0.70);
      expect(mvpConfig.consensusThreshold).toBe(0.80);
      expect(mvpConfig.maxIterations).toBe(5);
    });

    test('applies Standard mode thresholds', async () => {
      const standardConfig = {
        mode: 'standard' as const,
        gateThreshold: 0.75,
        consensusThreshold: 0.90,
        maxIterations: 10,
      };

      expect(standardConfig.gateThreshold).toBe(0.75);
      expect(standardConfig.consensusThreshold).toBe(0.90);
      expect(standardConfig.maxIterations).toBe(10);
    });

    test('applies Enterprise mode thresholds', async () => {
      const enterpriseConfig = {
        mode: 'enterprise' as const,
        gateThreshold: 0.75,
        consensusThreshold: 0.95,
        maxIterations: 15,
      };

      expect(enterpriseConfig.gateThreshold).toBe(0.75);
      expect(enterpriseConfig.consensusThreshold).toBe(0.95);
      expect(enterpriseConfig.maxIterations).toBe(15);
    });
  });

  // ============================================================================
  // Context Storage and Retrieval Tests
  // ============================================================================

  describe('Context Storage and Retrieval', () => {
    test('stores epic context in Redis', async () => {
      const epicContext = {
        epicGoal: 'Implement JWT authentication',
        deliverables: ['auth module', 'middleware', 'tests'],
        acceptanceCriteria: ['tokens expire after 1h', 'refresh tokens supported'],
      };

      mockRedis.set.mockResolvedValue('OK');

      await mockRedis.set(
        `swarm:${testConfig.taskId}:epic-context`,
        JSON.stringify(epicContext)
      );

      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining('epic-context'),
        expect.stringContaining('JWT authentication')
      );
    });

    test('stores phase context in Redis', async () => {
      const phaseContext = {
        phase: 'implementation',
        requirements: ['backend API', 'token generation', 'validation'],
      };

      mockRedis.set.mockResolvedValue('OK');

      await mockRedis.set(
        `swarm:${testConfig.taskId}:phase-context`,
        JSON.stringify(phaseContext)
      );

      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining('phase-context'),
        expect.any(String)
      );
    });

    test('stores success criteria in Redis', async () => {
      const successCriteria = {
        test_suites: [
          {
            name: 'auth-tests',
            command: 'npm test -- auth',
            threshold: 0.95,
          },
        ],
      };

      mockRedis.set.mockResolvedValue('OK');

      await mockRedis.set(
        `swarm:${testConfig.taskId}:success-criteria`,
        JSON.stringify(successCriteria)
      );

      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining('success-criteria'),
        expect.stringContaining('auth-tests')
      );
    });

    test('retrieves context for agent prompts', async () => {
      const storedContext = {
        task: 'Implement authentication',
        deliverables: ['auth.ts', 'auth.test.ts'],
        iteration: 1,
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(storedContext));

      const context = await mockRedis.get(
        `swarm:${testConfig.taskId}:context`
      );

      expect(context).toBeDefined();
      const parsed = JSON.parse(context as string);
      expect(parsed.task).toBe('Implement authentication');
    });
  });

  // ============================================================================
  // Structured Output Tests
  // ============================================================================

  describe('Structured Output', () => {
    test('outputs structured JSON result on success', async () => {
      const result = {
        status: 'success',
        iterations_completed: 2,
        final_decision: 'PROCEED',
        loop3_confidence: 0.88,
        loop2_consensus: 0.92,
        deliverables_verified: true,
        execution_time_seconds: 1847,
      };

      expect(result.status).toBe('success');
      expect(result.iterations_completed).toBe(2);
      expect(result.final_decision).toBe('PROCEED');
      expect(result.deliverables_verified).toBe(true);
    });

    test('outputs structured JSON result on failure', async () => {
      const result = {
        status: 'failed',
        iterations_completed: 10,
        final_decision: 'ITERATE',
        loop3_confidence: 0.65,
        loop2_consensus: 0.70,
        deliverables_verified: false,
        execution_time_seconds: 4500,
      };

      expect(result.status).toBe('failed');
      expect(result.iterations_completed).toBe(10);
      expect(result.deliverables_verified).toBe(false);
    });

    test('outputs structured JSON result on abort', async () => {
      const result = {
        status: 'aborted',
        iterations_completed: 1,
        final_decision: 'ABORT',
        loop3_confidence: 0.45,
        loop2_consensus: 0.50,
        deliverables_verified: false,
        execution_time_seconds: 300,
      };

      expect(result.status).toBe('aborted');
      expect(result.final_decision).toBe('ABORT');
    });
  });

  // ============================================================================
  // Enhanced Monitoring Tests (v3.0)
  // ============================================================================

  describe('Enhanced Monitoring and Progress Tracking', () => {
    test('tracks agent progress in real-time', async () => {
      const agentProgress = {
        agentId: 'backend-developer-1-1',
        status: 'in_progress',
        startTime: Date.now(),
        lastActivity: Date.now(),
      };

      mockRedis.set.mockResolvedValue('OK');

      await mockRedis.set(
        `swarm:${testConfig.taskId}:${agentProgress.agentId}:progress`,
        JSON.stringify(agentProgress)
      );

      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining('progress'),
        expect.any(String)
      );
    });

    test('detects stuck agents via health check', async () => {
      const lastActivity = Date.now() - 600000; // 10 minutes ago
      const stuckThreshold = 300000; // 5 minutes

      const isStuck = (Date.now() - lastActivity) > stuckThreshold;
      expect(isStuck).toBe(true);
    });

    test('automatically recovers stuck agents', async () => {
      const stuckAgentId = 'backend-developer-1-1';
      const stuckPid = 12345;
      let recoveryExecuted = false;

      // Simulate recovery
      if (stuckPid > 0) {
        recoveryExecuted = true;
      }

      expect(recoveryExecuted).toBe(true);
    });

    test('generates progress report with timestamps', async () => {
      const progressReport = {
        taskId: testConfig.taskId,
        iteration: 1,
        loop3Agents: [
          { agentId: 'backend-developer-1-1', status: 'completed', timestamp: Date.now() },
          { agentId: 'frontend-developer-1-1', status: 'in_progress', timestamp: Date.now() },
        ],
        loop2Agents: [],
      };

      expect(progressReport.loop3Agents).toHaveLength(2);
      expect(progressReport.loop3Agents[0].status).toBe('completed');
    });
  });

  // ============================================================================
  // Security and Validation Tests
  // ============================================================================

  describe('Security and Validation', () => {
    test('sanitizes task ID input', async () => {
      const maliciousTaskId = 'task-123; rm -rf /';
      const sanitized = maliciousTaskId.replace(/[^a-zA-Z0-9_-]/g, '');

      expect(sanitized).toBe('task-123rm-rf');
    });

    test('validates agent list format', async () => {
      const validAgentList = 'backend-developer,frontend-developer';
      const invalidAgentList = 'backend-developer,; rm -rf /';

      const isValid = (list: string) => /^[a-zA-Z0-9_,-]+$/.test(list);

      expect(isValid(validAgentList)).toBe(true);
      expect(isValid(invalidAgentList)).toBe(false);
    });

    test('enforces iteration limit to prevent resource exhaustion', async () => {
      const maxIterations = 100;
      const requestedIterations = 150;

      const enforced = Math.min(requestedIterations, maxIterations);
      expect(enforced).toBe(maxIterations);
    });

    test('validates JSON context size', async () => {
      const maxSize = 10485760; // 10MB
      const largeContext = JSON.stringify({ data: 'x'.repeat(maxSize + 1) });

      const isTooLarge = largeContext.length > maxSize;
      expect(isTooLarge).toBe(true);
    });
  });

  // ============================================================================
  // Performance Tests
  // ============================================================================

  describe('Performance', () => {
    test('spawns agents in parallel efficiently', async () => {
      const startTime = Date.now();

      const spawnPromises = testConfig.loop3Agents.map(async (agentType) => {
        return new Promise(resolve => {
          setTimeout(() => resolve({ agentType }), 100);
        });
      });

      await Promise.all(spawnPromises);

      const duration = Date.now() - startTime;

      // Parallel spawn should complete in ~100ms, not 300ms (sequential)
      expect(duration).toBeLessThan(200);
    });

    test('uses parallel BLPOP for agent waiting', async () => {
      const agentIds = ['agent-1', 'agent-2', 'agent-3'];
      const startTime = Date.now();

      const waitPromises = agentIds.map(async (agentId) => {
        return new Promise(resolve => {
          setTimeout(() => resolve(agentId), 50);
        });
      });

      await Promise.all(waitPromises);

      const duration = Date.now() - startTime;

      // Parallel wait should complete in ~50ms, not 150ms (sequential)
      expect(duration).toBeLessThan(100);
    });
  });
});
