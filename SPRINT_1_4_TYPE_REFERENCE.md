# Sprint 1.4 TypeScript Type Reference Guide

Quick reference for key type definitions and patterns in Phase 6-7 implementation.

---

## Core Interfaces Quick Reference

### Phase 6: Strategy Creation

#### Phase6Config (Entry Point)
```typescript
export interface Phase6Config {
  redis: Redis;                                    // Redis client
  contentPatterns: ContentPatternsCollection;     // RuVector patterns
  competitorIntelligence: CompetitorIntelligenceCollection; // RuVector intelligence
  taskId: string;                                 // Namespacing
  verbose?: boolean;                              // Logging
  siteDomain: string;                             // Subject site
  industry: string;                               // Industry context
  currentTraffic?: number;                        // Current monthly traffic
  targetTimelineMonths?: number;                  // Growth timeline
}
```

#### SEOStrategy (Phase 6 Output)
```typescript
export interface SEOStrategy {
  contentPillars: ContentPillar[];               // 3-5 main content areas
  quickWins: QuickWin[];                         // 10 high-impact opportunities
  competitiveAdvantages: CompetitiveAdvantage[]; // 8 strategic moats
  linkStrategy: LinkStrategy;                     // Backlink acquisition plan
  technicalRoadmap: TechnicalTask[];             // Prioritized fixes
  trafficProjections: TrafficProjection[];        // 12-month growth curve
  patternApplications: PatternApplication[];      // RuVector intelligence applied
  overallConfidence: number;                      // 0.70-0.95 range
  summary: string;                                // Executive summary
}
```

#### ContentPillar (Content Strategy)
```typescript
export interface ContentPillar {
  name: string;                           // Topic name
  description: string;                    // Pillar description
  priority: 'HIGH' | 'MEDIUM' | 'LOW';   // Strategic priority
  targetKeywords: string[];               // Top 10 keywords
  trafficPotential: number;               // Estimated annual traffic
  articleCount: number;                   // Content pieces needed
  patternSource?: string;                 // RuVector pattern ID
  relatedGaps: string[];                  // From Phase 5
  contentTypes: string[];                 // Blog, guide, tool, etc.
}
```

#### QuickWin (Fast Wins)
```typescript
export interface QuickWin {
  name: string;                      // Opportunity name
  description: string;               // How it works
  effort: number;                    // 1-10 effort scale
  impact: number;                    // 1-10 impact scale
  priorityScore: number;             // impact / effort
  type: 'technical' | 'content' | 'on-page' | 'backlink';
  steps: string[];                   // Implementation steps
  estimatedDays: number;             // Timeline
  expectedLift?: number;             // Traffic impact
}
```

---

### Phase 7: Roadmap Generation

#### Phase7Config (Entry Point)
```typescript
export interface Phase7Config {
  redis: Redis;                          // Redis client
  taskId: string;                        // Same taskId from Phase 6
  verbose?: boolean;                     // Logging
  siteDomain: string;                    // Subject site
  outputDir?: string;                    // Optional markdown output
}
```

#### SEORoadmap (Phase 7 Output)
```typescript
export interface SEORoadmap {
  milestones: Milestone[];              // 6 monthly checkpoints
  tasks: Task[];                        // 30-50 actionable tasks
  kpis: KPI[];                          // 9 key performance indicators
  dependencies: Dependency[];            // Task dependencies
  markdown: string;                      // Human-readable document
  summary: string;                       // Roadmap overview
}
```

#### Task (Roadmap Item)
```typescript
export interface Task {
  id: string;                           // Unique identifier
  name: string;                         // Task name
  description: string;                  // Detailed description
  type: 'technical' | 'content' | 'link-building' | 'analytics' | 'optimization';
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  effort: number;                       // Hours to complete
  impact: string;                       // Expected outcome
  startMonth: number;                   // When to start (1-6)
  endMonth: number;                     // When to complete
  dependencies: string[];               // Task IDs that must complete first
  assignedTo?: string;                  // Owner
  successMetrics: string[];             // Measurable outcomes
  status: 'pending' | 'in-progress' | 'completed';
}
```

