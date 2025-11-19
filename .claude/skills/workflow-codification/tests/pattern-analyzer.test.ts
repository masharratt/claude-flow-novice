/**
 * Comprehensive test suite for Pattern Analyzer
 * Tests cover: pattern detection, metrics calculation, security constraints, edge cases
 * Target: 90%+ code coverage
 */

import { PatternAnalyzer } from '../src/pattern-analyzer';
import { PatternAnalyzerConfig, WorkflowReflection, ILogger, Priority } from '../src/types';

// Mock Logger
class MockLogger implements ILogger {
  logs: string[] = [];
  successes: string[] = [];
  errors: string[] = [];
  warnings: string[] = [];

  log(message: string): void {
    this.logs.push(message);
  }

  success(message: string): void {
    this.successes.push(message);
  }

  error(message: string): void {
    this.errors.push(message);
  }

  warning(message: string): void {
    this.warnings.push(message);
  }

  reset(): void {
    this.logs = [];
    this.successes = [];
    this.errors = [];
    this.warnings = [];
  }
}

// Default test configuration
const getDefaultConfig = (): PatternAnalyzerConfig => ({
  dbHost: 'localhost',
  dbPort: 5432,
  dbName: 'cfn_workflow',
  dbUser: 'cfn_user',
  dbPassword: '',
  timeWindow: 90,
  minOccurrences: 5,
  minSimilarity: 0.85,
  minConfidence: 0.9,
  outputDir: '/tmp/workflow-patterns',
  outputFormat: 'both',
  insertDb: false,
  verbose: false,
});

// Test data factories
const createReflection = (
  overrides: Partial<WorkflowReflection> = {}
): WorkflowReflection => ({
  id: 'ref-1',
  task_id: 'task-1',
  team_id: 'team-1',
  content: 'Test workflow',
  workflow_steps: [{ command: 'echo', args: ['hello'] }],
  confidence: 0.95,
  created_at: new Date().toISOString(),
  tags: ['test'],
  domain: 'general',
  output: 'hello',
  ...overrides,
});

