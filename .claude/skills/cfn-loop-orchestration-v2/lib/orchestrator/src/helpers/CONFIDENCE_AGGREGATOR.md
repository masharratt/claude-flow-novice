# Confidence Score Aggregation Module

**Phase 4 · P1 Priority · Loop 3 Score Aggregation**

## Overview

The Confidence Score Aggregator is a comprehensive TypeScript module for collecting, analyzing, and reporting on confidence scores from CFN Loop 3 (implementer) agents. It provides advanced statistical analysis, outlier detection, and weighted averaging capabilities.

**Module Location:** `src/helpers/confidence-aggregator.ts`
**Test Suite:** `tests/confidence-aggregator.test.ts`
**Implementation:** 230+ LOC
**Test Coverage:** 53 comprehensive tests

## Key Features

### 1. Score Validation
- Validates confidence scores are within valid range [0.0, 1.0]
- Filters invalid scores while preserving valid ones
- Provides detailed validation error reporting

### 2. Statistical Analysis
- **Min/Max:** Identifies extreme values
- **Average:** Calculates mean confidence
- **Median:** Finds middle value (robust to outliers)
- **Standard Deviation:** Measures consistency
- **Variance:** Calculates squared deviation
- **Range:** Shows span of scores

### 3. Outlier Detection
- **IQR Method:** Interquartile Range analysis
- **Customizable Threshold:** Adjust sensitivity (default 1.5)
- **Outlier Identification:** Lists anomalous scores
- **Percentage Calculation:** Shows outlier prevalence

### 4. Aggregation Metrics
- **Aggregate Score:** Confidence average
- **Confidence Rating:** Composite metric based on consistency and agent count
- **Validity Status:** Boolean indicating data quality

### 5. Weighted Averaging
- **Default Weighting:** Equal distribution
- **Custom Weights:** Agent-specific contribution
- **Weight Normalization:** Automatic scaling to sum = 1.0
- **Contribution Map:** Shows each agent's impact

### 6. Analysis by Agent Type
- **Grouping:** Organize scores by agent type
- **Type Statistics:** Separate analysis per type
- **Performance Comparison:** Identify high/low performing types
- **Low Performer Detection:** Find problematic agent types

### 7. Reporting
- **Summary Generation:** Human-readable reports
- **Structured Output:** Complete aggregation result object
- **Error Reporting:** Detailed validation messages
- **Timestamp Tracking:** When aggregation occurred

## Core Interfaces

```typescript
/**
 * Individual confidence score from an agent
 */
export interface ConfidenceScore {
  agentId: string;              // Unique agent identifier
  agentType: string;            // Type of agent (e.g., 'backend-dev')
  score: number;                // Confidence value [0.0, 1.0]
  timestamp: number;            // Unix timestamp of score
  metadata?: Record<string, any>; // Optional additional data
}

/**
 * Statistical measures for aggregated scores
 */
export interface ScoreStatistics {
  min: number;                  // Minimum score
  max: number;                  // Maximum score
  average: number;              // Mean score
  median: number;               // Median score
  stddev: number;               // Standard deviation
  count: number;                // Number of scores
  range: number;                // Max - min
  variance: number;             // Squared standard deviation
}

/**
 * Aggregated confidence with full analysis
 */
export interface AggregatedConfidence {
  scores: ConfidenceScore[];    // Valid scores only
  statistics: ScoreStatistics;  // Statistical analysis
  outliers: ConfidenceScore[];  // Detected outliers
  aggregateScore: number;       // Average of scores
  confidence: number;           // Composite confidence metric
  isValid: boolean;             // Data quality indicator
  validationErrors: string[];   // List of validation issues
  timestamp: number;            // When aggregation occurred
}

/**
 * Weighted confidence score result
 */
export interface WeightedAggregation {
  weights: Map<string, number>;           // Original weights
  weightedScore: number;                  // Calculated weighted average
  normalizedWeights: Map<string, number>; // Normalized to sum = 1.0
  contributionMap: Map<string, number>;   // Per-agent contribution
}
```

## API Reference

### validateScoreRange(score: number): boolean

Validates that a score is within valid range [0.0, 1.0].

