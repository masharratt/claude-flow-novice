/**
 * @file Test Utilities for Byzantine Consensus Testing
 * @description Comprehensive test utilities with Byzantine fault simulation
 */

import { jest } from '@jest/globals';

export interface SpyFunction extends jest.MockedFunction<any> {
  calls: { arguments: any[]; result?: any; error?: any }[];
}

export function spy<T extends (...args: any[]) => any>(implementation?: T): jest.MockedFunction<T> {
  const mockFn = jest.fn(implementation) as jest.MockedFunction<T>;

  // Add calls array for compatibility
  if (!mockFn.calls) {
    (mockFn as any).calls = [];
    const originalMock = mockFn.getMockImplementation();

    mockFn.mockImplementation((...args) => {
      try {
        const result = originalMock ? originalMock(...args) : undefined;
        (mockFn as any).calls.push({ arguments: args, result });
        return result;
      } catch (error) {
        (mockFn as any).calls.push({ arguments: args, error });
        throw error;
      }
    });
  }

  return mockFn;
}

export function stub<T extends (...args: any[]) => any>(implementation?: T): jest.MockedFunction<T> {
  return spy(implementation);
}

export class FakeTime {
  private originalSetTimeout: typeof setTimeout;
  private originalClearTimeout: typeof clearTimeout;
  private originalDate: typeof Date;
  private currentTime: number;
  private timers: Map<NodeJS.Timeout, { callback: Function; time: number }> = new Map();
  private nextTimerId: number = 1;

  constructor(startTime: number = Date.now()) {
    this.currentTime = startTime;
    this.originalSetTimeout = global.setTimeout;
    this.originalClearTimeout = global.clearTimeout;
    this.originalDate = global.Date;

    this.install();
  }

  private install(): void {
    const self = this;

    // Mock setTimeout
    global.setTimeout = ((callback: Function, delay: number = 0): NodeJS.Timeout => {
      const id = self.nextTimerId++ as any;
      self.timers.set(id, {
        callback,
        time: self.currentTime + delay
      });
      return id;
    }) as any;

    // Mock clearTimeout
    global.clearTimeout = (id: NodeJS.Timeout): void => {
      self.timers.delete(id);
    };

    // Mock Date
    const MockDate = function(this: any, ...args: any[]) {
      if (args.length === 0) {
        return new self.originalDate(self.currentTime);
      }
      return new (self.originalDate as any)(...args);
    } as any;

    MockDate.now = () => self.currentTime;
    MockDate.prototype = self.originalDate.prototype;
    Object.setPrototypeOf(MockDate, self.originalDate);

    global.Date = MockDate;
  }

  tick(milliseconds: number): void {
    this.currentTime += milliseconds;

    // Execute due timers
    const dueTimers = Array.from(this.timers.entries())
      .filter(([, timer]) => timer.time <= this.currentTime)
      .sort(([, a], [, b]) => a.time - b.time);

    for (const [id, timer] of dueTimers) {
      this.timers.delete(id);
      timer.callback();
    }
  }

  restore(): void {
    global.setTimeout = this.originalSetTimeout;
    global.clearTimeout = this.originalClearTimeout;
    global.Date = this.originalDate;
    this.timers.clear();
  }
}

export class AsyncTestUtils {
  static async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static async timeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms)
      )
    ]);
  }

  static async retry<T>(
    fn: () => Promise<T>,
    options: { attempts?: number; delay?: number } = {}
  ): Promise<T> {
    const { attempts = 3, delay = 1000 } = options;

    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === attempts - 1) throw error;
        if (delay > 0) await this.delay(delay);
      }
    }

    throw new Error('Retry failed');
  }
}

export class MemoryTestUtils {
  static async checkMemoryLeak(fn: () => Promise<void>): Promise<{ leaked: boolean; before: number; after: number }> {
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    const before = process.memoryUsage().heapUsed;

    await fn();

    // Force garbage collection again
    if (global.gc) {
      global.gc();
    }

    const after = process.memoryUsage().heapUsed;
    const leaked = (after - before) > (1024 * 1024); // 1MB threshold

    return { leaked, before, after };
  }

  static getMemoryUsage(): NodeJS.MemoryUsage {
    return process.memoryUsage();
  }
}

