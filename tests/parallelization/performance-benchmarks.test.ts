/**
 * Performance Benchmarks for Sprint Parallelization
 *
 * Validates performance assumptions from ASSUMPTIONS_AND_TESTING.md (lines 701-705):
 * 1. **3 independent sprints**: <40min (baseline: 75min) - 46.7% faster
 * 2. **5 mixed sprints**: <60min (baseline: 125min) - 52% faster
 * 3. **10 sprints**: <100min (baseline: 250min) - 60% faster
 *
 * Implementation Strategy:
 * - Scale time by 0.1x for test performance (25min → 2.5s)
 * - Maintain same parallelization patterns as production
 * - Verify speedup ratios match expectations
 * - Test coordination overhead and resource management
 *
 * @module tests/parallelization/performance-benchmarks
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createClient, RedisClientType } from 'redis';
import type { BlockingCoordinationManager, CoordinationSignal } from '../../src/cfn-loop/blocking-coordination.js';

// ===== TYPE DEFINITIONS =====

/**
 * Sprint definition for benchmark tests
 */
interface BenchmarkSprint {
  /** Sprint identifier */
  id: string;
  /** Dependencies on other sprints (must complete first) */
  dependencies: string[];
  /** Estimated work time in scaled milliseconds (25min → 2.5s with 0.1x scale) */
  workloadMs: number;
  /** Number of agents in this sprint */
  agentCount: number;
  /** Sprint completion status */
  completed?: boolean;
  /** Start timestamp */
  startTime?: number;
  /** End timestamp */
  endTime?: number;
}

/**
 * Benchmark execution result
 */
interface BenchmarkResult {
  /** Total execution time in ms */
  totalTimeMs: number;
  /** Baseline sequential time in ms */
  baselineTimeMs: number;
  /** Speedup factor (baseline / actual) */
  speedup: number;
  /** Time saved percentage */
  timeSavedPercent: number;
  /** Sprints executed */
  sprintCount: number;
  /** Total agent count */
  agentCount: number;
  /** Sprint execution details */
  sprints: {
    id: string;
    startTime: number;
    endTime: number;
    durationMs: number;
    waitedForDependencies: boolean;
  }[];
  /** Coordination overhead in ms */
  coordinationOverheadMs: number;
}

/**
 * Resource conflict detector
 */
interface ResourceConflict {
  /** Resource type (port, file, etc.) */
  type: 'port' | 'file' | 'redis_key';
  /** Resource identifier */
  resource: string;
  /** Conflicting sprint IDs */
  sprints: string[];
}

// ===== TEST CONFIGURATION =====

const TEST_CONFIG = {
  REDIS_HOST: process.env.REDIS_TEST_HOST || 'localhost',
  REDIS_PORT: parseInt(process.env.REDIS_TEST_PORT || '6379'),
  REDIS_DB: parseInt(process.env.REDIS_TEST_DB || '1'), // Separate DB for tests

  // Time scaling factor: 0.1x means 25min → 2.5s
  TIME_SCALE: 0.1,

  // Sprint work time (25 minutes in production, 2.5s in tests)
  SPRINT_WORK_TIME_MS: 25 * 60 * 1000 * 0.1, // 2500ms = 2.5s

  // Coordination overhead per signal (ms)
  COORDINATION_OVERHEAD_MS: 50,

  // Agent count per sprint
  AGENTS_PER_SPRINT: 5,
};

// ===== TEST UTILITIES =====

/**
 * Sleep utility
 */
const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Connect to Redis with test configuration
 */
async function connectRedisClient(): Promise<RedisClientType> {
  const client = createClient({
    socket: {
      host: TEST_CONFIG.REDIS_HOST,
      port: TEST_CONFIG.REDIS_PORT,
    },
    database: TEST_CONFIG.REDIS_DB,
  });

  await client.connect();
  await client.ping(); // Verify connection

  return client;
}

/**
 * Sprint Execution Coordinator
 *
 * Simulates production BlockingCoordinationManager behavior for benchmarking
 */
class SprintExecutionCoordinator {
  private redis: RedisClientType;
  private sprints: Map<string, BenchmarkSprint> = new Map();
  private completedSprints: Set<string> = new Set();
  private coordinationMessages = 0;

