/**
 * CFN Loop Parallel Execution CLI Command
 * Sprint 5 - Phase 5.1: CLI Integration
 *
 * Enables parallel execution of multiple CFN Loop sprints with resource management,
 * dependency analysis, and real-time monitoring.
 */

import { Command } from 'commander';
import { EventEmitter } from 'events';
import Redis from 'ioredis';

interface ParallelSprintConfig {
  sprintId: string;
  objective: string;
  dependencies: string[];
  estimatedAgents: number;
  priority: number;
}

interface ParallelExecutionOptions {
  parallel?: boolean;
  analyzeOnly?: boolean;
  maxParallelSprints?: number;
  maxAgentsPerSprint?: number;
  testSlots?: number;
  memoryLimitMb?: number;
}

interface DependencyNode {
  sprintId: string;
  dependencies: string[];
  dependents: string[];
  depth: number;
}

interface ExecutionWave {
  wave: number;
  sprints: string[];
  estimatedAgents: number;
  estimatedMemoryMb: number;
}

/**
 * Dependency Graph Analyzer
 * Builds topological ordering of sprints for parallel execution
 */
class DependencyAnalyzer {
  private graph: Map<string, DependencyNode> = new Map();

  constructor(sprints: ParallelSprintConfig[]) {
    this.buildGraph(sprints);
  }

  private buildGraph(sprints: ParallelSprintConfig[]): void {
    // Initialize nodes
    for (const sprint of sprints) {
      this.graph.set(sprint.sprintId, {
        sprintId: sprint.sprintId,
        dependencies: sprint.dependencies,
        dependents: [],
        depth: 0
      });
    }

    // Build dependency edges
    for (const sprint of sprints) {
      for (const depId of sprint.dependencies) {
        const depNode = this.graph.get(depId);
        if (depNode) {
          depNode.dependents.push(sprint.sprintId);
        }
      }
    }

    // Calculate depth (for wave assignment)
    this.calculateDepths();
  }

  private calculateDepths(): void {
    const visited = new Set<string>();
    const calculateDepth = (sprintId: string): number => {
      if (visited.has(sprintId)) {
        const node = this.graph.get(sprintId);
        return node?.depth || 0;
      }
      visited.add(sprintId);

      const node = this.graph.get(sprintId);
      if (!node || node.dependencies.length === 0) {
        if (node) node.depth = 0;
        return 0;
      }

      const maxDepDepth = Math.max(
        ...node.dependencies.map(depId => calculateDepth(depId))
      );
      node.depth = maxDepDepth + 1;
      return node.depth;
    };

    for (const sprintId of this.graph.keys()) {
      calculateDepth(sprintId);
    }
  }

  /**
   * Generate execution waves for parallel execution
   * Sprints in same wave can run in parallel (no dependencies between them)
   */
  public getExecutionWaves(
    sprints: ParallelSprintConfig[],
    maxParallelSprints: number
  ): ExecutionWave[] {
    const waves: ExecutionWave[] = [];
    const sprintsByDepth = new Map<number, ParallelSprintConfig[]>();

    // Group sprints by depth
    for (const sprint of sprints) {
      const node = this.graph.get(sprint.sprintId);
      const depth = node?.depth || 0;
      if (!sprintsByDepth.has(depth)) {
        sprintsByDepth.set(depth, []);
      }
      sprintsByDepth.get(depth)!.push(sprint);
    }

    // Create waves respecting maxParallelSprints limit
    const sortedDepths = Array.from(sprintsByDepth.keys()).sort((a, b) => a - b);
    for (const depth of sortedDepths) {
      const sprintsAtDepth = sprintsByDepth.get(depth)!;

      // Split into multiple waves if exceeds limit
      for (let i = 0; i < sprintsAtDepth.length; i += maxParallelSprints) {
        const waveSprints = sprintsAtDepth.slice(i, i + maxParallelSprints);
        waves.push({
          wave: waves.length + 1,
          sprints: waveSprints.map(s => s.sprintId),
          estimatedAgents: waveSprints.reduce((sum, s) => sum + s.estimatedAgents, 0),
          estimatedMemoryMb: waveSprints.reduce((sum, s) => sum + (s.estimatedAgents * 150), 0) // ~150MB per agent
        });
      }
    }

    return waves;
  }

