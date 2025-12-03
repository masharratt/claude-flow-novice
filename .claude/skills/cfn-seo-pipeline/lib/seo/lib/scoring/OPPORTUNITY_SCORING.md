# Opportunity Scorer with Pattern Boost

## Overview

The Opportunity Scorer identifies high-impact keyword opportunities by analyzing multiple scoring factors including volume/difficulty ratio, competitive gaps, trends, and RuVector pattern matching.

**Score Range**: 0.0-1.0 (higher = better opportunity)

**Target Use Cases:**
- Phase 5: Gap analysis and opportunity identification
- Content prioritization for topic clusters
- ROI-maximized keyword targeting
- Quick-win opportunity detection

## Scoring Factors

### 1. Volume/Difficulty Ratio (30% weight)
**Score**: 0.0-1.0

Measures the attractiveness of a keyword based on search demand vs. difficulty to rank.

```
Score = min(1.0, (searchVolume / 1000) / (difficulty + 0.1) / 100)

Examples:
- 1000 monthly searches, 0.3 difficulty → 0.333
- 5000 monthly searches, 0.2 difficulty → 1.667 (capped at 1.0)
- 100 monthly searches, 0.7 difficulty → 0.143
```

**Thresholds:**
- Minimum search volume: 50 (configurable)
- Maximum difficulty: 0.8 (configurable)

### 2. Competitive Gap Bonus (25% weight)
**Score**: 0.0-0.3

Identifies opportunities where competitors rank but the site doesn't.

| Scenario | Bonus | Reasoning |
|----------|-------|-----------|
| Site doesn't rank, competitors do | 0.30 | Clear market gap |
| Site on page 2+, competitors on page 1 | 0.15 | Moderate gap |
| Site on page 1 | 0.00 | No gap |

**Use Cases:**
- Content gaps in topic clusters
- Quick win improvements (better content than competitors)
- Market penetration opportunities

### 3. Trend Bonus (15% weight)
**Score**: 0.0-0.15

Rewards growing keywords; penalizes declining keywords.

| Trend | Bonus | Duration | Reasoning |
|-------|-------|----------|-----------|
| Growing | 0.15 | Sustained growth | Increasing demand |
| Stable | 0.08 | Flat 12+ months | Consistent opportunity |
| Declining | 0.00 | Declining YoY | Shrinking market |

**Integration:**
- Use Google Trends API for trend detection
- SE Ranking provides trend data
- Historical keyword volume tracking

### 4. Quick Win Bonus (10% weight)
**Score**: 0.0-0.1

Identifies low-hanging fruit: low difficulty + page 2 ranking.

**Criteria:**
- Keyword difficulty < 0.40
- Current ranking position 11-20 (page 2)
- Only 1-2 content updates needed to reach top 10

**Example:**
- Keyword: "best family tree software"
- Current position: 16
- Difficulty: 0.35
- → Quick win bonus: 0.1

### 5. Intent Alignment Bonus (5% weight)
**Score**: 0.0-0.1

Bonus for keywords aligned with site's content strategy.

```
intentBonus = min(0.1, intentAlignment * 0.1)
```

**Intent Types:**
- **Informational**: "how to rank keywords" (educational)
- **Navigational**: "ancestry.com login" (brand)
- **Transactional**: "buy family tree software" (purchase)
- **Commercial**: "best family tree software" (comparison)

### 6. Pattern Match Bonus (10% weight)
**Score**: 0.0-0.2

RuVector integration: rewards keywords matching successful content patterns.

```
patternMatchBonus = min(0.2, avgPatternConfidence * 0.2)
```

**Matching Process:**
1. Query RuVector `content_patterns` collection
2. Find patterns (angle, structure, voice, hook)
3. Calculate average pattern confidence
4. Apply bonus weighted by confidence

**Example:**
- Keyword: "how to trace family ancestry"
- Matching patterns: 3 successful "how-to" articles
- Avg pattern confidence: 0.85
- → Pattern bonus: 0.17