#### KPI (Key Performance Indicator)
```typescript
export interface KPI {
  name: string;                               // KPI name
  description: string;                        // What it measures
  metricType: 'traffic' | 'rankings' | 'conversions' | 'engagement' | 'technical';
  target: number;                             // Goal value
  baseline: number;                           // Current value
  frequency: 'daily' | 'weekly' | 'monthly'; // Check frequency
  targetMonth: number;                        // When to achieve (1-6)
}
```

#### Milestone (Monthly Checkpoint)
```typescript
export interface Milestone {
  month: number;                       // 1-6
  name: string;                        // Foundation, Content Launch, etc.
  description: string;                 // What defines success
  taskCount: number;                   // Tasks due this month
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  expectedImpact: string;              // Outcomes
}
```

---

## Pattern Extraction Types

### PatternExtractor Class

```typescript
export class PatternExtractor {
  // Constructor with optional config
  constructor(options?: {
    verbose?: boolean;
    minConfidenceThreshold?: number;
  });

  // Dependency injection
  setContentPatternsCollection(collection: ContentPatternsCollection): void;

  // Core extraction methods
  extractSiteProfilePattern(phaseOutputs: {
    phase1?: Record<string, unknown>;
    phase2?: Record<string, unknown>;
    domain: string;
    niche: string;
  }): SiteProfilePattern;

  extractContentStrategyPattern(phaseOutputs: {
    phase3?: Record<string, unknown>;
    phase4?: Record<string, unknown>;
    niche: string;
  }): ContentStrategyPattern;

  extractCompetitorPattern(phaseOutputs: {
    phase2_5?: Record<string, unknown>;
  }): CompetitorPattern;

  extractKeywordClusterPatterns(phaseOutputs: {
    phase1?: Record<string, unknown>;
    phase3?: Record<string, unknown>;
  }): KeywordClusterPattern[];

  // Storage method
  async storePatterns(
    patterns: ExtractedPatterns,
    metadata: PatternMetadata
  ): Promise<string[]>;
}
```

### Pattern Interfaces

#### SiteProfilePattern
```typescript
export interface SiteProfilePattern {
  industry: string;
  siteSize: 'small' | 'medium' | 'large' | 'enterprise';
  technicalHealth: number;      // 0-100
  contentMaturity: number;      // 0-100
  competitiveLandscape: string;
  successFactors: string[];
  confidence: number;           // 0.0-1.0
  metadata: {
    domain: string;
    crawlDate: Date;
    pageCount: number;
    averageLoadTime: number;
  };
}
```

#### ContentStrategyPattern
```typescript
export interface ContentStrategyPattern {
  pillars: string[];
  keywordApproach: 'broad' | 'specific' | 'question-based' | 'long-tail';
  contentTypes: string[];
  publishingFrequency: 'daily' | 'weekly' | 'bi-weekly' | 'monthly';
  successMetrics: {
    averageTrafficGrowth: number;
    averageRankingImprovement: number;
    averageCTRLift: number;
    targetTopicsCount: number;
  };
  applicableIndustries: string[];
  confidence: number;
  structureGuidance: {
    recommendedWordCount: number;
    recommendedHeadingLevels: number;
    recommendedSectionCount: number;
    recommendedMediaInclusion: string[];
  };
}
```

#### KeywordClusterPattern
```typescript
export interface KeywordClusterPattern {
  cluster: string;              // Cluster name
  keywords: string[];           // Member keywords
  searchIntent: string;         // Semantic intent
  performanceMetrics: {
    averageVolume: number;
    averageDifficulty: number;
    totalPotential: number;
  };
  relatedClusters?: string[];
  recommendations: string[];
  confidence: number;
}
```

---

## Type Guard Patterns

### Common Pattern Checks