  /**
   * Detect circular dependencies
   */
  public detectCircularDependencies(): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const detectCycle = (sprintId: string, path: string[]): void => {
      visited.add(sprintId);
      recStack.add(sprintId);
      path.push(sprintId);

      const node = this.graph.get(sprintId);
      if (node) {
        for (const depId of node.dependencies) {
          if (!visited.has(depId)) {
            detectCycle(depId, [...path]);
          } else if (recStack.has(depId)) {
            // Cycle detected
            const cycleStart = path.indexOf(depId);
            cycles.push([...path.slice(cycleStart), depId]);
          }
        }
      }

      recStack.delete(sprintId);
    };

    for (const sprintId of this.graph.keys()) {
      if (!visited.has(sprintId)) {
        detectCycle(sprintId, []);
      }
    }

    return cycles;
  }
}

/**
 * Parallel CFN Loop Coordinator
 * Manages resource allocation, test slot queuing, and execution monitoring
 */
class ParallelCFNLoopCoordinator extends EventEmitter {
  private redis: Redis;
  private activeWave: number = 0;
  private completedSprints: Set<string> = new Set();
  private failedSprints: Set<string> = new Set();
  private resourcePool: {
    availableTestSlots: number;
    availableMemoryMb: number;
    activeAgents: number;
  };

  constructor(
    private options: ParallelExecutionOptions,
    private redisUrl: string = 'redis://localhost:6379'
  ) {
    super();
    this.redis = new Redis(redisUrl);
    this.resourcePool = {
      availableTestSlots: options.testSlots || 4,
      availableMemoryMb: options.memoryLimitMb || 8192,
      activeAgents: 0
    };
  }

  /**
   * Execute sprints in parallel waves
   */
  async executeWaves(
    waves: ExecutionWave[],
    sprints: ParallelSprintConfig[]
  ): Promise<{
    completed: string[];
    failed: string[];
    totalTime: number;
  }> {
    const startTime = Date.now();

    for (const wave of waves) {
      this.activeWave = wave.wave;
      console.log(`\n🌊 Wave ${wave.wave}/${waves.length}: ${wave.sprints.length} sprints`);
      console.log(`   Estimated: ${wave.estimatedAgents} agents, ${wave.estimatedMemoryMb}MB memory`);

      // Check resource availability
      if (wave.estimatedMemoryMb > this.resourcePool.availableMemoryMb) {
        console.warn(`⚠️  Wave ${wave.wave} exceeds memory limit. Proceeding with caution...`);
      }

      // Execute sprints in wave concurrently
      const wavePromises = wave.sprints.map(sprintId => {
        const sprint = sprints.find(s => s.sprintId === sprintId);
        if (!sprint) return Promise.resolve({ success: false, sprintId });

        return this.executeSprint(sprint);
      });

      const results = await Promise.allSettled(wavePromises);

      // Process results
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const sprintId = wave.sprints[i];

        if (result.status === 'fulfilled' && result.value.success) {
          this.completedSprints.add(sprintId);
          console.log(`   ✅ ${sprintId} completed`);
        } else {
          this.failedSprints.add(sprintId);
          console.error(`   ❌ ${sprintId} failed`);
        }
      }

      // Store wave completion in Redis
      await this.redis.setex(
        `cfn:parallel:wave:${wave.wave}:status`,
        3600,
        JSON.stringify({
          wave: wave.wave,
          completed: Array.from(this.completedSprints),
          failed: Array.from(this.failedSprints),
          timestamp: Date.now()
        })
      );
    }

