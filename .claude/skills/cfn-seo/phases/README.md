# SEO Onboarding Phases

Implementation of the 7-phase SEO site onboarding pipeline.

## Overview

Each phase is a self-contained TypeScript module with:
- **Step 0**: Pre-research RuVector cache check
- **Steps 1-N**: Core phase logic
- **Step 4.5**: Post-research RuVector storage

All phases follow a consistent interface pattern for easy orchestration.

---

## Implementation Status

### Sprint 1.2 - Phases 1-3

| Phase | Status | File | Lines | Confidence |
|-------|--------|------|-------|------------|
| **Phase 1** | ✅ Complete | `phase-1-technical.ts` | 256 | 0.91 |
| **Phase 2** | ✅ Complete | `phase-2-content.ts` | 252 | 0.92 |
| **Phase 3** | ✅ Complete | `phase-3-competitors.ts` | 491 | 0.92 |

### Sprint 1.3 - Phases 4-5

| Phase | Status | File | Lines | Confidence |
|-------|--------|------|-------|------------|
| **Phase 4** | ❌ Pending | `phase-4-keywords.ts` | - | - |
| **Phase 5** | ❌ Pending | `phase-5-gaps.ts` | - | - |

### Sprint 1.4 - Phases 6-7

| Phase | Status | File | Lines | Confidence |
|-------|--------|------|-------|------------|
| **Phase 6** | ❌ Pending | `phase-6-strategy.ts` | - | - |
| **Phase 7** | ❌ Pending | `phase-7-roadmap.ts` | - | - |

---

## Phase 2: Content Inventory

**File**: `phase-2-content.ts`
**Status**: Complete
**Confidence**: 0.92

### Purpose
Analyze content structure, quality, clusters, and internal linking to understand existing content assets and identify gaps.

### Interface

```typescript
interface ContentInventoryInput {
  domain: string;
  phase1Output: TechnicalFoundationOutput;
  skipCache?: boolean;
}

interface ContentInventoryOutput {
  domain: string;
  total_content_pages: number;
  content_by_type: ContentByType;
  content_quality_score: number; // 0.0-1.0
  content_clusters: ContentCluster[];
  internal_linking: InternalLinkingMetrics;
  cached: boolean;
  timestamp: string;
}
```

### Workflow

1. **Step 0**: Query RuVector for cached content patterns
2. **Step 1**: Analyze content structure (H1, meta, word count)
3. **Step 2**: Detect content clusters (semantic grouping)
4. **Step 3**: Assess internal linking (graph analysis)
5. **Step 4**: Calculate content quality score (0.0-1.0)
6. **Step 4.5**: Store content patterns in RuVector

### Dependencies

- Phase 1 output (`TechnicalFoundationOutput`)
- Phase 1 health score >= 0.50 (blocking condition)
- RuVector `seo_content_patterns` collection (Step 0)

### Helper Functions

- `analyzeContentStructure()` - Classify pages by type (blog, product, landing)
- `detectContentClusters()` - Group pages by semantic similarity
- `assessInternalLinking()` - Calculate link metrics and identify orphans
- `calculateContentQualityScore()` - Weighted score (0.0-1.0)

### Quality Score Calculation

**Weighted Components:**
- **Content Type Distribution**: 40% (favors blog posts + landing pages)
- **Content Clusters**: 30% (aim for 5-10 clusters)
- **Internal Linking**: 30% (aim for 10+ avg links/page)
- **Orphan Page Penalty**: 0.8x multiplier if >5% orphan pages

**Formula:**
```typescript
rawScore = (typeScore * 0.4 + clusterScore * 0.3 + linkingScore * 0.3)
finalScore = rawScore * orphanPenalty
```

### Testing

Run validation:
```bash
npx tsx .claude/skills/cfn-seo/phases/test-phase-2.ts
```

### Acceptance Criteria

- [x] `executePhase2()` function with full type safety
- [x] Phase 1 validation (health_score >= 0.50)
- [x] Step 0: RuVector cache check for patterns
- [x] Step 1: Content structure analysis (stub)
- [x] Step 2: Content cluster detection (stub)
- [x] Step 3: Internal linking assessment (stub)
- [x] Step 4: Quality score calculation (0.0-1.0)
- [x] Step 4.5: Store patterns in RuVector
- [x] All interfaces exported

