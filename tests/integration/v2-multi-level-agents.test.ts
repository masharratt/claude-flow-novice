/**
 * V2 Multi-Level Agent Spawning Test
 *
 * Tests 3-level deep agent hierarchy with V2 SDK coordination:
 * - Level 1: Coordinator spawns orchestrator
 * - Level 2: Orchestrator spawns workers
 * - Level 3: Workers spawn helpers
 *
 * Validates:
 * - Agent spawning at each level
 * - Pause/resume (zero-cost)
 * - Checkpoint creation/restoration
 * - Telemetry tracking
 * - Resource allocation
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { CoordinationToggle } from '../../src/coordination/coordination-toggle.js';
import type { ICoordinator } from '../../src/coordination/v2/interfaces/ICoordinator.js';
import type { Agent } from '../../src/coordination/v2/interfaces/ICoordinator.js';

describe('V2 Multi-Level Agent Spawning', () => {
  let coordinator: ICoordinator;
  const spawnedAgents: Agent[] = [];
  const checkpointIds: string[] = [];

  beforeEach(async () => {
    // Force V2 SDK mode for testing
    process.env.COORDINATION_VERSION = 'v2';

    // Provide mock API key for SDK mode testing
    if (!process.env.ANTHROPIC_API_KEY) {
      process.env.ANTHROPIC_API_KEY = process.env.TEST_ANTHROPIC_API_KEY || 'test-key-mock';
    }

    console.log('\n🚀 Initializing V2 Coordinator...');
    coordinator = await CoordinationToggle.create({
      version: 'v2',
      topology: 'mesh',
      maxAgents: 15, // Allow 3 levels x 5 agents
      tokenBudget: 20000,
      enableConsensus: false, // Simplify for testing
    });

    console.log('✅ V2 Coordinator initialized\n');
  });

  afterEach(async () => {
    // Cleanup all spawned agents
    console.log('\n🧹 Cleanup: Terminating all agents...');
    for (const agent of spawnedAgents) {
      try {
        await coordinator.terminateAgent(agent.agentId, 'Test cleanup');
        console.log(`  ✓ Terminated ${agent.agentId}`);
      } catch (err) {
        console.log(`  ⚠ Already terminated: ${agent.agentId}`);
      }
    }

    spawnedAgents.length = 0;
    checkpointIds.length = 0;

    delete process.env.COORDINATION_VERSION;
  });

  it('should spawn 3-level agent hierarchy with telemetry', async () => {
    console.log('━'.repeat(60));
    console.log('📊 TEST: 3-Level Agent Hierarchy');
    console.log('━'.repeat(60));

    // ========================================
    // LEVEL 1: Spawn Orchestrator
    // ========================================
    console.log('\n📍 LEVEL 1: Spawning Orchestrator');
    console.log('  ├─ Agent: orchestrator-001');
    console.log('  ├─ Type: orchestrator');
    console.log('  └─ Priority: 10 (highest)');

    const startTime1 = Date.now();
    const orchestrator = await coordinator.spawnAgent({
      agentId: 'orchestrator-001',
      type: 'orchestrator',
      priority: 10,
      tokenBudget: 15000,
      metadata: {
        level: 1,
        role: 'task-coordinator',
        capabilities: ['task-decomposition', 'agent-spawning'],
      },
    });
    const spawnTime1 = Date.now() - startTime1;

    spawnedAgents.push(orchestrator);

    console.log(`\n  ✅ Level 1 spawned in ${spawnTime1}ms`);
    console.log(`     └─ Agent ID: ${orchestrator.agentId}`);
    console.log(`     └─ Session: ${orchestrator.sessionId}`);
    console.log(`     └─ State: ${orchestrator.state}`);

    expect(orchestrator.agentId).toBe('orchestrator-001');
    expect(orchestrator.state).toBe('idle');
    expect(orchestrator.isPaused).toBe(false);

    // ========================================
    // LEVEL 2: Orchestrator spawns Workers
    // ========================================
    console.log('\n📍 LEVEL 2: Orchestrator spawning 3 Workers');

    const workers: Agent[] = [];
    const workerTypes = ['coder', 'tester', 'reviewer'];

    for (let i = 0; i < 3; i++) {
      const workerType = workerTypes[i];
      const workerId = `worker-${workerType}-00${i + 1}`;

      console.log(`\n  ├─ Worker ${i + 1}:`);
      console.log(`  │  ├─ Agent: ${workerId}`);
      console.log(`  │  ├─ Type: ${workerType}`);
      console.log(`  │  └─ Priority: ${8 - i} (parent: 10)`);

      const startTime2 = Date.now();
      const worker = await coordinator.spawnAgent({
        agentId: workerId,
        type: workerType,
        priority: 8 - i, // 8, 7, 6
        tokenBudget: 10000,
        metadata: {
          level: 2,
          parent: 'orchestrator-001',
          role: workerType,
          capabilities: [workerType, 'analysis'],
        },
      });
      const spawnTime2 = Date.now() - startTime2;

      workers.push(worker);
      spawnedAgents.push(worker);

      console.log(`  │  ✅ Spawned in ${spawnTime2}ms`);
      console.log(`  │     └─ Session: ${worker.sessionId}`);

      expect(worker.agentId).toBe(workerId);
      expect(worker.state).toBe('idle');
    }

    console.log(`\n  ✅ Level 2 complete: ${workers.length} workers spawned`);

    // ========================================
    // LEVEL 3: Workers spawn Helpers
    // ========================================
    console.log('\n📍 LEVEL 3: Workers spawning Helpers');

    const helpers: Agent[] = [];

    for (const worker of workers) {
      const helperType = `${worker.type}-helper`;
      const helperId = `helper-${worker.type}-001`;

      console.log(`\n  ├─ ${worker.type.toUpperCase()} spawning helper:`);
      console.log(`  │  ├─ Agent: ${helperId}`);
      console.log(`  │  ├─ Type: ${helperType}`);
      console.log(`  │  └─ Priority: ${worker.priority - 1} (parent: ${worker.priority})`);

      const startTime3 = Date.now();
      const helper = await coordinator.spawnAgent({
        agentId: helperId,
        type: helperType,
        priority: worker.priority - 1,
        tokenBudget: 5000,
        metadata: {
          level: 3,
          parent: worker.agentId,
          role: `${worker.type}-assistant`,
          capabilities: [worker.type, 'support'],
        },
      });
      const spawnTime3 = Date.now() - startTime3;

      helpers.push(helper);
      spawnedAgents.push(helper);

      console.log(`  │  ✅ Spawned in ${spawnTime3}ms`);
      console.log(`  │     └─ Session: ${helper.sessionId}`);

      expect(helper.agentId).toBe(helperId);
      expect(helper.state).toBe('idle');
    }

    console.log(`\n  ✅ Level 3 complete: ${helpers.length} helpers spawned`);

    // ========================================
    // HIERARCHY SUMMARY
    // ========================================
    console.log('\n' + '━'.repeat(60));
    console.log('📊 HIERARCHY SUMMARY');
    console.log('━'.repeat(60));
    console.log(`\n  Level 1: 1 orchestrator`);
    console.log(`  Level 2: ${workers.length} workers`);
    console.log(`  Level 3: ${helpers.length} helpers`);
    console.log(`  ─────────────────────`);
    console.log(`  Total:   ${1 + workers.length + helpers.length} agents`);

    expect(spawnedAgents.length).toBe(7); // 1 + 3 + 3

    // ========================================
    // METRICS VALIDATION
    // ========================================
    console.log('\n📊 Coordinator Metrics:');
    const metrics = coordinator.getMetrics();

    console.log(`  ├─ Total spawned: ${metrics.totalAgentsSpawned}`);
    console.log(`  ├─ Active agents: ${metrics.activeAgents}`);
    console.log(`  ├─ Paused agents: ${metrics.pausedAgents}`);
    console.log(`  ├─ Checkpoints:   ${metrics.totalCheckpoints}`);
    console.log(`  └─ Uptime:        ${metrics.uptimeMs}ms`);

    expect(metrics.totalAgentsSpawned).toBe(7);
    expect(metrics.activeAgents).toBe(7);
    expect(metrics.pausedAgents).toBe(0);
  });

  it('should pause/resume agents at each level (zero-cost)', async () => {
    console.log('━'.repeat(60));
    console.log('⏸️  TEST: Zero-Cost Pause/Resume at Each Level');
    console.log('━'.repeat(60));

    // Spawn hierarchy quickly
    const orchestrator = await coordinator.spawnAgent({
      agentId: 'orch-pause-001',
      type: 'orchestrator',
      priority: 10,
    });
    spawnedAgents.push(orchestrator);

    const worker = await coordinator.spawnAgent({
      agentId: 'worker-pause-001',
      type: 'coder',
      priority: 8,
      metadata: { parent: orchestrator.agentId },
    });
    spawnedAgents.push(worker);

    const helper = await coordinator.spawnAgent({
      agentId: 'helper-pause-001',
      type: 'coder-helper',
      priority: 7,
      metadata: { parent: worker.agentId },
    });
    spawnedAgents.push(helper);

    console.log('\n✅ 3-level hierarchy spawned\n');

    // ========================================
    // PAUSE LEVEL 3 (Helper)
    // ========================================
    console.log('📍 LEVEL 3: Pausing helper');
    const pauseStart3 = Date.now();
    await coordinator.pauseAgent(helper.agentId, 'Testing pause at level 3');
    const pauseTime3 = Date.now() - pauseStart3;

    console.log(`  ✅ Paused in ${pauseTime3}ms`);
    console.log(`     └─ Target: <50ms (zero-cost pause)`);

    expect(pauseTime3).toBeLessThan(50); // Zero-cost pause target

    // Verify checkpoint created
    const checkpoint3 = await coordinator.createCheckpoint(helper.agentId, 'Manual checkpoint');
    checkpointIds.push(checkpoint3.id);

    console.log(`     └─ Checkpoint: ${checkpoint3.id}`);

    // ========================================
    // PAUSE LEVEL 2 (Worker)
    // ========================================
    console.log('\n📍 LEVEL 2: Pausing worker');
    const pauseStart2 = Date.now();
    await coordinator.pauseAgent(worker.agentId, 'Testing pause at level 2');
    const pauseTime2 = Date.now() - pauseStart2;

    console.log(`  ✅ Paused in ${pauseTime2}ms`);
    expect(pauseTime2).toBeLessThan(50);

    const checkpoint2 = await coordinator.createCheckpoint(worker.agentId, 'Manual checkpoint');
    checkpointIds.push(checkpoint2.id);

    console.log(`     └─ Checkpoint: ${checkpoint2.id}`);

    // ========================================
    // PAUSE LEVEL 1 (Orchestrator)
    // ========================================
    console.log('\n📍 LEVEL 1: Pausing orchestrator');
    const pauseStart1 = Date.now();
    await coordinator.pauseAgent(orchestrator.agentId, 'Testing pause at level 1');
    const pauseTime1 = Date.now() - pauseStart1;

    console.log(`  ✅ Paused in ${pauseTime1}ms`);
    expect(pauseTime1).toBeLessThan(50);

    const checkpoint1 = await coordinator.createCheckpoint(orchestrator.agentId, 'Manual checkpoint');
    checkpointIds.push(checkpoint1.id);

    console.log(`     └─ Checkpoint: ${checkpoint1.id}`);

    // ========================================
    // VERIFY ALL PAUSED
    // ========================================
    console.log('\n📊 All agents paused - verifying metrics:');
    const pausedMetrics = coordinator.getMetrics();

    console.log(`  ├─ Active agents: ${pausedMetrics.activeAgents} (expect: 0)`);
    console.log(`  ├─ Paused agents: ${pausedMetrics.pausedAgents} (expect: 3)`);
    console.log(`  ├─ Checkpoints:   ${pausedMetrics.totalCheckpoints}`);
    console.log(`  └─ Tokens saved:  ${pausedMetrics.tokensSaved}`);

    expect(pausedMetrics.activeAgents).toBe(0);
    expect(pausedMetrics.pausedAgents).toBe(3);

    // ========================================
    // RESUME LEVEL 1 (Orchestrator)
    // ========================================
    console.log('\n📍 LEVEL 1: Resuming orchestrator');
    const resumeStart1 = Date.now();
    await coordinator.resumeAgent(orchestrator.agentId, checkpoint1.id);
    const resumeTime1 = Date.now() - resumeStart1;

    console.log(`  ✅ Resumed in ${resumeTime1}ms`);
    console.log(`     └─ Target: <50ms (fast checkpoint restore)`);

    expect(resumeTime1).toBeLessThan(50); // Fast resume target

    // ========================================
    // RESUME LEVEL 2 (Worker)
    // ========================================
    console.log('\n📍 LEVEL 2: Resuming worker');
    const resumeStart2 = Date.now();
    await coordinator.resumeAgent(worker.agentId, checkpoint2.id);
    const resumeTime2 = Date.now() - resumeStart2;

    console.log(`  ✅ Resumed in ${resumeTime2}ms`);
    expect(resumeTime2).toBeLessThan(50);

    // ========================================
    // RESUME LEVEL 3 (Helper)
    // ========================================
    console.log('\n📍 LEVEL 3: Resuming helper');
    const resumeStart3 = Date.now();
    await coordinator.resumeAgent(helper.agentId, checkpoint3.id);
    const resumeTime3 = Date.now() - resumeStart3;

    console.log(`  ✅ Resumed in ${resumeTime3}ms`);
    expect(resumeTime3).toBeLessThan(50);

    // ========================================
    // FINAL METRICS
    // ========================================
    console.log('\n📊 All agents resumed - final metrics:');
    const finalMetrics = coordinator.getMetrics();

    console.log(`  ├─ Active agents: ${finalMetrics.activeAgents} (expect: 3)`);
    console.log(`  ├─ Paused agents: ${finalMetrics.pausedAgents} (expect: 0)`);
    console.log(`  ├─ Total restores: ${finalMetrics.totalRestores}`);
    console.log(`  ├─ Avg restore time: ${finalMetrics.averageRestoreTimeMs}ms`);
    console.log(`  └─ P99 restore time: ${finalMetrics.p99RestoreTimeMs}ms`);

    expect(finalMetrics.activeAgents).toBe(3);
    expect(finalMetrics.pausedAgents).toBe(0);
    expect(finalMetrics.totalRestores).toBe(3);
    expect(finalMetrics.p99RestoreTimeMs).toBeLessThan(500); // P99 < 500ms target
  });

  it('should track agent hierarchy in telemetry', async () => {
    console.log('━'.repeat(60));
    console.log('📈 TEST: Telemetry Tracking for Agent Hierarchy');
    console.log('━'.repeat(60));

    // Spawn with telemetry metadata
    const agents = await Promise.all([
      coordinator.spawnAgent({
        agentId: 'telemetry-l1',
        type: 'orchestrator',
        priority: 10,
        metadata: {
          level: 1,
          telemetry: { track: true, category: 'orchestration' },
        },
      }),
      coordinator.spawnAgent({
        agentId: 'telemetry-l2-worker',
        type: 'worker',
        priority: 8,
        metadata: {
          level: 2,
          parent: 'telemetry-l1',
          telemetry: { track: true, category: 'execution' },
        },
      }),
      coordinator.spawnAgent({
        agentId: 'telemetry-l3-helper',
        type: 'helper',
        priority: 6,
        metadata: {
          level: 3,
          parent: 'telemetry-l2-worker',
          telemetry: { track: true, category: 'support' },
        },
      }),
    ]);

    spawnedAgents.push(...agents);

    console.log('\n✅ 3-level hierarchy with telemetry spawned');
    console.log('\n📊 Agent Telemetry:');

    for (const agent of agents) {
      console.log(`\n  ${agent.agentId}:`);
      console.log(`    ├─ Type: ${agent.type}`);
      console.log(`    ├─ Level: ${agent.metadata.level}`);
      console.log(`    ├─ Parent: ${agent.metadata.parent || 'root'}`);
      console.log(`    ├─ Category: ${agent.metadata.telemetry?.category}`);
      console.log(`    └─ Session: ${agent.sessionId}`);
    }

    // Verify hierarchy structure
    const l1 = agents.find(a => a.metadata.level === 1);
    const l2 = agents.find(a => a.metadata.level === 2);
    const l3 = agents.find(a => a.metadata.level === 3);

    expect(l1?.metadata.parent).toBeUndefined(); // Root has no parent
    expect(l2?.metadata.parent).toBe('telemetry-l1');
    expect(l3?.metadata.parent).toBe('telemetry-l2-worker');

    console.log('\n✅ Hierarchy validation complete');
  });
});