    const totalTime = Date.now() - startTime;
    return {
      completed: Array.from(this.completedSprints),
      failed: Array.from(this.failedSprints),
      totalTime
    };
  }

  /**
   * Execute single sprint with resource management
   */
  private async executeSprint(sprint: ParallelSprintConfig): Promise<{
    success: boolean;
    sprintId: string;
    confidence?: number;
  }> {
    // Allocate test slot
    const testSlot = await this.acquireTestSlot(sprint.sprintId);
    if (!testSlot) {
      console.warn(`⚠️  ${sprint.sprintId}: Waiting for test slot...`);
      await this.waitForTestSlot();
    }

    try {
      // Store sprint state in Redis
      await this.redis.setex(
        `cfn:parallel:sprint:${sprint.sprintId}:state`,
        3600,
        JSON.stringify({
          status: 'in-progress',
          wave: this.activeWave,
          startTime: Date.now(),
          estimatedAgents: sprint.estimatedAgents
        })
      );

      // Emit start event
      this.emit('sprint:start', { sprintId: sprint.sprintId, wave: this.activeWave });

      // Execute CFN Loop for sprint
      // This would call the actual CFN Loop execution logic
      const result = await this.executeCFNLoop(sprint);

      // Update resource pool
      this.resourcePool.activeAgents -= sprint.estimatedAgents;

      // Emit completion event
      this.emit('sprint:complete', {
        sprintId: sprint.sprintId,
        confidence: result.confidence,
        wave: this.activeWave
      });

      return {
        success: result.confidence >= 0.75,
        sprintId: sprint.sprintId,
        confidence: result.confidence
      };

    } catch (error) {
      this.emit('sprint:error', {
        sprintId: sprint.sprintId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return { success: false, sprintId: sprint.sprintId };
    } finally {
      // Release test slot
      await this.releaseTestSlot(sprint.sprintId);
    }
  }

  /**
   * Acquire test slot with queuing
   */
  private async acquireTestSlot(sprintId: string): Promise<boolean> {
    const slot = await this.redis.lpush('cfn:parallel:test-slot-queue', sprintId);

    // Check if we're within limit
    const queueLength = await this.redis.llen('cfn:parallel:test-slot-queue');
    return queueLength <= (this.options.testSlots || 4);
  }

  /**
   * Release test slot
   */
  private async releaseTestSlot(sprintId: string): Promise<void> {
    await this.redis.lrem('cfn:parallel:test-slot-queue', 1, sprintId);
  }

  /**
   * Wait for available test slot
   */
  private async waitForTestSlot(): Promise<void> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(async () => {
        const queueLength = await this.redis.llen('cfn:parallel:test-slot-queue');
        if (queueLength < (this.options.testSlots || 4)) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 1000);
    });
  }

  /**
   * Execute CFN Loop for sprint (stub - integrate with actual CFN Loop)
   */
  private async executeCFNLoop(sprint: ParallelSprintConfig): Promise<{
    confidence: number;
  }> {
    // This would integrate with the actual CFN Loop execution
    // For now, return mock result
    await new Promise(resolve => setTimeout(resolve, 2000));
    return { confidence: 0.85 };
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}

/**
 * CLI Command: cfn-loop-parallel
 */
