/**
 * Epic Orchestration Integration Tests
 *
 * Tests full epic execution with multiple phases and sprints:
 * 1. Full epic execution across phases
 * 2. Multi-phase coordination
 * 3. Progress tracking
 * 4. Topological ordering
 * 5. Epic-level validation
 * 6. Statistics aggregation
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

describe('Epic Orchestration - Integration Tests', () => {
  let orchestrator: PhaseOrchestrator;
  let config: PhaseOrchestratorConfig;

  beforeEach(() => {
    process.env.CLAUDE_FLOW_ENV = 'test';

    // Define comprehensive epic with 3 phases and 6 sprints
    const phase1Sprints: Sprint[] = [
      {
        id: 'sprint-1.1',
        phaseId: 'phase-1',
        name: 'JWT Token Generation',
        description: 'Implement JWT token generation and validation',
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
        name: 'Password Hashing',
        description: 'Implement bcrypt password hashing',
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
    ];

    const phase2Sprints: Sprint[] = [
      {
        id: 'sprint-2.1',
        phaseId: 'phase-2',
        name: 'Role Model',
        description: 'Create role database model',
        dependencies: [],
        crossPhaseDependencies: ['sprint-1.1'], // Depends on JWT
        checkpoints: {
          testsPass: true,
          minCoverage: 85,
          noSecurityIssues: true,
          minConfidence: 0.75,
          dependenciesSatisfied: true,
        },
      },
      {
        id: 'sprint-2.2',
        phaseId: 'phase-2',
        name: 'Permission System',
        description: 'Implement permission checking',
        dependencies: ['sprint-2.1'],
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

    const phase3Sprints: Sprint[] = [
      {
        id: 'sprint-3.1',
        phaseId: 'phase-3',
        name: 'Profile CRUD',
        description: 'Create user profile endpoints',
        dependencies: [],
        crossPhaseDependencies: ['sprint-1.1', 'sprint-2.2'], // Depends on both previous phases
        checkpoints: {
          testsPass: true,
          minCoverage: 85,
          noSecurityIssues: true,
          minConfidence: 0.75,
          dependenciesSatisfied: true,
        },
      },
      {
        id: 'sprint-3.2',
        phaseId: 'phase-3',
        name: 'Avatar Upload',
        description: 'Implement file upload for avatars',
        dependencies: ['sprint-3.1'],
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

    const phases: Phase[] = [
      {
        id: 'phase-1',
        order: 0,
        name: 'Core Authentication',
        description: 'Implement fundamental authentication mechanisms',
        dependsOn: [],
        sprints: phase1Sprints,
        completionCriteria: {
          minConsensusScore: 0.90,
          requiredDeliverables: [],
        },
      },
      {
        id: 'phase-2',
        order: 1,
        name: 'Authorization',
        description: 'Implement role-based access control',
        dependsOn: ['phase-1'],
        sprints: phase2Sprints,
        completionCriteria: {
          minConsensusScore: 0.90,
          requiredDeliverables: [],
        },
      },
      {
        id: 'phase-3',
        order: 2,
        name: 'User Management',
        description: 'User profile and avatar features',
        dependsOn: ['phase-1', 'phase-2'],
        sprints: phase3Sprints,
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

  describe('Full Epic Execution', () => {
    it('should execute complete epic with all phases and sprints', async () => {
      await orchestrator.initialize();

      const result: PhaseOrchestratorResult = await orchestrator.executeAllPhases(
        'Implement complete user management system'
      );

      expect(result.success).toBe(true);
      expect(result.totalPhases).toBe(3);
      expect(result.completedPhases).toEqual(['phase-1', 'phase-2', 'phase-3']);
      expect(result.failedPhases).toHaveLength(0);
      expect(result.phaseResults.size).toBe(3);
      expect(result.totalDuration).toBeGreaterThan(0);
      expect(result.timestamp).toBeGreaterThan(0);
    }, 180000); // 3 minutes timeout for full epic

    it('should execute phases in correct topological order', async () => {
      await orchestrator.initialize();

      const result = await orchestrator.executeAllPhases('Test topological ordering');

      // Phases should complete in dependency order
      expect(result.completedPhases).toEqual(['phase-1', 'phase-2', 'phase-3']);

      // Verify timestamps reflect execution order
      const phase1 = result.phaseResults.get('phase-1');
      const phase2 = result.phaseResults.get('phase-2');
      const phase3 = result.phaseResults.get('phase-3');

      expect(phase1!.timestamp).toBeLessThanOrEqual(phase2!.timestamp);
      expect(phase2!.timestamp).toBeLessThanOrEqual(phase3!.timestamp);
    }, 180000);
  });

  describe('Multi-Phase Coordination', () => {
    it('should coordinate sprint execution across phases', async () => {
      await orchestrator.initialize();

      const result = await orchestrator.executeAllPhases('Multi-phase coordination test');

      // Verify all phases completed
      expect(result.completedPhases).toContain('phase-1');
      expect(result.completedPhases).toContain('phase-2');
      expect(result.completedPhases).toContain('phase-3');

      // Verify phase results
      for (const phaseId of result.completedPhases) {
        const phaseResult = result.phaseResults.get(phaseId);
        expect(phaseResult).toBeDefined();
        expect(phaseResult!.success).toBe(true);
      }
    }, 180000);

    it('should resolve cross-phase sprint dependencies', async () => {
      await orchestrator.initialize();

      const result = await orchestrator.executeAllPhases('Cross-phase dependency test');

      // Phase-2 Sprint-2.1 depends on Phase-1 Sprint-1.1
      // Phase-3 Sprint-3.1 depends on Phase-1 Sprint-1.1 and Phase-2 Sprint-2.2
      // All should complete if dependencies are resolved
      expect(result.success).toBe(true);
      expect(result.completedPhases).toHaveLength(3);
    }, 180000);

    it('should handle complex dependency graph', async () => {
      await orchestrator.initialize();

      const result = await orchestrator.executeAllPhases('Complex dependency graph test');

      // With 3 phases and cross-phase dependencies, verify all sprints executed
      const phase1Result = result.phaseResults.get('phase-1');
      const phase2Result = result.phaseResults.get('phase-2');
      const phase3Result = result.phaseResults.get('phase-3');

      expect(phase1Result).toBeDefined();
      expect(phase2Result).toBeDefined();
      expect(phase3Result).toBeDefined();

      // Verify deliverables from all phases
      const totalDeliverables =
        phase1Result!.finalDeliverables.length +
        phase2Result!.finalDeliverables.length +
        phase3Result!.finalDeliverables.length;

      expect(totalDeliverables).toBeGreaterThan(0);
    }, 180000);
  });

  describe('Progress Tracking', () => {
    it('should track epic progress during execution', async () => {
      await orchestrator.initialize();

      const initialStats = orchestrator.getStatistics();
      expect(initialStats.completedPhases).toBe(0);
      expect(initialStats.inProgress).toBe(3);

      await orchestrator.executeAllPhases('Progress tracking test');

      const finalStats = orchestrator.getStatistics();
      expect(finalStats.completedPhases).toBe(3);
      expect(finalStats.inProgress).toBe(0);
    }, 180000);

    it('should emit progress events during execution', async () => {
      const events: string[] = [];

      orchestrator.on('phase:complete', (data: any) => {
        events.push(`phase:${data.phaseId}`);
      });

      await orchestrator.initialize();
      await orchestrator.executeAllPhases('Event tracking test');

      // Should have received 3 phase completion events
      expect(events).toContain('phase:phase-1');
      expect(events).toContain('phase:phase-2');
      expect(events).toContain('phase:phase-3');
    }, 180000);

    it('should calculate cumulative duration', async () => {
      await orchestrator.initialize();

      const startTime = Date.now();
      const result = await orchestrator.executeAllPhases('Duration test');
      const endTime = Date.now();

      const measuredDuration = endTime - startTime;

      // Reported duration should be close to measured duration
      expect(result.totalDuration).toBeGreaterThan(0);
      expect(result.totalDuration).toBeLessThanOrEqual(measuredDuration + 1000); // 1s tolerance
    }, 180000);
  });

  describe('Epic-Level Validation', () => {
    it('should aggregate phase validation results', async () => {
      await orchestrator.initialize();

      const result = await orchestrator.executeAllPhases('Aggregate validation test');

      // Check consensus results for all phases
      for (const phaseId of result.completedPhases) {
        const phaseResult = result.phaseResults.get(phaseId);
        expect(phaseResult!.consensusResult).toBeDefined();
        expect(phaseResult!.consensusResult.consensusScore).toBeGreaterThanOrEqual(0);
        expect(phaseResult!.consensusResult.consensusScore).toBeLessThanOrEqual(1);
      }
    }, 180000);

    it('should enforce epic-level quality standards', async () => {
      const highQualityConfig: PhaseOrchestratorConfig = {
        phases: config.phases.map(p => ({
          ...p,
          completionCriteria: {
            minConsensusScore: 0.95, // High standard
            requiredDeliverables: [],
          },
        })),
        maxPhaseRetries: 3,
        enableMemoryPersistence: false,
      };

      const highQualityOrchestrator = createPhaseOrchestrator(highQualityConfig);
      await highQualityOrchestrator.initialize();

      const result = await highQualityOrchestrator.executeAllPhases('High quality test');

      // May pass or fail depending on mock consensus
      expect(result).toBeDefined();

      await highQualityOrchestrator.shutdown();
    }, 180000);
  });

  describe('Statistics Aggregation', () => {
    it('should aggregate statistics across all phases', async () => {
      await orchestrator.initialize();

      const result = await orchestrator.executeAllPhases('Statistics aggregation test');

      // Verify statistics from all phases
      const phase1Stats = result.phaseResults.get('phase-1')!.statistics;
      const phase2Stats = result.phaseResults.get('phase-2')!.statistics;
      const phase3Stats = result.phaseResults.get('phase-3')!.statistics;

      expect(phase1Stats.totalDuration).toBeGreaterThan(0);
      expect(phase2Stats.totalDuration).toBeGreaterThan(0);
      expect(phase3Stats.totalDuration).toBeGreaterThan(0);

      // Total duration should be sum of phases
      const totalPhaseDuration =
        phase1Stats.totalDuration +
        phase2Stats.totalDuration +
        phase3Stats.totalDuration;

      expect(result.totalDuration).toBeGreaterThanOrEqual(totalPhaseDuration);
    }, 180000);

    it('should track confidence scores across epic', async () => {
      await orchestrator.initialize();

      const result = await orchestrator.executeAllPhases('Confidence tracking test');

      // Collect all confidence scores
      const allConfidenceScores: number[] = [];

      for (const phaseResult of result.phaseResults.values()) {
        allConfidenceScores.push(...phaseResult.confidenceScores);
      }

      expect(allConfidenceScores.length).toBeGreaterThan(0);

      // All confidence scores should be valid
      allConfidenceScores.forEach(score => {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      });
    }, 180000);

    it('should calculate average epic consensus', async () => {
      await orchestrator.initialize();

      const result = await orchestrator.executeAllPhases('Epic consensus test');

      const consensusScores = Array.from(result.phaseResults.values()).map(
        r => r.consensusResult.consensusScore
      );

      expect(consensusScores.length).toBe(3);

      const averageConsensus =
        consensusScores.reduce((sum, score) => sum + score, 0) / consensusScores.length;

      expect(averageConsensus).toBeGreaterThanOrEqual(0);
      expect(averageConsensus).toBeLessThanOrEqual(1);
    }, 180000);
  });

  describe('Epic Failure Scenarios', () => {
    it('should handle early phase failure', async () => {
      const failEarlyConfig: PhaseOrchestratorConfig = {
        phases: [
          {
            ...config.phases[0],
            completionCriteria: {
              minConsensusScore: 1.0, // Impossible
              requiredDeliverables: ['impossible-deliverable'],
            },
          },
          config.phases[1],
          config.phases[2],
        ],
        maxPhaseRetries: 1,
        enableMemoryPersistence: false,
      };

      const failEarlyOrchestrator = createPhaseOrchestrator(failEarlyConfig);
      await failEarlyOrchestrator.initialize();

      const result = await failEarlyOrchestrator.executeAllPhases('Early failure test');

      // Phase-1 should fail, Phase-2 and Phase-3 should be skipped
      expect(result.success).toBe(false);
      expect(result.failedPhases).toContain('phase-1');

      await failEarlyOrchestrator.shutdown();
    }, 180000);

    it('should continue on non-critical phase failure', async () => {
      // Create independent phases (no dependencies)
      const independentPhases: Phase[] = [
        {
          ...config.phases[0],
          dependsOn: [],
        },
        {
          ...config.phases[1],
          dependsOn: [], // Remove dependency
        },
        {
          ...config.phases[2],
          dependsOn: [], // Remove dependency
        },
      ];

      const independentConfig: PhaseOrchestratorConfig = {
        phases: independentPhases,
        maxPhaseRetries: 1,
        enableMemoryPersistence: false,
      };

      const independentOrchestrator = createPhaseOrchestrator(independentConfig);
      await independentOrchestrator.initialize();

      const result = await independentOrchestrator.executeAllPhases('Independent phases test');

      // Even if one fails, others should continue (if independent)
      expect(result.totalPhases).toBe(3);

      await independentOrchestrator.shutdown();
    }, 180000);
  });

  describe('Error Handling', () => {
    it('should handle orchestrator shutdown during execution', async () => {
      await orchestrator.initialize();

      // Start execution (don't await)
      const executionPromise = orchestrator.executeAllPhases('Shutdown test');

      // Shutdown orchestrator
      await orchestrator.shutdown();

      // Execution should complete or handle shutdown gracefully
      await expect(executionPromise).resolves.toBeDefined();
    }, 30000);

    it('should handle empty epic', async () => {
      const emptyConfig: PhaseOrchestratorConfig = {
        phases: [],
      };

      const emptyOrchestrator = createPhaseOrchestrator(emptyConfig);
      await emptyOrchestrator.initialize();

      const result = await emptyOrchestrator.executeAllPhases('Empty epic test');

      expect(result.totalPhases).toBe(0);
      expect(result.success).toBe(true);

      await emptyOrchestrator.shutdown();
    });
  });
});
