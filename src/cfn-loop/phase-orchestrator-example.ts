/**
 * Phase Orchestrator Usage Example
 *
 * Demonstrates Loop 0 (Parent Loop) managing multi-phase progression
 * for the Agent Coordination V2 system.
 *
 * @module cfn-loop/phase-orchestrator-example
 */

import {
  PhaseOrchestrator,
  createPhaseOrchestrator,
  Phase,
  PhaseOrchestratorConfig,
} from './phase-orchestrator.js';

// ===== EXAMPLE PHASE DEFINITIONS =====

/**
 * Phase 0: SDK Foundation
 */
const phase0: Phase = {
  id: 'PHASE_00_SDK_FOUNDATION',
  order: 0,
  name: 'SDK Foundation Setup',
  description: `
Establish SDK foundation for session forking, query control, checkpoints, and artifacts.
Key deliverables:
- SessionManager with parallel forking
- QueryController with pause/resume
- CheckpointManager with <500ms recovery
- ArtifactStorage with binary format
`.trim(),
  dependsOn: [], // No dependencies (foundation phase)
  completionCriteria: {
    minConsensusScore: 0.90,
    requiredDeliverables: [
      'session-manager',
      'query-controller',
      'checkpoint-manager',
      'artifact-storage',
    ],
  },
  selfLoopingPrompt: `
Phase 0 (SDK Foundation) complete with {consensusScore}% consensus.

✅ Deliverables: {deliverableCount}

🚀 **IMMEDIATELY proceed to Phase 1: State Machine Foundation**

DO NOT wait for human approval. Initialize swarm and begin state machine implementation NOW.

Dependencies satisfied: All ✅

Success criteria for Phase 1:
- State machine with 7 agent states (IDLE, WORKING, WAITING, HELPING, BLOCKED, COMPLETED, ERROR)
- Auto-checkpoint on state transitions (<100ms)
- SDK integration operational

NEXT ACTION: Initialize swarm for Phase 1 and spawn agents.
`.trim(),
  loopConfig: {
    maxLoop2Iterations: 10,
    maxLoop3Iterations: 10,
    confidenceThreshold: 0.75,
    consensusThreshold: 0.90,
  },
};

/**
 * Phase 1: State Machine Foundation
 */
const phase1: Phase = {
  id: 'PHASE_01_STATE_MACHINE',
  order: 1,
  name: 'State Machine Foundation',
  description: `
Implement 7-state agent lifecycle with SDK session integration.
Key deliverables:
- AgentState enum with 7 states
- StateMachineManager with transition validation
- State persistence to artifacts
- Auto-checkpoint on state transitions
`.trim(),
  dependsOn: ['PHASE_00_SDK_FOUNDATION'],
  completionCriteria: {
    minConsensusScore: 0.90,
    requiredDeliverables: [
      'agent-state',
      'state-transition',
      'state-machine',
      'state-storage',
    ],
  },
  selfLoopingPrompt: `
Phase 1 (State Machine) complete with {consensusScore}% consensus.

✅ State transitions operational
✅ SDK auto-checkpoints working

🚀 **IMMEDIATELY proceed to Phase 2: Dependency Graph**

DO NOT wait for approval. Begin dependency graph implementation NOW.

Dependencies satisfied: PHASE_00_SDK_FOUNDATION ✅

Success criteria for Phase 2:
- Dependency graph with cycle detection
- Topological sort operational
- Artifact-based storage (<12ms)

NEXT ACTION: Initialize swarm for Phase 2.
`.trim(),
};

/**
 * Phase 2: Dependency Graph
 */
const phase2: Phase = {
  id: 'PHASE_02_DEPENDENCY_GRAPH',
  order: 2,
  name: 'Dependency Graph',
  description: `
Build DAG structure for agent dependency management.
Key deliverables:
- DependencyGraph with cycle detection
- Topological sort for execution ordering
- DependencyManager routing requests
- Artifact-based storage
`.trim(),
  dependsOn: ['PHASE_01_STATE_MACHINE'],
  completionCriteria: {
    minConsensusScore: 0.90,
    requiredDeliverables: [
      'dependency-graph',
      'dependency-manager',
      'topological-sort',
    ],
  },
  selfLoopingPrompt: `
Phase 2 (Dependency Graph) complete with {consensusScore}% consensus.

✅ Cycle detection operational
✅ Topological ordering working
✅ Artifact storage <12ms

🚀 **IMMEDIATELY proceed to Phase 3: Message Bus**

Continue autonomous progression. NO approval needed.

All prior phases completed successfully.

NEXT ACTION: Initialize swarm for Phase 3 (4 specialized channels).
`.trim(),
};