### 7. Historical Success Bonus (5% weight)
**Score**: 0.0-0.15

Rewards keywords with proven historical conversion rates.

```
historicalSuccessBonus = min(0.15, successScore * 0.15)
```

**Heuristics:**
- Question keywords ("how", "what", "why"): +0.25
- Comparison keywords (" vs "): +0.20
- Tool/app keywords: +0.30
- Niche-specific adjustments: +0.10

## Weight Configuration

Opportunity scoring weights are critical to the accuracy of scores. All weights **MUST** sum to exactly 1.0 (±0.01 tolerance). Misconfigured weights will produce inflated or deflated opportunity scores, leading to incorrect priority rankings.

### Default Weights (Validated)

The default weights have been carefully tuned and validated to sum to 1.0:

```typescript
const defaultWeights: OpportunityScorerConfig = {
  volumeDifficultyWeight: 0.30,           // Volume/difficulty ratio
  gapBonusWeight: 0.25,                   // Competitive gap detection
  trendBonusWeight: 0.15,                 // Growing/stable/declining trends
  quickWinBonusWeight: 0.10,              // Low-hanging fruit opportunities
  intentBonusWeight: 0.05,                // Search intent alignment
  patternMatchBonusWeight: 0.10,          // RuVector pattern matching
  historicalSuccessBonusWeight: 0.05,     // Historical conversion likelihood
  // TOTAL: 1.00 (exactly)
};
```

### Custom Weight Configuration

If you need to adjust weights for your use case, ensure the **total equals 1.0**:

```typescript
// CORRECT: Weights sum to 1.0
const customScorer = new OpportunityScorer({
  volumeDifficultyWeight: 0.35,      // Emphasize volume more
  gapBonusWeight: 0.20,              // De-emphasize gaps
  trendBonusWeight: 0.15,
  quickWinBonusWeight: 0.10,
  intentBonusWeight: 0.05,
  patternMatchBonusWeight: 0.10,
  historicalSuccessBonusWeight: 0.05,
  // TOTAL: 1.00 ✓
});

// INCORRECT: This will throw an error
// Weights sum to 1.20
const invalidScorer = new OpportunityScorer({
  volumeDifficultyWeight: 0.5,
  gapBonusWeight: 0.5,
  // ... other weights
  // TOTAL: 1.20 ✗ ERROR
});
```

### Weight Validation

The OpportunityScorer validates weights at construction time and throws an error if they don't sum to 1.0 (±0.01 tolerance):

```typescript
// This will throw an error with details:
// "Opportunity scorer weight validation failed: weights sum to 1.2000
//  but must equal 1.0 (±0.01 tolerance). Misconfigured weights will produce
//  inflated or deflated opportunity scores. Provided weights: [volumeDifficultyWeight: 0.5, ...]"

try {
  const scorer = new OpportunityScorer({
    volumeDifficultyWeight: 0.5,
    gapBonusWeight: 0.5,
    // ... other weights that total > 1.0
  });
} catch (error) {
  console.error(error.message);
  // Apply correct weights or use defaults
}
```

### Weight Tuning Guidelines

When adjusting weights, consider:

1. **Domain Importance**: If your site operates in a competitive niche, increase `gapBonusWeight`
2. **Volume Preference**: For high-volume targeting, increase `volumeDifficultyWeight`
3. **Trend Sensitivity**: For fast-moving niches, increase `trendBonusWeight`
4. **Quick Wins**: For immediate ROI, increase `quickWinBonusWeight`
5. **Pattern Matching**: If RuVector patterns are reliable, increase `patternMatchBonusWeight`

### Tolerance and Floating-Point Precision

The validator uses a **0.01 tolerance** to account for floating-point precision errors:

```typescript
// Valid: sum = 1.005 (within tolerance)
{
  volumeDifficultyWeight: 0.3,
  gapBonusWeight: 0.25,
  trendBonusWeight: 0.15,
  quickWinBonusWeight: 0.1,
  intentBonusWeight: 0.05,
  patternMatchBonusWeight: 0.105,  // 0.10 + 0.005 floating-point
  historicalSuccessBonusWeight: 0.05,
  // TOTAL: 1.005 ✓ (within tolerance)
}

// Invalid: sum = 1.02 (outside tolerance)
{
  volumeDifficultyWeight: 0.3,
  gapBonusWeight: 0.25,
  trendBonusWeight: 0.15,
  quickWinBonusWeight: 0.1,
  intentBonusWeight: 0.05,
  patternMatchBonusWeight: 0.11,
  historicalSuccessBonusWeight: 0.05,
  // TOTAL: 1.02 ✗ (outside tolerance)
}
```

## Final Score Calculation

```
finalScore = min(1.0,
  volumeDifficultyScore * volumeDifficultyWeight +
  gapBonus * gapBonusWeight +
  trendBonus * trendBonusWeight +
  quickWinBonus * quickWinBonusWeight +
  intentBonus * intentBonusWeight +
  patternMatchBonus * patternMatchBonusWeight +
  historicalSuccessBonus * historicalSuccessBonusWeight
)

// With default weights:
finalScore = min(1.0,
  volumeDifficultyScore * 0.30 +
  gapBonus * 0.25 +
  trendBonus * 0.15 +
  quickWinBonus * 0.10 +
  intentBonus * 0.05 +
  patternMatchBonus * 0.10 +
  historicalSuccessBonus * 0.05
)
```

### Score Interpretation

| Score | Opportunity | Action |
|-------|-------------|--------|
| 0.8-1.0 | Excellent | Priority targeting |
| 0.6-0.8 | Very Good | High priority |
| 0.4-0.6 | Good | Medium priority |
| 0.2-0.4 | Moderate | Monitor/consider |
| <0.2 | Poor | Skip unless strategic |

## Usage Examples

### Single Keyword Scoring

```typescript
import { OpportunityScorer } from './lib/scoring';

const scorer = new OpportunityScorer({
  minSearchVolume: 100,
  verbose: true,
});

const opportunity = {
  keyword: 'how to create a family tree',
  searchVolume: 3500,
  difficulty: 0.35,
  currentPosition: 14,
  trend: 'growing' as const,
  hasGap: true,
};

const scoring = await scorer.scoreOpportunity(opportunity);
// {
//   volumeDifficultyScore: 0.75,
//   gapBonus: 0.15,
//   trendBonus: 0.15,
//   quickWinBonus: 0.10,
//   intentBonus: 0.05,
//   patternMatchBonus: 0.12,
//   historicalSuccessBonus: 0.08,
//   finalScore: 0.87,
//   confidence: 0.85,
//   explanation: [
//     'Volume/Difficulty ratio: 0.75 (volume: 3500, difficulty: 0.35)',
//     'Competitive gap identified: position 14 (gap bonus: 0.15)',
//     'Keyword trend is growing (bonus: 0.15)',
//     'Quick win opportunity: low difficulty + page 2 position: bonus 0.1',
//     'Pattern match bonus: 0.12 (3 patterns, avg confidence: 0.85)',
//     // ...
//   ]
// }
```

### Ranking Multiple Keywords

```typescript
const keywords = [
  { keyword: 'family tree software', searchVolume: 5000, difficulty: 0.7, ... },
  { keyword: 'trace ancestry online', searchVolume: 2000, difficulty: 0.4, ... },
  { keyword: 'genealogy research', searchVolume: 1500, difficulty: 0.35, ... },
];

const ranked = await scorer.scoreAndRank(keywords, 10); // Top 10
// Returns sorted by finalScore (descending)
// [
//   { keyword: 'trace ancestry online', scoring: { finalScore: 0.92, ... } },
//   { keyword: 'genealogy research', scoring: { finalScore: 0.88, ... } },
//   { keyword: 'family tree software', scoring: { finalScore: 0.71, ... } },
// ]
```

### Custom Configuration