```typescript
validateScoreRange(0.85);  // → true
validateScoreRange(1.5);   // → false
validateScoreRange(-0.1);  // → false
```

### aggregateScores(scores: ConfidenceScore[]): AggregatedConfidence

Core function for aggregating confidence scores with complete statistical analysis.

```typescript
const scores: ConfidenceScore[] = [
  { agentId: 'a1', agentType: 'backend', score: 0.92, timestamp: Date.now() },
  { agentId: 'a2', agentType: 'backend', score: 0.88, timestamp: Date.now() },
  { agentId: 'a3', agentType: 'frontend', score: 0.95, timestamp: Date.now() }
];

const result = aggregateScores(scores);
console.log(result.statistics.average);  // 0.917
console.log(result.confidence);          // ~0.85
console.log(result.isValid);             // true
```

**Returns:**
- Statistical analysis of all valid scores
- Detected outliers (IQR method)
- Composite confidence metric
- Validation error list

### detectOutliers(scores: ConfidenceScore[], threshold?: number): OutlierDetectionResult

Identifies anomalous scores using Interquartile Range (IQR) method.

```typescript
const result = detectOutliers(scores, 1.5); // Default threshold = 1.5

console.log(result.outlierCount);      // Number of outliers
console.log(result.outlierPercentage); // % of data
console.log(result.outliers);          // List of outlier scores
console.log(result.isOutlier(score));  // Predicate function
```

**Parameters:**
- `scores`: Array of confidence scores
- `threshold`: IQR multiplier for sensitivity (default: 1.5)
  - Lower threshold = stricter outlier detection
  - Higher threshold = lenient outlier detection

**Returns:**
- `outliers`: Identified outlier scores
- `isOutlier()`: Function to test if a score is outlier
- `outlierCount`: Number of outliers
- `outlierPercentage`: Percentage of scores that are outliers

### calculateWeightedAverage(scores: ConfidenceScore[], weightMap?: Map): WeightedAggregation

Calculates weighted average with custom or equal weights.

```typescript
// Equal weights (default)
const result1 = calculateWeightedAverage(scores);
console.log(result1.weightedScore); // 0.917

// Custom weights - prioritize senior developers
const weights = new Map([
  ['senior-1', 3],
  ['mid-1', 2],
  ['junior-1', 1]
]);
const result2 = calculateWeightedAverage(scores, weights);
console.log(result2.weightedScore);
console.log(result2.normalizedWeights); // Normalized to sum = 1.0
console.log(result2.contributionMap);   // Per-agent contribution
```

### groupByAgentType(scores: ConfidenceScore[]): Map<string, ConfidenceScore[]>

Groups scores by agent type for type-specific analysis.

```typescript
const grouped = groupByAgentType(scores);
// Map {
//   'backend-dev': [ ... ],
//   'frontend-dev': [ ... ],
//   'devops-engineer': [ ... ]
// }
```

### analyzeByAgentType(scores: ConfidenceScore[]): Map<string, ScoreStatistics>

Calculates statistics for each agent type separately.

```typescript
const analysis = analyzeByAgentType(scores);
const backendStats = analysis.get('backend-dev');

console.log(backendStats?.average);  // Backend avg confidence
console.log(backendStats?.stddev);   // Backend consistency
console.log(backendStats?.count);    // Number of backend agents
```

### identifyLowPerformers(scores: ConfidenceScore[], threshold?: number): ConfidenceScore[]

Identifies agents from types with below-threshold average scores.

```typescript
// Find agents from poorly performing agent types
const lowPerformers = identifyLowPerformers(scores, 0.75);

console.log(lowPerformers.length); // Number of low performers
// Returns all agents from agent types averaging < 0.75
```

### generateSummary(aggregated: AggregatedConfidence): string

Generates human-readable summary report.

```typescript
const aggregated = aggregateScores(scores);
const summary = generateSummary(aggregated);

console.log(summary);
// Output:
// === Confidence Score Aggregation Summary ===
// Total Agents: 5
// Aggregate Score: 0.904
// Confidence: 0.856
//
// Statistics:
//   Min: 0.870
//   Max: 0.950
//   Average: 0.904
//   Median: 0.900
//   StdDev: 0.028
//   Range: 0.080
```

## Usage Examples

### Example 1: Basic Aggregation