// ===== EXAMPLE ORCHESTRATION =====

/**
 * Example 1: Basic Phase Orchestration
 */
export async function exampleBasicOrchestration() {
  console.log('=== Example 1: Basic Phase Orchestration ===\n');

  // Define phases
  const phases: Phase[] = [phase0, phase1, phase2];

  // Create orchestrator configuration
  const config: PhaseOrchestratorConfig = {
    phases,
    maxPhaseRetries: 3,
    enableMemoryPersistence: true,
    defaultLoopConfig: {
      maxLoop2Iterations: 5,
      maxLoop3Iterations: 10,
      confidenceThreshold: 0.75,
      consensusThreshold: 0.90,
    },
  };

  // Create orchestrator
  const orchestrator = createPhaseOrchestrator(config);

  // Initialize (builds dependency graph, detects cycles, computes topological order)
  await orchestrator.initialize();

  // Listen for phase completion events
  orchestrator.on('phase:complete', (data) => {
    console.log('\n🎉 Phase Complete Event:');
    console.log(`  Phase: ${data.phaseId}`);
    console.log(`  Success: ${data.result.success}`);
    console.log(`  Consensus: ${(data.result.consensusResult.consensusScore * 100).toFixed(1)}%`);
    console.log(`  Next Phase: ${data.nextPhaseId || 'NONE (final phase)'}`);
    console.log('\n📝 Continuation Prompt:');
    console.log(data.continuationPrompt);
    console.log('\n' + '='.repeat(80) + '\n');
  });

  // Execute all phases
  const initialTask = 'Implement Agent Coordination System V2';
  const result = await orchestrator.executeAllPhases(initialTask);

  // Display final results
  console.log('\n=== Final Orchestration Results ===\n');
  console.log(`Success: ${result.success ? '✅' : '❌'}`);
  console.log(`Total Phases: ${result.totalPhases}`);
  console.log(`Completed: ${result.completedPhases.length}`);
  console.log(`Failed: ${result.failedPhases.length}`);
  console.log(`Duration: ${(result.totalDuration / 1000).toFixed(2)}s`);

  console.log('\nCompleted Phases:');
  result.completedPhases.forEach((phaseId, idx) => {
    const phaseResult = result.phaseResults.get(phaseId);
    console.log(`  ${idx + 1}. ${phaseId}`);
    console.log(`     Consensus: ${(phaseResult!.consensusResult.consensusScore * 100).toFixed(1)}%`);
    console.log(`     Deliverables: ${phaseResult!.finalDeliverables.length}`);
  });

  if (result.failedPhases.length > 0) {
    console.log('\nFailed Phases:');
    result.failedPhases.forEach((phaseId, idx) => {
      const phaseResult = result.phaseResults.get(phaseId);
      console.log(`  ${idx + 1}. ${phaseId}`);
      console.log(`     Reason: ${phaseResult?.escalationReason || 'Unknown'}`);
    });
  }

  // Cleanup
  await orchestrator.shutdown();
}

/**
 * Example 2: Phase with Custom Validation
 */
export async function exampleCustomValidation() {
  console.log('=== Example 2: Custom Phase Validation ===\n');

  // Phase with custom validation function
  const customPhase: Phase = {
    id: 'PHASE_CUSTOM',
    order: 0,
    name: 'Custom Validated Phase',
    description: 'Phase with custom validation logic',
    dependsOn: [],
    completionCriteria: {
      minConsensusScore: 0.85,
      requiredDeliverables: ['custom-deliverable'],
      // Custom validation: check that all deliverables have specific metadata
      customValidation: async (result) => {
        console.log('  Running custom validation...');

        // Check metadata
        const allHaveMetadata = result.finalDeliverables.every((d: any) =>
          d.metadata && d.metadata.validated === true
        );

        if (!allHaveMetadata) {
          console.log('  ❌ Custom validation failed: Missing metadata');
          return false;
        }

        console.log('  ✅ Custom validation passed');
        return true;
      },
    },
  };

  const config: PhaseOrchestratorConfig = {
    phases: [customPhase],
    maxPhaseRetries: 2,
  };

  const orchestrator = createPhaseOrchestrator(config);
  await orchestrator.initialize();

  const result = await orchestrator.executeAllPhases('Custom validated task');

  console.log(`Custom Validation Result: ${result.success ? '✅' : '❌'}`);

  await orchestrator.shutdown();
}

/**
 * Example 3: Dependency Chain with Self-Looping
 */