```typescript
const customScorer = new OpportunityScorer({
  minSearchVolume: 500, // Higher threshold
  maxDifficulty: 0.6,   // Fewer hard keywords
  volumeDifficultyWeight: 0.4, // Weight volume more
  patternMatchBonusWeight: 0.15, // Trust patterns more
  verbose: true,
});

const scoring = await customScorer.scoreOpportunity(opportunity);
```

## RuVector Integration

### Pattern Matching

The scorer queries the `content_patterns` collection to find successful patterns:

```typescript
// During scoring, the scorer looks for patterns like:
// - Format: "listicle", "how-to", "ultimate guide"
// - Structure: "numbered list", "comparison table"
// - Voice: "casual", "expert authority"
// - Hook: "open with statistic", "question hook"

// If found, pattern confidence is used to calculate bonus
patternMatchBonus = avgPatternConfidence * 0.2
```

### Historical Success Analysis

The scorer analyzes historical performance data to score similar keywords:

```typescript
// Query learning store for:
// - Keywords that converted well
// - Similar niches and intent types
// - Content formats that performed best

// Use heuristics to estimate success likelihood
historicalSuccessBonus = successScore * 0.15
```

## Confidence Scoring

Each opportunity score includes a confidence rating (0.0-1.0):

```typescript
interface ScoringFactors {
  // ...
  confidence: number; // 0.0-1.0
}
```

**Confidence Factors:**
- Data freshness: stale data = lower confidence
- Pattern matches: more matches = higher confidence
- Volume reliability: estimated volume = lower confidence
- Historical data: more historical examples = higher confidence

**Default**: 0.85 (high confidence)

## Comparison with Competitors

### Features Comparison
| Feature | Opportunity Scorer | Manual Analysis | SE Ranking Keyword Tool |
|---------|-------------------|-----------------|------------------------|
| Volume/Difficulty | Yes | Yes | Yes |
| Gap Detection | Yes | Slow | Limited |
| Trend Analysis | Yes | Manual | Yes |
| Pattern Matching | Yes (RuVector) | No | No |
| Historical Success | Yes | No | No |
| Speed | <1s per keyword | 5-10 min | 2-3s (API) |

## Testing

### Mock Mode Testing

```typescript
const scorer = new OpportunityScorer({
  verbose: true,
});

const mockOpportunity = {
  keyword: 'test keyword',
  searchVolume: 5000,
  difficulty: 0.4,
  trend: 'growing',
  currentPosition: 15,
  hasGap: true,
};

const scoring = await scorer.scoreOpportunity(mockOpportunity);
expect(scoring.finalScore).toBeGreaterThan(0.5);
```

### Integration Testing

```typescript
// With RuVector connection
const db = await createRuVectorDB();
const scorer = new OpportunityScorer({}, db);

// Pattern matching will query actual RuVector data
const scoring = await scorer.scoreOpportunity(realOpportunity);
```

## Performance

**Scoring Speed:**
- Per-keyword: 10-50ms (with RuVector patterns)
- Batch of 100 keywords: 1-5 seconds
- RuVector pattern query: 5-20ms

**Configuration for Production:**
```typescript
const scorer = new OpportunityScorer({
  minSearchVolume: 100,
  maxDifficulty: 0.8,
  verbose: false, // Disable logging for performance
});
```

## Future Enhancements

1. **ML-Based Scoring**: Train model on historical performance data
2. **Seasonal Adjustments**: Boost seasonal keywords before peak months
3. **Audience Targeting**: Adjust scoring by target audience demographics
4. **Content Gap Analysis**: Analyze competitor content depth
5. **SERP Feature Bonus**: Reward keywords with featured snippet opportunities

## References

- **DataForSEO API**: `.claude/skills/cfn-seo-pipeline/lib/seo/apis/dataforseo-cached.ts`
- **RuVector Integration**: `.claude/skills/cfn-seo-pipeline/lib/seo/lib/ruvector/`
- **Phase 5 Gap Analysis**: `planning/seo/PHASE_5_GAP_ANALYSIS.md`
