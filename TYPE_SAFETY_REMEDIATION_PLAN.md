# Type Safety Remediation Plan - Sprint 1.4

**Priority**: Medium (does not block production)
**Estimated Effort**: 4-6 hours
**Impact**: Improved type safety, IDE autocomplete, runtime validation

---

## Overview

This plan addresses the 41 unsafe type usages identified in Sprint 1.4 code. Most are concentrated in Phase 6 strategy and pattern extractor modules. The `any` types are currently guarded by defensive checks but could be eliminated with proper type definitions.

---

## Phase 1: Type Definition Extraction (1-2 hours)

### Task 1.1: Create `phase-data.ts` Type Definitions

**File**: `.claude/skills/cfn-seo-pipeline/lib/seo/types/phase-data.ts`

**Current State**:
```typescript
// phase-6-strategy.ts:409
async function loadPhaseData(redis: Redis, taskId: string, phase: string): Promise<any>
```

**Remediation**:
```typescript
/**
 * Strongly-typed phase output definitions
 * Extracted from Redis seo:onboarding:{taskId}:{phase} keys
 */

// Phase 1: Technical Foundation
export interface Phase1Data {
  pageCount: number;
  crawlDate: Date;
  coreWebVitals?: {
    pass: boolean;
    lcp: string;
    fid: string;
    cls: string;
  };
  mobileUsable?: boolean;
  sslCertificate?: boolean;
  crawlability?: { good: boolean };
  indexing?: { good: boolean };
  issues?: Array<{
    severity: 'critical' | 'high' | 'medium' | 'low';
    issue: string;
    effort?: 'high' | 'medium' | 'low';
  }>;
  recommendations?: string[];
}

// Phase 2: Content Inventory
export interface Phase2Data {
  topicsCovered?: number;
  recentUpdates?: { count: number };
  totalPages?: number;
  contentByType?: Record<string, number>;
  avgWordCount?: number;
  thinContentCount?: number;
  duplicateContentCount?: number;
  existingKeywords?: Array<{ keyword: string; pages: number; volume?: number }>;
  contentClusters?: Array<{ topic: string; pages: number }>;
  landscape?: string;
  successFactors?: string[];
}

// Phase 3: Competitor Analysis
export interface Phase3Data {
  keywordApproach?: 'broad' | 'specific' | 'question-based' | 'long-tail';
  questionKeywords?: { count: number };
  keywords?: { count: number };
  relatedNiches?: string[];
  contentPillars?: string[];
  contentTypes?: string[];
  differentiators?: Array<{
    differentiator: string;
    importance?: number;
  }>;
}

// Phase 4: Keywords & Clustering
export interface Phase4Data {
  keywords?: Array<{
    keyword: string;
    volume: number;
    difficulty: number;
    trafficPotential?: number;
    intent?: string;
    relatedKeywords?: string[];
  }>;
  clusters?: Array<{
    cluster: string;
    keywords: Array<{ keyword: string; volume: number }>;
    searchIntent?: string;
    relatedClusters?: string[];
  }>;
  topKeywords?: Array<{ keyword: string; volume: number }>;
}

// Phase 5: Gap Analysis
export interface Phase5Data {
  gaps?: Array<{
    topic: string;
    difficulty: number;
    volume: number;
    linkingCompetitors?: number;
    relatedGaps?: string[];
  }>;
  lowHangingFruit?: Array<{
    issue: string;
    severity?: string;
    effort?: string;
  }>;
}

// Union type for all phase data
export type PhaseData =
  | Phase1Data
  | Phase2Data
  | Phase3Data
  | Phase4Data
  | Phase5Data
  | null;

// Discriminated union for phase keys
export type PhaseOutputs = {
  phase1?: Phase1Data;
  phase2?: Phase2Data;
  phase3?: Phase3Data;
  phase4?: Phase4Data;
  phase5?: Phase5Data;
  domain?: string;
  niche?: string;
};

// Type predicate functions for runtime validation
export function isPhase1Data(data: unknown): data is Phase1Data {
  return (
    data !== null &&
    typeof data === 'object' &&
    'pageCount' in data &&
    typeof (data as any).pageCount === 'number'
  );
}

export function isPhase2Data(data: unknown): data is Phase2Data {
  return (
    data !== null &&
    typeof data === 'object' &&
    ('topicsCovered' in data || 'contentClusters' in data)
  );
}

export function isPhase4Data(data: unknown): data is Phase4Data {
  return (
    data !== null &&
    typeof data === 'object' &&
    ('keywords' in data || 'clusters' in data)
  );
}

export function isPhase5Data(data: unknown): data is Phase5Data {
  return (
    data !== null &&
    typeof data === 'object' &&
    'gaps' in data &&
    Array.isArray((data as any).gaps)
  );
}
```

