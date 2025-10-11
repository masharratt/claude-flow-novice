/**
 * Integration Tests for Parallel CFN Loop Execution
 *
 * Sprint 6, Phase 6.1: Integration Tests
 *
 * Tests:
 * 1. End-to-end parallel epic execution with 3 independent sprints
 * 2. Dependency waiting with productive work validation
 * 3. Coordination with 5+ concurrent sprints
 * 4. Memory leak test (10 sequential epics)
 * 5. Port conflict prevention
 *
 * Acceptance Criteria:
 * - 3 independent sprints complete in <40min
 * - 5 dependent sprints in <60min
 * - No memory growth across 10 epics
 * - Zero port conflicts
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Redis from 'ioredis';
import {
  CFNLoopOrchestrator,
  createCFNLoopOrchestrator,
  CFNLoopConfig,
} from '../../src/cfn-loop/cfn-loop-orchestrator.js';

// Test timeout: 70 minutes for full integration test
const INTEGRATION_TIMEOUT = 70 * 60 * 1000;

describe('Parallel CFN Loop Integration Tests', () => {
  let redis: Redis;
  let orchestrators: Map<string, CFNLoopOrchestrator>;

  beforeEach(async () => {
    // Initialize Redis connection
    redis = new Redis({
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });

    orchestrators = new Map();

    // Clear test coordination keys
    const testKeys = await redis.keys('cfn:test:*');
    if (testKeys.length > 0) {
      await redis.del(...testKeys);
    }
  });

  afterEach(async () => {
    // Cleanup orchestrators
    for (const [id, orchestrator] of orchestrators.entries()) {
      await orchestrator.shutdown();
    }
    orchestrators.clear();

    // Cleanup Redis
    await redis.quit();
  });

  describe('3 Independent Sprints (Target: <40min)', () => {
    it('should execute 3 independent sprints in parallel without conflicts', async () => {
      const startTime = Date.now();

      // Create 3 independent sprints
      const sprints = [
        {
          id: 'sprint-auth',
          phaseId: 'test-sprint-auth',
          task: 'Implement authentication system',
          expectedPhases: 2,
        },
        {
          id: 'sprint-api',
          phaseId: 'test-sprint-api',
          task: 'Create REST API endpoints',
          expectedPhases: 2,
        },
        {
          id: 'sprint-ui',
          phaseId: 'test-sprint-ui',
          task: 'Build user interface components',
          expectedPhases: 2,
        },
      ];

      // Initialize orchestrators for each sprint
      const orchestratorPromises = sprints.map(async (sprint) => {
        const config: CFNLoopConfig = {
          phaseId: sprint.phaseId,
          swarmId: `swarm-${sprint.id}`,
          maxLoop2Iterations: 3,
          maxLoop3Iterations: 5,
          confidenceThreshold: 0.75,
          consensusThreshold: 0.90,
          timeoutMs: 30000,
          enableCircuitBreaker: true,
          enableMemoryPersistence: true,
        };

        const orchestrator = createCFNLoopOrchestrator(config);
        orchestrators.set(sprint.id, orchestrator);

        // Store sprint start in Redis
        await redis.setex(
          `cfn:test:sprint:${sprint.id}:status`,
          3600,
          JSON.stringify({
            status: 'running',
            startTime: Date.now(),
            phaseId: sprint.phaseId,
          })
        );

        return orchestrator.executePhase(sprint.task);
      });

      // Execute all sprints in parallel
      const results = await Promise.all(orchestratorPromises);

      const totalDuration = Date.now() - startTime;
      const durationMinutes = totalDuration / 1000 / 60;

      // Verify all sprints succeeded
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const sprint = sprints[i];

        expect(result.success).toBe(true);
        expect(result.phaseId).toBe(sprint.phaseId);
        expect(result.escalated).toBe(false);
        expect(result.totalLoop2Iterations).toBeGreaterThanOrEqual(1);
        expect(result.totalLoop3Iterations).toBeGreaterThanOrEqual(1);

        // Update sprint completion in Redis
        await redis.setex(
          `cfn:test:sprint:${sprint.id}:result`,
          3600,
          JSON.stringify({
            success: result.success,
            duration: result.statistics.totalDuration,
            loop2Iterations: result.totalLoop2Iterations,
            loop3Iterations: result.totalLoop3Iterations,
            confidenceScore: result.statistics.averageConfidenceScore,
          })
        );
      }

      // Verify performance target: <40 minutes
      expect(durationMinutes).toBeLessThan(40);

      // Verify no port conflicts occurred
      const portConflicts = await redis.get('cfn:test:port-conflicts');
      expect(portConflicts).toBeNull();

      console.log(`✅ 3 independent sprints completed in ${durationMinutes.toFixed(2)} minutes`);
    }, INTEGRATION_TIMEOUT);
  });

  describe('5 Dependent Sprints (Target: <60min)', () => {
    it('should execute 5 sprints with dependencies using productive waiting', async () => {
      const startTime = Date.now();

      // Define 5 sprints with dependency chain
      const sprints = [
        {
          id: 'sprint-db-schema',
          phaseId: 'test-sprint-db-schema',
          task: 'Design database schema',
          dependencies: [],
        },
        {
          id: 'sprint-models',
          phaseId: 'test-sprint-models',
          task: 'Implement data models',
          dependencies: ['sprint-db-schema'],
        },
        {
          id: 'sprint-api-layer',
          phaseId: 'test-sprint-api-layer',
          task: 'Create API layer',
          dependencies: ['sprint-models'],
        },
        {
          id: 'sprint-auth-middleware',
          phaseId: 'test-sprint-auth-middleware',
          task: 'Add authentication middleware',
          dependencies: ['sprint-api-layer'],
        },
        {
          id: 'sprint-integration-tests',
          phaseId: 'test-sprint-integration-tests',
          task: 'Write integration tests',
          dependencies: ['sprint-auth-middleware'],
        },
      ];

      // Execute sprints with dependency coordination
      const executeSprintWithDependencies = async (sprint: typeof sprints[0]) => {
        // Wait for dependencies
        if (sprint.dependencies.length > 0) {
          console.log(`[${sprint.id}] Waiting for dependencies: ${sprint.dependencies.join(', ')}`);

          const dependencyPromises = sprint.dependencies.map(async (depId) => {
            // Poll Redis for dependency completion
            let completed = false;
            while (!completed) {
              const depResult = await redis.get(`cfn:test:sprint:${depId}:result`);
              if (depResult) {
                const parsedResult = JSON.parse(depResult);
                if (parsedResult.success) {
                  completed = true;
                  console.log(`[${sprint.id}] Dependency ${depId} completed`);
                }
              }
              if (!completed) {
                await new Promise((resolve) => setTimeout(resolve, 1000)); // Poll every 1s
              }
            }
          });

          await Promise.all(dependencyPromises);
        }

        // Execute sprint
        const config: CFNLoopConfig = {
          phaseId: sprint.phaseId,
          swarmId: `swarm-${sprint.id}`,
          maxLoop2Iterations: 3,
          maxLoop3Iterations: 5,
          confidenceThreshold: 0.75,
          consensusThreshold: 0.90,
          timeoutMs: 30000,
          enableCircuitBreaker: true,
          enableMemoryPersistence: true,
        };

        const orchestrator = createCFNLoopOrchestrator(config);
        orchestrators.set(sprint.id, orchestrator);

        await redis.setex(
          `cfn:test:sprint:${sprint.id}:status`,
          3600,
          JSON.stringify({ status: 'running', startTime: Date.now() })
        );

        const result = await orchestrator.executePhase(sprint.task);

        await redis.setex(
          `cfn:test:sprint:${sprint.id}:result`,
          3600,
          JSON.stringify({
            success: result.success,
            duration: result.statistics.totalDuration,
            loop2Iterations: result.totalLoop2Iterations,
            loop3Iterations: result.totalLoop3Iterations,
          })
        );

        return result;
      };

      // Execute all sprints (they will coordinate via Redis)
      const sprintPromises = sprints.map((sprint) => executeSprintWithDependencies(sprint));
      const results = await Promise.all(sprintPromises);

      const totalDuration = Date.now() - startTime;
      const durationMinutes = totalDuration / 1000 / 60;

      // Verify all sprints succeeded
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        expect(result.success).toBe(true);
        expect(result.escalated).toBe(false);
      }

      // Verify performance target: <60 minutes
      expect(durationMinutes).toBeLessThan(60);

      console.log(`✅ 5 dependent sprints completed in ${durationMinutes.toFixed(2)} minutes`);
    }, INTEGRATION_TIMEOUT);
  });

  describe('Memory Leak Test (10 Sequential Epics)', () => {
    it('should not leak memory across 10 sequential epic executions', async () => {
      const memorySnapshots: number[] = [];

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const initialMemory = process.memoryUsage().heapUsed;
      memorySnapshots.push(initialMemory);

      console.log(`Initial memory: ${(initialMemory / 1024 / 1024).toFixed(2)} MB`);

      // Execute 10 sequential epics
      for (let i = 0; i < 10; i++) {
        const config: CFNLoopConfig = {
          phaseId: `test-epic-${i}`,
          swarmId: `swarm-epic-${i}`,
          maxLoop2Iterations: 2,
          maxLoop3Iterations: 3,
          confidenceThreshold: 0.75,
          consensusThreshold: 0.90,
          timeoutMs: 30000,
          enableCircuitBreaker: true,
          enableMemoryPersistence: false, // Disable to isolate memory test
        };

        const orchestrator = createCFNLoopOrchestrator(config);
        const result = await orchestrator.executePhase(`Epic ${i + 1}: Implement feature set`);

        expect(result.success).toBe(true);

        // Shutdown and cleanup
        await orchestrator.shutdown();

        // Force garbage collection
        if (global.gc) {
          global.gc();
        }

        const currentMemory = process.memoryUsage().heapUsed;
        memorySnapshots.push(currentMemory);

        console.log(
          `After epic ${i + 1}: ${(currentMemory / 1024 / 1024).toFixed(2)} MB ` +
            `(+${((currentMemory - initialMemory) / 1024 / 1024).toFixed(2)} MB)`
        );
      }

      const finalMemory = memorySnapshots[memorySnapshots.length - 1];
      const memoryGrowth = finalMemory - initialMemory;
      const memoryGrowthMB = memoryGrowth / 1024 / 1024;
      const memoryGrowthPercent = (memoryGrowth / initialMemory) * 100;

      console.log(`Memory growth: ${memoryGrowthMB.toFixed(2)} MB (${memoryGrowthPercent.toFixed(2)}%)`);

      // Acceptable memory growth: <50% or <100MB
      // This accounts for V8 heap expansion and some retained data
      expect(memoryGrowthPercent).toBeLessThan(50);
      expect(memoryGrowthMB).toBeLessThan(100);

      console.log(`✅ Memory leak test passed: ${memoryGrowthPercent.toFixed(2)}% growth`);
    }, INTEGRATION_TIMEOUT);
  });

  describe('Port Conflict Prevention', () => {
    it('should prevent port conflicts across concurrent orchestrators', async () => {
      // Create 10 orchestrators simultaneously
      const orchestratorConfigs = Array.from({ length: 10 }, (_, i) => ({
        phaseId: `test-port-${i}`,
        swarmId: `swarm-port-${i}`,
        maxLoop2Iterations: 2,
        maxLoop3Iterations: 2,
        confidenceThreshold: 0.75,
        consensusThreshold: 0.90,
        timeoutMs: 30000,
        enableCircuitBreaker: true,
      }));

      // Initialize all orchestrators
      const initPromises = orchestratorConfigs.map(async (config) => {
        const orchestrator = createCFNLoopOrchestrator(config);
        orchestrators.set(config.phaseId, orchestrator);
        return orchestrator;
      });

      await Promise.all(initPromises);

      // Execute tasks on all orchestrators simultaneously
      const executionPromises = Array.from(orchestrators.values()).map((orchestrator) =>
        orchestrator.executePhase('Quick test task')
      );

      const results = await Promise.all(executionPromises);

      // Verify all succeeded (no port conflicts)
      for (const result of results) {
        expect(result.success).toBe(true);
      }

      // Check Redis for any port conflict logs
      const portConflictKeys = await redis.keys('cfn:test:port-conflict:*');
      expect(portConflictKeys.length).toBe(0);

      console.log('✅ Port conflict prevention test passed: 10 concurrent orchestrators');
    }, INTEGRATION_TIMEOUT);
  });

  describe('Coordination with 5+ Concurrent Sprints', () => {
    it('should coordinate 7 concurrent sprints without deadlock', async () => {
      const startTime = Date.now();

      // Create 7 concurrent sprints
      const sprints = Array.from({ length: 7 }, (_, i) => ({
        id: `sprint-concurrent-${i}`,
        phaseId: `test-concurrent-${i}`,
        task: `Implement feature module ${i + 1}`,
      }));

      // Execute all sprints concurrently
      const sprintPromises = sprints.map(async (sprint) => {
        const config: CFNLoopConfig = {
          phaseId: sprint.phaseId,
          swarmId: `swarm-${sprint.id}`,
          maxLoop2Iterations: 3,
          maxLoop3Iterations: 5,
          confidenceThreshold: 0.75,
          consensusThreshold: 0.90,
          timeoutMs: 30000,
          enableCircuitBreaker: true,
          enableMemoryPersistence: true,
        };

        const orchestrator = createCFNLoopOrchestrator(config);
        orchestrators.set(sprint.id, orchestrator);

        await redis.setex(
          `cfn:test:sprint:${sprint.id}:status`,
          3600,
          JSON.stringify({ status: 'running', startTime: Date.now() })
        );

        return orchestrator.executePhase(sprint.task);
      });

      const results = await Promise.all(sprintPromises);

      const totalDuration = Date.now() - startTime;
      const durationMinutes = totalDuration / 1000 / 60;

      // Verify all sprints succeeded
      for (const result of results) {
        expect(result.success).toBe(true);
        expect(result.escalated).toBe(false);
      }

      // Verify no deadlocks (all completed within timeout)
      expect(durationMinutes).toBeLessThan(60);

      console.log(`✅ 7 concurrent sprints completed in ${durationMinutes.toFixed(2)} minutes`);
    }, INTEGRATION_TIMEOUT);
  });

  describe('Redis State Persistence', () => {
    it('should persist orchestrator state to Redis during execution', async () => {
      const config: CFNLoopConfig = {
        phaseId: 'test-redis-persistence',
        swarmId: 'swarm-redis-test',
        maxLoop2Iterations: 3,
        maxLoop3Iterations: 5,
        confidenceThreshold: 0.75,
        consensusThreshold: 0.90,
        enableMemoryPersistence: true,
      };

      const orchestrator = createCFNLoopOrchestrator(config);
      orchestrators.set('redis-test', orchestrator);

      // Execute phase
      const resultPromise = orchestrator.executePhase('Test Redis persistence');

      // Wait a bit for execution to start
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Check for Redis state keys
      const stateKeys = await redis.keys(`cfn:phase:${config.phaseId}:*`);
      expect(stateKeys.length).toBeGreaterThan(0);

      // Wait for completion
      const result = await resultPromise;
      expect(result.success).toBe(true);

      console.log('✅ Redis state persistence validated');
    }, INTEGRATION_TIMEOUT);
  });

  describe('Performance Benchmarks', () => {
    it('should track and report performance metrics', async () => {
      const config: CFNLoopConfig = {
        phaseId: 'test-performance',
        swarmId: 'swarm-perf',
        maxLoop2Iterations: 3,
        maxLoop3Iterations: 5,
        confidenceThreshold: 0.75,
        consensusThreshold: 0.90,
      };

      const orchestrator = createCFNLoopOrchestrator(config);
      orchestrators.set('perf-test', orchestrator);

      const startTime = Date.now();
      const result = await orchestrator.executePhase('Performance benchmark task');
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);

      const stats = orchestrator.getStatistics();

      // Store performance metrics in Redis
      await redis.setex(
        'cfn:test:performance:benchmark',
        3600,
        JSON.stringify({
          duration,
          loop2Iterations: result.totalLoop2Iterations,
          loop3Iterations: result.totalLoop3Iterations,
          confidenceScore: stats.averageConfidenceScore,
          consensusScore: stats.finalConsensusScore,
          gatePasses: stats.gatePasses,
          gateFails: stats.gateFails,
        })
      );

      console.log('✅ Performance benchmark completed');
      console.log(`   Duration: ${duration}ms`);
      console.log(`   Confidence: ${stats.averageConfidenceScore.toFixed(2)}`);
      console.log(`   Consensus: ${stats.finalConsensusScore.toFixed(2)}`);
    }, INTEGRATION_TIMEOUT);
  });
});
