import { describe, it, expect, beforeEach } from '@jest/globals';
import { performance } from 'perf_hooks';

/**
 * BENCHMARK THRESHOLD: Checkpoint recovery <500ms (p99)
 *
 * Tests full checkpoint recovery including deserialization, validation,
 * context restoration, and error recovery for corrupted checkpoints.
 */

interface AgentCheckpoint {
  agentId: string;
  version: string;
  state: any;
  context: string;
  memory: Record<string, any>;
  files: string[];
  timestamp: number;
  checksum?: string;
}

interface RecoveryResult {
  agentId: string;
  success: boolean;
  latencyMs: number;
  stages: {
    load: number;
    validate: number;
    deserialize: number;
    restore: number;
    verify: number;
  };
  errors?: string[];
}

class CheckpointRecoverySystem {
  private storage: Map<string, string> = new Map();

  saveCheckpoint(checkpoint: AgentCheckpoint): void {
    const checksum = this.calculateChecksum(checkpoint);
    const withChecksum = { ...checkpoint, checksum };
    const serialized = JSON.stringify(withChecksum);
    this.storage.set(checkpoint.agentId, serialized);
  }

  /**
   * Recover agent from checkpoint
   * Should complete in <500ms (p99) including validation
   */
  recoverFromCheckpoint(agentId: string): RecoveryResult {
    const startTime = performance.now();
    const stages = { load: 0, validate: 0, deserialize: 0, restore: 0, verify: 0 };
    const errors: string[] = [];

    // Stage 1: Load checkpoint from storage
    const loadStart = performance.now();
    const serialized = this.storage.get(agentId);
    stages.load = performance.now() - loadStart;

    if (!serialized) {
      return {
        agentId,
        success: false,
        latencyMs: performance.now() - startTime,
        stages,
        errors: ['Checkpoint not found']
      };
    }

    // Stage 2: Validate checkpoint integrity
    const validateStart = performance.now();
    let checkpoint: AgentCheckpoint;
    try {
      checkpoint = JSON.parse(serialized);

      // Verify checksum
      const expectedChecksum = checkpoint.checksum;
      delete checkpoint.checksum;
      const actualChecksum = this.calculateChecksum(checkpoint);

      if (expectedChecksum !== actualChecksum) {
        errors.push('Checksum mismatch - checkpoint may be corrupted');
      }

      // Validate required fields
      if (!checkpoint.agentId || !checkpoint.state || !checkpoint.context) {
        errors.push('Missing required checkpoint fields');
      }

      // Validate version compatibility
      if (!this.isVersionCompatible(checkpoint.version)) {
        errors.push(`Incompatible checkpoint version: ${checkpoint.version}`);
      }
    } catch (error) {
      return {
        agentId,
        success: false,
        latencyMs: performance.now() - startTime,
        stages,
        errors: ['Failed to parse checkpoint']
      };
    }
    stages.validate = performance.now() - validateStart;

    // Stage 3: Deserialize complex state
    const deserializeStart = performance.now();
    const state = this.deserializeState(checkpoint.state);
    const memory = this.deserializeMemory(checkpoint.memory);
    stages.deserialize = performance.now() - deserializeStart;

    // Stage 4: Restore agent context
    const restoreStart = performance.now();
    const restoredAgent = {
      id: checkpoint.agentId,
      state,
      context: checkpoint.context,
      memory,
      files: checkpoint.files,
      version: checkpoint.version,
      recoveredAt: Date.now()
    };
    stages.restore = performance.now() - restoreStart;

    // Stage 5: Verify restoration
    const verifyStart = performance.now();
    const verificationErrors = this.verifyRestoration(restoredAgent);
    errors.push(...verificationErrors);
    stages.verify = performance.now() - verifyStart;

    const latencyMs = performance.now() - startTime;

    return {
      agentId,
      success: errors.length === 0,
      latencyMs,
      stages,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  private calculateChecksum(checkpoint: AgentCheckpoint): string {
    const str = JSON.stringify(checkpoint);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  private isVersionCompatible(version: string): boolean {
    const [major] = version.split('.');
    return parseInt(major) === 1; // Accept v1.x.x
  }

  private deserializeState(state: any): any {
    // Simulate complex state deserialization
    return JSON.parse(JSON.stringify(state));
  }

  private deserializeMemory(memory: Record<string, any>): Record<string, any> {
    // Simulate memory deserialization with type restoration
    return JSON.parse(JSON.stringify(memory));
  }

  private verifyRestoration(agent: any): string[] {
    const errors: string[] = [];

    if (!agent.id) errors.push('Missing agent ID');
    if (!agent.state) errors.push('Missing agent state');
    if (!agent.context) errors.push('Missing agent context');

    return errors;
  }

  reset(): void {
    this.storage.clear();
  }
}

describe('Checkpoint Recovery Performance Benchmark', () => {
  let system: CheckpointRecoverySystem;

  beforeEach(() => {
    system = new CheckpointRecoverySystem();
  });

  it('should recover from checkpoint in <500ms', () => {
    const checkpoint: AgentCheckpoint = {
      agentId: 'agent-1',
      version: '1.0.0',
      state: {
        currentTask: 'security-audit',
        progress: 0.75,
        findings: Array.from({ length: 20 }, (_, i) => ({ id: i, severity: 'medium' }))
      },
      context: 'Agent was performing security audit. Found 20 potential issues. '.repeat(10),
      memory: {
        reviewed_files: Array.from({ length: 50 }, (_, i) => `src/file-${i}.ts`),
        patterns: { sql_injection: 5, xss: 8, csrf: 3 }
      },
      files: Array.from({ length: 30 }, (_, i) => `src/module-${i}.ts`),
      timestamp: Date.now()
    };

    system.saveCheckpoint(checkpoint);

    const result = system.recoverFromCheckpoint('agent-1');

    console.log(`\nCheckpoint Recovery Latency (single agent):`);
    console.log(`  Load: ${result.stages.load.toFixed(3)}ms`);
    console.log(`  Validate: ${result.stages.validate.toFixed(3)}ms`);
    console.log(`  Deserialize: ${result.stages.deserialize.toFixed(3)}ms`);
    console.log(`  Restore: ${result.stages.restore.toFixed(3)}ms`);
    console.log(`  Verify: ${result.stages.verify.toFixed(3)}ms`);
    console.log(`  Total: ${result.latencyMs.toFixed(3)}ms`);
    console.log(`  Threshold: <500ms`);
    console.log(`  Status: ${result.latencyMs < 500 ? '✅ PASS' : '❌ FAIL'}`);

    expect(result.success).toBe(true);
    expect(result.latencyMs).toBeLessThan(500);
  });

  it('should maintain <500ms p99 across 100 recovery operations', () => {
    const latencies: number[] = [];
    const stageTimes = { load: [], validate: [], deserialize: [], restore: [], verify: [] };

    // Save 100 checkpoints with varied complexity
    for (let i = 1; i <= 100; i++) {
      const filesCount = 10 + Math.floor(Math.random() * 40);
      const findingsCount = 5 + Math.floor(Math.random() * 30);

      const checkpoint: AgentCheckpoint = {
        agentId: `agent-${i}`,
        version: '1.0.0',
        state: {
          task: `task-${i}`,
          progress: Math.random(),
          findings: Array.from({ length: findingsCount }, (_, j) => ({
            id: j,
            type: 'security',
            severity: j % 3 === 0 ? 'high' : 'medium'
          }))
        },
        context: `Agent ${i} context. `.repeat(Math.floor(Math.random() * 50) + 20),
        memory: {
          data: Array.from({ length: 20 }, (_, j) => ({ key: `data-${j}`, value: Math.random() })),
          metrics: { count: i, avg: Math.random() * 100 }
        },
        files: Array.from({ length: filesCount }, (_, j) => `src/file-${i}-${j}.ts`),
        timestamp: Date.now()
      };

      system.saveCheckpoint(checkpoint);
    }

    // Recover all checkpoints
    for (let i = 1; i <= 100; i++) {
      const result = system.recoverFromCheckpoint(`agent-${i}`);
      latencies.push(result.latencyMs);
      stageTimes.load.push(result.stages.load);
      stageTimes.validate.push(result.stages.validate);
      stageTimes.deserialize.push(result.stages.deserialize);
      stageTimes.restore.push(result.stages.restore);
      stageTimes.verify.push(result.stages.verify);
    }

    const sorted = latencies.sort((a, b) => a - b);
    const p99Index = Math.floor(sorted.length * 0.99);
    const p99Latency = sorted[p99Index];

    const avgLoad = stageTimes.load.reduce((a, b) => a + b) / stageTimes.load.length;
    const avgValidate = stageTimes.validate.reduce((a, b) => a + b) / stageTimes.validate.length;
    const avgDeserialize = stageTimes.deserialize.reduce((a, b) => a + b) / stageTimes.deserialize.length;
    const avgRestore = stageTimes.restore.reduce((a, b) => a + b) / stageTimes.restore.length;
    const avgVerify = stageTimes.verify.reduce((a, b) => a + b) / stageTimes.verify.length;

    console.log(`\nCheckpoint Recovery Performance (100 operations):`);
    console.log(`  Min: ${Math.min(...latencies).toFixed(3)}ms`);
    console.log(`  Max: ${Math.max(...latencies).toFixed(3)}ms`);
    console.log(`  Avg: ${(latencies.reduce((a, b) => a + b) / latencies.length).toFixed(3)}ms`);
    console.log(`  P99: ${p99Latency.toFixed(3)}ms`);
    console.log(`\nAverage Stage Latencies:`);
    console.log(`  Load: ${avgLoad.toFixed(3)}ms`);
    console.log(`  Validate: ${avgValidate.toFixed(3)}ms`);
    console.log(`  Deserialize: ${avgDeserialize.toFixed(3)}ms`);
    console.log(`  Restore: ${avgRestore.toFixed(3)}ms`);
    console.log(`  Verify: ${avgVerify.toFixed(3)}ms`);
    console.log(`\nThreshold: <500ms (p99)`);
    console.log(`  Status: ${p99Latency < 500 ? '✅ PASS' : '❌ FAIL'}`);

    expect(p99Latency).toBeLessThan(500);
  });

  it('should handle large checkpoint recovery efficiently', () => {
    const latencies: number[] = [];

    // Create progressively larger checkpoints
    for (let i = 1; i <= 20; i++) {
      const size = i * 50; // Increasing size multiplier

      const checkpoint: AgentCheckpoint = {
        agentId: `large-agent-${i}`,
        version: '1.0.0',
        state: {
          data: 'x'.repeat(size * 10),
          array: Array.from({ length: size }, (_, j) => ({ id: j, value: `item-${j}` }))
        },
        context: 'y'.repeat(size * 20),
        memory: Object.fromEntries(
          Array.from({ length: size }, (_, j) => [`key-${j}`, `value-${j}-${'z'.repeat(10)}`])
        ),
        files: Array.from({ length: size }, (_, j) => `file-${j}.ts`),
        timestamp: Date.now()
      };

      system.saveCheckpoint(checkpoint);
    }

    // Recover large checkpoints
    for (let i = 1; i <= 20; i++) {
      const result = system.recoverFromCheckpoint(`large-agent-${i}`);
      latencies.push(result.latencyMs);
    }

    const sorted = latencies.sort((a, b) => a - b);
    const p99Index = Math.floor(sorted.length * 0.99);
    const p99Latency = sorted[p99Index];

    console.log(`\nCheckpoint Recovery Scalability (large checkpoints):`);
    console.log(`  Checkpoint sizes: 50x - 1000x base size`);
    console.log(`  Min latency: ${Math.min(...latencies).toFixed(3)}ms`);
    console.log(`  Max latency: ${Math.max(...latencies).toFixed(3)}ms`);
    console.log(`  Avg latency: ${(latencies.reduce((a, b) => a + b) / latencies.length).toFixed(3)}ms`);
    console.log(`  P99: ${p99Latency.toFixed(3)}ms`);
    console.log(`  Threshold: <500ms (p99)`);
    console.log(`  Status: ${p99Latency < 500 ? '✅ PASS' : '❌ FAIL'}`);

    expect(p99Latency).toBeLessThan(500);
  });

  it('should recover from corrupted checkpoints gracefully', () => {
    const checkpoint: AgentCheckpoint = {
      agentId: 'corrupted-agent',
      version: '1.0.0',
      state: { task: 'important-work' },
      context: 'critical context',
      memory: { key: 'value' },
      files: ['file1.ts'],
      timestamp: Date.now()
    };

    system.saveCheckpoint(checkpoint);

    // Simulate corruption by modifying storage directly
    const serialized = system['storage'].get('corrupted-agent')!;
    const corrupted = serialized.slice(0, -50) + 'CORRUPTED_DATA"}';
    system['storage'].set('corrupted-agent', corrupted);

    const result = system.recoverFromCheckpoint('corrupted-agent');

    console.log(`\nCorrupted Checkpoint Recovery:`);
    console.log(`  Success: ${result.success}`);
    console.log(`  Latency: ${result.latencyMs.toFixed(3)}ms`);
    console.log(`  Errors: ${result.errors?.join(', ') || 'none'}`);
    console.log(`  Threshold: <500ms even on failure`);
    console.log(`  Status: ${result.latencyMs < 500 ? '✅ PASS' : '❌ FAIL'}`);

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.latencyMs).toBeLessThan(500); // Should fail fast
  });
});