export async function exampleDependencyChain() {
  console.log('=== Example 3: Dependency Chain with Self-Looping ===\n');

  // Create longer dependency chain
  const phases: Phase[] = [
    {
      id: 'PHASE_A',
      order: 0,
      name: 'Foundation',
      description: 'Foundation phase',
      dependsOn: [],
      completionCriteria: {
        minConsensusScore: 0.90,
        requiredDeliverables: ['foundation'],
      },
      selfLoopingPrompt: 'Phase A complete. IMMEDIATELY proceed to Phase B.',
    },
    {
      id: 'PHASE_B',
      order: 1,
      name: 'Core System',
      description: 'Core system phase',
      dependsOn: ['PHASE_A'],
      completionCriteria: {
        minConsensusScore: 0.90,
        requiredDeliverables: ['core'],
      },
      selfLoopingPrompt: 'Phase B complete. IMMEDIATELY proceed to Phase C.',
    },
    {
      id: 'PHASE_C',
      order: 2,
      name: 'Integration',
      description: 'Integration phase',
      dependsOn: ['PHASE_B'],
      completionCriteria: {
        minConsensusScore: 0.90,
        requiredDeliverables: ['integration'],
      },
      selfLoopingPrompt: 'Phase C complete. System ready for production.',
    },
  ];

  const config: PhaseOrchestratorConfig = {
    phases,
    maxPhaseRetries: 2,
  };

  const orchestrator = createPhaseOrchestrator(config);

  // Monitor statistics
  const statsInterval = setInterval(() => {
    const stats = orchestrator.getStatistics();
    console.log('\n📊 Progress:');
    console.log(`  Total Phases: ${stats.totalPhases}`);
    console.log(`  Completed: ${stats.completedPhases}`);
    console.log(`  Failed: ${stats.failedPhases}`);
    console.log(`  In Progress: ${stats.inProgress}`);
    console.log(`  Duration: ${(stats.duration / 1000).toFixed(1)}s`);
  }, 5000);

  await orchestrator.initialize();
  const result = await orchestrator.executeAllPhases('Dependency chain test');

  clearInterval(statsInterval);

  console.log('\n=== Dependency Chain Results ===');
  console.log(`All phases completed: ${result.success ? '✅' : '❌'}`);
  console.log(`Execution order: ${result.completedPhases.join(' → ')}`);

  await orchestrator.shutdown();
}

/**
 * Example 4: Error Handling and Retry
 */
export async function exampleErrorHandling() {
  console.log('=== Example 4: Error Handling and Retry ===\n');

  // Phase that may fail initially
  let attemptCount = 0;

  const flakeyPhase: Phase = {
    id: 'PHASE_FLAKEY',
    order: 0,
    name: 'Flakey Phase',
    description: 'Phase that fails initially but succeeds on retry',
    dependsOn: [],
    completionCriteria: {
      minConsensusScore: 0.90,
      requiredDeliverables: ['deliverable'],
      customValidation: async () => {
        attemptCount++;
        console.log(`  Validation attempt ${attemptCount}`);

        // Fail first 2 attempts, succeed on 3rd
        if (attemptCount < 3) {
          console.log('  ❌ Validation failed (simulated)');
          return false;
        }

        console.log('  ✅ Validation passed');
        return true;
      },
    },
  };

  const config: PhaseOrchestratorConfig = {
    phases: [flakeyPhase],
    maxPhaseRetries: 3, // Allow 3 retries
  };

  const orchestrator = createPhaseOrchestrator(config);
  await orchestrator.initialize();

  const result = await orchestrator.executeAllPhases('Retry test');

  console.log('\n=== Retry Results ===');
  console.log(`Success after retries: ${result.success ? '✅' : '❌'}`);
  console.log(`Total attempts: ${attemptCount}`);

  await orchestrator.shutdown();
}

// ===== MAIN EXECUTION =====

/**
 * Run all examples
 */
export async function runAllExamples() {
  console.log('\n' + '='.repeat(80));
  console.log('PHASE ORCHESTRATOR EXAMPLES');
  console.log('='.repeat(80) + '\n');

  try {
    // Example 1: Basic orchestration
    await exampleBasicOrchestration();

    // Example 2: Custom validation
    await exampleCustomValidation();

    // Example 3: Dependency chain
    await exampleDependencyChain();

    // Example 4: Error handling
    await exampleErrorHandling();

    console.log('\n' + '='.repeat(80));
    console.log('ALL EXAMPLES COMPLETE ✅');
    console.log('='.repeat(80) + '\n');
  } catch (error) {
    console.error('\n❌ Example failed:', error);
    throw error;
  }
}

// Run examples if executed directly
if (require.main === module) {
  runAllExamples().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
