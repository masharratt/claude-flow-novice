# Phase 6-7 Quick Start Guide

## Prerequisites

Before running Phase 6-7, ensure you have:

1. **Phase 1-5 outputs** stored in Redis:
   - `seo:onboarding:{taskId}:phase-1` (technical audit)
   - `seo:onboarding:{taskId}:phase-4` (keyword universe)
   - `seo:onboarding:{taskId}:phase-5` (gap analysis)
   - Optional: phase-2 (competitors), phase-3 (backlinks)

2. **RuVector collections** initialized:
   - `seo_content_patterns` (successful content strategies)
   - `seo_competitor_intelligence` (competitor analysis)

3. **Environment**:
   - Redis running and accessible
   - Node.js environment with TypeScript support

## Phase 6: Strategy Creation

### Minimal Example

```typescript
import { executePhase6 } from './lib/phases';
import Redis from 'ioredis';

const redis = new Redis();

// Mock collections for testing
const contentPatterns = {
  search: async (params) => []  // Returns ContentPatternEntry[]
};

const competitorIntelligence = {
  search: async (params) => []  // Returns CompetitorIntelligenceEntry[]
};

const result = await executePhase6({
  redis,
  contentPatterns,
  competitorIntelligence,
  taskId: 'onboard-example-com',
  siteDomain: 'example.com',
  industry: 'SaaS',
  verbose: true
});

console.log('Strategy:', result.strategy);
console.log('Confidence:', result.strategy.confidence);
```

### Full Example with Real Collections

```typescript
import { executePhase6 } from './lib/phases';
import { ContentPatternsCollection } from './lib/ruvector/collections/content-patterns';
import { CompetitorIntelligenceCollection } from './lib/ruvector/collections/competitor-intelligence';
import { initializeRuVector } from './lib/ruvector';
import Redis from 'ioredis';

// Initialize RuVector
const { collections } = await initializeRuVector();
const contentPatterns = collections.get('seo_content_patterns') as ContentPatternsCollection;
const competitorIntelligence = collections.get('seo_competitor_intelligence') as CompetitorIntelligenceCollection;

const redis = new Redis();

const result = await executePhase6({
  redis,
  contentPatterns,
  competitorIntelligence,
  taskId: 'onboard-mysite-com',
  siteDomain: 'mysite.com',
  industry: 'E-commerce',
  currentTraffic: 10000,
  targetTimelineMonths: 12,
  verbose: true
});

// Access strategy components
console.log('Content Pillars:', result.strategy.contentPillars.length);
console.log('Quick Wins:', result.strategy.quickWins.length);
console.log('6-month projection:', result.strategy.projections.sixMonth.organicTraffic);
```

### Output Structure

```typescript
{
  strategy: {
    contentPillars: [
      {
        name: "Content Marketing",
        priority: "HIGH",
        targetKeywords: ["content marketing guide", "content strategy", ...],
        trafficPotential: 15000,
        articleCount: 12,
        contentTypes: ["guide", "tutorial"]
      },
      // ... 2-4 more pillars
    ],
    quickWins: [
      {
        name: "Fix missing meta descriptions",
        type: "on-page",
        effort: 4,
        impact: 5,
        priorityScore: 1.25,
        estimatedDays: 3
      },
      // ... 9 more quick wins
    ],
    linkBuildingStrategy: {
      priorityDomains: ["authority-site.com", ...],
      tactics: [/* 5 link building tactics */],
      monthlyTargets: [/* 12 monthly targets */]
    },
    projections: {
      sixMonth: {
        organicTraffic: 25000,
        expectedRankings: { top3: 8, top10: 60, top20: 120 },
        confidence: 0.75
      },
      twelveMonth: {
        organicTraffic: 45000,
        expectedRankings: { top3: 16, top10: 144, top20: 300 },
        confidence: 0.65
      }
    },
    confidence: 0.85,
    summary: "SEO strategy focused on 5 content pillars..."
  },
  metadata: {
    processedAt: Date,
    processingTime: 4523,  // milliseconds
    patternsQueried: 18,
    patternsApplied: 5
  }
}
```

## Phase 7: Roadmap Generation

### Minimal Example

```typescript
import { executePhase7 } from './lib/phases';
import Redis from 'ioredis';

const redis = new Redis();

const result = await executePhase7({
  redis,
  taskId: 'onboard-example-com',
  siteDomain: 'example.com',
  verbose: true
});

console.log('Roadmap:', result.roadmap);
console.log('Tasks:', result.roadmap.tasks.length);
console.log('Milestones:', result.roadmap.milestones.length);
```

