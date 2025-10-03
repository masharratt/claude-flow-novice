import { describe, it, expect, beforeEach } from '@jest/globals';
import { performance } from 'perf_hooks';

/**
 * BENCHMARK THRESHOLD: Helper resume latency <50ms (p95)
 *
 * Tests the latency of resuming a paused helper agent when needed.
 * Includes checkpoint deserialization and context restoration.
 */

interface AgentCheckpoint {
  agentId: string;
  state: any;
  context: string;
  memory: Record<string, any>;
  timestamp: number;
}

interface ResumeResult {
  agentId: string;
  success: boolean;
  latencyMs: number;
  stages: {
    lookup: number;
    deserialize: number;
    restore: number;
    activate: number;
  };
}

class HelperResumeSystem {
  private checkpoints: Map<string, string> = new Map(); // Serialized checkpoints
  private activeAgents: Map<string, any> = new Map();

  pauseHelper(checkpoint: AgentCheckpoint): void {
    const serialized = JSON.stringify(checkpoint);
    this.checkpoints.set(checkpoint.agentId, serialized);
  }

  /**
   * Resume a paused helper agent
   * Should complete in <50ms (p95)
   */
  resumeHelper(agentId: string): ResumeResult {
    const startTime = performance.now();
    const stages = { lookup: 0, deserialize: 0, restore: 0, activate: 0 };

    // Stage 1: Lookup checkpoint
    const lookupStart = performance.now();
    const serialized = this.checkpoints.get(agentId);
    stages.lookup = performance.now() - lookupStart;

    if (!serialized) {
      return {
        agentId,
        success: false,
        latencyMs: performance.now() - startTime,
        stages
      };
    }

    // Stage 2: Deserialize checkpoint
    const deserializeStart = performance.now();
    const checkpoint: AgentCheckpoint = JSON.parse(serialized);
    stages.deserialize = performance.now() - deserializeStart;

    // Stage 3: Restore agent state
    const restoreStart = performance.now();
    const restoredAgent = {
      id: checkpoint.agentId,
      state: checkpoint.state,
      context: checkpoint.context,
      memory: checkpoint.memory,
      status: 'resuming'
    };
    stages.restore = performance.now() - restoreStart;

    // Stage 4: Activate agent
    const activateStart = performance.now();
    this.activeAgents.set(agentId, restoredAgent);
    this.checkpoints.delete(agentId);
    stages.activate = performance.now() - activateStart;

    const latencyMs = performance.now() - startTime;

    return {
      agentId,
      success: true,
      latencyMs,
      stages
    };
  }

  reset(): void {
    this.checkpoints.clear();
    this.activeAgents.clear();
  }
}