export class PerformanceTestUtils {
  static async benchmark(
    fn: () => Promise<any>,
    options: { iterations?: number; warmup?: number; concurrency?: number } = {}
  ): Promise<{ stats: { mean: number; median: number; min: number; max: number; stddev: number } }> {
    const { iterations = 100, warmup = 10, concurrency = 1 } = options;

    // Warmup runs
    for (let i = 0; i < warmup; i++) {
      await fn();
    }

    const times: number[] = [];

    if (concurrency === 1) {
      // Sequential execution
      for (let i = 0; i < iterations; i++) {
        const start = process.hrtime.bigint();
        await fn();
        const end = process.hrtime.bigint();
        times.push(Number(end - start) / 1000000); // Convert to milliseconds
      }
    } else {
      // Concurrent execution
      const batches = Math.ceil(iterations / concurrency);

      for (let batch = 0; batch < batches; batch++) {
        const promises: Promise<number>[] = [];
        const batchSize = Math.min(concurrency, iterations - batch * concurrency);

        for (let i = 0; i < batchSize; i++) {
          promises.push((async () => {
            const start = process.hrtime.bigint();
            await fn();
            const end = process.hrtime.bigint();
            return Number(end - start) / 1000000;
          })());
        }

        const batchTimes = await Promise.all(promises);
        times.push(...batchTimes);
      }
    }

    times.sort((a, b) => a - b);

    const mean = times.reduce((sum, time) => sum + time, 0) / times.length;
    const median = times[Math.floor(times.length / 2)];
    const min = times[0];
    const max = times[times.length - 1];
    const variance = times.reduce((sum, time) => sum + Math.pow(time - mean, 2), 0) / times.length;
    const stddev = Math.sqrt(variance);

    return {
      stats: { mean, median, min, max, stddev }
    };
  }

  static async loadTest(
    fn: () => Promise<any>,
    options: {
      duration?: number;
      maxConcurrency?: number;
      requestsPerSecond?: number;
    } = {}
  ): Promise<{
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    requestsPerSecond: number;
  }> {
    const { duration = 10000, maxConcurrency = 50, requestsPerSecond = 100 } = options;

    let totalRequests = 0;
    let successfulRequests = 0;
    let failedRequests = 0;
    let totalResponseTime = 0;

    const startTime = Date.now();
    const endTime = startTime + duration;

    const activeRequests = new Set<Promise<void>>();

    const executeRequest = async (): Promise<void> => {
      totalRequests++;
      const requestStart = Date.now();

      try {
        await fn();
        successfulRequests++;
      } catch (error) {
        failedRequests++;
      }

      totalResponseTime += Date.now() - requestStart;
    };

    while (Date.now() < endTime) {
      // Maintain target requests per second
      const intervalMs = 1000 / requestsPerSecond;
      const requestPromise = executeRequest();

      activeRequests.add(requestPromise);
      requestPromise.finally(() => activeRequests.delete(requestPromise));

      // Limit concurrency
      if (activeRequests.size >= maxConcurrency) {
        await Promise.race(activeRequests);
      }

      await AsyncTestUtils.delay(intervalMs);
    }

    // Wait for remaining requests
    await Promise.all(activeRequests);

    const actualDuration = Date.now() - startTime;

    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      averageResponseTime: totalResponseTime / totalRequests,
      requestsPerSecond: (totalRequests / actualDuration) * 1000
    };
  }
}

export class TestAssertions {
  static assertInRange(value: number, min: number, max: number): void {
    if (value < min || value > max) {
      throw new Error(`Expected ${value} to be between ${min} and ${max}`);
    }
  }

  static async assertThrowsAsync(
    fn: () => Promise<any>,
    expectedErrorType?: new (...args: any[]) => Error,
    expectedMessage?: string
  ): Promise<void> {
    try {
      await fn();
      throw new Error('Expected function to throw an error');
    } catch (error) {
      if (expectedErrorType && !(error instanceof expectedErrorType)) {
        throw new Error(`Expected error of type ${expectedErrorType.name}, got ${error.constructor.name}`);
      }

      if (expectedMessage && !error.message.includes(expectedMessage)) {
        throw new Error(`Expected error message to contain "${expectedMessage}", got "${error.message}"`);
      }
    }
  }

  static assertApproximately(actual: number, expected: number, tolerance: number): void {
    const diff = Math.abs(actual - expected);
    if (diff > tolerance) {
      throw new Error(`Expected ${actual} to be approximately ${expected} (±${tolerance}), difference was ${diff}`);
    }
  }
}

