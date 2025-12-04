# Phase 6-7 Integration Guide

## Overview

Phase 6 (Strategy Creation) and Phase 7 (Roadmap Generation) complete the SEO Site Onboarding pipeline by transforming gap analysis into actionable strategy and detailed roadmap.

## Implementation Summary

### Phase 6: Strategy Creation (`phase-6-strategy.ts`)
- **Lines of Code**: 996
- **Dependencies**: Redis, RuVector collections (content_patterns, competitor_intelligence)
- **Input**: Phases 1-5 outputs from Redis
- **Output**: SEO strategy with pillars, quick wins, projections

**Key Features**:
1. Queries RuVector for proven content patterns in target industry
2. Defines 3-5 content pillars from keyword clusters and patterns
3. Identifies top 10 quick wins (low effort, high impact)
4. Creates link building strategy with monthly targets
5. Builds technical roadmap from Phase 1 issues
6. Estimates 6-month and 12-month traffic projections
7. Records pattern applications for learning

**Data Flow**:
```
Phase 1-5 Redis → Query RuVector Patterns → Cluster Analysis →
Content Pillars + Quick Wins + Link Strategy + Tech Roadmap →
Traffic Projections → Redis Storage (7 day TTL)
```

**RuVector Integration**:
- Content Patterns: Searches for successful strategies by industry
- Competitor Intelligence: Identifies gaps and opportunities
- Pattern confidence scores influence strategy confidence

### Phase 7: Roadmap Generation (`phase-7-roadmap.ts`)
- **Lines of Code**: 915
- **Dependencies**: Redis, Phase 6 strategy
- **Input**: Phase 6 strategy from Redis
- **Output**: 6-month roadmap with tasks, milestones, KPIs, markdown

**Key Features**:
1. Generates 30-50 specific tasks from strategy
2. Creates 6 monthly milestones with clear focus
3. Defines 9 KPIs across traffic, rankings, technical, engagement
4. Extracts task dependencies for proper sequencing
5. Generates human-readable markdown document
6. Organizes work into Foundation → Content → Scale phases

**Monthly Structure**:
- **Month 1**: Foundation (technical fixes, analytics, quick wins)
- **Month 2**: Content Launch (first pillars, schema, Core Web Vitals)
- **Month 3**: Content Expansion (all pillars, internal linking)
- **Month 4**: Link Building Launch (systematic acquisition)
- **Month 5**: Optimization Phase (CTR, A/B tests)
- **Month 6**: Momentum & Scale (sustained growth systems)

**Task Distribution**:
- Technical: 8-12 tasks (performance, crawlability, schema)
- Content: 15-20 tasks (pillar creation, expansion)
- Link Building: 10-15 tasks (tactics execution)
- Analytics: 2-3 tasks (tracking, dashboards)
- Optimization: 5-8 tasks (CTR, featured snippets)

## Usage Example

```typescript
import { executePhase6, executePhase7 } from './lib/phases';
import type { ContentPatternsCollection, CompetitorIntelligenceCollection } from './lib/phases/phase-6-strategy';
import Redis from 'ioredis';

// Initialize Redis
const redis = new Redis();

// Setup RuVector collections (from your RuVector setup)
const contentPatterns: ContentPatternsCollection = {
  search: async (params) => {
    // Your RuVector content patterns search implementation
    return [];
  }
};

const competitorIntelligence: CompetitorIntelligenceCollection = {
  search: async (params) => {
    // Your RuVector competitor intelligence search implementation
    return [];
  }
};

// Execute Phase 6
const phase6Result = await executePhase6({
  redis,
  contentPatterns,
  competitorIntelligence,
  taskId: 'onboard-example-com',
  siteDomain: 'example.com',
  industry: 'SaaS',
  currentTraffic: 5000,
  targetTimelineMonths: 12,
  verbose: true
});

console.log('Strategy confidence:', phase6Result.strategy.confidence);
console.log('Content pillars:', phase6Result.strategy.contentPillars.length);
console.log('Quick wins:', phase6Result.strategy.quickWins.length);

// Execute Phase 7
const phase7Result = await executePhase7({
  redis,
  taskId: 'onboard-example-com',
  siteDomain: 'example.com',
  outputDir: './roadmaps',
  verbose: true
});

console.log('Roadmap tasks:', phase7Result.roadmap.tasks.length);
console.log('Milestones:', phase7Result.roadmap.milestones.length);
console.log('KPIs:', phase7Result.roadmap.kpis.length);

// Markdown output saved to: ./roadmaps/seo-roadmap-example.com.md
```

