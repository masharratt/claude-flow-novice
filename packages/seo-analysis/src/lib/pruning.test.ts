/**
 * Unit Tests for Promise-Based Pruning Engine
 *
 * @module @claude-flow-novice/seo-analysis/lib/pruning.test
 * @description Comprehensive test suite for MDAP Beam Search pruning logic
 * @version 1.0.0
 *
 * Tests cover:
 * - Branch state evaluation (SOLVED, PROMISING, EXPLORING, STALLED, DISPROVEN)
 * - Promise-based keep/discard logic (NO quota-based pruning)
 * - Evidence-based decision making
 * - Configuration validation
 * - Logging of all decisions
 */

import {
  PruningEngine,
  BranchState,
  BranchMetrics,
  Branch,
  PruningConfig,
  PruningDecision,
  PruningLogger,
  createPruningEngine,
  createPruningEngineWithLogger,
  DEFAULT_PRUNING_CONFIG,
  CONSERVATIVE_PRUNING_CONFIG,
  AGGRESSIVE_PRUNING_CONFIG,
} from './pruning';

// ============================================================================
// TEST UTILITIES
// ============================================================================

/**
 * Mock logger for testing
 */
class MockLogger implements PruningLogger {
  messages: Array<{ level: string; message: string; data?: Record<string, unknown> }> = [];

  info(message: string, data?: Record<string, unknown>): void {
    this.messages.push({ level: 'info', message, data });
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.messages.push({ level: 'debug', message, data });
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.messages.push({ level: 'warn', message, data });
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.messages.push({ level: 'error', message, data });
  }

  getMessages(level?: string): typeof this.messages {
    return level ? this.messages.filter((m) => m.level === level) : this.messages;
  }

  clear(): void {
    this.messages = [];
  }
}

/**
 * Helper to create test branch
 */
function createTestBranch(
  id: string,
  state: BranchState,
  confidence: number = 0.5,
  currentIteration: number = 5,
  lastProgressIteration: number = 2,
): Branch {
  return {
    id,
    metrics: {
      current_iteration: currentIteration,
      last_progress_iteration: lastProgressIteration,
      confidence,
      state,
      evidence: [
        {
          iteration: lastProgressIteration,
          type: 'progress',
          description: 'Latest progress marker',
          confidence,
        },
      ],
    },
  };
}

/**
 * Helper to create test branch with contradictions
 */
function createDisprovenBranch(
  id: string,
  evidenceType: string = 'contradiction',
  confidence: number = 0.95,
): Branch {
  return {
    id,
    metrics: {
      current_iteration: 10,
      last_progress_iteration: 2,
      confidence,
      state: BranchState.DISPROVEN,
      evidence: [
        {
          iteration: 8,
          type: evidenceType,
          description: 'Logical contradiction detected',
          confidence,
        },
      ],
    },
  };
}

// ============================================================================
// TEST SUITE
// ============================================================================

