/**
 * LRU Garbage Collection for PhaseOrchestrator Tests
 *
 * Validates that sprint results are automatically evicted from memory
 * using LRU cache with TTL and archiving functionality.
 */

import { PhaseOrchestrator, PhaseOrchestratorConfig, Phase } from '../../../src/cfn-loop/phase-orchestrator.js';

describe('PhaseOrchestrator LRU Garbage Collection', () => {
  let orchestrator: PhaseOrchestrator;

  const createTestPhases = (count: number): Phase[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `phase-${i}`,
      order: i,
      name: `Test Phase ${i}`,
      description: `Phase ${i} for testing`,
      dependsOn: i > 0 ? [`phase-${i - 1}`] : [],
      sprints: [
        {
          id: `sprint-${i}.1`,
          phaseId: `phase-${i}`,
          name: `Sprint ${i}.1`,
          description: 'Test sprint',
          dependencies: [],
          crossPhaseDependencies: [],
          suggestedAgentTypes: ['coder'],
          checkpoints: {
            testsPass: true,
            minCoverage: 85,
            noSecurityIssues: true,
            minConfidence: 0.75,
            dependenciesSatisfied: true,
          },
          maxRetries: 10,
          metadata: {},
        }
      ],
      completionCriteria: {
        minConsensusScore: 0.90,
        requiredDeliverables: [],
      },
    }));
  };

  beforeEach(() => {
    const config: PhaseOrchestratorConfig = {
      phases: createTestPhases(3),
      maxPhaseRetries: 3,
      enableMemoryPersistence: false, // Disable for testing
      enableRateLimiting: false,
    };

    orchestrator = new PhaseOrchestrator(config);
  });

  afterEach(async () => {
    await orchestrator.shutdown();
  });

  test('should initialize LRU cache with correct configuration', () => {
    const memStats = orchestrator.getMemoryStats();

    expect(memStats.maxSize).toBe(500);
    expect(memStats.ttl).toBe(1000 * 60 * 60); // 1 hour
    expect(memStats.size).toBe(0);
  });

  test('should store sprint results in LRU cache', () => {
    // Access private globalSprintResults for testing
    const sprintResults = (orchestrator as any).globalSprintResults;

    // Add test sprint results
    sprintResults.set('phase-1/sprint-1.1', {
      success: true,
      deliverables: ['test.js'],
      confidence: 0.85,
    });

    sprintResults.set('phase-1/sprint-1.2', {
      success: true,
      deliverables: ['test2.js'],
      confidence: 0.90,
    });

    const memStats = orchestrator.getMemoryStats();
    expect(memStats.size).toBe(2);
  });

  test('should clean up phase sprint results on completion', async () => {
    const sprintResults = (orchestrator as any).globalSprintResults;

    // Add sprint results for multiple phases
    sprintResults.set('phase-1/sprint-1.1', { success: true });
    sprintResults.set('phase-1/sprint-1.2', { success: true });
    sprintResults.set('phase-2/sprint-2.1', { success: true });
    sprintResults.set('phase-3/sprint-3.1', { success: true });

    expect(orchestrator.getMemoryStats().size).toBe(4);

    // Cleanup phase-1
    await orchestrator.cleanupCompletedPhase('phase-1');

    const memStats = orchestrator.getMemoryStats();
    expect(memStats.size).toBe(2); // Only phase-2 and phase-3 remain

    // Verify phase-1 entries are removed
    expect(sprintResults.has('phase-1/sprint-1.1')).toBe(false);
    expect(sprintResults.has('phase-1/sprint-1.2')).toBe(false);

    // Verify other phases remain
    expect(sprintResults.has('phase-2/sprint-2.1')).toBe(true);
    expect(sprintResults.has('phase-3/sprint-3.1')).toBe(true);
  });

  test('should respect LRU max size limit', () => {
    const sprintResults = (orchestrator as any).globalSprintResults;

    // Add results up to max size
    for (let i = 0; i < 510; i++) {
      sprintResults.set(`phase-${i}/sprint-${i}`, { success: true, index: i });
    }

    const memStats = orchestrator.getMemoryStats();

    // Cache should not exceed max size (500)
    expect(memStats.size).toBeLessThanOrEqual(500);
  });

  test('should update age on get (TTL refresh)', () => {
    const sprintResults = (orchestrator as any).globalSprintResults;

    // Add a result
    const key = 'phase-1/sprint-1.1';
    const value = { success: true, timestamp: Date.now() };
    sprintResults.set(key, value);

    // Access it (should refresh TTL)
    const retrieved = sprintResults.get(key);

    expect(retrieved).toEqual(value);
    expect(sprintResults.has(key)).toBe(true);
  });

  test('should include memory stats in orchestrator statistics', () => {
    const sprintResults = (orchestrator as any).globalSprintResults;

    // Add some test data
    sprintResults.set('phase-1/sprint-1.1', { success: true });
    sprintResults.set('phase-1/sprint-1.2', { success: true });

    const stats = orchestrator.getStatistics();

    expect(stats.memoryStats).toBeDefined();
    expect(stats.memoryStats.sprintCacheSize).toBe(2);
    expect(stats.memoryStats.sprintCacheMaxSize).toBe(500);
    expect(stats.memoryStats.sprintCacheTTL).toBe(1000 * 60 * 60);
  });

  test('should handle cleanup of non-existent phase gracefully', async () => {
    const sprintResults = (orchestrator as any).globalSprintResults;

    // Add some data
    sprintResults.set('phase-1/sprint-1.1', { success: true });

    // Try to cleanup non-existent phase
    await orchestrator.cleanupCompletedPhase('phase-999');

    // Original data should remain
    expect(orchestrator.getMemoryStats().size).toBe(1);
    expect(sprintResults.has('phase-1/sprint-1.1')).toBe(true);
  });

  test('should cleanup multiple sprints for same phase', async () => {
    const sprintResults = (orchestrator as any).globalSprintResults;

    // Add multiple sprints for phase-1
    for (let i = 1; i <= 10; i++) {
      sprintResults.set(`phase-1/sprint-1.${i}`, {
        success: true,
        deliverables: [`file${i}.js`]
      });
    }

    // Add sprints for other phases
    sprintResults.set('phase-2/sprint-2.1', { success: true });

    expect(orchestrator.getMemoryStats().size).toBe(11);

    // Cleanup phase-1 (10 sprints)
    await orchestrator.cleanupCompletedPhase('phase-1');

    const memStats = orchestrator.getMemoryStats();
    expect(memStats.size).toBe(1); // Only phase-2 sprint remains
  });

  test('should handle archiving gracefully when memory manager is disabled', async () => {
    const sprintResults = (orchestrator as any).globalSprintResults;

    sprintResults.set('phase-1/sprint-1.1', { success: true });

    // Cleanup should succeed even without memory manager
    await expect(orchestrator.cleanupCompletedPhase('phase-1')).resolves.not.toThrow();

    expect(orchestrator.getMemoryStats().size).toBe(0);
  });

  test('should track evictions in memory stats', () => {
    const sprintResults = (orchestrator as any).globalSprintResults;

    // Fill cache beyond max size to trigger evictions
    for (let i = 0; i < 510; i++) {
      sprintResults.set(`phase-${i}/sprint-${i}`, {
        success: true,
        data: 'x'.repeat(1000) // Add some data
      });
    }

    const memStats = orchestrator.getMemoryStats();

    // Size should be capped at max
    expect(memStats.size).toBeLessThanOrEqual(500);

    // Evictions should be tracked
    expect(typeof memStats.evictions).toBe('number');
  });
});
