/**
 * Confidence Score Aggregation Tests
 *
 * Comprehensive test suite for confidence score aggregation,
 * statistical analysis, outlier detection, and validation.
 *
 * Phase 4 · P1 Priority · Test Coverage
 */

import {
  ConfidenceScore,
  validateScoreRange,
  detectOutliers,
  aggregateScores,
  calculateWeightedAverage,
  groupByAgentType,
  analyzeByAgentType,
  identifyLowPerformers,
  generateSummary
} from '../src/helpers/confidence-aggregator';

describe('confidence-aggregator', () => {
  // ===== Test Data =====
  const createScore = (
    agentId: string,
    score: number,
    agentType: string = 'implementer'
  ): ConfidenceScore => ({
    agentId,
    agentType,
    score,
    timestamp: Date.now()
  });

  const standardScores: ConfidenceScore[] = [
    createScore('agent-1', 0.92, 'backend-dev'),
    createScore('agent-2', 0.88, 'backend-dev'),
    createScore('agent-3', 0.95, 'frontend-dev'),
    createScore('agent-4', 0.90, 'frontend-dev'),
    createScore('agent-5', 0.87, 'devops-engineer')
  ];

  // ===== validateScoreRange Tests =====
  describe('validateScoreRange', () => {
    it('should accept valid score at minimum (0.0)', () => {
      expect(validateScoreRange(0.0)).toBe(true);
    });

    it('should accept valid score at maximum (1.0)', () => {
      expect(validateScoreRange(1.0)).toBe(true);
    });

    it('should accept valid score in middle (0.5)', () => {
      expect(validateScoreRange(0.5)).toBe(true);
    });

    it('should accept various valid scores', () => {
      expect(validateScoreRange(0.33)).toBe(true);
      expect(validateScoreRange(0.67)).toBe(true);
      expect(validateScoreRange(0.99)).toBe(true);
      expect(validateScoreRange(0.01)).toBe(true);
    });

    it('should reject negative scores', () => {
      expect(validateScoreRange(-0.1)).toBe(false);
      expect(validateScoreRange(-1.0)).toBe(false);
    });

    it('should reject scores above 1.0', () => {
      expect(validateScoreRange(1.1)).toBe(false);
      expect(validateScoreRange(2.0)).toBe(false);
    });

    it('should reject non-numeric values', () => {
      expect(validateScoreRange(NaN)).toBe(false);
    });
  });

  // ===== detectOutliers Tests =====
  describe('detectOutliers', () => {
    it('should detect no outliers in uniform scores', () => {
      const scores = [
        createScore('a1', 0.90),
        createScore('a2', 0.92),
        createScore('a3', 0.91)
      ];
      const result = detectOutliers(scores);
      expect(result.outlierCount).toBe(0);
      expect(result.outliers).toHaveLength(0);
    });

    it('should detect extreme low outlier', () => {
      const scores = [
        createScore('a1', 0.90),
        createScore('a2', 0.92),
        createScore('a3', 0.91),
        createScore('a4', 0.88),
        createScore('a5', 0.10)
      ];
      const result = detectOutliers(scores);
      expect(result.outlierCount).toBeGreaterThan(0);
      expect(result.outliers.some(o => o.score === 0.10)).toBe(true);
    });

    it('should detect extreme high outlier', () => {
      const scores = [
        createScore('a1', 0.90),
        createScore('a2', 0.92),
        createScore('a3', 0.91),
        createScore('a4', 0.88),
        createScore('a5', 0.99)
      ];
      const result = detectOutliers(scores);
      expect(result.outlierCount).toBeGreaterThan(0);
    });

    it('should handle insufficient data gracefully', () => {
      const scores = [
        createScore('a1', 0.90),
        createScore('a2', 0.92)
      ];
      const result = detectOutliers(scores);
      expect(result.outlierCount).toBe(0);
      expect(result.isOutlier(scores[0]!)).toBe(false);
    });

    it('should use custom threshold', () => {
      const scores = [
        createScore('a1', 0.85),
        createScore('a2', 0.90),
        createScore('a3', 0.88),
        createScore('a4', 0.92),
        createScore('a5', 0.30)
      ];
      const result = detectOutliers(scores, 2.0); // Higher threshold
      expect(result.outlierCount).toBeLessThanOrEqual(1);
    });

    it('should calculate outlier percentage correctly', () => {
      const scores = [
        createScore('a1', 0.90),
        createScore('a2', 0.91),
        createScore('a3', 0.10),
        createScore('a4', 0.92),
        createScore('a5', 0.89)
      ];
      const result = detectOutliers(scores);
      expect(result.outlierPercentage).toBeGreaterThan(0);
      expect(result.outlierPercentage).toBeLessThanOrEqual(100);
    });
  });

  // ===== aggregateScores Tests =====
  describe('aggregateScores', () => {
    it('should aggregate standard scores correctly', () => {
      const result = aggregateScores(standardScores);

      expect(result.isValid).toBe(true);
      expect(result.validationErrors).toHaveLength(0);
      expect(result.statistics.count).toBe(5);
      expect(result.statistics.average).toBeCloseTo(0.904, 2);
      expect(result.statistics.min).toBe(0.87);
      expect(result.statistics.max).toBe(0.95);
      expect(result.aggregateScore).toBeCloseTo(0.904, 2);
    });

    it('should calculate median correctly for odd count', () => {
      const result = aggregateScores(standardScores);
      expect(result.statistics.median).toBe(0.90);
    });

    it('should calculate median correctly for even count', () => {
      const fourScores = standardScores.slice(0, 4);
      const result = aggregateScores(fourScores);
      // Sorted: 0.88, 0.90, 0.92, 0.95 → median = (0.90 + 0.92) / 2
      expect(result.statistics.median).toBeCloseTo(0.91, 2);
    });

    it('should calculate standard deviation', () => {
      const result = aggregateScores(standardScores);
      expect(result.statistics.stddev).toBeGreaterThan(0);
      expect(result.statistics.stddev).toBeLessThan(0.1);
    });

    it('should calculate variance correctly', () => {
      const result = aggregateScores(standardScores);
      const expectedVariance = Math.pow(result.statistics.stddev, 2);
      expect(result.statistics.variance).toBeCloseTo(expectedVariance, 4);
    });

    it('should detect invalid scores in array', () => {
      const mixedScores: ConfidenceScore[] = [
        createScore('a1', 0.90),
        createScore('a2', 1.5), // Invalid
        createScore('a3', 0.88)
      ];
      const result = aggregateScores(mixedScores);

      expect(result.validationErrors.length).toBeGreaterThan(0);
      expect(result.validationErrors[0]).toContain('Invalid score');
      expect(result.statistics.count).toBe(2); // Only valid scores counted
    });

    it('should handle empty array gracefully', () => {
      const result = aggregateScores([]);

      expect(result.isValid).toBe(false);
      expect(result.statistics.count).toBe(0);
      expect(result.aggregateScore).toBe(0);
      expect(result.validationErrors.length).toBeGreaterThan(0);
    });

    it('should handle null input gracefully', () => {
      const result = aggregateScores(null as unknown as ConfidenceScore[]);

      expect(result.isValid).toBe(false);
      expect(result.validationErrors.length).toBeGreaterThan(0);
    });

    it('should calculate confidence score based on consistency', () => {
      const consistentScores = [
        createScore('a1', 0.90),
        createScore('a2', 0.91),
        createScore('a3', 0.89)
      ];
      const result = aggregateScores(consistentScores);

      expect(result.confidence).toBeGreaterThan(0.7); // High consistency
      expect(result.confidence).toBeLessThanOrEqual(1.0);
    });

    it('should lower confidence for inconsistent scores', () => {
      const inconsistentScores = [
        createScore('a1', 0.90),
        createScore('a2', 0.50),
        createScore('a3', 0.10)
      ];
      const result = aggregateScores(inconsistentScores);

      expect(result.confidence).toBeLessThan(0.6);
    });

    it('should include timestamp in result', () => {
      const before = Date.now();
      const result = aggregateScores(standardScores);
      const after = Date.now();

      expect(result.timestamp).toBeGreaterThanOrEqual(before);
      expect(result.timestamp).toBeLessThanOrEqual(after);
    });

    it('should detect outliers in aggregation', () => {
      const scoresWithOutlier: ConfidenceScore[] = [
        createScore('a1', 0.90),
        createScore('a2', 0.91),
        createScore('a3', 0.89),
        createScore('a4', 0.92),
        createScore('a5', 0.10)
      ];
      const result = aggregateScores(scoresWithOutlier);

      expect(result.outliers.length).toBeGreaterThan(0);
      expect(result.outliers.some(o => o.score === 0.10)).toBe(true);
    });

    it('should handle single score', () => {
      const singleScore = [createScore('a1', 0.85)];
      const result = aggregateScores(singleScore);

      expect(result.isValid).toBe(true);
      expect(result.statistics.count).toBe(1);
      expect(result.aggregateScore).toBe(0.85);
      expect(result.statistics.stddev).toBe(0);
    });

    it('should preserve agent metadata in scores', () => {
      const scoresWithMetadata: ConfidenceScore[] = [
        {
          agentId: 'a1',
          agentType: 'backend',
          score: 0.90,
          timestamp: Date.now(),
          metadata: { iteration: 1, branch: 'main' }
        }
      ];
      const result = aggregateScores(scoresWithMetadata);

      expect(result.scores[0]?.metadata).toEqual({
        iteration: 1,
        branch: 'main'
      });
    });

    it('should filter invalid scores but keep valid ones', () => {
      const mixedScores: ConfidenceScore[] = [
        createScore('valid1', 0.90),
        createScore('invalid1', -0.5),
        createScore('valid2', 0.85),
        createScore('invalid2', 1.5)
      ];
      const result = aggregateScores(mixedScores);

      expect(result.scores).toHaveLength(2);
      expect(result.validationErrors).toHaveLength(2);
      expect(result.statistics.average).toBeCloseTo(0.875, 2);
    });
  });

  // ===== calculateWeightedAverage Tests =====
  describe('calculateWeightedAverage', () => {
    it('should calculate equal weights by default', () => {
      const result = calculateWeightedAverage(standardScores);

      expect(result.weights.size).toBe(5);
      expect(result.normalizedWeights.size).toBe(5);
      const weight = result.normalizedWeights.get('agent-1');
      expect(weight).toBeCloseTo(0.2, 2); // 1/5
    });

    it('should apply custom weights', () => {
      const weights = new Map([
        ['agent-1', 2],
        ['agent-2', 1],
        ['agent-3', 1],
        ['agent-4', 1],
        ['agent-5', 1]
      ]);
      const result = calculateWeightedAverage(standardScores, weights);

      // Total weight = 2 + 1 + 1 + 1 + 1 = 6
      // agent-1 normalized = 2/6 = 0.333...
      // agent-2 normalized = 1/6 = 0.166...
      expect(result.normalizedWeights.get('agent-1')).toBeCloseTo(2/6, 2);
      expect(result.normalizedWeights.get('agent-2')).toBeCloseTo(1/6, 2);
    });

    it('should calculate correct weighted score', () => {
      const weights = new Map([
        ['agent-1', 1], // 0.92 * 0.5 = 0.46
        ['agent-2', 1]  // 0.88 * 0.5 = 0.44
      ]);
      const twoScores = standardScores.slice(0, 2);
      const result = calculateWeightedAverage(twoScores, weights);

      expect(result.weightedScore).toBeCloseTo(0.90, 2);
    });

    it('should provide contribution map', () => {
      const result = calculateWeightedAverage(standardScores);

      expect(result.contributionMap.size).toBe(5);
      for (const contribution of result.contributionMap.values()) {
        expect(contribution).toBeGreaterThan(0);
        expect(contribution).toBeLessThanOrEqual(1.0);
      }
    });

    it('should handle empty scores gracefully', () => {
      const result = calculateWeightedAverage([]);

      expect(result.weightedScore).toBe(0);
      expect(result.weights.size).toBe(0);
      expect(result.normalizedWeights.size).toBe(0);
    });

    it('should clamp weighted score to [0, 1]', () => {
      const result = calculateWeightedAverage(standardScores);

      expect(result.weightedScore).toBeGreaterThanOrEqual(0);
      expect(result.weightedScore).toBeLessThanOrEqual(1.0);
    });

    it('should normalize weights correctly', () => {
      const weights = new Map([
        ['agent-1', 5],
        ['agent-2', 5]
      ]);
      const twoScores = standardScores.slice(0, 2);
      const result = calculateWeightedAverage(twoScores, weights);

      const totalWeight = Array.from(result.normalizedWeights.values()).reduce(
        (a, b) => a + b,
        0
      );
      expect(totalWeight).toBeCloseTo(1.0, 10);
    });
  });

  // ===== groupByAgentType Tests =====
  describe('groupByAgentType', () => {
    it('should group scores by agent type', () => {
      const result = groupByAgentType(standardScores);

      expect(result.size).toBe(3);
      expect(result.get('backend-dev')).toHaveLength(2);
      expect(result.get('frontend-dev')).toHaveLength(2);
      expect(result.get('devops-engineer')).toHaveLength(1);
    });

    it('should preserve score data in groups', () => {
      const result = groupByAgentType(standardScores);

      const backendScores = result.get('backend-dev')!;
      expect(backendScores.some(s => s.agentId === 'agent-1')).toBe(true);
      expect(backendScores.some(s => s.score === 0.92)).toBe(true);
    });

    it('should handle empty input', () => {
      const result = groupByAgentType([]);

      expect(result.size).toBe(0);
    });
  });

  // ===== analyzeByAgentType Tests =====
  describe('analyzeByAgentType', () => {
    it('should analyze statistics by agent type', () => {
      const result = analyzeByAgentType(standardScores);

      expect(result.size).toBe(3);
      expect(result.has('backend-dev')).toBe(true);
      expect(result.has('frontend-dev')).toBe(true);
    });

    it('should calculate correct statistics per type', () => {
      const result = analyzeByAgentType(standardScores);

      const backendStats = result.get('backend-dev')!;
      expect(backendStats.count).toBe(2);
      expect(backendStats.average).toBeCloseTo(0.90, 2); // (0.92 + 0.88) / 2
    });

    it('should include min/max per type', () => {
      const result = analyzeByAgentType(standardScores);

      const backendStats = result.get('backend-dev')!;
      expect(backendStats.min).toBe(0.88);
      expect(backendStats.max).toBe(0.92);
    });
  });

  // ===== identifyLowPerformers Tests =====
  describe('identifyLowPerformers', () => {
    it('should identify agents below threshold', () => {
      const scoresWithLowPerformer: ConfidenceScore[] = [
        createScore('a1', 0.90, 'type-a'),
        createScore('a2', 0.92, 'type-a'),
        createScore('b1', 0.50, 'type-b'),
        createScore('b2', 0.55, 'type-b')
      ];
      const result = identifyLowPerformers(scoresWithLowPerformer, 0.70);

      expect(result.length).toBeGreaterThan(0);
      expect(result.some(s => s.agentType === 'type-b')).toBe(true);
    });

    it('should use default threshold of 0.75', () => {
      const result = identifyLowPerformers(standardScores);

      expect(Array.isArray(result)).toBe(true);
    });

    it('should return empty array if all pass threshold', () => {
      const result = identifyLowPerformers(standardScores, 0.80);

      expect(result).toHaveLength(0);
    });

    it('should identify all agents of low-performing type', () => {
      const scoresWithLowType: ConfidenceScore[] = [
        createScore('a1', 0.90, 'good-type'),
        createScore('a2', 0.92, 'good-type'),
        createScore('b1', 0.40, 'bad-type'),
        createScore('b2', 0.45, 'bad-type')
      ];
      const result = identifyLowPerformers(scoresWithLowType, 0.70);

      expect(result).toHaveLength(2);
      expect(result.every(s => s.agentType === 'bad-type')).toBe(true);
    });
  });

  // ===== generateSummary Tests =====
  describe('generateSummary', () => {
    it('should generate summary string', () => {
      const aggregated = aggregateScores(standardScores);
      const summary = generateSummary(aggregated);

      expect(summary).toContain('Confidence Score Aggregation Summary');
      expect(summary).toContain('Total Agents:');
      expect(summary).toContain('Aggregate Score:');
      expect(summary).toContain('Confidence:');
    });

    it('should include statistics in summary', () => {
      const aggregated = aggregateScores(standardScores);
      const summary = generateSummary(aggregated);

      expect(summary).toContain('Statistics:');
      expect(summary).toContain('Min:');
      expect(summary).toContain('Max:');
      expect(summary).toContain('Average:');
      expect(summary).toContain('Median:');
      expect(summary).toContain('StdDev:');
      expect(summary).toContain('Range:');
    });

    it('should include outliers section if present', () => {
      const scoresWithOutlier: ConfidenceScore[] = [
        ...standardScores,
        createScore('outlier', 0.10)
      ];
      const aggregated = aggregateScores(scoresWithOutlier);
      const summary = generateSummary(aggregated);

      expect(summary).toContain('Outliers');
    });

    it('should include validation errors if present', () => {
      const mixedScores: ConfidenceScore[] = [
        createScore('valid', 0.90),
        createScore('invalid', 1.5)
      ];
      const aggregated = aggregateScores(mixedScores);
      const summary = generateSummary(aggregated);

      expect(summary).toContain('Validation Errors');
    });

    it('should indicate validity status', () => {
      const aggregated = aggregateScores(standardScores);
      const summary = generateSummary(aggregated);

      expect(summary).toContain('Validity:');
      expect(summary).toContain('Valid');
    });
  });

  // ===== Integration Tests =====
  describe('integration', () => {
    it('should work end-to-end with full pipeline', () => {
      // Collect and aggregate scores
      const aggregated = aggregateScores(standardScores);

      // Analyze by type
      const typeAnalysis = analyzeByAgentType(aggregated.scores);

      // Identify issues
      void identifyLowPerformers(aggregated.scores, 0.85);

      // Calculate weighted
      const weighted = calculateWeightedAverage(aggregated.scores);

      // Generate report
      const summary = generateSummary(aggregated);

      expect(aggregated.isValid).toBe(true);
      expect(typeAnalysis.size).toBeGreaterThan(0);
      expect(weighted.weightedScore).toBeGreaterThan(0);
      expect(summary.length).toBeGreaterThan(0);
    });

    it('should handle real-world scenario with mixed quality', () => {
      const realWorldScores: ConfidenceScore[] = [
        // High performers
        createScore('senior-backend-1', 0.95, 'senior-dev'),
        createScore('senior-backend-2', 0.94, 'senior-dev'),
        // Average performers
        createScore('mid-frontend-1', 0.85, 'mid-dev'),
        createScore('mid-frontend-2', 0.87, 'mid-dev'),
        // Junior performers
        createScore('junior-1', 0.75, 'junior-dev'),
        // Outlier
        createScore('struggling-1', 0.40, 'junior-dev')
      ];

      const aggregated = aggregateScores(realWorldScores);
      const typeAnalysis = analyzeByAgentType(aggregated.scores);
      const lowPerformers = identifyLowPerformers(aggregated.scores, 0.70);

      expect(aggregated.isValid).toBe(true);
      expect(aggregated.statistics.average).toBeLessThan(0.90);
      expect(typeAnalysis.get('senior-dev')!.average).toBeGreaterThan(0.93);
      expect(lowPerformers.length).toBeGreaterThan(0);
      expect(aggregated.outliers.length).toBeGreaterThan(0);
    });

    it('should validate Loop 2 consensus scores', () => {
      // Simulating Loop 2 validator scores
      const validatorScores: ConfidenceScore[] = [
        createScore('validator-1', 0.92, 'validator'),
        createScore('validator-2', 0.88, 'validator'),
        createScore('validator-3', 0.90, 'validator')
      ];

      const aggregated = aggregateScores(validatorScores);

      // Should pass 0.90 threshold for standard mode
      expect(aggregated.aggregateScore).toBeGreaterThanOrEqual(0.88);
      expect(aggregated.isValid).toBe(true);
      expect(aggregated.statistics.count).toBe(3);
    });
  });
});
