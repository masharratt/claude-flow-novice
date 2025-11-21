/**
 * Pattern Detection Test Suite
 * Tests workflow pattern detection and analysis
 *
 * Migration from: docker/tests/test-pattern-detection.sh
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

interface WorkflowStep {
  action: string;
  input?: any;
  output?: any;
  duration?: number;
}

interface WorkflowPattern {
  id: string;
  name: string;
  steps: WorkflowStep[];
  frequency: number;
  lastSeen: Date;
  confidence: number;
}

class PatternDetector {
  private patterns: Map<string, WorkflowPattern> = new Map();
  private workflows: Array<WorkflowStep[]> = [];

  /**
   * Record a workflow execution
   */
  recordWorkflow(steps: WorkflowStep[]): void {
    this.workflows.push(steps);
    this.detectPatterns();
  }

  /**
   * Detect patterns in workflows
   */
  private detectPatterns(): void {
    if (this.workflows.length < 2) return;

    // Simple pattern detection: find common sequences
    const stepSequences = new Map<string, { count: number; indices: number[] }>();

    this.workflows.forEach((workflow, idx) => {
      const sequence = workflow.map(s => s.action).join('->');
      const current = stepSequences.get(sequence) || { count: 0, indices: [] };
      current.count++;
      current.indices.push(idx);
      stepSequences.set(sequence, current);
    });

    // Create patterns for sequences appearing 2+ times
    stepSequences.forEach((data, sequence) => {
      if (data.count >= 2) {
        const patternId = `pattern-${Date.now()}-${Math.random()}`;
        const steps = sequence.split('->').map(action => ({ action }));
        const confidence = Math.min(data.count / this.workflows.length, 1);

        this.patterns.set(patternId, {
          id: patternId,
          name: `Detected Pattern: ${sequence}`,
          steps: steps as WorkflowStep[],
          frequency: data.count,
          lastSeen: new Date(),
          confidence
        });
      }
    });
  }

  /**
   * Get all detected patterns
   */
  getPatterns(): WorkflowPattern[] {
    return Array.from(this.patterns.values());
  }

  /**
   * Get pattern by ID
   */
  getPattern(id: string): WorkflowPattern | undefined {
    return this.patterns.get(id);
  }

  /**
   * Get high-confidence patterns
   */
  getHighConfidencePatterns(threshold: number = 0.7): WorkflowPattern[] {
    return Array.from(this.patterns.values()).filter(p => p.confidence >= threshold);
  }

  /**
   * Match workflow against patterns
   */
  matchWorkflow(workflow: WorkflowStep[]): { matched: boolean; patterns: string[] } {
    const sequence = workflow.map(s => s.action).join('->');
    const matched = Array.from(this.patterns.values())
      .filter(p => {
        const patternSeq = p.steps.map(s => s.action).join('->');
        return sequence.includes(patternSeq) || patternSeq.includes(sequence);
      })
      .map(p => p.id);

    return {
      matched: matched.length > 0,
      patterns: matched
    };
  }

  /**
   * Get pattern statistics
   */
  getStatistics(): {
    totalPatterns: number;
    totalWorkflows: number;
    avgFrequency: number;
    avgConfidence: number;
  } {
    const patterns = Array.from(this.patterns.values());

    const avgFrequency = patterns.length > 0
      ? patterns.reduce((sum, p) => sum + p.frequency, 0) / patterns.length
      : 0;

    const avgConfidence = patterns.length > 0
      ? patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length
      : 0;

    return {
      totalPatterns: patterns.length,
      totalWorkflows: this.workflows.length,
      avgFrequency,
      avgConfidence
    };
  }

  /**
   * Find similar patterns
   */
  findSimilarPatterns(patternId: string, threshold: number = 0.6): string[] {
    const target = this.patterns.get(patternId);
    if (!target) return [];

    const targetSeq = target.steps.map(s => s.action).join('->');

    return Array.from(this.patterns.values())
      .filter(p => {
        if (p.id === patternId) return false;

        const pSeq = p.steps.map(s => s.action).join('->');
        const similarity = this.calculateSimilarity(targetSeq, pSeq);
        return similarity >= threshold;
      })
      .map(p => p.id);
  }

  /**
   * Calculate string similarity (simple edit distance ratio)
   */
  private calculateSimilarity(a: string, b: string): number {
    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;

    if (longer.length === 0) return 1;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        const cost = a[j - 1] === b[i - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i][j - 1] + 1,      // insertion
          matrix[i - 1][j] + 1,      // deletion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Clear all patterns and workflows
   */
  clear(): void {
    this.patterns.clear();
    this.workflows = [];
  }
}

