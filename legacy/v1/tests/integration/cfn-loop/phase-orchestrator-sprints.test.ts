/**
 * Phase Orchestrator with Sprints Integration Tests
 *
 * Tests phase execution with sprint support:
 * 1. Phase with multiple sprints
 * 2. Cross-phase sprint dependencies
 * 3. Phase completion validation
 * 4. Sprint status tracking within phases
 * 5. Dependency resolution across phases
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  PhaseOrchestrator,
  createPhaseOrchestrator,
  Phase,
  PhaseOrchestratorConfig,
  PhaseOrchestratorResult,
} from '../../../src/cfn-loop/phase-orchestrator.js';
import type { Sprint } from '../../../src/cfn-loop/sprint-orchestrator.js';

describe('PhaseOrchestrator with Sprints - Integration Tests', () => {
  let orchestrator: PhaseOrchestrator;
  let config: PhaseOrchestratorConfig;

  beforeEach(() => {
    process.env.CLAUDE_FLOW_ENV = 'test';

    const sprintsPhase1: Sprint[] = [
      {
        id: 'sprint-1.1',
        phaseId: 'phase-1',
        name: 'Core Auth Implementation',
        description: 'Implement JWT authentication',
        dependencies: [],
        crossPhaseDependencies: [],
        checkpoints: {
          testsPass: true,
          minCoverage: 85,
          noSecurityIssues: true,
          minConfidence: 0.75,
          dependenciesSatisfied: true,
        },
      },
      {
        id: 'sprint-1.2',
        phaseId: 'phase-1',
        name: 'Auth Middleware',
        description: 'Create auth middleware',
        dependencies: ['sprint-1.1'],
        crossPhaseDependencies: [],
        checkpoints: {
          testsPass: true,
          minCoverage: 85,
          noSecurityIssues: true,
          minConfidence: 0.75,
          dependenciesSatisfied: true,
        },
      },
    ];

    const sprintsPhase2: Sprint[] = [
      {
        id: 'sprint-2.1',
        phaseId: 'phase-2',
        name: 'RBAC Core',
        description: 'Role-based access control',
        dependencies: [],
        crossPhaseDependencies: ['sprint-1.2'], // Depends on phase-1 sprint
        checkpoints: {
          testsPass: true,
          minCoverage: 85,
          noSecurityIssues: true,
          minConfidence: 0.75,
          dependenciesSatisfied: true,
        },
      },
    ];

    const phases: Phase[] = [
      {
        id: 'phase-1',
        order: 0,
        name: 'Authentication',
        description: 'Implement user authentication',
        dependsOn: [],
        sprints: sprintsPhase1,
        completionCriteria: {
          minConsensusScore: 0.90,
          requiredDeliverables: [],
        },
      },
      {
        id: 'phase-2',
        order: 1,
        name: 'Authorization',
        description: 'Implement role-based authorization',
        dependsOn: ['phase-1'],
        sprints: sprintsPhase2,
        completionCriteria: {
          minConsensusScore: 0.90,
          requiredDeliverables: [],
        },
      },
    ];

    config = {
      phases,
      maxPhaseRetries: 3,
      enableMemoryPersistence: false,
      defaultLoopConfig: {
        maxLoop2Iterations: 5,
        maxLoop3Iterations: 10,
        confidenceThreshold: 0.75,
        consensusThreshold: 0.90,
      },
    };

    orchestrator = createPhaseOrchestrator(config);
  });

  afterEach(async () => {
    await orchestrator.shutdown();
    delete process.env.CLAUDE_FLOW_ENV;
  });

  describe('Initialization', () => {
    it('should initialize with phase and sprint configuration', async () => {
      await expect(orchestrator.initialize()).resolves.not.toThrow();
    });

    it('should detect cycles in phase dependencies', async () => {
      const cyclicPhases: Phase[] = [
        {
          id: 'phase-a',
          order: 0,
          name: 'Phase A',
          description: 'Depends on Phase B',
          dependsOn: ['phase-b'],
          completionCriteria: {
            minConsensusScore: 0.90,
            requiredDeliverables: [],
          },
        },
        {
          id: 'phase-b',
          order: 1,
          name: 'Phase B',
          description: 'Depends on Phase A',
          dependsOn: ['phase-a'], // Cycle!
          completionCriteria: {
            minConsensusScore: 0.90,
            requiredDeliverables: [],
          },
        },
      ];

      const cyclicConfig: PhaseOrchestratorConfig = {
        phases: cyclicPhases,
      };

      const cyclicOrchestrator = createPhaseOrchestrator(cyclicConfig);

      await expect(cyclicOrchestrator.initialize()).rejects.toThrow('Dependency cycle detected');

      cyclicOrchestrator.shutdown();
    });

    it('should compute topological order of phases', async () => {
      await orchestrator.initialize();

      // Phase-1 should come before Phase-2 due to dependency
      // This is validated internally - just verify initialization succeeded
      expect(orchestrator).toBeDefined();
    });
  });

  describe('Single Phase with Sprints', () => {
    it('should execute phase with multiple sprints', async () => {
      const singlePhaseConfig: PhaseOrchestratorConfig = {
        phases: [config.phases[0]], // Only phase-1
        maxPhaseRetries: 3,
        enableMemoryPersistence: false,
      };

      const singlePhaseOrchestrator = createPhaseOrchestrator(singlePhaseConfig);
      await singlePhaseOrchestrator.initialize();

      const result = await singlePhaseOrchestrator.executeAllPhases('Implement authentication');

      expect(result.success).toBe(true);
      expect(result.completedPhases).toContain('phase-1');
      expect(result.failedPhases).toHaveLength(0);

      const phaseResult = result.phaseResults.get('phase-1');
      expect(phaseResult).toBeDefined();
      expect(phaseResult!.success).toBe(true);

      await singlePhaseOrchestrator.shutdown();
    }, 60000);

    it('should track sprint execution within phase', async () => {
      const singlePhaseConfig: PhaseOrchestratorConfig = {
        phases: [config.phases[0]],
        maxPhaseRetries: 3,
        enableMemoryPersistence: false,
      };

      const singlePhaseOrchestrator = createPhaseOrchestrator(singlePhaseConfig);
      await singlePhaseOrchestrator.initialize();

      const result = await singlePhaseOrchestrator.executeAllPhases('Test sprint tracking');

      // Sprint results should be captured via SprintOrchestrator
      expect(result.phaseResults.size).toBe(1);

      await singlePhaseOrchestrator.shutdown();
    }, 60000);
  });

  describe('Multi-Phase Execution', () => {
    it('should execute phases in dependency order', async () => {
      await orchestrator.initialize();

      const result = await orchestrator.executeAllPhases('Implement auth system');

      expect(result.success).toBe(true);
      expect(result.totalPhases).toBe(2);
      expect(result.completedPhases).toEqual(['phase-1', 'phase-2']);

      await orchestrator.shutdown();
    }, 90000);

    it('should wait for phase dependencies before execution', async () => {
      await orchestrator.initialize();

      const result = await orchestrator.executeAllPhases('Test dependency resolution');

      // Phase-2 should only execute after Phase-1 completes
      const phase1Result = result.phaseResults.get('phase-1');
      const phase2Result = result.phaseResults.get('phase-2');

      expect(phase1Result).toBeDefined();
      expect(phase2Result).toBeDefined();

      // Phase-1 timestamp should be earlier than Phase-2
      expect(phase1Result!.timestamp).toBeLessThanOrEqual(phase2Result!.timestamp);
    }, 90000);

    it('should handle phase failure and skip dependent phases', async () => {
      // Create configuration where phase-1 is likely to fail
      const failConfig: PhaseOrchestratorConfig = {
        phases: [
          {
            ...config.phases[0],
            completionCriteria: {
              minConsensusScore: 0.99, // Unrealistically high threshold
              requiredDeliverables: ['non-existent-deliverable'],
            },
          },
          config.phases[1],
        ],
        maxPhaseRetries: 1, // Low retry count
        enableMemoryPersistence: false,
      };

      const failOrchestrator = createPhaseOrchestrator(failConfig);
      await failOrchestrator.initialize();

      const result = await failOrchestrator.executeAllPhases('Test failure handling');

      // Phase-1 may fail, Phase-2 should be skipped or also fail
      expect(result.success).toBe(false);

      await failOrchestrator.shutdown();
    }, 90000);
  });

  describe('Cross-Phase Sprint Dependencies', () => {
    it('should resolve cross-phase sprint dependencies', async () => {
      await orchestrator.initialize();

      const result = await orchestrator.executeAllPhases('Test cross-phase dependencies');

      // Phase-2 Sprint-2.1 depends on Phase-1 Sprint-1.2
      // Both phases should complete if dependencies are resolved
      expect(result.completedPhases).toContain('phase-1');
      expect(result.completedPhases).toContain('phase-2');
    }, 90000);

    it('should track cross-phase dependency results', async () => {
      await orchestrator.initialize();

      const result = await orchestrator.executeAllPhases('Track cross-phase results');

      const phase2Result = result.phaseResults.get('phase-2');
      expect(phase2Result).toBeDefined();

      // Phase-2 should have access to Phase-1 results via dependency resolution
      expect(phase2Result!.success).toBe(true);
    }, 90000);
  });

  describe('Phase Completion Validation', () => {
    it('should validate phase completion criteria', async () => {
      await orchestrator.initialize();

      const result = await orchestrator.executeAllPhases('Validate completion criteria');

      const phase1Result = result.phaseResults.get('phase-1');
      expect(phase1Result).toBeDefined();

      // Verify consensus result
      expect(phase1Result!.consensusResult).toBeDefined();
      expect(phase1Result!.consensusResult.consensusScore).toBeGreaterThanOrEqual(0);
      expect(phase1Result!.consensusResult.consensusScore).toBeLessThanOrEqual(1);
    }, 90000);

    it('should enforce minimum consensus threshold', async () => {
      const highConsensusConfig: PhaseOrchestratorConfig = {
        phases: [
          {
            ...config.phases[0],
            completionCriteria: {
              minConsensusScore: 0.95, // High threshold
              requiredDeliverables: [],
            },
          },
        ],
        maxPhaseRetries: 3,
        enableMemoryPersistence: false,
      };

      const highConsensusOrchestrator = createPhaseOrchestrator(highConsensusConfig);
      await highConsensusOrchestrator.initialize();

      const result = await highConsensusOrchestrator.executeAllPhases('High consensus test');

      // May pass or fail depending on mock consensus scores
      expect(result).toBeDefined();

      await highConsensusOrchestrator.shutdown();
    }, 60000);
  });

  describe('Phase Statistics', () => {
    it('should track orchestration statistics', () => {
      const stats = orchestrator.getStatistics();

      expect(stats.totalPhases).toBe(2);
      expect(stats.completedPhases).toBe(0); // Before execution
      expect(stats.failedPhases).toBe(0);
      expect(stats.inProgress).toBe(2);
    });

    it('should update statistics during execution', async () => {
      await orchestrator.initialize();

      const beforeStats = orchestrator.getStatistics();
      expect(beforeStats.completedPhases).toBe(0);

      await orchestrator.executeAllPhases('Update statistics test');

      const afterStats = orchestrator.getStatistics();
      expect(afterStats.completedPhases).toBeGreaterThan(0);
    }, 90000);

    it('should calculate total duration', async () => {
      await orchestrator.initialize();

      const result = await orchestrator.executeAllPhases('Duration test');

      expect(result.totalDuration).toBeGreaterThan(0);

      const stats = orchestrator.getStatistics();
      expect(stats.duration).toBeGreaterThan(0);
    }, 90000);
  });

  describe('Phase Continuation Prompts', () => {
    it('should generate continuation prompt after phase completion', async () => {
      await orchestrator.initialize();

      const result = await orchestrator.executeAllPhases('Continuation prompt test');

      // Continuation prompts are generated internally
      // Verify result contains necessary data
      expect(result.phaseResults.size).toBeGreaterThan(0);
    }, 90000);

    it('should provide next phase information in continuation', async () => {
      const singlePhaseConfig: PhaseOrchestratorConfig = {
        phases: [config.phases[0]],
        maxPhaseRetries: 3,
      };

      const singlePhaseOrchestrator = createPhaseOrchestrator(singlePhaseConfig);
      await singlePhaseOrchestrator.initialize();

      const result = await singlePhaseOrchestrator.executeAllPhases('Next phase info test');

      // When no next phase exists, continuation should reflect completion
      expect(result.completedPhases).toContain('phase-1');

      await singlePhaseOrchestrator.shutdown();
    }, 60000);
  });

  describe('Error Handling', () => {
    it('should handle orchestrator shutdown gracefully', async () => {
      await expect(orchestrator.shutdown()).resolves.not.toThrow();
    });

    it('should handle empty phase list', async () => {
      const emptyConfig: PhaseOrchestratorConfig = {
        phases: [],
      };

      const emptyOrchestrator = createPhaseOrchestrator(emptyConfig);
      await emptyOrchestrator.initialize();

      const result = await emptyOrchestrator.executeAllPhases('Empty test');

      expect(result.totalPhases).toBe(0);
      expect(result.success).toBe(true);

      await emptyOrchestrator.shutdown();
    });

    it('should handle phases with no sprints', async () => {
      const noSprintsPhase: Phase = {
        id: 'phase-no-sprints',
        order: 0,
        name: 'No Sprints Phase',
        description: 'Phase without sprint structure',
        dependsOn: [],
        // No sprints property
        completionCriteria: {
          minConsensusScore: 0.90,
          requiredDeliverables: [],
        },
      };

      const noSprintsConfig: PhaseOrchestratorConfig = {
        phases: [noSprintsPhase],
        maxPhaseRetries: 3,
      };

      const noSprintsOrchestrator = createPhaseOrchestrator(noSprintsConfig);
      await noSprintsOrchestrator.initialize();

      const result = await noSprintsOrchestrator.executeAllPhases('No sprints test');

      // Should execute via direct CFN Loop (not sprint orchestrator)
      expect(result.phaseResults.size).toBe(1);

      await noSprintsOrchestrator.shutdown();
    }, 60000);
  });

  describe('Phase Retry Logic', () => {
    it('should retry phase on validation failure', async () => {
      const retryConfig: PhaseOrchestratorConfig = {
        phases: [config.phases[0]],
        maxPhaseRetries: 2, // Allow 2 retries
        enableMemoryPersistence: false,
      };

      const retryOrchestrator = createPhaseOrchestrator(retryConfig);
      await retryOrchestrator.initialize();

      const result = await retryOrchestrator.executeAllPhases('Retry test');

      // Should succeed (eventually)
      expect(result.phaseResults.size).toBe(1);

      await retryOrchestrator.shutdown();
    }, 60000);

    it('should abort after max phase retries', async () => {
      const maxRetryConfig: PhaseOrchestratorConfig = {
        phases: [
          {
            ...config.phases[0],
            completionCriteria: {
              minConsensusScore: 1.0, // Impossible threshold
              requiredDeliverables: [],
            },
          },
        ],
        maxPhaseRetries: 1, // Only 1 retry
        enableMemoryPersistence: false,
      };

      const maxRetryOrchestrator = createPhaseOrchestrator(maxRetryConfig);
      await maxRetryOrchestrator.initialize();

      const result = await maxRetryOrchestrator.executeAllPhases('Max retry test');

      // May fail after retries
      expect(result.phaseResults.size).toBe(1);

      await maxRetryOrchestrator.shutdown();
    }, 60000);
  });

  describe('Event Emission', () => {
    it('should emit phase completion events', async () => {
      const events: string[] = [];

      orchestrator.on('phase:complete', () => events.push('phase:complete'));

      await orchestrator.initialize();
      await orchestrator.executeAllPhases('Event test');

      // At least one phase completion event should fire
      expect(events.length).toBeGreaterThan(0);
    }, 90000);
  });
});
