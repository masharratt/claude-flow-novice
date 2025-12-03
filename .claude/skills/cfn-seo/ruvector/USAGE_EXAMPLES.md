# RuVector Onboarding Schemas - Usage Examples

Quick reference for common usage patterns in the onboarding pipeline.

---

## Pre-Research Lookups (Phase 0)

### Check if Site Was Previously Analyzed

```typescript
import {
  buildSiteProfileQueryString,
  isSiteProfileEntry,
  isEntryStale,
  ONBOARDING_COLLECTIONS,
} from './onboarding-schemas';

async function checkExistingSiteProfile(domain: string, ruvector: RuVectorClient) {
  // Build query for semantic search
  const queryStr = buildSiteProfileQueryString({
    domain,
    minFreshnessScore: 0.7, // Skip stale profiles
  });

  // Search RuVector
  const results = await ruvector.search(ONBOARDING_COLLECTIONS.SITE_PROFILES, queryStr);

  if (results.length > 0) {
    const result = results[0];

    // Validate entry structure at runtime
    if (isSiteProfileEntry(result)) {
      const profile = result as SiteProfileEntry;

      // Check if data is still fresh
      if (!isEntryStale(profile.metadata.freshnessScore)) {
        return {
          found: true,
          profile,
          action: 'REUSE',
          reason: 'Recent analysis available',
        };
      }
    }
  }

  return {
    found: false,
    profile: null,
    action: 'ANALYZE',
    reason: 'No recent cached data',
  };
}
```

### Find Industry Patterns Before Phase 6

```typescript
import {
  buildCrossSitePatternQueryString,
  isCrossSitePatternEntry,
  ONBOARDING_COLLECTIONS,
} from './onboarding-schemas';

async function findSuccessfulPatterns(
  industry: string,
  minConfidence: number = 0.8,
  ruvector: RuVectorClient
) {
  // Query for proven patterns in this industry
  const queryStr = buildCrossSitePatternQueryString({
    industry,
    patternType: 'CONTENT_STRUCTURE',
    minConfidence,
    minSuccessRate: 0.75,
  });

  const results = await ruvector.search(ONBOARDING_COLLECTIONS.CROSS_SITE_PATTERNS, queryStr);

  // Filter and validate results
  const patterns = results
    .filter((r) => isCrossSitePatternEntry(r))
    .map((r) => r as CrossSitePatternEntry)
    .filter((p) => !isEntryStale(p.metadata.freshnessScore));

  return {
    patternCount: patterns.length,
    patterns,
    avgConfidence: patterns.reduce((sum, p) => sum + p.metadata.overallConfidence, 0) / patterns.length,
    recommendation: patterns.length > 3 ? 'USE_PATTERNS' : 'ANALYZE',
  };
}
```

---

## Post-Phase Storage (Steps 4.5)

### Store Technical Audit Results (After Phase 1)

```typescript
import {
  createSiteProfileEntry,
  TechnicalHealthMetric,
  SiteProfileCrawlData,
} from './onboarding-schemas';

async function storePhase1Results(
  domain: string,
  industry: string,
  niche: string,
  phase1Output: PhaseOutput,
  technicalMetrics: TechnicalHealthMetric[],
  crawlData: SiteProfileCrawlData,
  ruvector: RuVectorClient
) {
  // Create entry ready for RuVector storage
  const siteProfile = createSiteProfileEntry(
    domain,
    industry,
    niche,
    phase1Output,
    technicalMetrics,
    crawlData,
    {
      // Optional overrides
      topPriorityIssues: ['Mobile friendliness', 'Core Web Vitals'],
      quickWins: ['Fix 404s', 'Optimize largest images'],
    }
  );

  // Store in RuVector for future reference
  await ruvector.upsert(ONBOARDING_COLLECTIONS.SITE_PROFILES, [siteProfile]);

  console.log(`Stored site profile: ${siteProfile.id}`);
  console.log(`Health score: ${siteProfile.metadata.technicalHealthScore.toFixed(2)}`);
  console.log(`Blocking condition: ${siteProfile.metadata.blockingConditionScore.toFixed(2)}`);

  return siteProfile;
}
```

### Store Complete Onboarding Results (After All Phases)