**Impact**: Eliminates 15 instances of `any` parameter types

---

### Task 1.2: Create `keyword-data.ts` Type Definitions

**File**: `.claude/skills/cfn-seo-pipeline/lib/seo/types/keyword-data.ts`

**Remediation**:
```typescript
/**
 * Keyword and clustering type definitions
 */

export interface KeywordMetric {
  keyword: string;
  volume: number;
  difficulty: number;
  trafficPotential?: number;
  intent?: 'informational' | 'commercial' | 'transactional' | 'navigational';
  relatedKeywords?: string[];
  cpc?: number;
  trendingDirection?: 'up' | 'down' | 'stable';
}

export interface ContentGapData {
  topic: string;
  difficulty: number;
  volume: number;
  linkingCompetitors?: number;
  searchIntent?: string;
  relatedGaps?: string[];
  relevance?: number;
}

export interface KeywordCluster {
  name: string;
  keywords: KeywordMetric[];
  searchIntent: 'informational' | 'commercial' | 'transactional' | 'navigational';
  averageVolume: number;
  totalVolume: number;
  averageDifficulty: number;
  relatedClusters?: string[];
  confidence: number;
}

export type KeywordArray = KeywordMetric[] & { readonly __brand: 'KeywordArray' };

export function isKeywordMetric(obj: unknown): obj is KeywordMetric {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'keyword' in obj &&
    'volume' in obj &&
    typeof (obj as any).keyword === 'string' &&
    typeof (obj as any).volume === 'number'
  );
}

export function isKeywordArray(val: unknown): val is KeywordArray {
  return Array.isArray(val) && val.every(isKeywordMetric);
}

export function asKeywordArray(val: unknown): KeywordArray {
  if (!isKeywordArray(val)) {
    throw new TypeError('Expected array of KeywordMetric objects');
  }
  return val;
}
```

**Impact**: Eliminates 8 instances of `as any[]` type assertions

---

## Phase 2: Update Phase 6 Strategy (1.5-2 hours)

### Task 2.1: Update Function Signatures

**File**: `.claude/skills/cfn-seo-pipeline/lib/seo/lib/phases/phase-6-strategy.ts`

**Change 1: loadPhaseData function**
```typescript
// BEFORE
async function loadPhaseData(redis: Redis, taskId: string, phase: string): Promise<any> {
  const key = `seo:onboarding:${taskId}:${phase}`;
  const data = await redis.get(key);
  return data ? JSON.parse(data) : null;
}

// AFTER
import type { PhaseData, PhaseOutputs } from '../types/phase-data';

async function loadPhaseData(
  redis: Redis,
  taskId: string,
  phase: string
): Promise<PhaseData> {
  const key = `seo:onboarding:${taskId}:${phase}`;
  const data = await redis.get(key);
  if (!data) return null;

  const parsed: unknown = JSON.parse(data);

  // Runtime validation based on phase
  if (phase === 'phase-1') return isPhase1Data(parsed) ? parsed : null;
  if (phase === 'phase-2') return isPhase2Data(parsed) ? parsed : null;
  if (phase === 'phase-4') return isPhase4Data(parsed) ? parsed : null;
  if (phase === 'phase-5') return isPhase5Data(parsed) ? parsed : null;

  return null;
}
```

**Change 2: defineContentPillars function**
```typescript
// BEFORE
async function defineContentPillars(
  keywords: unknown[],
  contentGaps: any[],
  patterns: PatternApplication[],
  phase4Data: any,
  phase5Data: any,
  verbose?: boolean
): Promise<ContentPillar[]>

// AFTER
import { KeywordMetric, ContentGapData, isKeywordMetric } from '../types/keyword-data';

async function defineContentPillars(
  keywords: KeywordMetric[],
  contentGaps: ContentGapData[],
  patterns: PatternApplication[],
  phase4Data: Phase4Data | null,
  phase5Data: Phase5Data | null,
  verbose?: boolean
): Promise<ContentPillar[]>
```