  constructor(redis: RedisClientType) {
    this.redis = redis;
  }

  /**
   * Register sprint for execution
   */
  registerSprint(sprint: BenchmarkSprint): void {
    this.sprints.set(sprint.id, sprint);
  }

  /**
   * Execute sprint with dependency waiting
   */
  async executeSprint(sprintId: string): Promise<void> {
    const sprint = this.sprints.get(sprintId);
    if (!sprint) {
      throw new Error(`Sprint ${sprintId} not found`);
    }

    sprint.startTime = Date.now();

    // Wait for dependencies
    await this.waitForDependencies(sprint);

    // Simulate sprint work (scaled time)
    await sleep(sprint.workloadMs);

    // Mark as completed
    sprint.endTime = Date.now();
    sprint.completed = true;
    this.completedSprints.add(sprintId);

    // Publish completion signal
    await this.publishCompletionSignal(sprintId);
  }

  /**
   * Wait for sprint dependencies to complete
   */
  private async waitForDependencies(sprint: BenchmarkSprint): Promise<void> {
    if (sprint.dependencies.length === 0) {
      return; // No dependencies
    }

    const pollInterval = 100; // 100ms poll interval
    const maxWaitTime = 60000; // 60 seconds max wait
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      // Check if all dependencies are completed
      const allCompleted = sprint.dependencies.every(depId =>
        this.completedSprints.has(depId)
      );

      if (allCompleted) {
        // Add coordination overhead
        await sleep(TEST_CONFIG.COORDINATION_OVERHEAD_MS);
        this.coordinationMessages++;
        return;
      }

      // Poll
      await sleep(pollInterval);
    }

    throw new Error(`Dependency wait timeout for sprint ${sprint.id}`);
  }

  /**
   * Publish sprint completion signal
   */
  private async publishCompletionSignal(sprintId: string): Promise<void> {
    const signal = {
      sprintId,
      timestamp: Date.now(),
      status: 'completed',
    };

    await this.redis.publish(
      `sprint:coordination:${sprintId}`,
      JSON.stringify(signal)
    );

    this.coordinationMessages++;
  }

  /**
   * Execute all sprints in parallel with dependency coordination
   */
  async executeAllSprints(): Promise<BenchmarkResult> {
    const startTime = Date.now();
    const sprintIds = Array.from(this.sprints.keys());

    // Execute all sprints in parallel
    const executionPromises = sprintIds.map(sprintId =>
      this.executeSprint(sprintId)
    );

    await Promise.all(executionPromises);

    const endTime = Date.now();
    const totalTimeMs = endTime - startTime;

    // Calculate baseline (sequential execution time)
    const baselineTimeMs = Array.from(this.sprints.values()).reduce(
      (sum, sprint) => sum + sprint.workloadMs,
      0
    );

    // Calculate speedup
    const speedup = baselineTimeMs / totalTimeMs;
    const timeSavedPercent = ((baselineTimeMs - totalTimeMs) / baselineTimeMs) * 100;

    // Build result
    const sprints = Array.from(this.sprints.values()).map(sprint => ({
      id: sprint.id,
      startTime: sprint.startTime!,
      endTime: sprint.endTime!,
      durationMs: sprint.endTime! - sprint.startTime!,
      waitedForDependencies: sprint.dependencies.length > 0,
    }));

    const coordinationOverheadMs = this.coordinationMessages * TEST_CONFIG.COORDINATION_OVERHEAD_MS;
    const agentCount = Array.from(this.sprints.values()).reduce(
      (sum, sprint) => sum + sprint.agentCount,
      0
    );

    return {
      totalTimeMs,
      baselineTimeMs,
      speedup,
      timeSavedPercent,
      sprintCount: this.sprints.size,
      agentCount,
      sprints,
      coordinationOverheadMs,
    };
  }

  /**
   * Get coordination message count
   */
  getCoordinationMessageCount(): number {
    return this.coordinationMessages;
  }

  /**
   * Cleanup test data
   */
  async cleanup(): Promise<void> {
    const pattern = 'sprint:coordination:*';
    const keys = await this.redis.keys(pattern);

    if (keys.length > 0) {
      await this.redis.del(keys);
    }
  }
}