```typescript
import { createOnboardingResultsEntry, PhaseOutput } from './onboarding-schemas';

async function storeOnboardingResults(
  domain: string,
  runId: string,
  industry: string,
  niche: string,
  allPhaseOutputs: PhaseOutput[], // Phases 1-7
  ruvector: RuVectorClient
) {
  // Create entry with all phase results
  const results = createOnboardingResultsEntry(
    domain,
    runId,
    industry,
    niche,
    allPhaseOutputs,
    {
      // Override with actual metrics from phases
      keywordsDiscovered: 487,
      contentGapsIdentified: 23,
      competitorsAnalyzed: 8,
      quickWinsCount: 12,
      apiCallsMade: 156,
      apiCallsCached: 624, // Cached = total - made
      cacheHitRate: 0.8, // 80% hit rate!
      estimatedCostSavings: 4200, // USD
      topRecommendations: [
        'Build 15 cornerstone content pieces',
        'Fix mobile indexing issues',
        'Create internal linking maps',
      ],
      roadmapMilestones: [
        'Month 1-2: Technical foundation',
        'Month 3-4: Content creation',
        'Month 5+: Link building',
      ],
    }
  );

  // Store for historical tracking
  await ruvector.upsert(ONBOARDING_COLLECTIONS.ONBOARDING_RESULTS, [results]);

  console.log(`Stored onboarding results for run: ${runId}`);
  console.log(`Phases completed: ${results.metadata.phasesCompleted}/7`);
  console.log(`Overall confidence: ${results.metadata.overallConfidence.toFixed(2)}`);
  console.log(`Cost savings: $${results.metadata.estimatedCostSavings}`);

  return results;
}
```

---

## Pattern Extraction (Step 12.5)

### Extract and Store Successful Patterns

```typescript
import { createCrossSitePatternEntry, IndustrySuccessMetric } from './onboarding-schemas';

async function extractAndStorePatterns(
  domain: string,
  industry: string,
  onboardingResults: OnboardingResultsEntry,
  ruvector: RuVectorClient
) {
  // Example: Extract content structure pattern
  const contentPattern = createCrossSitePatternEntry(
    'CONTENT_STRUCTURE',
    industry,
    'Three-pillar content strategy with semantic linking',
    [
      'Define 3-5 primary content pillars based on keyword clusters',
      'Create cluster pages under each pillar (10-15 per pillar)',
      'Build internal linking maps between cluster pages',
      'Add resource and index pages at pillar level',
      'Implement topic-based URL structure',
    ],
    [
      {
        industry,
        successCount: 5,
        avgImprovement: 2.3, // Average ranking improvement
        confidence: 0.88,
        lastValidatedAt: new Date(),
      },
    ],
    {
      sourceProfileIds: [onboardingResults.id],
      validatingRunIds: [onboardingResults.metadata.runId],
      appliedCount: 5,
      successCount: 5,
      successRate: 1.0,
      typicalOutcomes: [
        '+2-3 positions average ranking',
        '+40% organic traffic in 6 months',
        'Improved internal linking authority distribution',
      ],
      commonPitfalls: [
        'Over-siloing content (too many levels)',
        'Forgetting to link resource pages',
        'Inconsistent anchor text patterns',
      ],
    }
  );

  // Extract keyword cluster pattern
  const keywordPattern = createCrossSitePatternEntry(
    'KEYWORD_CLUSTER',
    industry,
    'Semantic keyword clustering by search intent',
    [
      'Group keywords by primary search intent (info, commercial, transactional)',
      'Create sub-clusters by difficulty level',
      'Map quick-win keywords to pillar pages',
      'Reserve competitive keywords for future',
    ],
    [
      {
        industry,
        successCount: 8,
        avgImprovement: 1.8,
        confidence: 0.92,
        lastValidatedAt: new Date(),
      },
    ],
    {
      minSiteSize: 'small',
      worksBothB2BAndB2C: true,
      successRate: 0.95,
    }
  );

  // Store all patterns
  await ruvector.upsert(ONBOARDING_COLLECTIONS.CROSS_SITE_PATTERNS, [
    contentPattern,
    keywordPattern,
    // ... more patterns
  ]);

  console.log('Extracted and stored patterns for future reuse');
  return [contentPattern, keywordPattern];
}
```