**Change 3: Remove inline `as any[]` assertions**
```typescript
// BEFORE
const topClusters = Object.entries(topicClusters)
  .sort(([, a], [, b]) => (b as any[]).length - (a as any[]).length)
  .slice(0, 5);

// AFTER
const topClusters = Object.entries(topicClusters)
  .sort(([, a], [, b]) => {
    const aLen = Array.isArray(a) ? a.length : 0;
    const bLen = Array.isArray(b) ? b.length : 0;
    return bLen - aLen;
  })
  .slice(0, 5);

// Or create helper
function sortByLength(
  entries: Array<[string, unknown]>
): Array<[string, unknown]> {
  return entries.sort(([, a], [, b]) => {
    const aLen = isKeywordArray(a) ? a.length : 0;
    const bLen = isKeywordArray(b) ? b.length : 0;
    return bLen - aLen;
  });
}
```

**Change 4: Add type guards to filter operations**
```typescript
// BEFORE
.filter((gap: any) => gap.topic.toLowerCase().includes(topic.toLowerCase()))
.map((gap: any) => gap.topic);

// AFTER
.filter((gap: ContentGapData): gap is ContentGapData =>
  gap && 'topic' in gap && typeof gap.topic === 'string'
)
.map((gap) => gap.topic)
```

**Impact**: Eliminates remaining 8 instances of `any` in Phase 6

---

### Task 2.2: Update Helper Functions

**File**: `.claude/skills/cfn-seo-pipeline/lib/seo/lib/phases/phase-6-strategy.ts`

```typescript
// BEFORE
function clusterKeywordsByTopic(keywords: any[]): Record<string, any[]> {
  const clusters: Record<string, any[]> = {};
  // ...
}

// AFTER
import { KeywordMetric } from '../types/keyword-data';

function clusterKeywordsByTopic(keywords: KeywordMetric[]): Record<string, KeywordMetric[]> {
  const clusters: Record<string, KeywordMetric[]> = {};
  // ...
}

// BEFORE
async function buildTechnicalRoadmap(phase1Data: any, verbose?: boolean): Promise<TechnicalTask[]> {

// AFTER
async function buildTechnicalRoadmap(
  phase1Data: Phase1Data | null,
  verbose?: boolean
): Promise<TechnicalTask[]>
```

**Impact**: Eliminates 6 remaining `any` parameter types

---

## Phase 3: Update Pattern Extractor (1-1.5 hours)

### Task 3.1: Add Type Guards Module

**File**: `.claude/skills/cfn-seo-pipeline/lib/seo/lib/guards/pattern-guards.ts`

```typescript
/**
 * Type guard functions for pattern extraction
 */

import type { Phase1Data, Phase2Data, Phase3Data, Phase4Data } from '../types/phase-data';

export function isValidObject(data: unknown): data is Record<string, unknown> {
  return data !== null && typeof data === 'object';
}

export function hasProperty<K extends string>(
  obj: unknown,
  key: K
): obj is Record<K, unknown> {
  return isValidObject(obj) && key in obj;
}

export function getPropertyAs<T>(
  obj: unknown,
  key: string,
  validator: (val: unknown) => val is T
): T | null {
  if (!hasProperty(obj, key)) return null;
  const value = (obj as Record<string, unknown>)[key];
  return validator(value) ? (value as T) : null;
}

export function getNumericProperty(
  obj: unknown,
  key: string,
  defaultValue: number = 0
): number {
  const value = getPropertyAs(obj, key, (v) => typeof v === 'number');
  return value ?? defaultValue;
}

export function getStringProperty(
  obj: unknown,
  key: string,
  defaultValue: string = ''
): string {
  const value = getPropertyAs(obj, key, (v) => typeof v === 'string');
  return value ?? defaultValue;
}

export function getArrayProperty<T>(
  obj: unknown,
  key: string,
  validator?: (item: unknown) => item is T
): T[] {
  const value = getPropertyAs(obj, key, Array.isArray);
  if (!value) return [];
  if (!validator) return (value as unknown[]) as T[];
  return value.filter(validator);
}
```

