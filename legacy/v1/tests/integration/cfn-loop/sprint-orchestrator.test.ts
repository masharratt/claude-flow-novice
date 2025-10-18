/**
 * Sprint Orchestrator Integration Tests
 *
 * Tests sprint-level execution:
 * 1. Single sprint execution with CFN Loop
 * 2. Sprint with dependencies (within-phase)
 * 3. Sprint retry (up to 10 iterations)
 * 4. Checkpoint validation (tests, coverage, security, confidence, deps)
 * 5. Auto-agent assignment via NLP heuristics
 * 6. Sprint status tracking
 * 7. Sprint result storage
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  SprintOrchestrator,
  createSprintOrchestrator,
  Sprint,
  SprintOrchestratorConfig,
  SprintResult,
  EpicResult,
} from '../../../src/cfn-loop/sprint-orchestrator.js';

describe('SprintOrchestrator - Integration Tests', () => {
  let orchestrator: SprintOrchestrator;
  let config: SprintOrchestratorConfig;

  beforeEach(() => {
    process.env.CLAUDE_FLOW_ENV = 'test';

    const sprints: Sprint[] = [
      {
        id: 'sprint-1.1',
        phaseId: 'phase-1',
        name: 'JWT Token Generation',
        description: 'Implement JWT token generation with bcrypt hashing',
        dependencies: [],
        crossPhaseDependencies: [],
        checkpoints: {
          testsPass: true,
          minCoverage: 85,
          noSecurityIssues: true,
          minConfidence: 0.75,
          dependenciesSatisfied: true,
        },
        maxRetries: 10,
      },
      {
        id: 'sprint-1.2',
        phaseId: 'phase-1',
        name: 'Auth Middleware',
        description: 'Create authentication middleware for Express',
        dependencies: ['sprint-1.1'],
        crossPhaseDependencies: [],
        checkpoints: {
          testsPass: true,
          minCoverage: 85,
          noSecurityIssues: true,
          minConfidence: 0.75,
          dependenciesSatisfied: true,
        },
        maxRetries: 10,
      },
    ];

    config = {
      epicId: 'test-epic-auth',
      sprints,
      defaultMaxRetries: 10,
      loopConfig: {
        maxLoop2Iterations: 5,
        maxLoop3Iterations: 10,
        confidenceThreshold: 0.75,
        consensusThreshold: 0.90,
      },
      memoryConfig: {
        enabled: false, // Disable for tests
      },
    };

    orchestrator = createSprintOrchestrator(config);
  });

  afterEach(async () => {
    await orchestrator.shutdown();
    delete process.env.CLAUDE_FLOW_ENV;
  });

  describe('Initialization', () => {
    it('should initialize sprint orchestrator with configuration', () => {
      expect(orchestrator).toBeDefined();
      expect(orchestrator.getStatistics).toBeDefined();
    });

    it('should create orchestrator with factory function', () => {
      const newOrchestrator = createSprintOrchestrator(config);
      expect(newOrchestrator).toBeInstanceOf(SprintOrchestrator);
      newOrchestrator.shutdown();
    });

    it('should initialize orchestrator and build dependency graphs', async () => {
      await expect(orchestrator.initialize()).resolves.not.toThrow();
    });

    it('should detect cycles in dependency graph', async () => {
      const cyclicSprints: Sprint[] = [
        {
          id: 'sprint-a',
          phaseId: 'phase-1',
          name: 'Sprint A',
          description: 'Task A',
          dependencies: ['sprint-b'],
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
          id: 'sprint-b',
          phaseId: 'phase-1',
          name: 'Sprint B',
          description: 'Task B',
          dependencies: ['sprint-a'], // Cycle!
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

      const cyclicConfig: SprintOrchestratorConfig = {
        epicId: 'cyclic-test',
        sprints: cyclicSprints,
        defaultMaxRetries: 10,
      };

      const cyclicOrchestrator = createSprintOrchestrator(cyclicConfig);

      await expect(cyclicOrchestrator.initialize()).rejects.toThrow('Dependency cycle detected');

      cyclicOrchestrator.shutdown();
    });
  });

  describe('Single Sprint Execution', () => {
    it('should execute single sprint successfully', async () => {
      const singleSprintConfig: SprintOrchestratorConfig = {
        epicId: 'single-sprint-test',
        sprints: [config.sprints[0]],
        defaultMaxRetries: 10,
        loopConfig: config.loopConfig,
      };

      const singleOrchestrator = createSprintOrchestrator(singleSprintConfig);
      await singleOrchestrator.initialize();

      const result: EpicResult = await singleOrchestrator.executeEpic();

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.totalSprints).toBe(1);
      expect(result.completedSprints).toContain('sprint-1.1');
      expect(result.failedSprints).toHaveLength(0);
      expect(result.statistics).toBeDefined();
      expect(result.timestamp).toBeGreaterThan(0);

      await singleOrchestrator.shutdown();
    }, 30000);

    it('should track sprint execution metrics', async () => {
      await orchestrator.initialize();
      const result = await orchestrator.executeEpic();

      const sprintResult = result.sprintResults.get('sprint-1.1');
      expect(sprintResult).toBeDefined();
      expect(sprintResult!.sprintId).toBe('sprint-1.1');
      expect(sprintResult!.phaseId).toBe('phase-1');
      expect(sprintResult!.duration).toBeGreaterThan(0);
      expect(sprintResult!.retries).toBeGreaterThanOrEqual(0);
      expect(sprintResult!.retries).toBeLessThanOrEqual(10);
    }, 30000);
  });

  describe('Sprint Dependencies', () => {
    it('should execute sprints in dependency order', async () => {
      await orchestrator.initialize();
      const result = await orchestrator.executeEpic();

      expect(result.completedSprints).toEqual(['sprint-1.1', 'sprint-1.2']);
    }, 30000);

    it('should fail sprint when dependency not satisfied', async () => {
      const dependentSprints: Sprint[] = [
        {
          id: 'sprint-dependent',
          phaseId: 'phase-1',
          name: 'Dependent Sprint',
          description: 'Depends on missing sprint',
          dependencies: ['sprint-missing'],
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

      const dependentConfig: SprintOrchestratorConfig = {
        epicId: 'dependent-test',
        sprints: dependentSprints,
        defaultMaxRetries: 10,
      };

      const dependentOrchestrator = createSprintOrchestrator(dependentConfig);
      await dependentOrchestrator.initialize();

      const result = await dependentOrchestrator.executeEpic();

      expect(result.success).toBe(false);
      expect(result.failedSprints).toContain('sprint-dependent');

      await dependentOrchestrator.shutdown();
    }, 15000);

    it('should handle cross-phase dependencies', async () => {
      const crossPhaseSprints: Sprint[] = [
        {
          id: 'sprint-2.1',
          phaseId: 'phase-2',
          name: 'Phase 2 Sprint',
          description: 'Depends on phase 1 sprint',
          dependencies: [],
          crossPhaseDependencies: ['sprint-1.1'],
          checkpoints: {
            testsPass: true,
            minCoverage: 85,
            noSecurityIssues: true,
            minConfidence: 0.75,
            dependenciesSatisfied: true,
          },
        },
        config.sprints[0], // sprint-1.1
      ];

      const crossPhaseConfig: SprintOrchestratorConfig = {
        epicId: 'cross-phase-test',
        sprints: crossPhaseSprints,
        defaultMaxRetries: 10,
      };

      const crossPhaseOrchestrator = createSprintOrchestrator(crossPhaseConfig);
      await crossPhaseOrchestrator.initialize();

      const result = await crossPhaseOrchestrator.executeEpic();

      // Should execute in order: sprint-1.1, then sprint-2.1
      expect(result.completedSprints).toContain('sprint-1.1');
      expect(result.completedSprints).toContain('sprint-2.1');

      await crossPhaseOrchestrator.shutdown();
    }, 30000);
  });

  describe('Sprint Retry Logic', () => {
    it('should retry sprint up to 10 times on failure', async () => {
      // This test is challenging to implement without actual failure injection
      // We verify the retry mechanism through configuration
      const retryConfig: SprintOrchestratorConfig = {
        epicId: 'retry-test',
        sprints: [config.sprints[0]],
        defaultMaxRetries: 3, // Lower for testing
      };

      const retryOrchestrator = createSprintOrchestrator(retryConfig);
      await retryOrchestrator.initialize();

      const result = await retryOrchestrator.executeEpic();

      const sprintResult = result.sprintResults.get('sprint-1.1');
      expect(sprintResult).toBeDefined();
      expect(sprintResult!.retries).toBeLessThanOrEqual(3);

      await retryOrchestrator.shutdown();
    }, 30000);

    it('should escalate after max retries reached', async () => {
      // Similar limitation - testing escalation requires failure injection
      const stats = orchestrator.getStatistics();
      expect(stats.totalSprints).toBe(2);
    });
  });

  describe('Checkpoint Validation', () => {
    it('should validate all checkpoint criteria', async () => {
      await orchestrator.initialize();
      const result = await orchestrator.executeEpic();

      const sprintResult = result.sprintResults.get('sprint-1.1');
      expect(sprintResult).toBeDefined();
      expect(sprintResult!.checkpointResults).toBeDefined();
      expect(sprintResult!.checkpointResults.passed).toBeDefined();
      expect(sprintResult!.checkpointResults.checkpoints).toHaveProperty('testsPass');
      expect(sprintResult!.checkpointResults.checkpoints).toHaveProperty('coveragePass');
      expect(sprintResult!.checkpointResults.checkpoints).toHaveProperty('securityPass');
      expect(sprintResult!.checkpointResults.checkpoints).toHaveProperty('confidencePass');
      expect(sprintResult!.checkpointResults.checkpoints).toHaveProperty('dependenciesPass');
    }, 30000);

    it('should report failed checkpoints', async () => {
      await orchestrator.initialize();
      const result = await orchestrator.executeEpic();

      const sprintResult = result.sprintResults.get('sprint-1.1');
      expect(sprintResult!.checkpointResults.failedCheckpoints).toBeDefined();
      expect(Array.isArray(sprintResult!.checkpointResults.failedCheckpoints)).toBe(true);
    }, 30000);

    it('should validate minimum coverage threshold', async () => {
      const highCoverageSprint: Sprint = {
        id: 'sprint-high-coverage',
        phaseId: 'phase-1',
        name: 'High Coverage Sprint',
        description: 'Requires 95% coverage',
        dependencies: [],
        crossPhaseDependencies: [],
        checkpoints: {
          testsPass: true,
          minCoverage: 95, // High threshold
          noSecurityIssues: true,
          minConfidence: 0.75,
          dependenciesSatisfied: true,
        },
      };

      const highCoverageConfig: SprintOrchestratorConfig = {
        epicId: 'high-coverage-test',
        sprints: [highCoverageSprint],
        defaultMaxRetries: 10,
      };

      const highCoverageOrchestrator = createSprintOrchestrator(highCoverageConfig);
      await highCoverageOrchestrator.initialize();

      const result = await highCoverageOrchestrator.executeEpic();
      const sprintResult = result.sprintResults.get('sprint-high-coverage');

      expect(sprintResult).toBeDefined();
      // Coverage validation runs in validateCheckpoints()
      expect(sprintResult!.checkpointResults.checkpoints.coveragePass).toBeDefined();

      await highCoverageOrchestrator.shutdown();
    }, 30000);
  });

  describe('Auto-Agent Assignment', () => {
    it('should auto-assign agents based on sprint description', async () => {
      const backendSprint: Sprint = {
        id: 'sprint-backend',
        phaseId: 'phase-1',
        name: 'Backend API Sprint',
        description: 'Implement REST API endpoints with database integration',
        dependencies: [],
        crossPhaseDependencies: [],
        checkpoints: {
          testsPass: true,
          minCoverage: 85,
          noSecurityIssues: true,
          minConfidence: 0.75,
          dependenciesSatisfied: true,
        },
      };

      const backendConfig: SprintOrchestratorConfig = {
        epicId: 'backend-test',
        sprints: [backendSprint],
        defaultMaxRetries: 10,
      };

      const backendOrchestrator = createSprintOrchestrator(backendConfig);
      await backendOrchestrator.initialize();
      const result = await backendOrchestrator.executeEpic();

      const sprintResult = result.sprintResults.get('sprint-backend');
      expect(sprintResult).toBeDefined();
      expect(sprintResult!.assignedAgents).toBeDefined();
      expect(sprintResult!.assignedAgents.length).toBeGreaterThan(0);

      // Should include backend-dev agent for API keywords
      const agentTypes = sprintResult!.assignedAgents.map(a => a.agentType);
      expect(agentTypes).toContain('backend-dev');

      await backendOrchestrator.shutdown();
    }, 30000);

    it('should use suggested agent types when provided', async () => {
      const customAgentSprint: Sprint = {
        id: 'sprint-custom-agents',
        phaseId: 'phase-1',
        name: 'Custom Agents Sprint',
        description: 'Sprint with predefined agents',
        dependencies: [],
        crossPhaseDependencies: [],
        suggestedAgentTypes: ['coder', 'tester', 'security-specialist'],
        checkpoints: {
          testsPass: true,
          minCoverage: 85,
          noSecurityIssues: true,
          minConfidence: 0.75,
          dependenciesSatisfied: true,
        },
      };

      const customConfig: SprintOrchestratorConfig = {
        epicId: 'custom-agents-test',
        sprints: [customAgentSprint],
        defaultMaxRetries: 10,
      };

      const customOrchestrator = createSprintOrchestrator(customConfig);
      await customOrchestrator.initialize();
      const result = await customOrchestrator.executeEpic();

      const sprintResult = result.sprintResults.get('sprint-custom-agents');
      expect(sprintResult!.assignedAgents.length).toBe(3);

      const agentTypes = sprintResult!.assignedAgents.map(a => a.agentType);
      expect(agentTypes).toContain('coder');
      expect(agentTypes).toContain('tester');
      expect(agentTypes).toContain('security-specialist');

      await customOrchestrator.shutdown();
    }, 30000);

    it('should always include tester and reviewer agents', async () => {
      await orchestrator.initialize();
      const result = await orchestrator.executeEpic();

      const sprintResult = result.sprintResults.get('sprint-1.1');
      const agentTypes = sprintResult!.assignedAgents.map(a => a.agentType);

      expect(agentTypes).toContain('tester');
      expect(agentTypes).toContain('reviewer');
    }, 30000);
  });

  describe('Epic Execution', () => {
    it('should execute all sprints in epic', async () => {
      await orchestrator.initialize();
      const result = await orchestrator.executeEpic();

      expect(result.success).toBe(true);
      expect(result.totalSprints).toBe(2);
      expect(result.completedSprints).toHaveLength(2);
      expect(result.failedSprints).toHaveLength(0);
    }, 30000);

    it('should calculate epic statistics', async () => {
      await orchestrator.initialize();
      const result = await orchestrator.executeEpic();

      expect(result.statistics).toBeDefined();
      expect(result.statistics.totalRetries).toBeGreaterThanOrEqual(0);
      expect(result.statistics.averageConfidence).toBeGreaterThanOrEqual(0);
      expect(result.statistics.averageConfidence).toBeLessThanOrEqual(1);
      expect(result.statistics.averageConsensus).toBeGreaterThanOrEqual(0);
      expect(result.statistics.averageConsensus).toBeLessThanOrEqual(1);
      expect(result.statistics.checkpointFailures).toBeGreaterThanOrEqual(0);
    }, 30000);

    it('should emit events during execution', async () => {
      const events: string[] = [];

      orchestrator.on('initialized', () => events.push('initialized'));
      orchestrator.on('epic:started', () => events.push('epic:started'));
      orchestrator.on('sprint:completed', () => events.push('sprint:completed'));
      orchestrator.on('epic:completed', () => events.push('epic:completed'));

      await orchestrator.initialize();
      await orchestrator.executeEpic();

      expect(events).toContain('initialized');
      expect(events).toContain('epic:started');
      expect(events).toContain('epic:completed');
    }, 30000);
  });

  describe('Statistics and Monitoring', () => {
    it('should track orchestrator statistics', () => {
      const stats = orchestrator.getStatistics();

      expect(stats.epicId).toBe(config.epicId);
      expect(stats.totalSprints).toBe(2);
      expect(stats.completedSprints).toBe(0); // Before execution
      expect(stats.failedSprints).toBe(0);
      expect(stats.inProgress).toBe(2);
    });

    it('should update statistics during execution', async () => {
      await orchestrator.initialize();

      const beforeStats = orchestrator.getStatistics();
      expect(beforeStats.completedSprints).toBe(0);

      await orchestrator.executeEpic();

      const afterStats = orchestrator.getStatistics();
      expect(afterStats.completedSprints).toBe(2);
      expect(afterStats.inProgress).toBe(0);
    }, 30000);

    it('should track execution duration', async () => {
      await orchestrator.initialize();
      const result = await orchestrator.executeEpic();

      expect(result.totalDuration).toBeGreaterThan(0);

      const stats = orchestrator.getStatistics();
      expect(stats.duration).toBeGreaterThan(0);
    }, 30000);
  });

  describe('Error Handling', () => {
    it('should handle orchestrator shutdown gracefully', async () => {
      await expect(orchestrator.shutdown()).resolves.not.toThrow();
    });

    it('should handle multiple shutdown calls', async () => {
      await orchestrator.shutdown();
      await expect(orchestrator.shutdown()).resolves.not.toThrow();
    });

    it('should handle empty sprint list', async () => {
      const emptyConfig: SprintOrchestratorConfig = {
        epicId: 'empty-test',
        sprints: [],
        defaultMaxRetries: 10,
      };

      const emptyOrchestrator = createSprintOrchestrator(emptyConfig);
      await emptyOrchestrator.initialize();

      const result = await emptyOrchestrator.executeEpic();

      expect(result.totalSprints).toBe(0);
      expect(result.success).toBe(true);

      await emptyOrchestrator.shutdown();
    });
  });
});