describe('Pattern Detection', () => {
  let detector: PatternDetector;

  beforeEach(() => {
    detector = new PatternDetector();
  });

  describe('Pattern Recording', () => {
    it('should record a workflow', () => {
      const workflow: WorkflowStep[] = [
        { action: 'fetch' },
        { action: 'parse' },
        { action: 'validate' }
      ];

      detector.recordWorkflow(workflow);
      const stats = detector.getStatistics();
      expect(stats.totalWorkflows).toBe(1);
    });

    it('should detect repeated patterns', () => {
      const workflow: WorkflowStep[] = [
        { action: 'fetch' },
        { action: 'parse' }
      ];

      detector.recordWorkflow(workflow);
      detector.recordWorkflow(workflow);

      const patterns = detector.getPatterns();
      expect(patterns.length).toBeGreaterThan(0);
    });

    it('should not detect patterns from single workflow', () => {
      const workflow: WorkflowStep[] = [
        { action: 'fetch' },
        { action: 'parse' }
      ];

      detector.recordWorkflow(workflow);
      const patterns = detector.getPatterns();
      expect(patterns).toHaveLength(0);
    });
  });

  describe('Pattern Retrieval', () => {
    beforeEach(() => {
      const workflow: WorkflowStep[] = [
        { action: 'fetch' },
        { action: 'parse' }
      ];
      detector.recordWorkflow(workflow);
      detector.recordWorkflow(workflow);
    });

    it('should get all patterns', () => {
      const patterns = detector.getPatterns();
      expect(patterns).toHaveLength(1);
      expect(patterns[0]).toHaveProperty('id');
      expect(patterns[0]).toHaveProperty('name');
      expect(patterns[0]).toHaveProperty('frequency');
    });

    it('should get pattern by ID', () => {
      const patterns = detector.getPatterns();
      const firstId = patterns[0].id;

      const pattern = detector.getPattern(firstId);
      expect(pattern).toBeDefined();
      expect(pattern?.id).toBe(firstId);
    });

    it('should return undefined for non-existent pattern', () => {
      const pattern = detector.getPattern('non-existent');
      expect(pattern).toBeUndefined();
    });
  });

  describe('Confidence Filtering', () => {
    it('should get high-confidence patterns', () => {
      const workflow1: WorkflowStep[] = [
        { action: 'fetch' },
        { action: 'parse' }
      ];
      const workflow2: WorkflowStep[] = [
        { action: 'fetch' },
        { action: 'validate' }
      ];

      detector.recordWorkflow(workflow1);
      detector.recordWorkflow(workflow1);
      detector.recordWorkflow(workflow1);
      detector.recordWorkflow(workflow2);

      const high = detector.getHighConfidencePatterns(0.6);
      expect(high.length).toBeGreaterThan(0);
      high.forEach(p => {
        expect(p.confidence).toBeGreaterThanOrEqual(0.6);
      });
    });
  });

  describe('Workflow Matching', () => {
    beforeEach(() => {
      const workflow: WorkflowStep[] = [
        { action: 'fetch' },
        { action: 'parse' }
      ];
      detector.recordWorkflow(workflow);
      detector.recordWorkflow(workflow);
    });

    it('should match workflow against patterns', () => {
      const workflow: WorkflowStep[] = [
        { action: 'fetch' },
        { action: 'parse' }
      ];

      const result = detector.matchWorkflow(workflow);
      expect(result.matched).toBe(true);
      expect(result.patterns.length).toBeGreaterThan(0);
    });

    it('should return unmatched result for new workflow', () => {
      const workflow: WorkflowStep[] = [
        { action: 'unknown' }
      ];

      const result = detector.matchWorkflow(workflow);
      expect(result.matched).toBe(false);
    });
  });

  describe('Statistics', () => {
    beforeEach(() => {
      const workflow: WorkflowStep[] = [
        { action: 'fetch' },
        { action: 'parse' }
      ];
      detector.recordWorkflow(workflow);
      detector.recordWorkflow(workflow);
      detector.recordWorkflow(workflow);
    });

    it('should calculate statistics', () => {
      const stats = detector.getStatistics();

      expect(stats.totalWorkflows).toBe(3);
      expect(stats.totalPatterns).toBeGreaterThan(0);
      expect(stats.avgFrequency).toBeGreaterThan(0);
      expect(stats.avgConfidence).toBeGreaterThan(0);
    });

    it('should have correct confidence range', () => {
      const stats = detector.getStatistics();
      expect(stats.avgConfidence).toBeGreaterThanOrEqual(0);
      expect(stats.avgConfidence).toBeLessThanOrEqual(1);
    });
  });

  describe('Similar Patterns', () => {
    it('should find similar patterns', () => {
      const w1: WorkflowStep[] = [{ action: 'fetch' }, { action: 'parse' }];
      const w2: WorkflowStep[] = [{ action: 'fetch' }, { action: 'parse' }];
      const w3: WorkflowStep[] = [{ action: 'fetch' }, { action: 'validate' }];

      detector.recordWorkflow(w1);
      detector.recordWorkflow(w1);
      detector.recordWorkflow(w2);
      detector.recordWorkflow(w2);
      detector.recordWorkflow(w3);
      detector.recordWorkflow(w3);

      const patterns = detector.getPatterns();
      if (patterns.length > 0) {
        const similar = detector.findSimilarPatterns(patterns[0].id);
        expect(Array.isArray(similar)).toBe(true);
      }
    });
  });

  describe('State Management', () => {
    it('should clear patterns and workflows', () => {
      const workflow: WorkflowStep[] = [
        { action: 'fetch' },
        { action: 'parse' }
      ];

      detector.recordWorkflow(workflow);
      detector.recordWorkflow(workflow);

      detector.clear();
      const stats = detector.getStatistics();

      expect(stats.totalWorkflows).toBe(0);
      expect(stats.totalPatterns).toBe(0);
    });
  });
});