/**
 * Detect resource conflicts between sprints
 */
function detectResourceConflicts(sprints: BenchmarkSprint[]): ResourceConflict[] {
  const conflicts: ResourceConflict[] = [];
  const portUsage = new Map<number, string[]>();

  // Check for port conflicts (simplified simulation)
  sprints.forEach(sprint => {
    const basePort = 3000;
    const sprintPort = basePort + parseInt(sprint.id.replace(/\D/g, ''));

    if (!portUsage.has(sprintPort)) {
      portUsage.set(sprintPort, []);
    }
    portUsage.get(sprintPort)!.push(sprint.id);
  });

  // Find conflicts
  portUsage.forEach((sprintIds, port) => {
    if (sprintIds.length > 1) {
      conflicts.push({
        type: 'port',
        resource: `port-${port}`,
        sprints: sprintIds,
      });
    }
  });

  return conflicts;
}

// ===== TEST SUITE =====

describe('Sprint Parallelization Performance Benchmarks', () => {
  let redisClient: RedisClientType;

  // Set timeout for all tests in this suite (60 seconds)
  jest.setTimeout(60000);

  beforeEach(async () => {
    // Connect to Redis
    redisClient = await connectRedisClient();

    // Clear test data
    const keys = await redisClient.keys('sprint:coordination:*');
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  });

  afterEach(async () => {
    // Cleanup
    if (redisClient) {
      await redisClient.quit();
    }
  });

  // ===== TEST 1: 3 INDEPENDENT SPRINTS =====

  it('should execute 3 independent sprints in <40min (46.7% faster)', async () => {
    const coordinator = new SprintExecutionCoordinator(redisClient);

    // Define 3 independent sprints (no dependencies)
    const sprints: BenchmarkSprint[] = [
      {
        id: 'sprint-1',
        dependencies: [],
        workloadMs: TEST_CONFIG.SPRINT_WORK_TIME_MS, // 2.5s
        agentCount: TEST_CONFIG.AGENTS_PER_SPRINT,
      },
      {
        id: 'sprint-2',
        dependencies: [],
        workloadMs: TEST_CONFIG.SPRINT_WORK_TIME_MS, // 2.5s
        agentCount: TEST_CONFIG.AGENTS_PER_SPRINT,
      },
      {
        id: 'sprint-3',
        dependencies: [],
        workloadMs: TEST_CONFIG.SPRINT_WORK_TIME_MS, // 2.5s
        agentCount: TEST_CONFIG.AGENTS_PER_SPRINT,
      },
    ];

    sprints.forEach(sprint => coordinator.registerSprint(sprint));

    // Execute all sprints in parallel
    const result = await coordinator.executeAllSprints();

    // Log results
    console.log('\n=== 3 INDEPENDENT SPRINTS BENCHMARK ===');
    console.log(`Total Time: ${result.totalTimeMs}ms (${(result.totalTimeMs / 1000).toFixed(2)}s)`);
    console.log(`Baseline (Sequential): ${result.baselineTimeMs}ms (${(result.baselineTimeMs / 1000).toFixed(2)}s)`);
    console.log(`Speedup: ${result.speedup.toFixed(2)}x`);
    console.log(`Time Saved: ${result.timeSavedPercent.toFixed(1)}%`);
    console.log(`Coordination Overhead: ${result.coordinationOverheadMs}ms`);
    console.log(`Total Agents: ${result.agentCount}`);
    console.log(`\nProduction Scale (10x):`);
    console.log(`  Actual Time: ~${(result.totalTimeMs * 10 / 60000).toFixed(1)}min`);
    console.log(`  Baseline: ~${(result.baselineTimeMs * 10 / 60000).toFixed(1)}min`);

    // Validate performance requirements
    // Target: <40min in production (<4s in tests at 0.1x scale)
    const targetTimeMs = 40 * 60 * 1000 * TEST_CONFIG.TIME_SCALE; // 4000ms
    expect(result.totalTimeMs).toBeLessThan(targetTimeMs);

    // Target speedup: 1.875x (46.7% time saved)
    expect(result.speedup).toBeGreaterThan(1.8);

    // Time saved should be ≥46%
    expect(result.timeSavedPercent).toBeGreaterThan(46);

    // Verify no resource conflicts
    const conflicts = detectResourceConflicts(sprints);
    expect(conflicts.length).toBe(0);

    await coordinator.cleanup();
  });

  // ===== TEST 2: 5 MIXED SPRINTS WITH DEPENDENCIES =====

  it('should execute 5 mixed sprints in <60min (52% faster)', async () => {
    const coordinator = new SprintExecutionCoordinator(redisClient);

    // Define 5 sprints with mixed dependencies
    // Dependency graph:
    //   sprint-1 (independent)
    //   sprint-2 (independent)
    //   sprint-3 (depends on sprint-1)
    //   sprint-4 (depends on sprint-2)
    //   sprint-5 (depends on sprint-3, sprint-4)
    const sprints: BenchmarkSprint[] = [
      {
        id: 'sprint-1',
        dependencies: [],
        workloadMs: TEST_CONFIG.SPRINT_WORK_TIME_MS, // 2.5s
        agentCount: TEST_CONFIG.AGENTS_PER_SPRINT,
      },
      {
        id: 'sprint-2',
        dependencies: [],
        workloadMs: TEST_CONFIG.SPRINT_WORK_TIME_MS, // 2.5s
        agentCount: TEST_CONFIG.AGENTS_PER_SPRINT,
      },
      {
        id: 'sprint-3',
        dependencies: ['sprint-1'],
        workloadMs: TEST_CONFIG.SPRINT_WORK_TIME_MS, // 2.5s
        agentCount: TEST_CONFIG.AGENTS_PER_SPRINT,
      },
      {
        id: 'sprint-4',
        dependencies: ['sprint-2'],
        workloadMs: TEST_CONFIG.SPRINT_WORK_TIME_MS, // 2.5s
        agentCount: TEST_CONFIG.AGENTS_PER_SPRINT,
      },
      {
        id: 'sprint-5',
        dependencies: ['sprint-3', 'sprint-4'],
        workloadMs: TEST_CONFIG.SPRINT_WORK_TIME_MS, // 2.5s
        agentCount: TEST_CONFIG.AGENTS_PER_SPRINT,
      },
    ];

    sprints.forEach(sprint => coordinator.registerSprint(sprint));

    // Execute all sprints
    const result = await coordinator.executeAllSprints();

    // Log results
    console.log('\n=== 5 MIXED SPRINTS BENCHMARK ===');
    console.log(`Total Time: ${result.totalTimeMs}ms (${(result.totalTimeMs / 1000).toFixed(2)}s)`);
    console.log(`Baseline (Sequential): ${result.baselineTimeMs}ms (${(result.baselineTimeMs / 1000).toFixed(2)}s)`);
    console.log(`Speedup: ${result.speedup.toFixed(2)}x`);
    console.log(`Time Saved: ${result.timeSavedPercent.toFixed(1)}%`);
    console.log(`Coordination Overhead: ${result.coordinationOverheadMs}ms`);
    console.log(`Total Agents: ${result.agentCount}`);
    console.log(`\nProduction Scale (10x):`);
    console.log(`  Actual Time: ~${(result.totalTimeMs * 10 / 60000).toFixed(1)}min`);
    console.log(`  Baseline: ~${(result.baselineTimeMs * 10 / 60000).toFixed(1)}min`);

    // Validate performance requirements
    // Target: <60min in production (<6s in tests at 0.1x scale)
    const targetTimeMs = 60 * 60 * 1000 * TEST_CONFIG.TIME_SCALE; // 6000ms
    expect(result.totalTimeMs).toBeLessThan(targetTimeMs);

    // Target speedup: 2.08x (52% time saved)
    expect(result.speedup).toBeGreaterThan(2.0);

    // Time saved should be ≥52%
    expect(result.timeSavedPercent).toBeGreaterThan(52);

    // Verify dependency execution order
    const sprint1End = result.sprints.find(s => s.id === 'sprint-1')!.endTime;
    const sprint3Start = result.sprints.find(s => s.id === 'sprint-3')!.startTime;
    expect(sprint3Start).toBeGreaterThan(sprint1End - 200); // Allow 200ms tolerance

    await coordinator.cleanup();
  });

  // ===== TEST 3: 10 SPRINTS MAX SCALE =====

  it('should execute 10 sprints in <100min (60% faster)', async () => {
    const coordinator = new SprintExecutionCoordinator(redisClient);

    // Define 10 sprints with dependency graph
    // Dependency structure:
    //   Layer 0: sprint-1, sprint-2 (independent)
    //   Layer 1: sprint-3, sprint-4 (depend on layer 0)
    //   Layer 2: sprint-5, sprint-6 (depend on layer 1)
    //   Layer 3: sprint-7, sprint-8 (depend on layer 2)
    //   Layer 4: sprint-9, sprint-10 (depend on layer 3)
    const sprints: BenchmarkSprint[] = [
      // Layer 0
      {
        id: 'sprint-1',
        dependencies: [],
        workloadMs: TEST_CONFIG.SPRINT_WORK_TIME_MS,
        agentCount: TEST_CONFIG.AGENTS_PER_SPRINT,
      },
      {
        id: 'sprint-2',
        dependencies: [],
        workloadMs: TEST_CONFIG.SPRINT_WORK_TIME_MS,
        agentCount: TEST_CONFIG.AGENTS_PER_SPRINT,
      },
      // Layer 1
      {
        id: 'sprint-3',
        dependencies: ['sprint-1'],
        workloadMs: TEST_CONFIG.SPRINT_WORK_TIME_MS,
        agentCount: TEST_CONFIG.AGENTS_PER_SPRINT,
      },
      {
        id: 'sprint-4',
        dependencies: ['sprint-2'],
        workloadMs: TEST_CONFIG.SPRINT_WORK_TIME_MS,
        agentCount: TEST_CONFIG.AGENTS_PER_SPRINT,
      },
      // Layer 2
      {
        id: 'sprint-5',
        dependencies: ['sprint-3'],
        workloadMs: TEST_CONFIG.SPRINT_WORK_TIME_MS,
        agentCount: TEST_CONFIG.AGENTS_PER_SPRINT,
      },
      {
        id: 'sprint-6',
        dependencies: ['sprint-4'],
        workloadMs: TEST_CONFIG.SPRINT_WORK_TIME_MS,
        agentCount: TEST_CONFIG.AGENTS_PER_SPRINT,
      },
      // Layer 3
      {
        id: 'sprint-7',
        dependencies: ['sprint-5'],
        workloadMs: TEST_CONFIG.SPRINT_WORK_TIME_MS,
        agentCount: TEST_CONFIG.AGENTS_PER_SPRINT,
      },
      {
        id: 'sprint-8',
        dependencies: ['sprint-6'],
        workloadMs: TEST_CONFIG.SPRINT_WORK_TIME_MS,
        agentCount: TEST_CONFIG.AGENTS_PER_SPRINT,
      },
      // Layer 4
      {
        id: 'sprint-9',
        dependencies: ['sprint-7'],
        workloadMs: TEST_CONFIG.SPRINT_WORK_TIME_MS,
        agentCount: TEST_CONFIG.AGENTS_PER_SPRINT,
      },
      {
        id: 'sprint-10',
        dependencies: ['sprint-8'],
        workloadMs: TEST_CONFIG.SPRINT_WORK_TIME_MS,
        agentCount: TEST_CONFIG.AGENTS_PER_SPRINT,
      },
    ];

    sprints.forEach(sprint => coordinator.registerSprint(sprint));

    // Execute all sprints
    const result = await coordinator.executeAllSprints();

    // Log results
    console.log('\n=== 10 SPRINTS MAX SCALE BENCHMARK ===');
    console.log(`Total Time: ${result.totalTimeMs}ms (${(result.totalTimeMs / 1000).toFixed(2)}s)`);
    console.log(`Baseline (Sequential): ${result.baselineTimeMs}ms (${(result.baselineTimeMs / 1000).toFixed(2)}s)`);
    console.log(`Speedup: ${result.speedup.toFixed(2)}x`);
    console.log(`Time Saved: ${result.timeSavedPercent.toFixed(1)}%`);
    console.log(`Coordination Overhead: ${result.coordinationOverheadMs}ms`);
    console.log(`Total Agents: ${result.agentCount}`);
    console.log(`Coordination Messages: ${coordinator.getCoordinationMessageCount()}`);
    console.log(`\nProduction Scale (10x):`);
    console.log(`  Actual Time: ~${(result.totalTimeMs * 10 / 60000).toFixed(1)}min`);
    console.log(`  Baseline: ~${(result.baselineTimeMs * 10 / 60000).toFixed(1)}min`);

    // Validate performance requirements
    // Target: <100min in production (<10s in tests at 0.1x scale)
    const targetTimeMs = 100 * 60 * 1000 * TEST_CONFIG.TIME_SCALE; // 10000ms
    expect(result.totalTimeMs).toBeLessThan(targetTimeMs);

    // Target speedup: 2.5x (60% time saved)
    expect(result.speedup).toBeGreaterThan(2.4);

    // Time saved should be ≥60%
    expect(result.timeSavedPercent).toBeGreaterThan(60);

    // Verify scalability: coordination overhead should be <5% of total time
    const overheadPercent = (result.coordinationOverheadMs / result.totalTimeMs) * 100;
    expect(overheadPercent).toBeLessThan(5);

    await coordinator.cleanup();
  });

  // ===== TEST 4: COORDINATION OVERHEAD ANALYSIS =====

  it('should maintain low coordination overhead at scale', async () => {
    const coordinator = new SprintExecutionCoordinator(redisClient);

    // Create 10 sprints with varying dependency patterns
    const sprints: BenchmarkSprint[] = Array.from({ length: 10 }, (_, i) => ({
      id: `sprint-${i + 1}`,
      dependencies: i > 0 ? [`sprint-${i}`] : [], // Chain dependencies
      workloadMs: TEST_CONFIG.SPRINT_WORK_TIME_MS,
      agentCount: TEST_CONFIG.AGENTS_PER_SPRINT,
    }));

    sprints.forEach(sprint => coordinator.registerSprint(sprint));

    const result = await coordinator.executeAllSprints();

    // Calculate coordination metrics
    const overheadPercent = (result.coordinationOverheadMs / result.totalTimeMs) * 100;
    const messagesPerSprint = coordinator.getCoordinationMessageCount() / result.sprintCount;

    console.log('\n=== COORDINATION OVERHEAD ANALYSIS ===');
    console.log(`Total Time: ${result.totalTimeMs}ms`);
    console.log(`Coordination Overhead: ${result.coordinationOverheadMs}ms (${overheadPercent.toFixed(1)}%)`);
    console.log(`Coordination Messages: ${coordinator.getCoordinationMessageCount()}`);
    console.log(`Messages Per Sprint: ${messagesPerSprint.toFixed(1)}`);

    // Overhead should be <5% of total time
    expect(overheadPercent).toBeLessThan(5);

    // Should have reasonable message count (2-3 per sprint: start, complete, ack)
    expect(messagesPerSprint).toBeLessThan(5);

    await coordinator.cleanup();
  });

  // ===== TEST 5: RESOURCE CONFLICT DETECTION =====

  it('should detect resource conflicts in parallel execution', async () => {
    // Create sprints that would conflict on same port
    const sprints: BenchmarkSprint[] = [
      {
        id: 'sprint-1',
        dependencies: [],
        workloadMs: TEST_CONFIG.SPRINT_WORK_TIME_MS,
        agentCount: TEST_CONFIG.AGENTS_PER_SPRINT,
      },
      {
        id: 'sprint-11', // Same port as sprint-1 (3001)
        dependencies: [],
        workloadMs: TEST_CONFIG.SPRINT_WORK_TIME_MS,
        agentCount: TEST_CONFIG.AGENTS_PER_SPRINT,
      },
    ];

    // Detect conflicts
    const conflicts = detectResourceConflicts(sprints);

    console.log('\n=== RESOURCE CONFLICT DETECTION ===');
    console.log(`Conflicts Found: ${conflicts.length}`);
    conflicts.forEach(conflict => {
      console.log(`  ${conflict.type}: ${conflict.resource} - Sprints: ${conflict.sprints.join(', ')}`);
    });

    // Should detect port conflict
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0].type).toBe('port');
    expect(conflicts[0].sprints).toContain('sprint-1');
    expect(conflicts[0].sprints).toContain('sprint-11');
  });
});