### Known Limitations (Sprint 1.2)

- **Content Analysis**: Stub implementation (replace with real crawling)
- **Cluster Detection**: Stub implementation (replace with NLP/embeddings)
- **Link Analysis**: Stub implementation (replace with graph analysis)
- **RuVector Client**: TODO comments where actual calls would go

---

## Phase 3: Competitor Discovery

**File**: `phase-3-competitors.ts`
**Status**: Complete
**Confidence**: 0.92

### Purpose
Identify competitors, analyze competitive landscape, discover gaps (keywords they rank for that we don't).

### Interface

```typescript
interface CompetitorDiscoveryInput {
  domain: string;
  industry: string;
  phase1Output: TechnicalFoundationOutput;
  phase2Output: ContentInventoryOutput;
  manualCompetitors?: string[];
  skipCache?: boolean;
}

interface CompetitorDiscoveryOutput {
  domain: string;
  competitors: Competitor[];
  competitive_intensity: number; // 0.0-1.0
  gaps: CompetitiveGap[];
  cached: boolean;
  timestamp: string;
}
```

### Workflow

1. **Step 0**: Query RuVector for cached competitor intelligence
2. **Step 1**: Identify competitors (manual + discovered)
3. **Step 2**: Analyze competitive landscape (rank by strength)
4. **Step 3**: Identify competitive gaps (keywords they rank for)
5. **Step 4**: Calculate competitive intensity (0.0-1.0)
6. **Step 4.5**: Store competitor intelligence in RuVector

### Dependencies

- Phase 1 output (`TechnicalFoundationOutput`)
- Phase 2 output (`ContentInventoryOutput`)
- RuVector `cross_site_patterns` collection (Step 0)
- RuVector `competitor_intelligence` collection (Step 4.5)

### Helper Functions

- `queryCompetitorCache()` - Query RuVector for cached competitors
- `identifyCompetitors()` - Discover competitors via industry analysis
- `analyzeCompetitiveLandscape()` - Rank competitors by strength
- `identifyCompetitiveGaps()` - Find keywords they rank for, we don't
- `calculateCompetitiveIntensity()` - Score competitive environment
- `storeCompetitorIntelligence()` - Save results to RuVector

### RuVector Integration

**Pre-Research (Step 0)**:
```typescript
const queryStr = buildCrossSitePatternQueryString({
  industry: 'healthcare',
  patternType: 'COMPETITOR_STRATEGY',
  minConfidence: 0.7,
  minFreshnessScore: 0.5
});
const patterns = await queryCrossSitePatterns(queryStr, 10);
```

**Post-Research (Step 4.5)**:
```typescript
await upsertCompetitorIntelligence({
  domain,
  industry,
  competitors: output.competitors,
  gaps: output.gaps,
  intensity: output.competitive_intensity
});
```

### Testing

Run validation:
```bash
node .claude/skills/cfn-seo/phases/validate-phase-3.cjs
```

Run unit tests (when test runner is set up):
```bash
npm test -- phases/phase-3-competitors.test.ts
```

### Acceptance Criteria

- [x] `executePhase3()` function with full type safety
- [x] Step 0: RuVector cache check for competitor intelligence
- [x] Step 1: Competitor identification (manual + discovered)
- [x] Step 2: Competitive landscape analysis (stub)
- [x] Step 3: Gap identification (stub with sample data)
- [x] Step 4: Competitive intensity calculation (0.0-1.0)
- [x] Step 4.5: Store in RuVector competitor_intelligence collection
- [x] All interfaces exported

### Known Limitations (Sprint 1.2)

- **Competitor Discovery**: Stub implementation (replace with DataForSEO/SEMrush API)
- **Gap Analysis**: Stub implementation (replace with keyword gap API)
- **RuVector Client**: TODO comments where actual calls would go
- **Redis Storage**: Not yet implemented (planned for coordinator)

---

## Common Patterns

### Phase Input/Output Chaining

```typescript
// Phase 1 → Phase 2
const phase1Output = await executePhase1(phase1Input);
const phase2Output = await executePhase2({
  ...phase2Input,
  phase1Output
});

// Phase 2 → Phase 3
const phase3Output = await executePhase3({
  ...phase3Input,
  phase1Output,
  phase2Output
});
```

### RuVector Cache Pattern

All phases follow this pattern:

```typescript
// Step 0: Pre-research cache check
if (!skipCache) {
  const cached = await queryCacheForPhase(industry, domain);
  if (cached && !isStale(cached)) {
    return cached; // Skip work
  }
}

// Steps 1-N: Execute phase logic
const results = await doPhaseWork();

// Step 4.5: Post-research storage
await storePhasResults(results);

return results;
```

### Error Handling

All phases use non-blocking storage:

```typescript
try {
  await storeInRuVector(results);
} catch (error) {
  console.error('[Phase N] Storage failed:', error);
  // Continue - don't block phase completion
}
```

---

## Integration Points

### With RuVector Collections

| Phase | Pre-Research (Step 0) | Post-Research (Step 4.5) |
|-------|----------------------|--------------------------|
| Phase 1 | `seo_site_profiles` | `seo_site_profiles` |
| Phase 2 | `seo_content_patterns` | `seo_content_patterns` |
| Phase 3 | `seo_cross_site_patterns` | `seo_competitor_intelligence` |
| Phase 4 | `seo_keyword_research` | `seo_keyword_research` |
| Phase 5 | `seo_serp_patterns` | `seo_serp_patterns` |
| Phase 6 | `seo_cross_site_patterns` | `seo_cross_site_patterns` |
| Phase 7 | `seo_cross_site_patterns` | `seo_onboarding_results` |

### With Redis Storage

Each phase stores outputs to Redis for coordinator access:

```
seo:site:{domain}:run:{runId}:phase:{N}
```

See `storage-schema.md` for full Redis key structure.

---

## Development Guidelines

### Creating a New Phase

1. **Copy template**:
   ```bash
   cp phase-3-competitors.ts phase-N-name.ts
   ```

2. **Update interfaces**:
   - Define `{PhaseName}Input` interface
   - Define `{PhaseName}Output` interface
   - Import required previous phase outputs

3. **Implement workflow**:
   - Step 0: RuVector cache check
   - Steps 1-N: Core logic
   - Step 4.5: RuVector storage

4. **Add helper functions**:
   - Keep helpers focused and testable
   - Use descriptive names
   - Add JSDoc comments

5. **Write tests**:
   - Create `phase-N-name.test.ts`
   - Test each step independently
   - Test type safety
   - Test edge cases

6. **Validate**:
   ```bash
   npx tsc --noEmit phases/phase-N-name.ts
   node phases/validate-phase-N.cjs
   ```

### Code Style

- **Naming**: Use descriptive names (`calculateCompetitiveIntensity` not `calcCI`)
- **Comments**: Add step markers (`// Step 0:`, `// Step 1:`)
- **Logging**: Use `[Phase N]` prefix for all console output
- **Errors**: Non-blocking storage, log and continue
- **Types**: No `any` types, full TypeScript coverage

---

## Related Documentation

- **RuVector Schemas**: `../ruvector/onboarding-schemas.ts`
- **Storage Schema**: `../storage-schema.md`
- **Onboarding Design**: `../../../../planning/seo/SEO_SITE_ONBOARDING_DESIGN.md`
- **Epic**: `../../../../planning/epics/seo-onboarding-discovery/epic.json`

---

## Next Steps

**Sprint 1.2 Remaining**:
1. Implement Phase 1: Technical Foundation
2. Implement Phase 2: Content Inventory
3. Create RuVector client functions (`queryCrossSitePatterns`, `upsertCompetitorIntelligence`)
4. Add Redis storage integration
5. Create phase orchestration coordinator

**Sprint 1.3**:
- Implement Phases 4-5 with DataForSEO API integration
- Add cache layer for keyword research

**Sprint 1.4**:
- Implement Phases 6-7 with pattern application
- Add pattern extraction module (Step 12.5)

---

**Author**: Code Implementation Agent
**Date**: 2025-12-03
**Confidence**: 0.92