---

## Query Lookups for Specific Phases

### Phase 3: Find Competitor Insights

```typescript
import {
  buildOnboardingResultsQueryString,
  isOnboardingResultsEntry,
} from './onboarding-schemas';

async function findCompetitorInsights(
  industry: string,
  competitor: string,
  ruvector: RuVectorClient
) {
  // Find previous onboardings in same industry
  // to understand competitor positioning
  const queryStr = buildOnboardingResultsQueryString({
    domain: competitor,
    industry,
    minCompletionPercent: 50, // At least partial analysis
    minConfidence: 0.7,
  });

  const results = await ruvector.search(ONBOARDING_COLLECTIONS.ONBOARDING_RESULTS, queryStr);

  if (results.length > 0 && isOnboardingResultsEntry(results[0])) {
    const insights = results[0] as OnboardingResultsEntry;

    return {
      competitorAnalyzed: true,
      keywordsFocused: insights.metadata.keywordsDiscovered,
      contentGaps: insights.metadata.contentGapsIdentified,
      technicalHealth: insights.metadata.technicalHealthScoreAtStart,
      topRecommendations: insights.metadata.topRecommendations,
      cacheReuse: 'PARTIAL', // Reuse competitor analysis
    };
  }

  return {
    competitorAnalyzed: false,
    action: 'NEW_ANALYSIS_REQUIRED',
  };
}
```

### Phase 4: Check Keyword Research Cache

```typescript
import { buildOnboardingResultsQueryString } from './onboarding-schemas';

async function checkKeywordCacheByNiche(niche: string, ruvector: RuVectorClient) {
  // Find successful keyword discoveries in same niche
  const queryStr = buildOnboardingResultsQueryString({
    domain: niche, // Use niche as lookup key
    successfulOnly: true,
    minCompletionPercent: 80,
    minConfidence: 0.85,
  });

  const results = await ruvector.search(ONBOARDING_COLLECTIONS.ONBOARDING_RESULTS, queryStr);

  if (results.length > 0) {
    const successfulRuns = results.filter((r) => isOnboardingResultsEntry(r));

    return {
      cachedKeywords: successfulRuns.reduce((sum, r) => sum + r.metadata.keywordsDiscovered, 0),
      cacheHitCount: successfulRuns.length,
      avgConfidence:
        successfulRuns.reduce((sum, r) => sum + r.metadata.overallConfidence, 0) /
        successfulRuns.length,
      recommendation: 'START_WITH_CACHED_KEYWORDS',
    };
  }

  return { cacheHitCount: 0, recommendation: 'FULL_KEYWORD_RESEARCH' };
}
```

---

## Type Guards and Validation

### Validate Entries at Runtime

```typescript
import {
  isSiteProfileEntry,
  isOnboardingResultsEntry,
  isCrossSitePatternEntry,
} from './onboarding-schemas';

function validateRuVectorEntry(entry: unknown): {
  valid: boolean;
  type?: string;
  error?: string;
} {
  if (isSiteProfileEntry(entry)) {
    return { valid: true, type: 'SiteProfile' };
  }

  if (isOnboardingResultsEntry(entry)) {
    return { valid: true, type: 'OnboardingResults' };
  }

  if (isCrossSitePatternEntry(entry)) {
    return { valid: true, type: 'CrossSitePattern' };
  }

  return {
    valid: false,
    error: 'Unknown entry type',
  };
}

// Usage
const entry = await ruvector.get(collectionName, entryId);
const validation = validateRuVectorEntry(entry);

if (validation.valid) {
  console.log(`Valid ${validation.type} entry`);
} else {
  console.error(`Invalid entry: ${validation.error}`);
}
```

---

## Freshness Management

### Check and Refresh Stale Data