```typescript
// Check if object
if (!data || typeof data !== 'object') return null;

// Check if array
if (!Array.isArray(keywords)) return [];

// Check array content
if (!keywords.every((k) => typeof k === 'string')) return [];

// Optional chaining
const count = phase1?.pageCount || 0;

// Property existence
if ('topic' in gap && typeof gap.topic === 'string') {
  // gap.topic is definitely string here
}

// Array filter with type predicate
const validGaps = gaps.filter((gap): gap is ContentGapData =>
  gap && typeof gap === 'object' && 'topic' in gap
);

// Safe type access
const value = phase2?.successFactors as string[] | undefined;
const safe = Array.isArray(value) ? value : [];
```

---

## Function Signatures (Public APIs)

### Phase 6 Main Export
```typescript
export async function executePhase6(
  config: Phase6Config
): Promise<Phase6Result> {
  // Implementation
  return {
    strategy: SEOStrategy,
    metadata: {
      processedAt: Date,
      phaseVersion: string,
      processingTime: number,
      confidenceScore: number,
      patternsApplied: number,
    },
  };
}
```

### Phase 7 Main Export
```typescript
export async function executePhase7(
  config: Phase7Config
): Promise<Phase7Result> {
  // Implementation
  return {
    roadmap: SEORoadmap,
    metadata: {
      processedAt: Date,
      phaseVersion: string,
      processingTime: number,
      totalTasks: number,
      totalKPIs: number,
    },
  };
}
```

### Pattern Extractor Usage
```typescript
const extractor = new PatternExtractor({ verbose: true });
extractor.setContentPatternsCollection(collection);

const siteProfile = extractor.extractSiteProfilePattern({
  phase1: data.phase1,
  phase2: data.phase2,
  domain: 'example.com',
  niche: 'SaaS',
});

const strategy = extractor.extractContentStrategyPattern({
  phase3: data.phase3,
  phase4: data.phase4,
  niche: 'SaaS',
});

const patterns: ExtractedPatterns = {
  siteProfile,
  contentStrategy: strategy,
  // ... other patterns
};

const ids = await extractor.storePatterns(patterns, {
  niche: 'SaaS',
  siteSize: 'small',
  timestamp: Date.now(),
  version: '1.0',
});
```

---

## Data Flow Type Safety

### Phase 6 Complete Flow
```typescript
// 1. Load configuration (typed)
const config: Phase6Config = { /* ... */ };

// 2. Load previous phases (with type guards)
const phase4Data = await loadPhaseData(redis, taskId, 'phase-4');
if (!phase4Data) throw new Error('Phase 4 required');

const phase5Data = await loadPhaseData(redis, taskId, 'phase-5');
if (!phase5Data) throw new Error('Phase 5 required');

// 3. Query RuVector (typed return)
const patterns: ContentPatternEntry[] = await config
  .contentPatterns.search({
    queryText: `Strategies in ${config.industry}`,
    limit: 20,
    minConfidence: 0.7,
  });

// 4. Create strategy (typed structure)
const strategy: SEOStrategy = {
  contentPillars: pillars,    // ContentPillar[]
  quickWins: wins,            // QuickWin[]
  competitiveAdvantages: advs, // CompetitiveAdvantage[]
  linkStrategy: links,        // LinkStrategy
  technicalRoadmap: tasks,    // TechnicalTask[]
  trafficProjections: proj,   // TrafficProjection[]
  patternApplications: apps,  // PatternApplication[]
  overallConfidence: 0.82,    // number (0-1)
  summary: text,              // string
};

// 5. Store result (typed)
const result: Phase6Result = {
  strategy,
  metadata: {
    processedAt: new Date(),
    phaseVersion: '1.0',
    processingTime: elapsed,
    confidenceScore: 0.82,
    patternsApplied: appliedCount,
  },
};

await redis.set(
  `seo:onboarding:${taskId}:phase-6`,
  JSON.stringify(result),
  'EX',
  7 * 24 * 3600
);
```