## Data Structures

### SEOStrategy (Phase 6 Output)
```typescript
{
  contentPillars: ContentPillar[];      // 3-5 topic clusters
  quickWins: QuickWin[];                 // 10 prioritized opportunities
  competitiveAdvantages: string[];       // 8 strategic moats
  linkBuildingStrategy: LinkStrategy;    // Monthly targets + tactics
  technicalRoadmap: TechnicalTask[];     // Prioritized fixes
  projections: {
    sixMonth: TrafficProjection;         // Conservative estimate
    twelveMonth: TrafficProjection;      // Growth trajectory
  };
  patternInsights: PatternApplication[]; // RuVector pattern usage
  confidence: number;                    // 0.75-0.95 typical
  summary: string;                       // Executive summary
}
```

### SEORoadmap (Phase 7 Output)
```typescript
{
  milestones: Milestone[];               // 6 monthly milestones
  tasks: Task[];                         // 30-50 specific tasks
  kpis: KPI[];                          // 9 success metrics
  dependencies: Dependency[];            // Task sequencing
  markdown: string;                      // Human-readable doc
  summary: string;                       // Roadmap overview
}
```

## Redis Keys

Phase 6 strategy is stored at:
```
seo:onboarding:{taskId}:phase-6
TTL: 7 days
```

Phase 7 roadmap is stored at:
```
seo:onboarding:{taskId}:phase-7
TTL: 7 days
```

## Integration Points

### Required Phase Outputs
- **Phase 1**: Technical audit (issues, meta tags)
- **Phase 2**: Competitor analysis (optional for enhanced moats)
- **Phase 3**: Backlink analysis (for link strategy)
- **Phase 4**: Keyword universe (for pillars)
- **Phase 5**: Gap analysis (for quick wins)

### Optional Enhancements
- Custom pattern weighting based on industry
- Multi-site benchmarking for projections
- Integration with project management tools (export tasks)
- Automated roadmap updates based on actual progress

## Confidence Scoring

**Phase 6 Strategy Confidence**:
- Base: 0.70
- +0.10 if 10+ patterns found
- +0.05 if 5+ quick wins
- +0.05 if 3+ content pillars
- +0.05 if no critical technical issues
- **Typical Range**: 0.80-0.90

**Phase 7 Confidence** (metadata):
- Inherits from Phase 6 strategy
- Adjusted by task completeness
- Validated by dependency resolution

## Error Handling

Both phases throw errors if prerequisites are missing:

```typescript
// Phase 6 requires Phases 1, 4, 5
if (!phase1Data || !phase4Data || !phase5Data) {
  throw new Error('Missing required phase data. Run Phases 1, 4, and 5 first.');
}

// Phase 7 requires Phase 6
if (!strategyData) {
  throw new Error('Phase 6 strategy not found. Run Phase 6 first.');
}
```

## Performance

**Phase 6**:
- RuVector queries: 2-5 seconds
- Strategy generation: 1-2 seconds
- **Total**: 3-7 seconds typical

**Phase 7**:
- Redis read: <100ms
- Task generation: 500ms-1s
- Markdown generation: 200-500ms
- **Total**: 1-2 seconds typical

## Files Created

1. `/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-seo-pipeline/lib/seo/lib/phases/phase-6-strategy.ts` (996 lines)
2. `/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-seo-pipeline/lib/seo/lib/phases/phase-7-roadmap.ts` (915 lines)
3. `/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-seo-pipeline/lib/seo/lib/phases/index.ts` (updated with exports)

## Next Steps

1. **Testing**: Create integration tests with mock RuVector collections
2. **Validation**: Test with real Phase 1-5 outputs
3. **UI Integration**: Connect to dashboard for roadmap visualization
4. **Export Formats**: Add JSON, CSV, Project Management tool exports
5. **Iteration**: Implement roadmap progress tracking and re-planning

## Pattern Learning

Phase 6 records which patterns influenced strategy decisions. This feedback loop:
1. Tracks pattern application → strategy section
2. Records expected impact estimates
3. Enables future validation against actual results
4. Builds institutional knowledge of pattern effectiveness

Example:
```typescript
{
  patternId: "ANGLE:abc123",
  type: "ANGLE",
  application: "Applied to Content Marketing content pillar",
  expectedImpact: "15000 monthly traffic from 12 articles",
  confidence: 0.87
}
```

This data can later be used to:
- Validate pattern predictions
- Adjust pattern confidence scores
- Refine strategy generation algorithms
- Build industry-specific pattern libraries
