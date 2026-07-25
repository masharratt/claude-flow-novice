/**
 * Confidence Score Aggregation
 *
 * Aggregates and analyzes confidence scores from Loop 3 implementers.
 * Provides statistical analysis, outlier detection, and validation.
 *
 * Phase 4 · P1 Priority · Loop 3 Score Aggregation
 * Target: 224 LOC (actual: ~230 LOC)
 */

/**
 * Individual confidence score from an agent
 */
export interface ConfidenceScore {
  agentId: string;
  agentType: string;
  score: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/**
 * Statistical measures for aggregated scores
 */
export interface ScoreStatistics {
  min: number;
  max: number;
  average: number;
  median: number;
  stddev: number;
  count: number;
  range: number;
  variance: number;
}

/**
 * Result of outlier detection
 */
export interface OutlierDetectionResult {
  outliers: ConfidenceScore[];
  isOutlier: (score: ConfidenceScore) => boolean;
  outlierCount: number;
  outlierPercentage: number;
}

/**
 * Aggregated confidence with full analysis
 */
export interface AggregatedConfidence {
  scores: ConfidenceScore[];
  statistics: ScoreStatistics;
  outliers: ConfidenceScore[];
  aggregateScore: number;
  confidence: number;
  isValid: boolean;
  validationErrors: string[];
  timestamp: number;
}

/**
 * Weighted confidence score result
 */
export interface WeightedAggregation {
  weights: Map<string, number>;
  weightedScore: number;
  normalizedWeights: Map<string, number>;
  contributionMap: Map<string, number>;
}

/**
 * Validates that a confidence score is in valid range [0.0, 1.0]
 * @param score The score to validate
 * @returns true if valid, false otherwise
 */
export function validateScoreRange(score: number): boolean {
  return typeof score === 'number' && score >= 0.0 && score <= 1.0;
}

/**
 * Detects outliers using Interquartile Range (IQR) method
 * @param scores Array of confidence scores
 * @param threshold IQR multiplier (default 1.5)
 * @returns Outlier detection result
 */
export function detectOutliers(
  scores: ConfidenceScore[],
  threshold: number = 1.5
): OutlierDetectionResult {
  if (scores.length < 4) {
    // Not enough data for meaningful outlier detection
    return {
      outliers: [],
      isOutlier: () => false,
      outlierCount: 0,
      outlierPercentage: 0
    };
  }

  // Sort scores numerically
  const sortedScores = [...scores].sort((a, b) => a.score - b.score);
  const n = sortedScores.length;

  // Calculate quartiles
  const q1Index = Math.floor(n * 0.25);
  const q3Index = Math.floor(n * 0.75);
  const q1Element = sortedScores[q1Index];
  const q3Element = sortedScores[q3Index];

  if (!q1Element || !q3Element) {
    // Safeguard against undefined elements
    return {
      outliers: [],
      isOutlier: () => false,
      outlierCount: 0,
      outlierPercentage: 0
    };
  }

  const q1 = q1Element.score;
  const q3 = q3Element.score;
  const iqr = q3 - q1;

  // Calculate outlier bounds
  const lowerBound = q1 - threshold * iqr;
  const upperBound = q3 + threshold * iqr;

  // Identify outliers
  const outliers = scores.filter(
    s => s.score < lowerBound || s.score > upperBound
  );

  const isOutlier = (score: ConfidenceScore): boolean =>
    score.score < lowerBound || score.score > upperBound;

  return {
    outliers,
    isOutlier,
    outlierCount: outliers.length,
    outlierPercentage: (outliers.length / scores.length) * 100
  };
}

/**
 * Calculates median of scores
 * @param sortedScores Pre-sorted array of score numbers
 * @returns Median value
 */
function calculateMedian(sortedScores: number[]): number {
  const n = sortedScores.length;
  if (n === 0) return 0;
  if (n % 2 === 1) {
    const midIndex = Math.floor(n / 2);
    return sortedScores[midIndex] ?? 0;
  }
  const mid1 = sortedScores[n / 2 - 1] ?? 0;
  const mid2 = sortedScores[n / 2] ?? 0;
  return (mid1 + mid2) / 2;
}

/**
 * Calculates standard deviation
 * @param scores Array of score numbers
 * @param average Pre-calculated average
 * @returns Standard deviation
 */
function calculateStdDev(scores: number[], average: number): number {
  if (scores.length < 2) return 0;
  const variance = scores.reduce((sum, score) => {
    return sum + Math.pow(score - average, 2);
  }, 0) / scores.length;
  return Math.sqrt(variance);
}

/**
 * Calculates statistical measures for scores
 * @param scores Array of confidence scores
 * @returns ScoreStatistics object
 */
function calculateStatistics(scores: ConfidenceScore[]): ScoreStatistics {
  if (scores.length === 0) {
    return {
      min: 0,
      max: 0,
      average: 0,
      median: 0,
      stddev: 0,
      count: 0,
      range: 0,
      variance: 0
    };
  }

  const numericScores = scores.map(s => s.score);
  const sum = numericScores.reduce((a, b) => a + b, 0);
  const average = sum / numericScores.length;
  const min = Math.min(...numericScores);
  const max = Math.max(...numericScores);
  const sortedScores = [...numericScores].sort((a, b) => a - b);
  const median = calculateMedian(sortedScores);
  const stddev = calculateStdDev(numericScores, average);
  const variance = Math.pow(stddev, 2);

  return {
    min,
    max,
    average,
    median,
    stddev,
    count: scores.length,
    range: max - min,
    variance
  };
}

/**
 * Aggregates confidence scores with full statistical analysis
 * @param scores Array of confidence scores to aggregate
 * @returns AggregatedConfidence with statistics and validation
 */
export function aggregateScores(
  scores: ConfidenceScore[]
): AggregatedConfidence {
  const validationErrors: string[] = [];
  const timestamp = Date.now();

  // Validate input
  if (!scores || !Array.isArray(scores)) {
    validationErrors.push('Scores must be a non-empty array');
    return {
      scores: [],
      statistics: {
        min: 0,
        max: 0,
        average: 0,
        median: 0,
        stddev: 0,
        count: 0,
        range: 0,
        variance: 0
      },
      outliers: [],
      aggregateScore: 0,
      confidence: 0,
      isValid: false,
      validationErrors,
      timestamp
    };
  }

  if (scores.length === 0) {
    validationErrors.push('No scores provided');
    return {
      scores: [],
      statistics: {
        min: 0,
        max: 0,
        average: 0,
        median: 0,
        stddev: 0,
        count: 0,
        range: 0,
        variance: 0
      },
      outliers: [],
      aggregateScore: 0,
      confidence: 0,
      isValid: false,
      validationErrors,
      timestamp
    };
  }

  // Validate all scores
  const validScores: ConfidenceScore[] = [];
  for (const score of scores) {
    if (!validateScoreRange(score.score)) {
      validationErrors.push(
        `Invalid score from ${score.agentId}: ${score.score} (must be 0.0-1.0)`
      );
    } else {
      validScores.push(score);
    }
  }

  // Calculate statistics
  const statistics = calculateStatistics(validScores);

  // Detect outliers
  const outlierResult = detectOutliers(validScores);

  // Aggregate score = average of valid scores
  const aggregateScore = statistics.average;

  // Confidence score based on consistency (inverse of stddev)
  // High stddev = low consistency = low confidence
  const maxStdDev = 0.5; // Normalize by reasonable max stddev
  const confidenceFromConsistency = Math.max(0, 1 - (statistics.stddev / maxStdDev));

  // Confidence also considers number of agents (more agents = higher confidence)
  const agentScaling = Math.min(1, validScores.length / 5);
  const confidence = (aggregateScore + confidenceFromConsistency + agentScaling) / 3;

  // Determine validity
  const isValid = validationErrors.length === 0 && validScores.length > 0;

  return {
    scores: validScores,
    statistics,
    outliers: outlierResult.outliers,
    aggregateScore,
    confidence: Math.min(1.0, Math.max(0.0, confidence)),
    isValid,
    validationErrors,
    timestamp
  };
}

/**
 * Calculates weighted average of confidence scores
 * @param scores Array of confidence scores
 * @param weightMap Map of agentId to weight (will be normalized)
 * @returns WeightedAggregation result
 */
export function calculateWeightedAverage(
  scores: ConfidenceScore[],
  weightMap?: Map<string, number>
): WeightedAggregation {
  if (scores.length === 0) {
    return {
      weights: new Map(),
      weightedScore: 0,
      normalizedWeights: new Map(),
      contributionMap: new Map()
    };
  }

  // Default weights: equal distribution
  let weights = weightMap || new Map<string, number>();
  if (weights.size === 0) {
    const equalWeight = 1 / scores.length;
    weights = new Map(scores.map(s => [s.agentId, equalWeight]));
  }

  // Normalize weights to sum to 1.0
  const totalWeight = Array.from(weights.values()).reduce((a, b) => a + b, 0);
  const normalizedWeights = new Map(
    Array.from(weights.entries()).map(([agentId, weight]) => [
      agentId,
      weight / totalWeight
    ])
  );

  // Calculate weighted score
  let weightedScore = 0;
  const contributionMap = new Map<string, number>();

  for (const score of scores) {
    const weight = normalizedWeights.get(score.agentId) || 0;
    const contribution = score.score * weight;
    weightedScore += contribution;
    contributionMap.set(score.agentId, contribution);
  }

  return {
    weights,
    weightedScore: Math.min(1.0, Math.max(0.0, weightedScore)),
    normalizedWeights,
    contributionMap
  };
}

/**
 * Groups scores by agent type for analysis
 * @param scores Array of confidence scores
 * @returns Map of agentType to their scores
 */
export function groupByAgentType(
  scores: ConfidenceScore[]
): Map<string, ConfidenceScore[]> {
  const grouped = new Map<string, ConfidenceScore[]>();

  for (const score of scores) {
    if (!grouped.has(score.agentType)) {
      grouped.set(score.agentType, []);
    }
    grouped.get(score.agentType)!.push(score);
  }

  return grouped;
}

/**
 * Analyzes confidence scores by agent type
 * @param scores Array of confidence scores
 * @returns Map of agentType to their statistics
 */
export function analyzeByAgentType(
  scores: ConfidenceScore[]
): Map<string, ScoreStatistics> {
  const grouped = groupByAgentType(scores);
  const analysis = new Map<string, ScoreStatistics>();

  for (const [agentType, typeScores] of grouped.entries()) {
    analysis.set(agentType, calculateStatistics(typeScores));
  }

  return analysis;
}

/**
 * Identifies potentially problematic agents (consistently low scores)
 * @param scores Array of confidence scores
 * @param threshold Minimum acceptable average (default 0.75)
 * @returns Array of agents with low average scores
 */
export function identifyLowPerformers(
  scores: ConfidenceScore[],
  threshold: number = 0.75
): ConfidenceScore[] {
  const grouped = groupByAgentType(scores);
  const lowPerformers: ConfidenceScore[] = [];

  for (const typeScores of grouped.values()) {
    const stats = calculateStatistics(typeScores);
    if (stats.average < threshold) {
      lowPerformers.push(...typeScores);
    }
  }

  return lowPerformers;
}

/**
 * Generates a human-readable summary of aggregated scores
 * @param aggregated The aggregated confidence result
 * @returns Summary string
 */
export function generateSummary(aggregated: AggregatedConfidence): string {
  const lines: string[] = [];

  lines.push('=== Confidence Score Aggregation Summary ===');
  lines.push(`Total Agents: ${aggregated.statistics.count}`);
  lines.push(`Aggregate Score: ${aggregated.aggregateScore.toFixed(3)}`);
  lines.push(`Confidence: ${aggregated.confidence.toFixed(3)}`);
  lines.push('');
  lines.push('Statistics:');
  lines.push(`  Min: ${aggregated.statistics.min.toFixed(3)}`);
  lines.push(`  Max: ${aggregated.statistics.max.toFixed(3)}`);
  lines.push(`  Average: ${aggregated.statistics.average.toFixed(3)}`);
  lines.push(`  Median: ${aggregated.statistics.median.toFixed(3)}`);
  lines.push(`  StdDev: ${aggregated.statistics.stddev.toFixed(3)}`);
  lines.push(`  Range: ${aggregated.statistics.range.toFixed(3)}`);

  if (aggregated.outliers.length > 0) {
    lines.push('');
    lines.push(`Outliers (${aggregated.outliers.length}):`);
    for (const outlier of aggregated.outliers) {
      lines.push(`  - ${outlier.agentId}: ${outlier.score.toFixed(3)}`);
    }
  }

  if (aggregated.validationErrors.length > 0) {
    lines.push('');
    lines.push('Validation Errors:');
    for (const error of aggregated.validationErrors) {
      lines.push(`  - ${error}`);
    }
  }

  lines.push(`Validity: ${aggregated.isValid ? 'Valid' : 'Invalid'}`);

  return lines.join('\n');
}