export function createParallelCFNLoopCommand(): Command {
  const command = new Command('cfn-loop-parallel');

  command
    .description('Execute CFN Loop sprints in parallel with dependency management')
    .argument('<epic-config>', 'Path to epic configuration JSON file')
    .option('--parallel', 'Enable parallel execution (default: sequential)', false)
    .option('--analyze-only', 'Only analyze dependencies without execution', false)
    .option('--max-parallel-sprints <n>', 'Maximum concurrent sprints', '3')
    .option('--max-agents-per-sprint <n>', 'Maximum agents per sprint', '10')
    .option('--test-slots <n>', 'Number of concurrent test slots', '4')
    .option('--memory-limit-mb <n>', 'Memory limit in MB', '8192')
    .action(async (epicConfigPath: string, options: ParallelExecutionOptions) => {
      try {
        // Load epic configuration
        const fs = await import('fs/promises');
        const epicConfig = JSON.parse(await fs.readFile(epicConfigPath, 'utf-8'));
        const sprints: ParallelSprintConfig[] = epicConfig.sprints || [];

        console.log(`\n🚀 CFN Loop Parallel Execution`);
        console.log(`   Epic: ${epicConfig.name || 'Unnamed Epic'}`);
        console.log(`   Sprints: ${sprints.length}`);
        console.log(`   Mode: ${options.parallel ? 'Parallel' : 'Sequential'}`);

        // Analyze dependencies
        const analyzer = new DependencyAnalyzer(sprints);
        const cycles = analyzer.detectCircularDependencies();

        if (cycles.length > 0) {
          console.error('\n❌ Circular dependencies detected:');
          cycles.forEach((cycle, i) => {
            console.error(`   ${i + 1}. ${cycle.join(' → ')}`);
          });
          process.exit(1);
        }

        // Generate execution waves
        const maxParallelSprints = parseInt(options.maxParallelSprints || '3');
        const waves = analyzer.getExecutionWaves(sprints, maxParallelSprints);

        console.log(`\n📊 Execution Plan:`);
        console.log(`   Waves: ${waves.length}`);
        waves.forEach(wave => {
          console.log(`   Wave ${wave.wave}: ${wave.sprints.join(', ')}`);
          console.log(`      → ${wave.estimatedAgents} agents, ~${wave.estimatedMemoryMb}MB`);
        });

        if (options.analyzeOnly) {
          console.log('\n✅ Analysis complete (--analyze-only mode)');
          return;
        }

        // Execute parallel coordination
        if (options.parallel) {
          const coordinator = new ParallelCFNLoopCoordinator(options);

          // Monitor events
          coordinator.on('sprint:start', (data) => {
            console.log(`   🔄 Starting: ${data.sprintId} (Wave ${data.wave})`);
          });

          coordinator.on('sprint:complete', (data) => {
            console.log(`   ✅ Completed: ${data.sprintId} (confidence: ${data.confidence})`);
          });

          coordinator.on('sprint:error', (data) => {
            console.error(`   ❌ Error: ${data.sprintId} - ${data.error}`);
          });

          const result = await coordinator.executeWaves(waves, sprints);

          console.log(`\n📊 Execution Summary:`);
          console.log(`   Total Time: ${(result.totalTime / 1000).toFixed(2)}s`);
          console.log(`   Completed: ${result.completed.length}/${sprints.length}`);
          console.log(`   Failed: ${result.failed.length}`);

          await coordinator.close();

          if (result.failed.length > 0) {
            process.exit(1);
          }
        } else {
          console.log('\n⚠️  Sequential mode not yet implemented');
        }

      } catch (error) {
        console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    });

  return command;
}

/**
 * CLI Command: cfn-loop-parallel-status
 */
export function createParallelStatusCommand(): Command {
  const command = new Command('cfn-loop-parallel-status');

  command
    .description('Monitor parallel CFN Loop execution status')
    .option('--wave <n>', 'Show specific wave status')
    .option('--sprint <id>', 'Show specific sprint status')
    .option('--watch', 'Watch mode (auto-refresh)', false)
    .action(async (options: { wave?: string; sprint?: string; watch?: boolean }) => {
      const redis = new Redis('redis://localhost:6379');

      const displayStatus = async (): Promise<void> => {
        console.clear();
        console.log('🔍 CFN Loop Parallel Execution Status\n');

        if (options.sprint) {
          // Show specific sprint
          const state = await redis.get(`cfn:parallel:sprint:${options.sprint}:state`);
          if (state) {
            const data = JSON.parse(state);
            console.log(`Sprint: ${options.sprint}`);
            console.log(`Status: ${data.status}`);
            console.log(`Wave: ${data.wave}`);
            console.log(`Agents: ${data.estimatedAgents}`);
            console.log(`Started: ${new Date(data.startTime).toISOString()}`);
          } else {
            console.log(`Sprint ${options.sprint} not found`);
          }
        } else if (options.wave) {
          // Show specific wave
          const state = await redis.get(`cfn:parallel:wave:${options.wave}:status`);
          if (state) {
            const data = JSON.parse(state);
            console.log(`Wave: ${data.wave}`);
            console.log(`Completed: ${data.completed.join(', ')}`);
            console.log(`Failed: ${data.failed.join(', ')}`);
          } else {
            console.log(`Wave ${options.wave} not found`);
          }
        } else {
          // Show all active sprints
          const keys = await redis.keys('cfn:parallel:sprint:*:state');
          console.log(`Active Sprints: ${keys.length}\n`);

          for (const key of keys) {
            const state = await redis.get(key);
            if (state) {
              const data = JSON.parse(state);
              const sprintId = key.split(':')[3];
              console.log(`  ${sprintId}: ${data.status} (Wave ${data.wave})`);
            }
          }

          // Show test slot queue
          const queueLength = await redis.llen('cfn:parallel:test-slot-queue');
          console.log(`\nTest Slot Queue: ${queueLength} waiting`);
        }

        console.log(`\nLast Update: ${new Date().toISOString()}`);
      };

      if (options.watch) {
        // Watch mode
        const interval = setInterval(displayStatus, 2000);
        displayStatus();

        process.on('SIGINT', () => {
          clearInterval(interval);
          redis.quit();
          process.exit(0);
        });
      } else {
        await displayStatus();
        await redis.quit();
      }
    });

  return command;
}

export default { createParallelCFNLoopCommand, createParallelStatusCommand };