### Phase 7 Complete Flow
```typescript
// 1. Load configuration (typed)
const config: Phase7Config = { /* ... */ };

// 2. Load Phase 6 strategy (with validation)
const strategyData = await redis.get(`seo:onboarding:${taskId}:phase-6`);
const strategy: SEOStrategy = JSON.parse(strategyData);

// 3. Generate tasks (typed collection)
const tasks: Task[] = await generateTasks(strategy, config.verbose);

// 4. Define KPIs (typed)
const kpis: KPI[] = await defineKPIs(strategy, config.verbose);

// 5. Create milestones (typed)
const milestones: Milestone[] = await createMilestones(
  tasks,
  strategy,
  config.verbose
);

// 6. Generate markdown (string output)
const markdown: string = generateMarkdown(
  config.siteDomain,
  milestones,
  tasks,
  kpis,
  strategy
);

// 7. Create roadmap (typed)
const roadmap: SEORoadmap = {
  milestones,
  tasks,
  kpis,
  dependencies,
  markdown,
  summary: generateRoadmapSummary(milestones, tasks, kpis),
};

// 8. Return result (typed)
const result: Phase7Result = {
  roadmap,
  metadata: {
    processedAt: new Date(),
    phaseVersion: '1.0',
    processingTime: elapsed,
    totalTasks: tasks.length,
    totalKPIs: kpis.length,
  },
};
```

---

## Type Safety Checklist

### Before Using Phase 6
- [ ] Redis client configured
- [ ] ContentPatternsCollection available
- [ ] CompetitorIntelligenceCollection available
- [ ] taskId set correctly
- [ ] siteDomain provided
- [ ] industry specified

### Before Using Phase 7
- [ ] Phase 6 completed and stored in Redis
- [ ] taskId matches Phase 6
- [ ] Redis accessible
- [ ] Optional: output directory exists for markdown

### Pattern Extractor Setup
- [ ] ContentPatternsCollection injected
- [ ] Phase data available from previous phases
- [ ] domain and niche provided
- [ ] verbose flag set (optional)
- [ ] minConfidenceThreshold acceptable (default 0.6)

---

## Common Type Errors & Fixes

### Error: Type is undefined
```typescript
// ❌ Wrong
function process(data: any) {
  return data.field; // Type error possible
}

// ✅ Right
interface Data { field: string }
function process(data: Data) {
  return data.field; // Type safe
}
```

### Error: Cannot assign to Property
```typescript
// ❌ Wrong
const config: Phase6Config = {
  redis: client,
  // Missing required fields
};

// ✅ Right
const config: Phase6Config = {
  redis: client,
  contentPatterns: collection,
  competitorIntelligence: intelligence,
  taskId: 'task-123',
  siteDomain: 'example.com',
  industry: 'SaaS',
};
```

### Error: Object is possibly undefined
```typescript
// ❌ Wrong
const count = data.phase1.pageCount; // Could be undefined

// ✅ Right
const count = data.phase1?.pageCount ?? 0;

// ✅ Also Right
if (data.phase1) {
  const count = data.phase1.pageCount;
}
```

---

## Recommended IDE Configuration

### TypeScript Settings (tsconfig.json)
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "noImplicitThis": true,
    "alwaysStrict": true
  }
}
```

### VS Code Settings
```json
{
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.formatOnSave": true,
    "editor.codeActionsOnSave": {
      "source.fixAll.eslint": true
    }
  }
}
```

---

## Links to Files

### Main Implementation Files
- Phase 6: `.claude/skills/cfn-seo-pipeline/lib/seo/lib/phases/phase-6-strategy.ts`
- Phase 7: `.claude/skills/cfn-seo-pipeline/lib/seo/lib/phases/phase-7-roadmap.ts`
- Pattern Extractor: `.claude/skills/cfn-seo-pipeline/lib/seo/lib/ruvector/pattern-extractor.ts`
- Strategy Document: `.claude/skills/cfn-seo-pipeline/lib/seo/lib/output/strategy-document.ts`

### Documentation
- Type Verification: `TYPESCRIPT_VERIFICATION_SPRINT_1_4.md`
- Remediation Plan: `TYPE_SAFETY_REMEDIATION_PLAN.md`
- Executive Summary: `SPRINT_1_4_TYPE_SAFETY_SUMMARY.md`

---

**Last Updated**: 2025-12-03
**Status**: Production Ready