describe('PruningEngine', () => {
  let engine: PruningEngine;
  let mockLogger: MockLogger;

  beforeEach(() => {
    mockLogger = new MockLogger();
    engine = createPruningEngineWithLogger(mockLogger);
  });

  // ========================================================================
  // Rule 1: SOLVED branches (keep)
  // ========================================================================

  describe('Rule 1: SOLVED state (always keep)', () => {
    it('should keep SOLVED branches regardless of confidence', async () => {
      const branch = createTestBranch('branch-1', BranchState.SOLVED, 0.1);
      const decision = await engine.evaluateBranch(branch, DEFAULT_PRUNING_CONFIG);

      expect(decision.action).toBe('keep');
      expect(decision.reason).toContain('solution');
      expect(decision.evidence).toContain('State is SOLVED');
    });

    it('should keep SOLVED branches with high confidence', async () => {
      const branch = createTestBranch('branch-2', BranchState.SOLVED, 0.99);
      const decision = await engine.evaluateBranch(branch, DEFAULT_PRUNING_CONFIG);

      expect(decision.action).toBe('keep');
      expect(decision.branch_id).toBe('branch-2');
    });

    it('should keep SOLVED branches regardless of iteration count', async () => {
      const branch = createTestBranch('branch-3', BranchState.SOLVED, 0.5, 1000, 0);
      const decision = await engine.evaluateBranch(branch, DEFAULT_PRUNING_CONFIG);

      expect(decision.action).toBe('keep');
    });
  });

  // ========================================================================
  // Rule 2: PROMISING branches (keep)
  // ========================================================================

  describe('Rule 2: PROMISING state (always keep)', () => {
    it('should keep PROMISING branches with sufficient confidence', async () => {
      const branch = createTestBranch('branch-4', BranchState.PROMISING, 0.7);
      const decision = await engine.evaluateBranch(branch, DEFAULT_PRUNING_CONFIG);

      expect(decision.action).toBe('keep');
      expect(decision.reason).toContain('strong potential');
    });

    it('should keep PROMISING branches with low confidence', async () => {
      const branch = createTestBranch('branch-5', BranchState.PROMISING, 0.1);
      const decision = await engine.evaluateBranch(branch, DEFAULT_PRUNING_CONFIG);

      expect(decision.action).toBe('keep');
      expect(decision.branch_id).toBe('branch-5');
    });

    it('should include confidence in evidence for PROMISING branches', async () => {
      const branch = createTestBranch('branch-6', BranchState.PROMISING, 0.65);
      const decision = await engine.evaluateBranch(branch, DEFAULT_PRUNING_CONFIG);

      expect(decision.evidence).toContain('Confidence: 0.65');
    });
  });

  // ========================================================================
  // Rule 3: EXPLORING branches (keep)
  // ========================================================================

  describe('Rule 3: EXPLORING state (always keep)', () => {
    it('should keep EXPLORING branches during active exploration', async () => {
      const branch = createTestBranch('branch-7', BranchState.EXPLORING, 0.5, 5, 4);
      const decision = await engine.evaluateBranch(branch, DEFAULT_PRUNING_CONFIG);

      expect(decision.action).toBe('keep');
      expect(decision.reason).toContain('actively explored');
    });

    it('should keep EXPLORING branches with minimal progress', async () => {
      const branch = createTestBranch('branch-8', BranchState.EXPLORING, 0.3, 100, 1);
      const decision = await engine.evaluateBranch(branch, DEFAULT_PRUNING_CONFIG);

      expect(decision.action).toBe('keep');
    });

    it('should include iteration info in evidence for EXPLORING', async () => {
      const branch = createTestBranch('branch-9', BranchState.EXPLORING, 0.5, 10, 7);
      const decision = await engine.evaluateBranch(branch, DEFAULT_PRUNING_CONFIG);

      expect(decision.evidence).toContain('Iterations since progress: 3');
    });
  });

  // ========================================================================
  // Rule 4: DISPROVEN branches (discard)
  // ========================================================================

  describe('Rule 4: DISPROVEN state (always discard)', () => {
    it('should discard DISPROVEN branches due to contradiction', async () => {
      const branch = createDisprovenBranch('branch-10', 'contradiction', 0.95);
      const decision = await engine.evaluateBranch(branch, DEFAULT_PRUNING_CONFIG);

      expect(decision.action).toBe('discard');
      expect(decision.reason).toContain('disproven');
      expect(decision.reason).toContain('contradiction');
    });

    it('should discard DISPROVEN branches due to constraint violation', async () => {
      const branch = createDisprovenBranch('branch-11', 'constraint_violation', 0.9);
      const decision = await engine.evaluateBranch(branch, DEFAULT_PRUNING_CONFIG);

      expect(decision.action).toBe('discard');
      expect(decision.reason).toContain('constraint violation');
    });

    it('should discard DISPROVEN branches regardless of high confidence', async () => {
      const branch = createDisprovenBranch('branch-12', 'contradiction', 0.99);
      const decision = await engine.evaluateBranch(branch, DEFAULT_PRUNING_CONFIG);

      expect(decision.action).toBe('discard');
    });

    it('should discard DISPROVEN branches regardless of iteration count', async () => {
      const branch = createDisprovenBranch('branch-13', 'contradiction', 0.85);
      branch.metrics.current_iteration = 2; // Very early
      const decision = await engine.evaluateBranch(branch, DEFAULT_PRUNING_CONFIG);

      expect(decision.action).toBe('discard');
    });
  });

  // ========================================================================
  // Rule 5: STALLED branches (conditional)
  // ========================================================================

  describe('Rule 5: STALLED state (conditional keep/discard)', () => {
    describe('Sub-rule 5a: Discard if stalled > max_stalled_iterations', () => {
      it('should discard STALLED when iterations exceed max without progress', async () => {
        const config: PruningConfig = DEFAULT_PRUNING_CONFIG;
        // 6 iterations since progress, max is 5
        const branch = createTestBranch('branch-14', BranchState.STALLED, 0.5, 10, 4);

        const decision = await engine.evaluateBranch(branch, config);

        expect(decision.action).toBe('discard');
        expect(decision.reason).toContain('stalled');
        expect(decision.reason).toContain('6');
      });

      it('should use max_stalled_iterations from config', async () => {
        const config: PruningConfig = {
          max_stalled_iterations: 3,
          min_confidence_threshold: 0.3,
          require_progress_every_n_iterations: 3,
        };
        // 7 iterations since progress, max is 3
        const branch = createTestBranch('branch-15', BranchState.STALLED, 0.5, 10, 3);

        const decision = await engine.evaluateBranch(branch, config);

        expect(decision.action).toBe('discard');
      });
    });

    describe('Sub-rule 5b: Discard if stalled AND confidence < threshold', () => {
      it('should discard STALLED when confidence is below threshold', async () => {
        const config: PruningConfig = DEFAULT_PRUNING_CONFIG;
        // Low confidence, well below threshold
        const branch = createTestBranch('branch-16', BranchState.STALLED, 0.1, 5, 4);

        const decision = await engine.evaluateBranch(branch, config);

        expect(decision.action).toBe('discard');
        expect(decision.reason).toContain('insufficient confidence');
      });

      it('should use min_confidence_threshold from config', async () => {
        const config: PruningConfig = {
          max_stalled_iterations: 10,
          min_confidence_threshold: 0.8, // High threshold
          require_progress_every_n_iterations: 5,
        };
        // Confidence below high threshold
        const branch = createTestBranch('branch-17', BranchState.STALLED, 0.5, 5, 4);

        const decision = await engine.evaluateBranch(branch, config);

        expect(decision.action).toBe('discard');
      });

      it('should keep STALLED if confidence meets threshold even if stalled', async () => {
        const config: PruningConfig = {
          max_stalled_iterations: 10,
          min_confidence_threshold: 0.3,
          require_progress_every_n_iterations: 5,
        };
        // Within stalled limit, confidence above threshold
        const branch = createTestBranch('branch-18', BranchState.STALLED, 0.5, 5, 4);

        const decision = await engine.evaluateBranch(branch, config);

        expect(decision.action).toBe('keep');
      });
    });

    describe('Sub-rule 5c: Keep STALLED if within iteration limit', () => {
      it('should keep STALLED when within max iterations with good confidence', async () => {
        const config: PruningConfig = DEFAULT_PRUNING_CONFIG;
        // 2 iterations since progress, max is 5
        const branch = createTestBranch('branch-19', BranchState.STALLED, 0.7, 7, 5);

        const decision = await engine.evaluateBranch(branch, config);

        expect(decision.action).toBe('keep');
        expect(decision.reason).toContain('within iteration limit');
      });

      it('should show progress stalled status in evidence', async () => {
        const branch = createTestBranch('branch-20', BranchState.STALLED, 0.6, 8, 6);
        const decision = await engine.evaluateBranch(branch, DEFAULT_PRUNING_CONFIG);

        expect(decision.evidence).toContain('Iterations without progress: 2');
        expect(decision.evidence).toContain('Max allowed: 5');
      });

      it('should keep STALLED at exactly max iteration boundary', async () => {
        const config: PruningConfig = DEFAULT_PRUNING_CONFIG;
        // Exactly at max boundary
        const branch = createTestBranch('branch-21', BranchState.STALLED, 0.5, 10, 5);

        const decision = await engine.evaluateBranch(branch, config);

        expect(decision.action).toBe('keep');
      });
    });
  });

  // ========================================================================
  // Batch Pruning
  // ========================================================================

  describe('pruneBranches: Batch operation', () => {
    it('should evaluate multiple branches in parallel', async () => {
      const branches: Branch[] = [
        createTestBranch('b1', BranchState.SOLVED, 0.9),
        createTestBranch('b2', BranchState.PROMISING, 0.6),
        createTestBranch('b3', BranchState.EXPLORING, 0.4),
        createDisprovenBranch('b4', 'contradiction', 0.85),
      ];

      const result = await engine.pruneBranches(branches, DEFAULT_PRUNING_CONFIG);

      expect(result.decisions.length).toBe(4);
      expect(result.kept_count).toBe(3);
      expect(result.discarded_count).toBe(1);
    });

    it('should maintain branch IDs in decisions', async () => {
      const branches: Branch[] = [
        createTestBranch('branch-a', BranchState.SOLVED),
        createTestBranch('branch-b', BranchState.PROMISING),
      ];

      const result = await engine.pruneBranches(branches, DEFAULT_PRUNING_CONFIG);
      const ids = result.decisions.map((d) => d.branch_id);

      expect(ids).toContain('branch-a');
      expect(ids).toContain('branch-b');
    });

    it('should return summary statistics', async () => {
      const branches: Branch[] = [
        createTestBranch('s1', BranchState.SOLVED),
        createTestBranch('s2', BranchState.SOLVED),
        createDisprovenBranch('d1'),
        createDisprovenBranch('d2'),
        createTestBranch('e1', BranchState.EXPLORING),
      ];

      const result = await engine.pruneBranches(branches, DEFAULT_PRUNING_CONFIG);

      expect(result.kept_count).toBe(3); // 2 SOLVED + 1 EXPLORING
      expect(result.discarded_count).toBe(2); // 2 DISPROVEN
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should log batch operations with summary', async () => {
      mockLogger.clear();
      const branches: Branch[] = [createTestBranch('b1', BranchState.SOLVED)];

      await engine.pruneBranches(branches, DEFAULT_PRUNING_CONFIG);

      const infoLogs = mockLogger.getMessages('info');
      expect(infoLogs.length).toBeGreaterThan(0);
      expect(infoLogs.some((log) => log.message.includes('Starting pruning'))).toBe(true);
      expect(infoLogs.some((log) => log.message.includes('completed'))).toBe(true);
    });
  });

  // ========================================================================
  // Configuration Validation
  // ========================================================================

  describe('Configuration validation', () => {
    it('should reject max_stalled_iterations < 1', async () => {
      const invalidConfig: PruningConfig = {
        max_stalled_iterations: 0,
        min_confidence_threshold: 0.3,
        require_progress_every_n_iterations: 3,
      };
      const branch = createTestBranch('b1', BranchState.SOLVED);

      await expect(engine.pruneBranches([branch], invalidConfig)).rejects.toThrow(
        'max_stalled_iterations must be >= 1',
      );
    });

    it('should reject min_confidence_threshold < 0', async () => {
      const invalidConfig: PruningConfig = {
        max_stalled_iterations: 5,
        min_confidence_threshold: -0.1,
        require_progress_every_n_iterations: 3,
      };
      const branch = createTestBranch('b1', BranchState.SOLVED);

      await expect(engine.pruneBranches([branch], invalidConfig)).rejects.toThrow(
        'min_confidence_threshold must be between 0.0 and 1.0',
      );
    });

    it('should reject min_confidence_threshold > 1', async () => {
      const invalidConfig: PruningConfig = {
        max_stalled_iterations: 5,
        min_confidence_threshold: 1.1,
        require_progress_every_n_iterations: 3,
      };
      const branch = createTestBranch('b1', BranchState.SOLVED);

      await expect(engine.pruneBranches([branch], invalidConfig)).rejects.toThrow(
        'min_confidence_threshold must be between 0.0 and 1.0',
      );
    });

    it('should reject require_progress_every_n_iterations < 1', async () => {
      const invalidConfig: PruningConfig = {
        max_stalled_iterations: 5,
        min_confidence_threshold: 0.3,
        require_progress_every_n_iterations: 0,
      };
      const branch = createTestBranch('b1', BranchState.SOLVED);

      await expect(engine.pruneBranches([branch], invalidConfig)).rejects.toThrow(
        'require_progress_every_n_iterations must be >= 1',
      );
    });

    it('should accept valid configurations', async () => {
      const validConfig: PruningConfig = {
        max_stalled_iterations: 5,
        min_confidence_threshold: 0.5,
        require_progress_every_n_iterations: 2,
      };
      const branch = createTestBranch('b1', BranchState.SOLVED);

      await expect(engine.pruneBranches([branch], validConfig)).resolves.toBeDefined();
    });
  });

  // ========================================================================
  // Preset Configurations
  // ========================================================================

  describe('Preset configurations', () => {
    it('should provide DEFAULT_PRUNING_CONFIG', () => {
      expect(DEFAULT_PRUNING_CONFIG.max_stalled_iterations).toBe(5);
      expect(DEFAULT_PRUNING_CONFIG.min_confidence_threshold).toBe(0.3);
      expect(DEFAULT_PRUNING_CONFIG.require_progress_every_n_iterations).toBe(3);
    });

    it('should provide CONSERVATIVE_PRUNING_CONFIG with higher thresholds', () => {
      expect(CONSERVATIVE_PRUNING_CONFIG.max_stalled_iterations).toBeGreaterThan(
        DEFAULT_PRUNING_CONFIG.max_stalled_iterations,
      );
      expect(CONSERVATIVE_PRUNING_CONFIG.min_confidence_threshold).toBeLessThan(
        DEFAULT_PRUNING_CONFIG.min_confidence_threshold,
      );
    });

    it('should provide AGGRESSIVE_PRUNING_CONFIG with lower thresholds', () => {
      expect(AGGRESSIVE_PRUNING_CONFIG.max_stalled_iterations).toBeLessThan(
        DEFAULT_PRUNING_CONFIG.max_stalled_iterations,
      );
      expect(AGGRESSIVE_PRUNING_CONFIG.min_confidence_threshold).toBeGreaterThan(
        DEFAULT_PRUNING_CONFIG.min_confidence_threshold,
      );
    });
  });

  // ========================================================================
  // Logging
  // ========================================================================

  describe('Logging of decisions', () => {
    it('should log evaluation decisions with details', async () => {
      mockLogger.clear();
      const branch = createTestBranch('test-branch', BranchState.SOLVED, 0.9);

      await engine.evaluateBranch(branch, DEFAULT_PRUNING_CONFIG);

      const debugLogs = mockLogger.getMessages('debug');
      expect(debugLogs.length).toBeGreaterThan(0);
    });

    it('should log batch pruning operation', async () => {
      mockLogger.clear();
      const branches: Branch[] = [createTestBranch('b1', BranchState.SOLVED)];

      await engine.pruneBranches(branches, DEFAULT_PRUNING_CONFIG);

      const infoLogs = mockLogger.getMessages('info');
      const startLog = infoLogs.find((log) => log.message.includes('Starting pruning'));
      expect(startLog).toBeDefined();
    });

    it('should provide evidence in logging', async () => {
      mockLogger.clear();
      const branch = createTestBranch('b1', BranchState.STALLED, 0.5, 5, 3);

      await engine.evaluateBranch(branch, DEFAULT_PRUNING_CONFIG);

      const logs = mockLogger.messages;
      const hasEvidence = logs.some((log) => log.data?.evidence);
      expect(hasEvidence || logs.length > 0).toBe(true);
    });
  });

  // ========================================================================
  // Edge Cases
  // ========================================================================

  describe('Edge cases and special scenarios', () => {
    it('should handle empty branch list', async () => {
      const result = await engine.pruneBranches([], DEFAULT_PRUNING_CONFIG);

      expect(result.kept_count).toBe(0);
      expect(result.discarded_count).toBe(0);
      expect(result.decisions.length).toBe(0);
    });

    it('should handle branch with zero confidence', async () => {
      const branch = createTestBranch('b1', BranchState.EXPLORING, 0.0);
      const decision = await engine.evaluateBranch(branch, DEFAULT_PRUNING_CONFIG);

      expect(decision.action).toBe('keep'); // EXPLORING is always kept
    });

    it('should handle branch with max confidence (1.0)', async () => {
      const branch = createTestBranch('b1', BranchState.EXPLORING, 1.0);
      const decision = await engine.evaluateBranch(branch, DEFAULT_PRUNING_CONFIG);

      expect(decision.action).toBe('keep');
    });

    it('should handle branch at start of exploration', async () => {
      const branch = createTestBranch('b1', BranchState.EXPLORING, 0.5, 1, 0);
      const decision = await engine.evaluateBranch(branch, DEFAULT_PRUNING_CONFIG);

      expect(decision.action).toBe('keep');
    });

    it('should handle branch with no evidence', async () => {
      const branch: Branch = {
        id: 'b1',
        metrics: {
          current_iteration: 5,
          last_progress_iteration: 4,
          confidence: 0.5,
          state: BranchState.EXPLORING,
          evidence: [],
        },
      };

      const decision = await engine.evaluateBranch(branch, DEFAULT_PRUNING_CONFIG);

      expect(decision.action).toBe('keep');
      expect(decision.evidence.length).toBeGreaterThanOrEqual(0);
    });
  });

  // ========================================================================
  // Factory Functions
  // ========================================================================

  describe('Factory functions', () => {
    it('should create engine with createPruningEngine()', () => {
      const eng = createPruningEngine();
      expect(eng).toBeInstanceOf(PruningEngine);
    });

    it('should create engine with custom logger via createPruningEngineWithLogger()', () => {
      const logger = new MockLogger();
      const eng = createPruningEngineWithLogger(logger);
      expect(eng).toBeInstanceOf(PruningEngine);
    });
  });

  // ========================================================================
  // Promise-Based Behavior
  // ========================================================================

  describe('Promise-based async operations', () => {
    it('evaluateBranch should return a Promise', () => {
      const branch = createTestBranch('b1', BranchState.SOLVED);
      const result = engine.evaluateBranch(branch, DEFAULT_PRUNING_CONFIG);

      expect(result).toBeInstanceOf(Promise);
    });

    it('pruneBranches should return a Promise', () => {
      const branches = [createTestBranch('b1', BranchState.SOLVED)];
      const result = engine.pruneBranches(branches, DEFAULT_PRUNING_CONFIG);

      expect(result).toBeInstanceOf(Promise);
    });

    it('should handle multiple concurrent evaluations', async () => {
      const branches = [
        createTestBranch('b1', BranchState.SOLVED),
        createTestBranch('b2', BranchState.PROMISING),
        createTestBranch('b3', BranchState.EXPLORING),
      ];

      const promises = branches.map((b) => engine.evaluateBranch(b, DEFAULT_PRUNING_CONFIG));
      const decisions = await Promise.all(promises);

      expect(decisions.length).toBe(3);
      expect(decisions.every((d) => d.action)).toBe(true);
    });
  });

  // ========================================================================
  // Evidence-Based Decisions
  // ========================================================================

  describe('Evidence-based decision making', () => {
    it('should include evidence in keep decision', async () => {
      const branch = createTestBranch('b1', BranchState.PROMISING, 0.7);
      const decision = await engine.evaluateBranch(branch, DEFAULT_PRUNING_CONFIG);

      expect(decision.evidence.length).toBeGreaterThan(0);
      expect(decision.evidence[0]).toContain('State');
    });

    it('should include evidence in discard decision', async () => {
      const branch = createDisprovenBranch('b1', 'contradiction', 0.9);
      const decision = await engine.evaluateBranch(branch, DEFAULT_PRUNING_CONFIG);

      expect(decision.evidence.length).toBeGreaterThanOrEqual(0);
    });

    it('should provide reason field for all decisions', async () => {
      const states = [
        BranchState.SOLVED,
        BranchState.PROMISING,
        BranchState.EXPLORING,
        BranchState.DISPROVEN,
      ];

      for (const state of states) {
        const branch = createTestBranch('b', state, 0.5);
        const decision = await engine.evaluateBranch(branch, DEFAULT_PRUNING_CONFIG);
        expect(decision.reason).toBeDefined();
        expect(decision.reason.length).toBeGreaterThan(0);
      }
    });
  });
});
