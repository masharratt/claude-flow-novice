/**
 * Phase 5 - Sprint 5.2: Multi-Level Agent Control Example
 *
 * Demonstrates pause/inject/resume from Level 0 to any child level
 *
 * @module examples/phase-5-multi-level-control
 */

import { QueryController } from '../src/coordination/v2/sdk/query-controller.js';
import { HierarchicalCoordinator } from '../src/agents/hierarchical-coordinator.js';
import {
  MultiLevelController,
  InjectedCommandType,
  createMultiLevelControllerWithHierarchy,
} from '../src/coordination/v2/sdk/multi-level-control.js';

/**
 * Example: Multi-Level Agent Control
 *
 * Scenario:
 * - Level 0: Supervisor (top-level coordinator)
 * - Level 1: Team Leads (2 agents)
 * - Level 2: Workers (3 agents under Team Lead A)
 *
 * Demonstrates:
 * - Level 0 pauses any agent at any level
 * - Level 0 injects commands to modify agent state/tasks
 * - Level 0 resumes agents with commands applied
 * - <100ms latency for all control operations
 */
async function multiLevelControlExample() {
  console.log('=== Phase 5 - Sprint 5.2: Multi-Level Agent Control Example ===\n');

  // Step 1: Initialize QueryController (Phase 0)
  console.log('Step 1: Initialize QueryController for pause/resume...');
  const queryController = new QueryController({
    maxConcurrentAgents: 20,
    defaultTokenBudget: 10000,
    enableDynamicAllocation: true,
  });
  await queryController.initialize();
  console.log('✓ QueryController initialized\n');

  // Step 2: Initialize HierarchicalCoordinator (Phase 5)
  console.log('Step 2: Initialize HierarchicalCoordinator for hierarchy management...');
  const hierarchicalCoordinator = new HierarchicalCoordinator({
    maxDepth: 10,
    maxChildrenPerNode: 10,
    enableDependencyTracking: true,
  });
  await hierarchicalCoordinator.initialize();
  console.log('✓ HierarchicalCoordinator initialized\n');

  // Step 3: Create Multi-Level Controller (Sprint 5.2)
  console.log('Step 3: Create MultiLevelController integration layer...');
  const multiLevelController = createMultiLevelControllerWithHierarchy(
    queryController,
    hierarchicalCoordinator,
    {
      maxControlLatencyMs: 100, // <100ms target
      enableCommandQueue: true,
      maxQueuedCommands: 50,
    }
  );
  console.log('✓ MultiLevelController created\n');

  // Step 4: Build 3-Level Agent Hierarchy
  console.log('Step 4: Build 3-level agent hierarchy...');

  // Level 0: Supervisor
  const supervisor = await queryController.spawnAgent({
    agentId: 'supervisor',
    type: 'coordinator',
    priority: 10,
    metadata: { role: 'Level 0 Supervisor' },
  });
  await hierarchicalCoordinator.registerAgent(
    'supervisor',
    {
      name: 'Supervisor',
      type: 'coordinator',
      level: 0,
      status: 'ready',
      capabilities: ['coordination', 'hierarchy-control'],
    },
    undefined // No parent (root)
  );

  // Level 1: Team Leads
  const teamLeadA = await queryController.spawnAgent({
    agentId: 'team-lead-a',
    type: 'coordinator',
    priority: 8,
    metadata: { role: 'Team Lead A' },
  });
  await hierarchicalCoordinator.registerAgent(
    'team-lead-a',
    {
      name: 'Team Lead A',
      type: 'coordinator',
      level: 1,
      status: 'ready',
      capabilities: ['coordination', 'task-delegation'],
    },
    'supervisor' // Parent: supervisor
  );

  const teamLeadB = await queryController.spawnAgent({
    agentId: 'team-lead-b',
    type: 'coordinator',
    priority: 8,
    metadata: { role: 'Team Lead B' },
  });
  await hierarchicalCoordinator.registerAgent(
    'team-lead-b',
    {
      name: 'Team Lead B',
      type: 'coordinator',
      level: 1,
      status: 'ready',
      capabilities: ['coordination', 'task-delegation'],
    },
    'supervisor'
  );

  // Level 2: Workers (under Team Lead A)
  const workerA1 = await queryController.spawnAgent({
    agentId: 'worker-a1',
    type: 'worker',
    priority: 5,
    metadata: { role: 'Worker A1' },
  });
  await hierarchicalCoordinator.registerAgent(
    'worker-a1',
    {
      name: 'Worker A1',
      type: 'worker',
      level: 2,
      status: 'ready',
      capabilities: ['code-generation', 'testing'],
    },
    'team-lead-a'
  );

  const workerA2 = await queryController.spawnAgent({
    agentId: 'worker-a2',
    type: 'worker',
    priority: 5,
    metadata: { role: 'Worker A2' },
  });
  await hierarchicalCoordinator.registerAgent(
    'worker-a2',
    {
      name: 'Worker A2',
      type: 'worker',
      level: 2,
      status: 'ready',
      capabilities: ['documentation', 'review'],
    },
    'team-lead-a'
  );

  console.log('✓ Hierarchy built:');
  console.log('  - Level 0: Supervisor');
  console.log('  - Level 1: Team Lead A, Team Lead B');
  console.log('  - Level 2: Worker A1, Worker A2\n');

  // Step 5: Demonstrate Multi-Level Control Operations
  console.log('Step 5: Multi-Level Control Operations\n');

  // Operation 1: Level 0 pauses Level 2 agent
  console.log('Operation 1: Supervisor (L0) pauses Worker A1 (L2)...');
  const pauseResult = await multiLevelController.pauseChildAgent(
    'supervisor',
    'worker-a1',
    'Supervisor directive: pause for configuration update'
  );
  console.log(`✓ Paused: ${pauseResult.success}`);
  console.log(`  - Agent: ${pauseResult.agentId} (Level ${pauseResult.level})`);
  console.log(`  - Latency: ${pauseResult.latencyMs.toFixed(2)}ms (<100ms target)\n`);

  // Operation 2: Level 0 injects commands to paused agent
  console.log('Operation 2: Supervisor (L0) injects commands to Worker A1 (L2)...');

  const stateInjection = await multiLevelController.injectCommand(
    'supervisor',
    'worker-a1',
    InjectedCommandType.STATE_UPDATE,
    { state: 'working' },
    false
  );
  console.log(`✓ Injected STATE_UPDATE: ${stateInjection.success} (${stateInjection.latencyMs.toFixed(2)}ms)`);

  const taskInjection = await multiLevelController.injectCommand(
    'supervisor',
    'worker-a1',
    InjectedCommandType.TASK_UPDATE,
    {
      task: 'Implement authentication module',
      taskId: 'task-auth-001',
      deadline: '2025-10-15',
    },
    false
  );
  console.log(`✓ Injected TASK_UPDATE: ${taskInjection.success} (${taskInjection.latencyMs.toFixed(2)}ms)`);

  const priorityInjection = await multiLevelController.injectCommand(
    'supervisor',
    'worker-a1',
    InjectedCommandType.PRIORITY_UPDATE,
    { priority: 9 },
    false
  );
  console.log(`✓ Injected PRIORITY_UPDATE: ${priorityInjection.success} (${priorityInjection.latencyMs.toFixed(2)}ms)`);

  const queuedCount = multiLevelController.getQueuedCommandsCount('worker-a1');
  console.log(`  - Queued commands: ${queuedCount}\n`);

  // Operation 3: Level 0 resumes agent with commands applied
  console.log('Operation 3: Supervisor (L0) resumes Worker A1 (L2)...');
  const resumeResult = await multiLevelController.resumeChildAgent('supervisor', 'worker-a1');
  console.log(`✓ Resumed: ${resumeResult.success}`);
  console.log(`  - Commands applied: ${resumeResult.data?.appliedCommands}`);
  console.log(`  - Latency: ${resumeResult.latencyMs.toFixed(2)}ms\n`);

  // Verify commands were applied
  const workerSession = await queryController.getAgentSession('worker-a1');
  console.log('✓ Verification:');
  console.log(`  - Worker A1 state: ${workerSession.state}`);
  console.log(`  - Worker A1 priority: ${workerSession.priority}`);
  console.log(`  - Injected commands: ${workerSession.metadata.injectedCommands?.length ?? 0}\n`);

  // Operation 4: Cascade pause to all Team Lead A's children
  console.log('Operation 4: Supervisor (L0) cascades pause to all Team Lead A children...');
  const cascadeResults = await multiLevelController.cascadeControlOperation('team-lead-a', 'pause');
  console.log(`✓ Cascade pause completed: ${cascadeResults.length} agents affected`);
  for (const result of cascadeResults) {
    console.log(
      `  - ${result.agentId} (L${result.level}): ${result.success ? 'Paused' : 'Failed'} (${result.latencyMs.toFixed(2)}ms)`
    );
  }
  console.log('');

  // Operation 5: Cascade resume
  console.log('Operation 5: Supervisor (L0) cascades resume to all Team Lead A children...');
  const resumeCascade = await multiLevelController.cascadeControlOperation('team-lead-a', 'resume');
  console.log(`✓ Cascade resume completed: ${resumeCascade.length} agents resumed\n`);

  // Step 6: Show Final Metrics
  console.log('Step 6: Control Operation Metrics');
  const metrics = multiLevelController.getMetrics();
  console.log(`  - Total pauses: ${metrics.totalPauses}`);
  console.log(`  - Total injections: ${metrics.totalInjections}`);
  console.log(`  - Total resumes: ${metrics.totalResumes}`);
  console.log(`  - Average latency: ${metrics.averageControlLatencyMs.toFixed(2)}ms`);
  console.log(`  - Max latency: ${metrics.maxControlLatencyMs.toFixed(2)}ms`);
  console.log(`  - Within <100ms target: ${metrics.withinTarget ? 'YES ✓' : 'NO ✗'}\n`);

  // Cleanup
  console.log('Cleanup...');
  await multiLevelController.cleanup();
  await hierarchicalCoordinator.shutdown();
  await queryController.cleanup();
  console.log('✓ All components cleaned up\n');

  console.log('=== Multi-Level Control Example Complete ===');
}

// Run example
if (import.meta.url === `file://${process.argv[1]}`) {
  multiLevelControlExample()
    .then(() => {
      console.log('\n✓ Example completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n✗ Example failed:', error);
      process.exit(1);
    });
}

export { multiLevelControlExample };