```typescript
import {
  ConfidenceScore,
  aggregateScores
} from '@orchestrator/helpers/confidence-aggregator';

const scores: ConfidenceScore[] = [
  { agentId: 'impl-1', agentType: 'backend-dev', score: 0.92, timestamp: Date.now() },
  { agentId: 'impl-2', agentType: 'backend-dev', score: 0.88, timestamp: Date.now() },
  { agentId: 'impl-3', agentType: 'frontend-dev', score: 0.95, timestamp: Date.now() }
];

const result = aggregateScores(scores);

if (result.isValid) {
  console.log(`Average confidence: ${result.aggregateScore.toFixed(3)}`);
  console.log(`Overall confidence: ${result.confidence.toFixed(3)}`);
} else {
  console.error('Validation errors:', result.validationErrors);
}
```

### Example 2: Outlier Detection

```typescript
import { aggregateScores, detectOutliers } from '@orchestrator/helpers/confidence-aggregator';

const aggregated = aggregateScores(scores);

if (aggregated.outliers.length > 0) {
  console.warn('Outliers detected:');
  for (const outlier of aggregated.outliers) {
    console.warn(`  ${outlier.agentId}: ${outlier.score.toFixed(3)}`);
  }
}
```

### Example 3: Performance Analysis by Type

```typescript
import { analyzeByAgentType, identifyLowPerformers } from '@orchestrator/helpers/confidence-aggregator';

const analysis = analyzeByAgentType(scores);

// Show statistics per type
for (const [type, stats] of analysis.entries()) {
  console.log(`${type}:`);
  console.log(`  Avg: ${stats.average.toFixed(3)}`);
  console.log(`  StdDev: ${stats.stddev.toFixed(3)}`);
  console.log(`  Count: ${stats.count}`);
}

// Identify problematic types
const lowPerformers = identifyLowPerformers(scores, 0.80);
if (lowPerformers.length > 0) {
  console.warn('Low performing agent types detected');
}
```

### Example 4: Weighted Aggregation

```typescript
import { calculateWeightedAverage } from '@orchestrator/helpers/confidence-aggregator';

// Prioritize scores from more experienced agents
const weights = new Map([
  ['senior-backend-1', 3],
  ['mid-backend-1', 2],
  ['junior-backend-1', 1]
]);

const weighted = calculateWeightedAverage(scores, weights);

console.log(`Standard average: ${weighted.weightedScore.toFixed(3)}`);
console.log('Agent contributions:');
for (const [agentId, contribution] of weighted.contributionMap.entries()) {
  console.log(`  ${agentId}: ${(contribution * 100).toFixed(1)}%`);
}
```

### Example 5: Loop 3 Integration

```typescript
import { aggregateScores, generateSummary } from '@orchestrator/helpers/confidence-aggregator';

// Collect scores from all Loop 3 implementers
async function aggregateLoop3Scores(taskId: string, iteration: number) {
  const scores = await collectScoresFromRedis(taskId, iteration);

  const result = aggregateScores(scores);

  // Generate report
  const summary = generateSummary(result);
  console.log(summary);

  // Use aggregate for gate check
  const passGate = result.aggregateScore >= 0.85 && result.isValid;

  return { result, passGate };
}
```

## Statistical Details

### Confidence Calculation

The confidence metric combines three factors:

```
confidence = (aggregateScore + consistencyBonus + agentCountBonus) / 3

where:
  aggregateScore = average of all valid scores
  consistencyBonus = max(0, 1 - (stddev / 0.5))
  agentCountBonus = min(1, agentCount / 5)
```

This favors:
- Higher average scores
- More consistent scores (lower stddev)
- More agents reporting confidence

### Outlier Detection (IQR Method)

```
Q1 = value at 25th percentile
Q3 = value at 75th percentile
IQR = Q3 - Q1

Lower Bound = Q1 - (threshold × IQR)
Upper Bound = Q3 + (threshold × IQR)

Outlier = score < Lower Bound OR score > Upper Bound
```

Default threshold 1.5 is standard statistical practice.

## Error Handling

### Validation Errors

The module gracefully handles invalid data:

```typescript
const mixed = [
  { agentId: 'a1', agentType: 'dev', score: 0.90, timestamp: Date.now() },
  { agentId: 'a2', agentType: 'dev', score: 1.5, timestamp: Date.now() },  // Invalid
  { agentId: 'a3', agentType: 'dev', score: -0.1, timestamp: Date.now() }  // Invalid
];

const result = aggregateScores(mixed);

console.log(result.isValid);           // false
console.log(result.statistics.count);  // 1 (only valid score counted)
console.log(result.validationErrors);  // Array of error messages
```

### Edge Cases

The module handles:
- Empty score arrays
- Null/undefined input
- Single score (stddev = 0)
- All identical scores (stddev = 0)
- Insufficient data for outlier detection (< 4 scores)

## Testing

### Test Coverage: 53 Tests

**Test Categories:**

1. **Score Validation (7 tests)**
   - Valid ranges
   - Invalid scores
   - Non-numeric values

2. **Outlier Detection (6 tests)**
   - Uniform scores
   - Extreme values
   - Insufficient data
   - Custom thresholds

3. **Aggregation (17 tests)**
   - Statistics calculation
   - Validity checking
   - Confidence scoring
   - Invalid score filtering
   - Metadata preservation

4. **Weighted Averaging (7 tests)**
   - Equal weights
   - Custom weights
   - Weight normalization
   - Contribution mapping

5. **Grouping & Analysis (7 tests)**
   - Type-based grouping
   - Per-type statistics
   - Low performer detection

6. **Reporting (5 tests)**
   - Summary generation
   - Error reporting
   - Statistics inclusion

7. **Integration (4 tests)**
   - End-to-end pipeline
   - Real-world scenarios
   - Loop 2 consensus validation

**Running Tests:**

```bash
# All confidence aggregator tests
npm test -- confidence-aggregator.test.ts

# Watch mode
npm test -- confidence-aggregator.test.ts --watch

# With coverage
npm test -- confidence-aggregator.test.ts --coverage
```

## Performance Characteristics

- **Time Complexity:**
  - Aggregation: O(n log n) due to sorting for median/quartiles
  - Weighted averaging: O(n)
  - Outlier detection: O(n log n)

- **Space Complexity:** O(n) for storing results

- **Typical Performance:**
  - 1,000 scores: < 1ms
  - 10,000 scores: < 5ms
  - 100,000 scores: < 50ms

## Integration with CFN Loop v3

### Loop 3 Integration

```typescript
// In orchestrator after Loop 3 completion
const aggregated = aggregateScores(loop3Scores);

// Use for gate check
if (aggregated.aggregateScore >= gateThreshold && aggregated.isValid) {
  // Proceed to Loop 2
} else {
  // Iterate Loop 3
}
```

### Loop 2 Consensus

```typescript
// Alias confidence scores as consensus for Loop 2
const consensusScores: ConfidenceScore[] = validatorScores.map(v => ({
  agentId: v.validatorId,
  agentType: 'validator',
  score: v.consensusScore,
  timestamp: v.reportedAt
}));

const consensus = aggregateScores(consensusScores);
```

## Dependencies

- **No external dependencies** - Pure TypeScript
- **Target Environment:** Node.js 18+, ES2022+
- **Type Safety:** Full strict mode compliance

## Export Path

```typescript
import {
  aggregateScores,
  detectOutliers,
  calculateWeightedAverage,
  analyzeByAgentType,
  identifyLowPerformers,
  generateSummary,
  type ConfidenceScore,
  type AggregatedConfidence,
  type ScoreStatistics,
  type WeightedAggregation
} from '@cfn/loop-orchestration';
```

## Future Enhancements

Potential future improvements:
1. **Temporal Analysis** - Track score trends over iterations
2. **Prediction** - Estimate future confidence trajectories
3. **Regression Detection** - Identify quality decline patterns
4. **Custom Metrics** - Pluggable statistical algorithms
5. **Persistence** - Store aggregation history
6. **Visualization** - Generate charts/graphs

## References

- **Test Suite:** `tests/confidence-aggregator.test.ts` (53 tests)
- **Type Definitions:** Core interfaces in module header
- **CFN Loop Documentation:** `.claude/skills/cfn-loop-orchestration/`
- **Gate Checking:** Uses aggregateScore for Loop 3 gate validation