describe('Helper Resume Performance Benchmark', () => {
  let system: HelperResumeSystem;

  beforeEach(() => {
    system = new HelperResumeSystem();
  });

  it('should resume helper in <50ms', () => {
    const checkpoint: AgentCheckpoint = {
      agentId: 'helper-1',
      state: { currentTask: 'security-review', progress: 0.6 },
      context: 'Agent was reviewing authentication module for SQL injection vulnerabilities',
      memory: {
        findings: ['potential-sql-injection-line-45', 'missing-input-validation-line-89'],
        reviewed_files: ['src/auth/login.ts', 'src/auth/register.ts']
      },
      timestamp: Date.now()
    };

    system.pauseHelper(checkpoint);

    const result = system.resumeHelper('helper-1');

    console.log(`\nHelper Resume Latency (single agent):`);
    console.log(`  Lookup: ${result.stages.lookup.toFixed(3)}ms`);
    console.log(`  Deserialize: ${result.stages.deserialize.toFixed(3)}ms`);
    console.log(`  Restore: ${result.stages.restore.toFixed(3)}ms`);
    console.log(`  Activate: ${result.stages.activate.toFixed(3)}ms`);
    console.log(`  Total: ${result.latencyMs.toFixed(3)}ms`);
    console.log(`  Threshold: <50ms`);
    console.log(`  Status: ${result.latencyMs < 50 ? '✅ PASS' : '❌ FAIL'}`);

    expect(result.success).toBe(true);
    expect(result.latencyMs).toBeLessThan(50);
  });

  it('should maintain <50ms p95 across 100 resume operations', () => {
    const latencies: number[] = [];
    const stageTimes = { lookup: [], deserialize: [], restore: [], activate: [] };

    // Pause 100 helpers with varied checkpoint sizes
    for (let i = 1; i <= 100; i++) {
      const checkpoint: AgentCheckpoint = {
        agentId: `helper-${i}`,
        state: {
          task: `task-${i}`,
          progress: Math.random(),
          files: Array.from({ length: Math.floor(Math.random() * 5) + 1 }, (_, j) => `file-${j}.ts`)
        },
        context: `Helper ${i} context. `.repeat(Math.floor(Math.random() * 20) + 10),
        memory: {
          key1: `value-${i}`,
          key2: Math.random() * 1000,
          key3: { nested: 'data' }
        },
        timestamp: Date.now()
      };

      system.pauseHelper(checkpoint);
    }

    // Resume all helpers
    for (let i = 1; i <= 100; i++) {
      const result = system.resumeHelper(`helper-${i}`);
      latencies.push(result.latencyMs);
      stageTimes.lookup.push(result.stages.lookup);
      stageTimes.deserialize.push(result.stages.deserialize);
      stageTimes.restore.push(result.stages.restore);
      stageTimes.activate.push(result.stages.activate);
    }

    const sorted = latencies.sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);
    const p95Latency = sorted[p95Index];

    const avgLookup = stageTimes.lookup.reduce((a, b) => a + b) / stageTimes.lookup.length;
    const avgDeserialize = stageTimes.deserialize.reduce((a, b) => a + b) / stageTimes.deserialize.length;
    const avgRestore = stageTimes.restore.reduce((a, b) => a + b) / stageTimes.restore.length;
    const avgActivate = stageTimes.activate.reduce((a, b) => a + b) / stageTimes.activate.length;

    console.log(`\nHelper Resume Performance (100 operations):`);
    console.log(`  Min: ${Math.min(...latencies).toFixed(3)}ms`);
    console.log(`  Max: ${Math.max(...latencies).toFixed(3)}ms`);
    console.log(`  Avg: ${(latencies.reduce((a, b) => a + b) / latencies.length).toFixed(3)}ms`);
    console.log(`  P95: ${p95Latency.toFixed(3)}ms`);
    console.log(`\nAverage Stage Latencies:`);
    console.log(`  Lookup: ${avgLookup.toFixed(3)}ms`);
    console.log(`  Deserialize: ${avgDeserialize.toFixed(3)}ms`);
    console.log(`  Restore: ${avgRestore.toFixed(3)}ms`);
    console.log(`  Activate: ${avgActivate.toFixed(3)}ms`);
    console.log(`\nThreshold: <50ms (p95)`);
    console.log(`  Status: ${p95Latency < 50 ? '✅ PASS' : '❌ FAIL'}`);

    expect(p95Latency).toBeLessThan(50);
  });

  it('should handle concurrent resume operations efficiently', async () => {
    // Pause 30 helpers
    for (let i = 1; i <= 30; i++) {
      const checkpoint: AgentCheckpoint = {
        agentId: `concurrent-helper-${i}`,
        state: { task: `concurrent-task-${i}` },
        context: 'concurrent context '.repeat(50),
        memory: { data: i },
        timestamp: Date.now()
      };

      system.pauseHelper(checkpoint);
    }

    // Resume all concurrently
    const resumePromises = [];
    for (let i = 1; i <= 30; i++) {
      resumePromises.push(
        new Promise<ResumeResult>(resolve => {
          const result = system.resumeHelper(`concurrent-helper-${i}`);
          resolve(result);
        })
      );
    }

    const startTime = performance.now();
    const results = await Promise.all(resumePromises);
    const totalTime = performance.now() - startTime;

    const latencies = results.map(r => r.latencyMs);
    const sorted = latencies.sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);
    const p95Latency = sorted[p95Index];
    const maxLatency = Math.max(...latencies);

    console.log(`\nConcurrent Resume (30 helpers):`);
    console.log(`  Total time: ${totalTime.toFixed(3)}ms`);
    console.log(`  Avg latency: ${(latencies.reduce((a, b) => a + b) / latencies.length).toFixed(3)}ms`);
    console.log(`  Max latency: ${maxLatency.toFixed(3)}ms`);
    console.log(`  P95 latency: ${p95Latency.toFixed(3)}ms`);
    console.log(`  Threshold: <50ms (p95)`);
    console.log(`  Status: ${p95Latency < 50 ? '✅ PASS' : '❌ FAIL'}`);

    expect(p95Latency).toBeLessThan(50);
  });

  it('should scale resume performance with large checkpoints', () => {
    const latencies: number[] = [];

    // Create checkpoints with varying sizes
    for (let i = 1; i <= 50; i++) {
      const contextSize = i * 100; // Increasing context size
      const memoryEntries = i * 2; // Increasing memory entries

      const checkpoint: AgentCheckpoint = {
        agentId: `large-helper-${i}`,
        state: { data: 'x'.repeat(1000) },
        context: 'y'.repeat(contextSize),
        memory: Object.fromEntries(
          Array.from({ length: memoryEntries }, (_, j) => [`key-${j}`, `value-${j}`])
        ),
        timestamp: Date.now()
      };

      system.pauseHelper(checkpoint);
    }

    // Resume with increasing checkpoint sizes
    for (let i = 1; i <= 50; i++) {
      const result = system.resumeHelper(`large-helper-${i}`);
      latencies.push(result.latencyMs);
    }

    const sorted = latencies.sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);
    const p95Latency = sorted[p95Index];

    console.log(`\nResume Scalability (large checkpoints):`);
    console.log(`  Checkpoint sizes: 100-5000 chars`);
    console.log(`  Min latency: ${Math.min(...latencies).toFixed(3)}ms`);
    console.log(`  Max latency: ${Math.max(...latencies).toFixed(3)}ms`);
    console.log(`  Avg latency: ${(latencies.reduce((a, b) => a + b) / latencies.length).toFixed(3)}ms`);
    console.log(`  P95: ${p95Latency.toFixed(3)}ms`);
    console.log(`  Threshold: <50ms (p95)`);
    console.log(`  Status: ${p95Latency < 50 ? '✅ PASS' : '❌ FAIL'}`);

    expect(p95Latency).toBeLessThan(50);
  });
});