export class MockFactory {
  static createMockAgent(type: string, id: string): any {
    return {
      id,
      type,
      status: 'idle',
      capabilities: [`${type}_capability`],
      performance: {
        tasksCompleted: 0,
        qualityScore: 0.8,
        averageTaskTime: 60000,
        collaborationScore: 0.9
      }
    };
  }

  static createMockTask(id: string, options: Partial<any> = {}): any {
    return {
      id,
      title: `Test Task ${id}`,
      description: `Description for task ${id}`,
      priority: 'medium',
      estimatedDuration: 60000,
      ...options
    };
  }

  static createByzantineScenario(options: {
    maliciousAgents?: string[];
    conflictProbability?: number;
    falseClaims?: boolean;
  } = {}): any {
    const {
      maliciousAgents = ['agent-malicious-1'],
      conflictProbability = 0.3,
      falseClaims = true
    } = options;

    return {
      maliciousAgents,
      conflictProbability,
      falseClaims,
      generateConflict: () => Math.random() < conflictProbability,
      simulateFalseClaim: (agentId: string) => maliciousAgents.includes(agentId) && falseClaims
    };
  }
}

// Export Jest globals for compatibility
export const { describe, it, beforeEach, afterEach, expect } = jest;

// Add Byzantine-specific test utilities
export class ByzantineTestUtils {
  static createConsensusScenario(options: {
    agentCount: number;
    byzantineCount: number;
    truthValue: any;
    conflictData?: Map<string, any>;
  }): {
    agents: string[];
    byzantineAgents: string[];
    honestAgents: string[];
    consensusThreshold: number;
    generateAgentClaim: (agentId: string) => { claim: any; truthful: boolean };
  } {
    const { agentCount, byzantineCount, truthValue, conflictData = new Map() } = options;

    if (byzantineCount >= Math.floor(agentCount / 3)) {
      throw new Error('Byzantine agents must be less than 1/3 of total agents');
    }

    const agents = Array.from({ length: agentCount }, (_, i) => `agent-${i}`);
    const byzantineAgents = agents.slice(0, byzantineCount);
    const honestAgents = agents.slice(byzantineCount);
    const consensusThreshold = Math.floor((agentCount + byzantineCount) / 2) + 1;

    return {
      agents,
      byzantineAgents,
      honestAgents,
      consensusThreshold,
      generateAgentClaim: (agentId: string) => {
        const isByzantine = byzantineAgents.includes(agentId);

        if (isByzantine && conflictData.has(agentId)) {
          return {
            claim: conflictData.get(agentId),
            truthful: false
          };
        }

        return {
          claim: truthValue,
          truthful: !isByzantine
        };
      }
    };
  }

  static simulateNetworkPartition(agents: string[], partitionSize: number): {
    partition1: string[];
    partition2: string[];
    canReachConsensus: boolean;
  } {
    const partition1 = agents.slice(0, partitionSize);
    const partition2 = agents.slice(partitionSize);
    const canReachConsensus = partition1.length > agents.length / 2 || partition2.length > agents.length / 2;

    return { partition1, partition2, canReachConsensus };
  }

  static createEvidenceChain(truthClaims: Array<{ agentId: string; claim: any; evidence: any }>): {
    chain: any[];
    trustScore: number;
    conflicts: string[];
  } {
    const chain = [];
    const conflicts = [];
    let trustScore = 1.0;

    for (let i = 0; i < truthClaims.length; i++) {
      const current = truthClaims[i];

      // Check for conflicts with previous claims
      for (let j = 0; j < i; j++) {
        const previous = truthClaims[j];
        if (JSON.stringify(current.claim) !== JSON.stringify(previous.claim)) {
          conflicts.push(`Conflict between ${current.agentId} and ${previous.agentId}`);
          trustScore *= 0.7; // Reduce trust score for conflicts
        }
      }

      chain.push({
        index: i,
        agentId: current.agentId,
        claim: current.claim,
        evidence: current.evidence,
        timestamp: Date.now() + i * 1000,
        hash: this.hashEvidence(current)
      });
    }

    return { chain, trustScore, conflicts };
  }

  private static hashEvidence(evidence: any): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256')
      .update(JSON.stringify(evidence))
      .digest('hex');
  }
}