### Task 3.2: Update Pattern Extractor Methods

```typescript
// BEFORE
private calculateTechnicalHealth(phase1: any): number {
  if (!phase1 || typeof phase1 !== 'object') return 0;
  // ...
}

// AFTER
import { getNumericProperty, hasProperty, getArrayProperty } from '../guards/pattern-guards';
import type { Phase1Data } from '../types/phase-data';

private calculateTechnicalHealth(phase1: Phase1Data | undefined): number {
  if (!phase1) return 0;

  let score = 50;
  if (phase1.coreWebVitals?.pass) score += 15;
  if (phase1.mobileUsable) score += 10;
  // ... now fully typed
}

// BEFORE
private calculateContentMaturity(phase1: any, phase2: any): number {
  if (!phase1 || !phase2) return 0;
  // ...
}

// AFTER
private calculateContentMaturity(
  phase1: Phase1Data | undefined,
  phase2: Phase2Data | undefined
): number {
  if (!phase1 || !phase2) return 0;
  // now fully typed
}
```

**Impact**: Eliminates all 23 `any` parameter types in pattern extractor

---

## Phase 4: Validation & Testing (1 hour)

### Task 4.1: Add Integration Tests

**File**: `.claude/skills/cfn-seo-pipeline/lib/seo/lib/__tests__/type-safety.test.ts`

```typescript
/**
 * Type safety validation tests for Phase 6-7
 */

import { isPhase1Data, isPhase2Data, isPhase4Data, isPhase5Data } from '../types/phase-data';
import { isKeywordMetric, isKeywordArray } from '../types/keyword-data';

describe('Phase Data Type Guards', () => {
  describe('isPhase1Data', () => {
    it('should validate complete Phase 1 data', () => {
      const data = {
        pageCount: 100,
        crawlDate: new Date(),
        coreWebVitals: { pass: true, lcp: '2.5s', fid: '50ms', cls: '0.1' },
      };
      expect(isPhase1Data(data)).toBe(true);
    });

    it('should reject invalid data', () => {
      expect(isPhase1Data(null)).toBe(false);
      expect(isPhase1Data({})).toBe(false);
      expect(isPhase1Data({ pageCount: 'invalid' })).toBe(false);
    });
  });

  describe('isKeywordMetric', () => {
    it('should validate keyword metrics', () => {
      const keyword = {
        keyword: 'seo tips',
        volume: 1000,
        difficulty: 50,
      };
      expect(isKeywordMetric(keyword)).toBe(true);
    });

    it('should reject incomplete data', () => {
      expect(isKeywordMetric({ keyword: 'seo tips' })).toBe(false);
    });
  });

  describe('isKeywordArray', () => {
    it('should validate keyword arrays', () => {
      const keywords = [
        { keyword: 'seo tips', volume: 1000, difficulty: 50 },
        { keyword: 'seo guide', volume: 800, difficulty: 45 },
      ];
      expect(isKeywordArray(keywords)).toBe(true);
    });

    it('should reject mixed arrays', () => {
      const mixed = [
        { keyword: 'seo tips', volume: 1000, difficulty: 50 },
        { keyword: 'invalid' },
      ];
      expect(isKeywordArray(mixed)).toBe(false);
    });
  });
});
```

### Task 4.2: Compile & Verify

```bash
# Run TypeScript compiler
npx tsc --noEmit --strict \
  .claude/skills/cfn-seo-pipeline/lib/seo/lib/types/phase-data.ts \
  .claude/skills/cfn-seo-pipeline/lib/seo/lib/types/keyword-data.ts \
  .claude/skills/cfn-seo-pipeline/lib/seo/lib/guards/pattern-guards.ts

# Run tests
npm test -- --testPathPattern=type-safety

# Verify no regressions
npm run test:integration -- seo-pipeline
```

---

## Phase 5: Documentation Update (30 minutes)

### Task 5.1: Update TypeScript Documentation

**File**: `.claude/skills/cfn-seo-pipeline/lib/seo/TYPESCRIPT_GUIDE.md`