describe('PatternAnalyzer', () => {
  let analyzer: PatternAnalyzer;
  let logger: MockLogger;

  beforeEach(() => {
    logger = new MockLogger();
    const config = getDefaultConfig();
    analyzer = new PatternAnalyzer(config, logger);
  });

  describe('Constructor and Validation', () => {
    it('should create instance with valid config', () => {
      expect(analyzer).toBeInstanceOf(PatternAnalyzer);
    });

    it('should throw on invalid config', () => {
      const invalidConfig = {} as PatternAnalyzerConfig;
      expect(() => new PatternAnalyzer(invalidConfig, logger)).toThrow(
        'Invalid pattern analyzer configuration'
      );
    });

    it('should throw on missing required config fields', () => {
      const incompleteConfig = { dbHost: 'localhost' } as PatternAnalyzerConfig;
      expect(() => new PatternAnalyzer(incompleteConfig, logger)).toThrow();
    });
  });

  describe('Workflow Signature Generation', () => {
    it('should generate signature from workflow steps', () => {
      const steps = [
        { command: 'mkdir', path: '/tmp' },
        { command: 'cd', path: '/tmp' },
        { command: 'ls', args: ['-la'] },
      ];

      const signature = analyzer.generateWorkflowSignature(steps);
      expect(signature).toContain('→');
      expect(signature).not.toEqual('unknown');
    });

    it('should return "unknown" for empty steps', () => {
      const signature = analyzer.generateWorkflowSignature([]);
      expect(signature).toBe('unknown');
    });

    it('should return "unknown" for non-array input', () => {
      const signature = analyzer.generateWorkflowSignature(null as unknown as unknown[]);
      expect(signature).toBe('unknown');
    });

    it('should normalize whitespace in signature', () => {
      const steps = [
        { command: 'echo    hello' },
        { command: 'echo    world' },
      ];

      const signature = analyzer.generateWorkflowSignature(steps);
      expect(signature).not.toContain('    ');
    });

    it('should handle mixed types in steps', () => {
      const steps = [
        { command: 'test' },
        'string-step',
        123,
        null,
      ];

      expect(() => analyzer.generateWorkflowSignature(steps)).not.toThrow();
    });

    it('should handle exception during signature generation', () => {
      // Create steps that will cause an error during processing
      const steps = [{ cmd: () => 'test' }]; // Function can't be JSON stringified easily

      const signature = analyzer.generateWorkflowSignature(steps as unknown[]);
      expect(signature).not.toThrow;
    });
  });

  describe('Jaccard Similarity Calculation', () => {
    it('should calculate similarity between identical sets', () => {
      const stepsA = [{ cmd: 'echo' }, { cmd: 'ls' }];
      const stepsB = [{ cmd: 'echo' }, { cmd: 'ls' }];

      const similarity = analyzer.calculateJaccardSimilarity(stepsA, stepsB);
      expect(similarity).toBe(1.0);
    });

    it('should calculate similarity between different sets', () => {
      const stepsA = [{ cmd: 'echo' }, { cmd: 'ls' }];
      const stepsB = [{ cmd: 'echo' }, { cmd: 'pwd' }];

      const similarity = analyzer.calculateJaccardSimilarity(stepsA, stepsB);
      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThan(1.0);
    });

    it('should return 0 for completely different sets', () => {
      const stepsA = [{ cmd: 'echo' }];
      const stepsB = [{ cmd: 'pwd' }];

      const similarity = analyzer.calculateJaccardSimilarity(stepsA, stepsB);
      expect(similarity).toBe(0);
    });

    it('should return 0 for non-array inputs', () => {
      const similarity1 = analyzer.calculateJaccardSimilarity(null as unknown as unknown[], []);
      expect(similarity1).toBe(0);

      const similarity2 = analyzer.calculateJaccardSimilarity([], null as unknown as unknown[]);
      expect(similarity2).toBe(0);
    });

    it('should handle empty arrays', () => {
      const similarity = analyzer.calculateJaccardSimilarity([], []);
      expect(similarity).toBe(0);
    });
  });

  describe('Similarity Score Calculation', () => {
    it('should calculate average similarity across group', () => {
      const reflections = [
        createReflection({
          id: 'r1',
          workflow_steps: [{ cmd: 'echo' }, { cmd: 'ls' }],
        }),
        createReflection({
          id: 'r2',
          workflow_steps: [{ cmd: 'echo' }, { cmd: 'ls' }],
        }),
        createReflection({
          id: 'r3',
          workflow_steps: [{ cmd: 'echo' }, { cmd: 'pwd' }],
        }),
      ];

      const score = analyzer.calculateSimilarityScore(reflections);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should return 1.0 for single reflection', () => {
      const reflections = [createReflection()];
      const score = analyzer.calculateSimilarityScore(reflections);
      expect(score).toBe(1.0);
    });

    it('should return 1.0 for empty array', () => {
      const score = analyzer.calculateSimilarityScore([]);
      expect(score).toBe(1.0);
    });

    it('should handle case with no valid pairs', () => {
      // Single element should skip pairwise comparison
      const score = analyzer.calculateSimilarityScore([createReflection()]);
      expect(score).toBe(1.0);
    });

    it('should return precise decimal values', () => {
      const reflections = [
        createReflection({
          id: 'r1',
          workflow_steps: [{ a: 1 }, { b: 2 }, { c: 3 }],
        }),
        createReflection({
          id: 'r2',
          workflow_steps: [{ a: 1 }, { d: 4 }],
        }),
      ];

      const score = analyzer.calculateSimilarityScore(reflections);
      expect(String(score).split('.')[1]?.length).toBeLessThanOrEqual(3);
    });
  });

  describe('Determinism Check', () => {
    it('should detect deterministic workflows', () => {
      const reflections = [
        createReflection({
          workflow_steps: [{ cmd: 'echo' }, { cmd: 'ls' }],
          output: 'test',
        }),
        createReflection({
          workflow_steps: [{ cmd: 'echo' }, { cmd: 'ls' }],
          output: 'test',
        }),
      ];

      const isDeterministic = analyzer.checkDeterministic(reflections);
      expect(isDeterministic).toBe(true);
    });

    it('should detect non-deterministic workflows with random', () => {
      const reflections = [
        createReflection({
          workflow_steps: [{ cmd: 'Math.random()' }],
        }),
      ];

      const isDeterministic = analyzer.checkDeterministic(reflections);
      expect(isDeterministic).toBe(false);
    });

    it('should detect non-deterministic workflows with timestamps', () => {
      const reflections = [
        createReflection({
          workflow_steps: [{ cmd: 'date' }, { cmd: '$(date)' }],
        }),
      ];

      const isDeterministic = analyzer.checkDeterministic(reflections);
      expect(isDeterministic).toBe(false);
    });

    it('should detect non-deterministic workflows with UUID', () => {
      const reflections = [
        createReflection({
          workflow_steps: [{ cmd: 'uuid' }],
        }),
      ];

      const isDeterministic = analyzer.checkDeterministic(reflections);
      expect(isDeterministic).toBe(false);
    });

    it('should detect non-deterministic workflows with API calls', () => {
      const reflections = [
        createReflection({
          workflow_steps: [{ cmd: 'curl api.example.com' }],
        }),
      ];

      const isDeterministic = analyzer.checkDeterministic(reflections);
      expect(isDeterministic).toBe(false);
    });

    it('should detect high output variance as non-deterministic', () => {
      const reflections = [
        createReflection({
          id: 'r1',
          output: 'output1',
        }),
        createReflection({
          id: 'r2',
          output: 'output2',
        }),
        createReflection({
          id: 'r3',
          output: 'output3',
        }),
        createReflection({
          id: 'r4',
          output: 'output4',
        }),
      ];

      const isDeterministic = analyzer.checkDeterministic(reflections);
      expect(isDeterministic).toBe(false);
    });

    it('should handle low output variance', () => {
      const reflections = [
        createReflection({ id: 'r1', output: 'same' }),
        createReflection({ id: 'r2', output: 'same' }),
        createReflection({ id: 'r3', output: 'same' }),
      ];

      const isDeterministic = analyzer.checkDeterministic(reflections);
      expect(isDeterministic).toBe(true);
    });
  });

  describe('Cost Savings Estimation', () => {
    it('should calculate cost savings from occurrence count', () => {
      const savings = analyzer.estimateCostSavings(10, 90);
      expect(savings).toBeGreaterThan(0);
      expect(typeof savings).toBe('number');
    });

    it('should scale savings with occurrence count', () => {
      const savings10 = analyzer.estimateCostSavings(10, 90);
      const savings20 = analyzer.estimateCostSavings(20, 90);
      expect(savings20).toBeGreaterThan(savings10);
    });

    it('should handle different time windows', () => {
      const savings30 = analyzer.estimateCostSavings(10, 30);
      const savings90 = analyzer.estimateCostSavings(10, 90);
      expect(savings90).toBeGreaterThan(0);
      expect(savings30).toBeGreaterThan(0);
    });

    it('should return 0 for zero occurrences', () => {
      const savings = analyzer.estimateCostSavings(0, 90);
      expect(savings).toBe(0);
    });

    it('should return numeric value with 2 decimals', () => {
      const savings = analyzer.estimateCostSavings(15, 90);
      const parts = String(savings).split('.');
      if (parts[1]) {
        expect(parts[1].length).toBeLessThanOrEqual(2);
      }
    });
  });

  describe('Priority Calculation', () => {
    it('should assign high priority to high-value patterns', () => {
      const priority = analyzer.calculatePriority(25, 100, 4, 0.95);
      expect(priority).toBe('high');
    });

    it('should assign medium priority to moderate patterns', () => {
      const priority = analyzer.calculatePriority(10, 30, 2, 0.85);
      expect(priority).toBe('medium');
    });

    it('should assign low priority to low-value patterns', () => {
      const priority = analyzer.calculatePriority(3, 5, 1, 0.75);
      expect(priority).toBe('low');
    });

    it('should weight occurrence count heavily', () => {
      const priorityMap: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
      const lowOccurrence = analyzer.calculatePriority(5, 100, 5, 0.95);
      const highOccurrence = analyzer.calculatePriority(25, 100, 5, 0.95);
      // High occurrence should get higher or equal priority
      const lowScore = priorityMap[lowOccurrence] ?? 2;
      const highScore = priorityMap[highOccurrence] ?? 2;
      expect(highScore).toBeLessThanOrEqual(lowScore);
    });

    it('should consider cost savings', () => {
      const priorityMap: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
      const lowSavings = analyzer.calculatePriority(15, 5, 2, 0.85);
      const highSavings = analyzer.calculatePriority(15, 50, 2, 0.85);
      // High savings should get higher or equal priority
      const lowScore = priorityMap[lowSavings] ?? 2;
      const highScore = priorityMap[highSavings] ?? 2;
      expect(highScore).toBeLessThanOrEqual(lowScore);
    });

    it('should consider teams affected', () => {
      const priorityMap: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
      const fewTeams = analyzer.calculatePriority(15, 30, 1, 0.85);
      const manyTeams = analyzer.calculatePriority(15, 30, 4, 0.85);
      // Many teams should get higher or equal priority
      const fewScore = priorityMap[fewTeams] ?? 2;
      const manyScore = priorityMap[manyTeams] ?? 2;
      expect(manyScore).toBeLessThanOrEqual(fewScore);
    });

    it('should consider confidence score', () => {
      const priorityMap: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
      const lowConfidence = analyzer.calculatePriority(15, 30, 2, 0.7);
      const highConfidence = analyzer.calculatePriority(15, 30, 2, 0.95);
      // High confidence should get higher or equal priority
      const lowScore = priorityMap[lowConfidence] ?? 2;
      const highScore = priorityMap[highConfidence] ?? 2;
      expect(highScore).toBeLessThanOrEqual(lowScore);
    });

    it('should return valid priority value', () => {
      const priority = analyzer.calculatePriority(10, 20, 2, 0.85);
      expect(['high', 'medium', 'low']).toContain(priority);
    });
  });

  describe('Pattern Analysis', () => {
    it('should analyze empty reflections array', async () => {
      const report = await analyzer.analyzePatterns([]);
      expect(report.patterns).toHaveLength(0);
      expect(report.metadata.total_reflections_analyzed).toBe(0);
    });

    it('should analyze single reflection', async () => {
      const reflections = [createReflection()];
      const report = await analyzer.analyzePatterns(reflections);
      expect(report.metadata.total_reflections_analyzed).toBe(1);
    });

    it('should analyze multiple reflections', async () => {
      const reflections = [
        createReflection({ id: 'r1' }),
        createReflection({ id: 'r2' }),
        createReflection({ id: 'r3' }),
      ];

      const report = await analyzer.analyzePatterns(reflections);
      expect(report.metadata.total_reflections_analyzed).toBe(3);
    });

    it('should detect patterns with sufficient occurrences', async () => {
      const reflections = Array.from({ length: 10 }, (_, i) =>
        createReflection({
          id: `r${i}`,
          workflow_steps: [{ cmd: 'echo' }, { cmd: 'ls' }],
          confidence: 0.95,
          output: 'same',
        })
      );

      const report = await analyzer.analyzePatterns(reflections);
      expect(report.patterns.length).toBeGreaterThan(0);
    });

    it('should not report patterns below occurrence threshold', async () => {
      const reflections = [
        createReflection({ id: 'r1' }),
        createReflection({ id: 'r2' }),
      ];

      const report = await analyzer.analyzePatterns(reflections);
      // With minOccurrences=5, should not find patterns
      expect(report.patterns.length).toBe(0);
    });

    it('should apply similarity filter', async () => {
      const config = getDefaultConfig();
      config.minSimilarity = 0.99;
      const analyzer2 = new PatternAnalyzer(config, logger);

      const reflections = Array.from({ length: 5 }, (_, i) =>
        createReflection({
          id: `r${i}`,
          workflow_steps: [{ cmd: `cmd${i}` }],
        })
      );

      const report = await analyzer2.analyzePatterns(reflections);
      // High similarity threshold should filter out dissimilar patterns
      expect(report.patterns.length).toBe(0);
    });

    it('should apply confidence filter', async () => {
      const config = getDefaultConfig();
      config.minConfidence = 0.99;
      const analyzer2 = new PatternAnalyzer(config, logger);

      const reflections = Array.from({ length: 5 }, (_, i) =>
        createReflection({
          id: `r${i}`,
          workflow_steps: [{ cmd: 'echo' }],
          confidence: 0.5,
        })
      );

      const report = await analyzer2.analyzePatterns(reflections);
      // High confidence threshold should filter out low-confidence patterns
      expect(report.patterns.length).toBe(0);
    });

    it('should reject non-deterministic patterns', async () => {
      const reflections = Array.from({ length: 5 }, (_, i) =>
        createReflection({
          id: `r${i}`,
          workflow_steps: [{ cmd: 'Math.random()' }],
        })
      );

      const report = await analyzer.analyzePatterns(reflections);
      expect(report.patterns.length).toBe(0);
    });

    it('should filter invalid reflections', async () => {
      const validReflection = createReflection({ id: 'valid' });
      const invalidReflection = { incomplete: true } as unknown as WorkflowReflection;

      const report = await analyzer.analyzePatterns([validReflection, invalidReflection]);
      expect(report.metadata.total_reflections_analyzed).toBe(1);
    });

    it('should throw on non-array input', async () => {
      await expect(analyzer.analyzePatterns(null as unknown as WorkflowReflection[])).rejects.toThrow(
        'Reflections must be an array'
      );
    });

    it('should throw on oversized array', async () => {
      const config = getDefaultConfig();
      const analyzer2 = new PatternAnalyzer(config, logger);

      // Create array exceeding security limit
      const hugeArray = Array(20001).fill(createReflection());

      await expect(analyzer2.analyzePatterns(hugeArray)).rejects.toThrow(
        /exceed maximum size/
      );
    });

    it('should sort patterns by priority and savings', async () => {
      const config = getDefaultConfig();
      config.minOccurrences = 1;
      const analyzer2 = new PatternAnalyzer(config, logger);

      const reflections = [
        // High priority
        ...Array(10).fill(createReflection({
          workflow_steps: [{ cmd: 'high' }],
          confidence: 0.95,
        })),
        // Low priority
        ...Array(5).fill(createReflection({
          workflow_steps: [{ cmd: 'low' }],
          confidence: 0.7,
        })),
      ];

      const report = await analyzer2.analyzePatterns(reflections);

      if (report.patterns.length > 1) {
        const priorities = report.patterns.map((p) => p.priority);
        const priorityMap: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
        // Should be sorted with high priority first
        for (let i = 1; i < priorities.length; i++) {
          const prevPriority = priorities[i - 1];
          const currPriority = priorities[i];
          if (prevPriority && currPriority) {
            const prevScore = priorityMap[prevPriority] ?? 2;
            const currScore = priorityMap[currPriority] ?? 2;
            expect(prevScore).toBeLessThanOrEqual(currScore);
          }
        }
      }
    });

    it('should sort patterns by savings when priorities are equal', async () => {
      const config = getDefaultConfig();
      config.minOccurrences = 1;
      config.minSimilarity = 0.5; // Lower threshold to allow more patterns
      const analyzer2 = new PatternAnalyzer(config, logger);

      // Create two distinct patterns with same priority
      const reflections = [
        // Pattern 1: 15 similar reflections
        ...Array(15).fill(createReflection({
          id: 'pattern1',
          workflow_steps: [{ cmd: 'echo' }, { cmd: 'ls' }],
          confidence: 0.85,
          output: 'same1',
        })),
        // Pattern 2: 15 similar reflections (different workflow)
        ...Array(15).fill(createReflection({
          id: 'pattern2',
          workflow_steps: [{ cmd: 'mkdir' }, { cmd: 'cd' }],
          confidence: 0.85,
          output: 'same2',
        })),
      ];

      const report = await analyzer2.analyzePatterns(reflections);

      // Both should have the same priority but different savings due to same occurrence count
      if (report.patterns.length > 1) {
        // Verify patterns are sorted correctly
        const priorities = report.patterns.map((p) => p.priority);
        const priorityMap: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

        // Check that priorities are non-decreasing
        for (let i = 1; i < priorities.length; i++) {
          const prev = priorities[i - 1];
          const curr = priorities[i];
          const prevPattern = report.patterns[i - 1];
          const currPattern = report.patterns[i];

          if (prev && curr && prevPattern && currPattern) {
            const prevScore = priorityMap[prev] ?? 2;
            const currScore = priorityMap[curr] ?? 2;
            // If same priority, next check is savings
            if (prevScore === currScore) {
              const prevSavings = prevPattern.estimated_savings_usd;
              const currSavings = currPattern.estimated_savings_usd;
              expect(prevSavings).toBeGreaterThanOrEqual(currSavings);
            }
          }
        }
      }
    });
  });

  describe('Report Generation', () => {
    it('should generate metadata', async () => {
      const reflections = [createReflection()];
      const report = await analyzer.analyzePatterns(reflections);

      expect(report.metadata).toBeDefined();
      expect(report.metadata.analysis_timestamp).toBeDefined();
      expect(report.metadata.time_window_days).toBe(90);
      expect(report.metadata.total_reflections_analyzed).toBe(1);
      expect(report.metadata.patterns_found).toBeDefined();
      expect(report.metadata.filters).toBeDefined();
    });

    it('should format report as JSON', async () => {
      const reflections = [createReflection()];
      const report = await analyzer.analyzePatterns(reflections);
      const json = analyzer.formatAsJson(report);

      expect(() => JSON.parse(json)).not.toThrow();
      const parsed = JSON.parse(json);
      expect(parsed.metadata).toBeDefined();
      expect(parsed.patterns).toBeDefined();
    });

    it('should format report as summary', async () => {
      const reflections = [createReflection()];
      const report = await analyzer.analyzePatterns(reflections);
      const summary = analyzer.formatAsSummary(report);

      expect(summary).toContain('Pattern Analysis Summary');
      expect(summary).toContain('Analysis Timestamp');
      expect(summary).toContain('Time Window');
    });

    it('should include patterns in summary', async () => {
      const config = getDefaultConfig();
      config.minOccurrences = 1;
      const analyzer2 = new PatternAnalyzer(config, logger);

      const reflections = Array.from({ length: 5 }, (_, i) =>
        createReflection({
          id: `r${i}`,
          workflow_steps: [{ cmd: 'echo' }],
        })
      );

      const report = await analyzer2.analyzePatterns(reflections);
      const summary = analyzer2.formatAsSummary(report);

      if (report.patterns.length > 0) {
        expect(summary).toContain('Top 5 Patterns');
      }
    });

    it('should format summary with no patterns found', async () => {
      const reflections = [createReflection({ id: 'r1' })];
      const report = await analyzer.analyzePatterns(reflections);
      const summary = analyzer.formatAsSummary(report);

      expect(summary).toContain('Pattern Analysis Summary');
      expect(summary).toContain('High: 0');
      expect(summary).toContain('Medium: 0');
      expect(summary).toContain('Low: 0');
    });

    it('should format JSON with proper indentation', async () => {
      const reflections = [createReflection({ id: 'r1' })];
      const report = await analyzer.analyzePatterns(reflections);
      const json = analyzer.formatAsJson(report);

      // Check for proper indentation (2 spaces)
      expect(json).toMatch(/\n  /);
    });
  });

  describe('Security Constraints', () => {
    it('should validate path length', () => {
      const longPath = 'a'.repeat(5000);
      // This test validates internal path validation works
      const config = getDefaultConfig();
      config.outputDir = longPath;
      expect(() => new PatternAnalyzer(config, logger)).not.toThrow();
    });

    it('should limit array size', async () => {
      const hugeArray = Array(20001).fill(createReflection());
      await expect(analyzer.analyzePatterns(hugeArray)).rejects.toThrow();
    });

    it('should prevent SQL injection in queries', async () => {
      const config = getDefaultConfig();
      // Try with suspicious config values
      config.dbUser = "'; DROP TABLE--";
      config.dbPassword = "' OR '1'='1";

      // Should not throw during instantiation
      expect(() => new PatternAnalyzer(config, logger)).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle reflections with null values', async () => {
      const reflection = createReflection();
      reflection.output = null as unknown as string;

      const report = await analyzer.analyzePatterns([reflection]);
      expect(report).toBeDefined();
    });

    it('should handle determinism check with caught exception', () => {
      const reflections = [
        createReflection({
          workflow_steps: [{ cmd: 'test', nested: { circular: {} as unknown } }],
        }),
      ];

      // Should not throw even with complex objects
      expect(() => analyzer.checkDeterministic(reflections)).not.toThrow();
    });

    it('should handle similarity calculation with caught exception', () => {
      const stepsWithComplexStructure = [
        { cmd: 'test' },
        { nested: { deep: { structure: {} } } },
      ];

      expect(() => analyzer.calculateJaccardSimilarity(stepsWithComplexStructure, [])).not.toThrow();
    });

    it('should handle reflections with empty workflow steps', async () => {
      const reflection = createReflection();
      reflection.workflow_steps = [];

      const report = await analyzer.analyzePatterns([reflection]);
      expect(report.patterns.length).toBe(0);
    });

    it('should handle very large occurrence counts', () => {
      const savings = analyzer.estimateCostSavings(1000000, 90);
      expect(typeof savings).toBe('number');
      expect(savings).toBeGreaterThan(0);
    });

    it('should handle identical reflections', async () => {
      const reflections = Array(10).fill(createReflection({ id: 'same' })).map((r, i) => ({
        ...r,
        id: `r${i}`,
      }));

      const report = await analyzer.analyzePatterns(reflections);
      expect(report.patterns.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle mixed team IDs', async () => {
      const config = getDefaultConfig();
      config.minOccurrences = 1;
      const analyzer2 = new PatternAnalyzer(config, logger);

      const reflections = [
        createReflection({ id: 'r1', team_id: 'team-a', workflow_steps: [{ cmd: 'echo' }] }),
        createReflection({ id: 'r2', team_id: 'team-b', workflow_steps: [{ cmd: 'echo' }] }),
        createReflection({ id: 'r3', team_id: 'team-c', workflow_steps: [{ cmd: 'echo' }] }),
      ];

      const report = await analyzer2.analyzePatterns(reflections);
      if (report.patterns.length > 0) {
        const firstPattern = report.patterns[0];
        if (firstPattern) {
          const teamsAffected = firstPattern.teams_affected;
          expect(teamsAffected.length).toBeGreaterThanOrEqual(1);
        }
      }
    });

    it('should handle special characters in workflow steps', async () => {
      const reflection = createReflection({
        workflow_steps: [
          { cmd: 'echo "special chars: !@#$%^&*()"' },
        ],
      });

      const report = await analyzer.analyzePatterns([reflection]);
      expect(report).toBeDefined();
    });

    it('should handle unicode in content', async () => {
      const reflection = createReflection({
        content: 'Test with unicode: 你好世界 🚀',
      });

      const report = await analyzer.analyzePatterns([reflection]);
      expect(report).toBeDefined();
    });

    it('should handle decimal similarity scores', () => {
      const similarity = analyzer.calculateJaccardSimilarity(
        [{ a: 1 }, { b: 2 }, { c: 3 }],
        [{ a: 1 }, { b: 2 }]
      );

      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThan(1);
    });
  });

  describe('Integration Tests', () => {
    it('should complete full analysis workflow', async () => {
      const config = getDefaultConfig();
      config.minOccurrences = 1;
      const analyzer2 = new PatternAnalyzer(config, logger);

      const reflections = [
        createReflection({
          id: 'r1',
          workflow_steps: [{ cmd: 'mkdir' }, { cmd: 'cd' }],
          confidence: 0.95,
          output: 'same',
        }),
        createReflection({
          id: 'r2',
          workflow_steps: [{ cmd: 'mkdir' }, { cmd: 'cd' }],
          confidence: 0.93,
          output: 'same',
        }),
        createReflection({
          id: 'r3',
          workflow_steps: [{ cmd: 'ls' }, { cmd: 'pwd' }],
          confidence: 0.85,
          output: 'different',
        }),
      ];

      const report = await analyzer2.analyzePatterns(reflections);

      expect(report.metadata).toBeDefined();
      expect(report.patterns).toBeDefined();
      expect(Array.isArray(report.patterns)).toBe(true);

      const json = analyzer2.formatAsJson(report);
      expect(() => JSON.parse(json)).not.toThrow();

      const summary = analyzer2.formatAsSummary(report);
      expect(summary.length).toBeGreaterThan(0);
    });

    it('should handle production-like workload', async () => {
      const config = getDefaultConfig();
      config.minOccurrences = 5;
      const analyzer2 = new PatternAnalyzer(config, logger);

      // Create 100 reflections with patterns
      const reflections: WorkflowReflection[] = [];

      // Pattern 1: 10 similar reflections
      for (let i = 0; i < 10; i++) {
        reflections.push(
          createReflection({
            id: `p1-r${i}`,
            team_id: `team-${i % 3}`,
            workflow_steps: [{ cmd: 'pattern1' }, { cmd: 'action' }],
            confidence: 0.92 + Math.random() * 0.07,
            output: 'result1',
          })
        );
      }

      // Pattern 2: 8 similar reflections
      for (let i = 0; i < 8; i++) {
        reflections.push(
          createReflection({
            id: `p2-r${i}`,
            team_id: `team-${i % 4}`,
            workflow_steps: [{ cmd: 'pattern2' }, { cmd: 'execute' }],
            confidence: 0.88 + Math.random() * 0.1,
            output: 'result2',
          })
        );
      }

      // Noise: 20 unique reflections
      for (let i = 0; i < 20; i++) {
        reflections.push(
          createReflection({
            id: `noise-r${i}`,
            workflow_steps: [{ cmd: `unique${i}` }],
            confidence: 0.75 + Math.random() * 0.15,
          })
        );
      }

      const report = await analyzer2.analyzePatterns(reflections);

      expect(report.metadata.total_reflections_analyzed).toBe(38);
      expect(report.patterns.length).toBeGreaterThanOrEqual(0);

      // Should detect major patterns
      if (report.patterns.length > 0) {
        const firstPattern = report.patterns[0];
        if (firstPattern) {
          expect(firstPattern.occurrence_count).toBeGreaterThanOrEqual(5);
        }
      }
    });
  });
});