### With Markdown Output

```typescript
import { executePhase7 } from './lib/phases';
import Redis from 'ioredis';

const redis = new Redis();

const result = await executePhase7({
  redis,
  taskId: 'onboard-mysite-com',
  siteDomain: 'mysite.com',
  outputDir: './roadmaps',  // Optional: saves markdown file
  verbose: true
});

// Markdown saved to: ./roadmaps/seo-roadmap-mysite.com.md
console.log('Markdown preview:');
console.log(result.roadmap.markdown.substring(0, 500));
```

### Output Structure

```typescript
{
  roadmap: {
    milestones: [
      {
        month: 1,
        name: "Foundation Month",
        focus: "Foundation",
        tasks: [/* 8-12 tasks */],
        expectedImpact: "Technical foundation established...",
        deliverables: ["Technical audit completed", ...],
        successCriteria: ["Zero critical issues", ...]
      },
      // ... 5 more milestones
    ],
    tasks: [
      {
        id: "TASK-001",
        name: "Fix critical technical issues",
        type: "technical",
        priority: "CRITICAL",
        effort: 16,
        startMonth: 1,
        endMonth: 1,
        dependencies: [],
        successMetrics: ["Issue resolved", "Search Console validation"]
      },
      // ... 29-49 more tasks
    ],
    kpis: [
      {
        name: "Organic Traffic",
        metricType: "traffic",
        target: 25000,
        baseline: 10000,
        frequency: "weekly",
        targetMonth: 6
      },
      // ... 8 more KPIs
    ],
    markdown: "# SEO Roadmap: mysite.com\n\n...",
    summary: "6-month SEO roadmap with 6 milestones, 42 tasks..."
  },
  metadata: {
    processedAt: Date,
    processingTime: 1234,  // milliseconds
    totalTasks: 42,
    totalKPIs: 9
  }
}
```

## Complete Pipeline Example

```typescript
import { executePhase6, executePhase7 } from './lib/phases';
import Redis from 'ioredis';

async function runFullOnboarding(
  taskId: string,
  siteDomain: string,
  industry: string
) {
  const redis = new Redis();

  // Assume Phases 1-5 already completed and stored in Redis

  try {
    // Phase 6: Create Strategy
    console.log('[Phase 6] Creating SEO strategy...');
    const strategyResult = await executePhase6({
      redis,
      contentPatterns,      // Your RuVector collection
      competitorIntelligence, // Your RuVector collection
      taskId,
      siteDomain,
      industry,
      verbose: true
    });

    console.log(`[Phase 6] ✓ Strategy created with ${strategyResult.strategy.contentPillars.length} pillars`);
    console.log(`[Phase 6] ✓ Confidence: ${(strategyResult.strategy.confidence * 100).toFixed(0)}%`);

    // Phase 7: Generate Roadmap
    console.log('[Phase 7] Generating 6-month roadmap...');
    const roadmapResult = await executePhase7({
      redis,
      taskId,
      siteDomain,
      outputDir: './roadmaps',
      verbose: true
    });

    console.log(`[Phase 7] ✓ Roadmap created with ${roadmapResult.roadmap.tasks.length} tasks`);
    console.log(`[Phase 7] ✓ Markdown saved to ./roadmaps/seo-roadmap-${siteDomain}.md`);

    return {
      strategy: strategyResult.strategy,
      roadmap: roadmapResult.roadmap
    };

  } catch (error) {
    console.error('Onboarding failed:', error.message);
    throw error;
  } finally {
    await redis.quit();
  }
}

// Run it
runFullOnboarding(
  'onboard-acme-corp',
  'acme-corp.com',
  'B2B SaaS'
).then(result => {
  console.log('\n✓ Onboarding complete!');
  console.log('Strategy summary:', result.strategy.summary);
  console.log('Roadmap summary:', result.roadmap.summary);
});
```

## Error Handling

### Missing Prerequisites

```typescript
try {
  await executePhase6({ /* config */ });
} catch (error) {
  if (error.message.includes('Missing required phase data')) {
    console.error('Run Phases 1, 4, and 5 first!');
    // Redirect to run missing phases
  }
}

try {
  await executePhase7({ /* config */ });
} catch (error) {
  if (error.message.includes('Phase 6 strategy not found')) {
    console.error('Run Phase 6 first!');
    // Redirect to Phase 6
  }
}
```

### RuVector Query Failures

Both phases gracefully handle RuVector query failures:

```typescript
// Internal error handling - will return empty arrays and continue
async function queryContentPatterns(...) {
  try {
    const results = await collection.search(...);
    return results;
  } catch (error) {
    if (verbose) {
      console.warn('Error querying content patterns:', error);
    }
    return [];  // Continues with empty results
  }
}
```

## Testing

### Mock Collections for Testing

```typescript
// Mock content patterns collection
const mockContentPatterns = {
  search: async ({ queryText, limit, minConfidence }) => {
    return [
      {
        id: 'ANGLE:test-123',
        text: 'Test pattern',
        metadata: {
          type: 'ANGLE',
          description: 'Test content pattern',
          niche: 'SaaS',
          confidenceScore: 0.85,
          // ... other required fields
        }
      }
    ];
  }
};

// Mock competitor intelligence collection
const mockCompetitorIntel = {
  search: async ({ queryText, limit, minFreshnessScore }) => {
    return [
      {
        id: 'competitor.com:saas',
        text: 'Test competitor',
        metadata: {
          domain: 'competitor.com',
          niche: 'SaaS',
          contentGaps: [
            {
              topic: 'API documentation',
              priority: 'high',
              opportunity: 'Create comprehensive API guides'
            }
          ],
          // ... other required fields
        }
      }
    ];
  }
};
```

## Configuration Tips

### Industry Selection

Common industries:
- `"B2B SaaS"`
- `"E-commerce"`
- `"Healthcare"`
- `"Finance"`
- `"Education"`
- `"Marketing"`

Industry affects:
- RuVector pattern matching
- Traffic projection models
- Link building tactics

### Current Traffic

Provide `currentTraffic` for more accurate projections:

```typescript
currentTraffic: 5000,      // Small site
currentTraffic: 50000,     // Medium site
currentTraffic: 500000,    // Large site
```

### Timeline

Default is 12 months. Adjust for different planning horizons:

```typescript
targetTimelineMonths: 6,   // Short-term sprint
targetTimelineMonths: 12,  // Standard (default)
targetTimelineMonths: 24,  // Long-term vision
```

## Redis TTL

Both phases store data with 7-day TTL:

```
seo:onboarding:{taskId}:phase-6  (expires in 7 days)
seo:onboarding:{taskId}:phase-7  (expires in 7 days)
```

To persist beyond 7 days:

```typescript
// After executePhase6
const strategy = await redis.get(`seo:onboarding:${taskId}:phase-6`);
await redis.set(`seo:strategy:${siteDomain}`, strategy);  // No TTL

// After executePhase7
const roadmap = await redis.get(`seo:onboarding:${taskId}:phase-7`);
await redis.set(`seo:roadmap:${siteDomain}`, roadmap);  // No TTL
```

## Performance Optimization

### Parallel Execution (if independent)

```typescript
// If you have multiple sites to onboard
const sites = ['site1.com', 'site2.com', 'site3.com'];

const results = await Promise.all(
  sites.map(site =>
    executePhase6({
      redis,
      contentPatterns,
      competitorIntelligence,
      taskId: `onboard-${site.replace('.', '-')}`,
      siteDomain: site,
      industry: 'SaaS',
      verbose: false  // Reduce log noise
    })
  )
);
```

### Caching RuVector Results

```typescript
// Cache pattern queries if processing multiple similar sites
const patternCache = new Map();

async function getCachedPatterns(industry) {
  if (!patternCache.has(industry)) {
    const patterns = await contentPatterns.search({
      queryText: `Successful content strategies in ${industry}`,
      limit: 20,
      minConfidence: 0.7
    });
    patternCache.set(industry, patterns);
  }
  return patternCache.get(industry);
}
```

## Next Steps

After generating the roadmap:

1. **Review**: Share markdown with stakeholders
2. **Customize**: Adjust tasks based on team capacity
3. **Track**: Import tasks to project management tool
4. **Monitor**: Set up KPI tracking dashboards
5. **Execute**: Begin Month 1 Foundation tasks
6. **Iterate**: Re-run Phase 6-7 quarterly to adjust strategy

## Troubleshooting

**"Missing required phase data"**
→ Run Phases 1, 4, 5 first

**"Phase 6 strategy not found"**
→ Run Phase 6 before Phase 7

**Empty content pillars**
→ Check Phase 4 keyword data quality

**Low confidence scores**
→ Improve Phase 1-5 data quality or add more RuVector patterns

**No RuVector results**
→ Verify collections are initialized and contain data for your industry

## Support

For implementation questions, see:
- `PHASE_6_7_INTEGRATION.md` - Detailed integration guide
- `SPRINT_1_4_SUMMARY.md` - Complete implementation summary
- Phase source code comments - Inline documentation