```typescript
import {
  calculateFreshnessScore,
  isEntryStale,
  ONBOARDING_COLLECTION_TTL_DAYS,
} from './onboarding-schemas';

function assessDataFreshness(entry: SiteProfileEntry | OnboardingResultsEntry) {
  const ttl = ONBOARDING_COLLECTION_TTL_DAYS[entry.metadata.collection];
  const freshness = calculateFreshnessScore(entry.metadata.createdAt, ttl);

  return {
    currentScore: freshness.toFixed(2),
    isStale: isEntryStale(freshness, 0.3),
    shouldRefresh: freshness < 0.5,
    recommendation:
      freshness > 0.7
        ? 'USE_CACHED_DATA'
        : freshness > 0.3
          ? 'USE_WITH_CAUTION'
          : 'REFRESH_REQUIRED',
  };
}

// Usage
const profile = await ruvector.get(ONBOARDING_COLLECTIONS.SITE_PROFILES, 'example-com');
const freshness = assessDataFreshness(profile);

if (freshness.shouldRefresh) {
  console.log('Running fresh analysis instead of using cached data');
  // Skip cache, re-analyze
}
```

---

## ID Generation for New Entries

### Generate Consistent IDs

```typescript
import {
  generateSiteProfileId,
  generateOnboardingResultsId,
  generateCrossSitePatternId,
  normalizeForId,
} from './onboarding-schemas';

// Site profile ID (simple)
const siteProfileId = generateSiteProfileId('example.com');
// Output: "example-com"

// Onboarding results ID (with timestamp and run ID)
const resultsId = generateOnboardingResultsId('example.com', 'run-abc123', new Date());
// Output: "example-com:2025-12-03:run-abc123"

// Cross-site pattern ID (with hash)
const patternId = generateCrossSitePatternId(
  'CONTENT_STRUCTURE',
  'saas',
  'Three-pillar strategy with internal linking'
);
// Output: "content-structure:saas:a1b2c3d4"

// Normalize any string for IDs
const normalized = normalizeForId('My Blog Post About SEO!!');
// Output: "my-blog-post-about-seo"
```

---

## Complete Onboarding Integration Flow

```typescript
import {
  buildSiteProfileQueryString,
  buildCrossSitePatternQueryString,
  createSiteProfileEntry,
  createOnboardingResultsEntry,
  isSiteProfileEntry,
  isEntryStale,
  ONBOARDING_COLLECTIONS,
} from './onboarding-schemas';

async function orchestrateOnboarding(
  domain: string,
  industry: string,
  competitors: string[],
  ruvector: RuVectorClient
) {
  const runId = `run-${Date.now()}`;
  const phaseOutputs: PhaseOutput[] = [];

  console.log('Starting onboarding pipeline...');

  // Phase 0: Pre-research
  const queryStr = buildSiteProfileQueryString({ domain, minFreshnessScore: 0.7 });
  const cachedProfile = await ruvector.search(ONBOARDING_COLLECTIONS.SITE_PROFILES, queryStr);

  let skipPhase1 = false;
  if (cachedProfile.length > 0 && isSiteProfileEntry(cachedProfile[0])) {
    const profile = cachedProfile[0];
    if (!isEntryStale(profile.metadata.freshnessScore)) {
      console.log('Reusing cached site profile - skipping Phase 1');
      skipPhase1 = true;
    }
  }

  // Phase 1: Technical (or skip if cached)
  if (!skipPhase1) {
    console.log('Executing Phase 1: Technical Foundation');
    const phase1Output = await executePhase1(domain);
    phaseOutputs.push(phase1Output);

    // Store results
    const profile = createSiteProfileEntry(domain, industry, 'niche', phase1Output, metrics, crawl);
    await ruvector.upsert(ONBOARDING_COLLECTIONS.SITE_PROFILES, [profile]);
  }

  // Phases 2-7: Continue...
  // (abbreviated for example)

  // Store final results
  const finalResults = createOnboardingResultsEntry(domain, runId, industry, 'niche', phaseOutputs);
  await ruvector.upsert(ONBOARDING_COLLECTIONS.ONBOARDING_RESULTS, [finalResults]);

  console.log('Onboarding complete');
  console.log(`Stored results: ${finalResults.id}`);
  console.log(`Cost savings: $${finalResults.metadata.estimatedCostSavings}`);

  return finalResults;
}
```

---

For more details, see:
- `INDEX.md` - Complete API reference
- `onboarding-schemas.ts` - Source code
- `IMPLEMENTATION_SUMMARY.md` - Architecture overview