```markdown
# TypeScript Type Safety Guide - SEO Pipeline

## Type Definition Modules

### Phase Data Types (`types/phase-data.ts`)
Defines strongly-typed interfaces for each phase's output:
- `Phase1Data`: Technical foundation data
- `Phase2Data`: Content inventory data
- `Phase3Data`: Competitor analysis data
- `Phase4Data`: Keyword universe data
- `Phase5Data`: Gap analysis data

**Usage**:
```typescript
import type { Phase1Data } from './types/phase-data';
import { isPhase1Data } from './types/phase-data';

const data = await loadPhaseData(redis, taskId, 'phase-1');
if (isPhase1Data(data)) {
  // data is now Phase1Data, not unknown
  console.log(data.pageCount); // No type errors
}
```

### Keyword Data Types (`types/keyword-data.ts`)
Strongly-typed keyword metrics and clustering:
- `KeywordMetric`: Individual keyword with metrics
- `ContentGapData`: Gap analysis entry
- `KeywordCluster`: Grouped keywords by intent

### Pattern Guards (`guards/pattern-guards.ts`)
Reusable type guard utilities for safe data access:
- `isValidObject()`: Basic object validation
- `getPropertyAs<T>()`: Type-safe property access
- `getNumericProperty()`: Safe numeric extraction
- `getArrayProperty<T>()`: Safe array extraction

**Usage**:
```typescript
import { getNumericProperty, getArrayProperty } from './guards/pattern-guards';

const pageCount = getNumericProperty(phase1Data, 'pageCount', 0);
const issues = getArrayProperty(phase1Data, 'issues', isIssue);
```

## Best Practices

1. **Always use type predicates for runtime validation**
   - Never use `as any` for type assertions
   - Always validate before casting

2. **Prefer explicit types over inferred types**
   - All function parameters should have explicit types
   - All function returns should have explicit return types

3. **Use discriminated unions for related types**
   - Phase data should be discriminated by phase number
   - Error types should be discriminated by error code

4. **Document type contracts clearly**
   - Add JSDoc to all exported types
   - Include examples of valid data
```

---

## Implementation Checklist

### Phase 1: Type Definitions
- [ ] Create `types/phase-data.ts` with all phase interfaces
- [ ] Create `types/keyword-data.ts` with keyword types
- [ ] Add type predicates for runtime validation
- [ ] Export all types from `types/index.ts`

### Phase 2: Phase 6 Updates
- [ ] Update `loadPhaseData` return type
- [ ] Update `defineContentPillars` parameters
- [ ] Replace `as any[]` assertions with type guards
- [ ] Update helper function signatures
- [ ] Verify compilation

### Phase 3: Pattern Extractor Updates
- [ ] Create `guards/pattern-guards.ts`
- [ ] Update all `calculateTechnicalHealth` parameters
- [ ] Update all `calculateContentMaturity` parameters
- [ ] Replace defensive checks with type predicates
- [ ] Verify compilation

### Phase 4: Testing
- [ ] Add type guard tests
- [ ] Add integration tests
- [ ] Run full test suite
- [ ] Verify no regressions

### Phase 5: Documentation
- [ ] Update TypeScript guide
- [ ] Add usage examples
- [ ] Update sprint summary
- [ ] Create migration guide if needed

---

## Estimated Timeline

| Phase | Task | Hours | Priority |
|-------|------|-------|----------|
| 1 | Type definition extraction | 1-2 | High |
| 2 | Phase 6 strategy updates | 1.5-2 | High |
| 3 | Pattern extractor updates | 1-1.5 | High |
| 4 | Validation & testing | 1 | Medium |
| 5 | Documentation | 0.5 | Low |
| | **Total** | **5-7** | |

---

## Rollout Strategy

1. **Create new types in feature branch**
2. **Update Phase 6 & Pattern Extractor gradually**
3. **Run tests after each module update**
4. **Create single PR for all changes**
5. **Include before/after type checking output**
6. **Document breaking changes (none expected)**

---

## Success Criteria

- [ ] Zero `any` types in Phase 6-7 code
- [ ] Zero type assertions (`as` keyword usage)
- [ ] 100% type coverage for public APIs
- [ ] All tests passing
- [ ] No runtime errors from type issues
- [ ] Improved IDE autocomplete suggestions
- [ ] Better error messages from TypeScript compiler

---

**Plan Owner**: TypeScript Specialist
**Status**: Ready for Implementation
**Next Steps**: Schedule implementation with development team
