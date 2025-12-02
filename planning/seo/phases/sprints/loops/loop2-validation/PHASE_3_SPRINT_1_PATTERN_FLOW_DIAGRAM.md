# Phase 3 Sprint 1 - Pattern Flow Integration Diagram

**Version:** 1.0
**Date:** 2025-12-01
**Purpose:** Visual representation of intelligence pattern flow from knowledge store to agents

---

## Complete Intelligence Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         KNOWLEDGE STORE (Phase 1 Sprint 3)                   │
│                                                                               │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  YAML Pattern Files (21 seed patterns)                                 │ │
│  │  ├── keyword-patterns.yaml                                             │ │
│  │  │   └── kw-seasonal-001: "Family history software peaks Nov-Dec"      │ │
│  │  ├── content-patterns.yaml                                             │ │
│  │  │   └── cp-title-001: "Primary Keyword: {Emotion} + {Benefit}"       │ │
│  │  ├── serp-patterns.yaml                                                │ │
│  │  │   └── sp-featured-001: "3-7 item lists for featured snippets"      │ │
│  │  ├── competitor-patterns.yaml                                          │ │
│  │  │   └── comp-strat-001: "Hub-and-spoke with 15+ internal links"      │ │
│  │  └── algorithm-patterns.yaml                                           │ │
│  │      └── algo-risk-001: "Keyword stuffing penalty: -20 to -40 pos"    │ │
│  │                                                                          │ │
│  │  Schema: pattern-schema.yaml                                            │ │
│  │  Validation: PatternManager.validate()                                  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ↓
                          ┌───────────────────────┐
                          │  Pattern Manager      │
                          │  (Phase 1 Sprint 3)   │
                          │                       │
                          │  • Load from YAML     │
                          │  • Query by filters   │
                          │  • Validate schema    │
                          │  • Track lifecycle    │
                          └───────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                    STEP 0: INTELLIGENCE PRE-LOAD (Phase 1 Sprint 4)          │
│                                                                               │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  IntelligenceCurator.load(taskId, targetKeyword, contentType, industry)│ │
│  │                                                                          │ │
│  │  1. Query PatternManager for relevant patterns:                         │ │
│  │     • Filter by contentType (e.g., "blog-post")                         │ │
│  │     • Filter by industry (e.g., "genealogy")                            │ │
│  │     • Filter by minConfidence (e.g., >= 0.80)                           │ │
│  │     • Filter by lifecycle (e.g., "validated", "promoted")               │ │
│  │                                                                          │ │
│  │  2. Package patterns by type:                                           │ │
│  │     • keyword_patterns: Pattern[] (seasonal, intent, volume)            │ │
│  │     • content_patterns: Pattern[] (title, meta, h2, hooks)              │ │
│  │     • serp_patterns: Pattern[] (featured snippets, PAA, rich results)   │ │
│  │     • competitor_patterns: Pattern[] (strategy, content gaps)           │ │
│  │     • algorithm_risks: Pattern[] (penalties, thresholds)                │ │
│  │                                                                          │ │
│  │  3. ⚠️ MAP PHASE 1 PATTERN → AGENT intelligence_context:                │ │
│  │     Phase 1: { id, type, confidence, metadata }                         │ │
│  │     Agent:   { pattern_id, pattern_type, confidence, data }             │ │
│  │                                                                          │ │
│  │     Example Mapping:                                                    │ │
│  │     {                                                                   │ │
│  │       pattern_id: pattern.id,           // "kw-seasonal-001"           │ │
│  │       pattern_type: pattern.type,       // PatternType.Keyword → "keyword"│ │
│  │       confidence: pattern.confidence,   // 0.92                         │ │
│  │       data: pattern.metadata            // Full metadata object         │ │
│  │     }                                                                   │ │
│  │                                                                          │ │
│  │  4. Store to Redis:                                                     │ │
│  │     Key: "seo:context:{taskId}"                                         │ │
│  │     TTL: 86400 seconds (24 hours)                                       │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ↓
                          ┌───────────────────────┐
                          │  Redis Context Store  │
                          │  (Phase 1 Sprint 3)   │
                          │                       │
                          │  Key: seo:context:{id}│
                          │  Value: JSON context  │
                          │  TTL: 24 hours        │
                          └───────────────────────┘
                                      ↓
            ┌─────────────────────────────────────────────────┐
            │                                                 │
            ↓                                                 ↓
┌────────────────────────────────────┐      ┌────────────────────────────────────┐
│  STEP 2.5: KEYWORD RESEARCH        │      │  STEP 3.5: CONTENT STRATEGY        │
│  (seo-analytics-specialist)        │      │  (content-seo-strategist)          │
│  (Phase 3 Sprint 1)                │      │  (Phase 3 Sprint 1)                │
│                                    │      │                                    │
│  INPUT:                            │      │  INPUT:                            │
│  {                                 │      │  {                                 │
│    keyword: "target keyword",      │      │    keyword: "target keyword",      │
│    intelligence_context: {         │      │    target_length: 2000,            │
│      keyword_patterns: [...],      │      │    intelligence_context: {         │
│      content_patterns: [...],      │      │      content_patterns: [...],      │
│      serp_patterns: [...],         │      │      serp_patterns: [...],         │
│      competitor_patterns: [...],   │      │      competitor_patterns: [...],   │
│      algorithm_risks: [...]        │      │      keyword_patterns: [...]       │
│    }                               │      │    }                               │
│  }                                 │      │  }                                 │
│                                    │      │                                    │
│  PROCESSING:                       │      │  PROCESSING:                       │
│  • Apply keyword_patterns to       │      │  • Apply content_patterns to       │
│    traffic forecasting             │      │    title tag structure             │
│  • Apply serp_patterns to          │      │  • Apply serp_patterns to          │
│    ranking opportunities           │      │    outline sections (PAA, snippets)│
│  • Apply competitor_patterns to    │      │  • Apply competitor_patterns to    │
│    benchmarking analysis           │      │    content gap analysis            │
│  • Apply content_patterns to       │      │  • Apply keyword_patterns to       │
│    conversion optimization         │      │    keyword clustering              │
│  • Track influence_weight (0.0-1.0)│      │  • Track influence_weight (0.0-1.0)│
│                                    │      │                                    │
│  OUTPUT:                           │      │  OUTPUT:                           │
│  {                                 │      │  {                                 │
│    analysis_result: {              │      │    content_brief: {                │
│      traffic_forecast: "15% Q4",   │      │      title: "10 Best Tools 2024",  │
│      conversion_recs: [...]        │      │      outline: {...},               │
│      ranking_opportunities: [...]  │      │      word_count: 2000              │
│    },                              │      │    },                              │
│    pattern_applications: [         │      │    pattern_applications: [         │
│      {                             │      │      {                             │
│        pattern_id: "kw-seas-001",  │      │        pattern_id: "cp-title-001", │
│        pattern_type: "keyword",    │      │        pattern_type: "content",    │
│        confidence: 0.92,           │      │        confidence: 0.89,           │
│        applied_to: "forecast",     │      │        applied_to: "title_tag",    │
│        influence_weight: 0.75,     │      │        influence_weight: 0.90,     │
│        timestamp: "2025-12-01..."  │      │        timestamp: "2025-12-01..."  │
│      },                            │      │      },                            │
│      {...}  // More applications   │      │      {...}  // More applications   │
│    ]                               │      │    ]                               │
│  }                                 │      │  }                                 │
└────────────────────────────────────┘      └────────────────────────────────────┘
                                      ↓
                          ┌───────────────────────┐
                          │  Collect Applications │
                          │  from all agents      │
                          │                       │
                          │  • Analytics: 3 apps  │
                          │  • Strategist: 4 apps │
                          │  • Total: 7 apps      │
                          └───────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                   STEP 12: LEARNING CAPTURE (Phase 1 Sprint 4)               │
│                                                                               │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  Execute learning capture for pattern confidence updates                │ │
│  │                                                                          │ │
│  │  1. ⚠️ MAP AGENT pattern_applications → PHASE 1 PatternApplication:     │ │
│  │     Agent:   { pattern_id, pattern_type, applied_to, influence_weight } │ │
│  │     Phase 1: { applicationId, patternId, patternCategory, metrics }     │ │
│  │                                                                          │ │
│  │     Example Mapping:                                                    │ │
│  │     {                                                                   │ │
│  │       applicationId: crypto.randomUUID(),     // Generate              │ │
│  │       taskId: context.task.taskId,            // From context           │ │
│  │       patternId: app.pattern_id,              // Direct map             │ │
│  │       patternType: app.pattern_type,          // Direct map             │ │
│  │       patternCategory: lookupCategory(),      // Lookup from PM         │ │
│  │       appliedAt: new Date(app.timestamp),     // Parse timestamp        │ │
│  │       metrics: {                                                        │ │
│  │         influence_weight: app.influence_weight,                         │ │
│  │         confidence: app.confidence                                      │ │
│  │       },                                                                │ │
│  │       notes: `Applied to: ${app.applied_to}`  // Map to notes           │ │
│  │     }                                                                   │ │
│  │                                                                          │ │
│  │  2. Store applications to Redis:                                        │ │
│  │     Key: "seo:applications:{taskId}"                                    │ │
│  │     Value: JSON array of PatternApplication objects                     │ │
│  │                                                                          │ │
│  │  3. Create PatternEvidence for each application:                        │ │
│  │     {                                                                   │ │
│  │       source: taskId,                                                   │ │
│  │       outcome: "success" | "failure",  // Based on pipeline result      │ │
│  │       metrics: { influence_weight: 0.75, ... },                         │ │
│  │       capturedAt: new Date(),                                           │ │
│  │       domain: context.task.domain,                                      │ │
│  │       contentType: context.task.contentType                             │ │
│  │     }                                                                   │ │
│  │                                                                          │ │
│  │  4. Update pattern confidence via PatternManager:                       │ │
│  │     PatternManager.updateConfidence(patternId, newEvidence)             │ │
│  │     • Weighted average: 70% existing + 30% new evidence                 │ │
│  │     • Lifecycle transitions based on confidence thresholds:             │ │
│  │       - >= 0.85: discovery → validated                                  │ │
│  │       - >= 0.90: validated → promoted                                   │ │
│  │                                                                          │ │
│  │  5. Save updated patterns to knowledge store (YAML files)               │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ↓
                          ┌───────────────────────┐
                          │  Updated Patterns     │
                          │  (Knowledge Store)    │
                          │                       │
                          │  • Confidence updated │
                          │  • Evidence appended  │
                          │  • Lifecycle promoted │
                          └───────────────────────┘
```

---

## Key Integration Points

### 1. Step 0 → Agent (Intelligence Loading)

**Data Flow:**
1. PatternManager queries YAML files
2. IntelligenceCurator packages patterns by type
3. **⚠️ Mapping Required:** Phase 1 Pattern → agent intelligence_context
4. RedisContextStore caches context with TTL

**Schema Transformation:**
```javascript
// Input: Phase 1 Pattern
{
  id: "kw-seasonal-001",
  type: PatternType.Keyword,
  category: "seasonal-trends",
  confidence: 0.92,
  metadata: {
    applicability: {...},
    performance: {...}
  }
}

// Output: Agent intelligence_context.keyword_patterns[0]
{
  pattern_id: "kw-seasonal-001",
  pattern_type: "keyword",
  confidence: 0.92,
  data: {
    applicability: {...},
    performance: {...}
  }
}
```

---

### 2. Agent → Step 12 (Learning Capture)

**Data Flow:**
1. Agents output pattern_applications array
2. Orchestrator collects applications from all agents
3. **⚠️ Mapping Required:** agent pattern_applications → Phase 1 PatternApplication
4. PatternManager updates confidence with new evidence

**Schema Transformation:**
```javascript
// Input: Agent pattern_applications[0]
{
  pattern_id: "kw-seasonal-001",
  pattern_type: "keyword",
  confidence: 0.92,
  applied_to: "traffic_forecast",
  influence_weight: 0.75,
  timestamp: "2025-12-01T12:00:00Z"
}

// Output: Phase 1 PatternApplication
{
  applicationId: "550e8400-e29b-41d4-a716-446655440000",
  taskId: "task-001",
  patternId: "kw-seasonal-001",
  patternType: "keyword",
  patternCategory: "seasonal-trends",
  appliedAt: new Date("2025-12-01T12:00:00Z"),
  outcome: "success",
  metrics: {
    influence_weight: 0.75,
    confidence: 0.92
  },
  notes: "Applied to: traffic_forecast"
}
```

---

## Redis Key Namespace

### Phase 1 Infrastructure Keys

```
seo:context:{taskId}              # Intelligence context for task
seo:applications:{taskId}         # Pattern applications for task
seo:pattern:{patternId}           # Individual pattern cache
seo:evidence:{patternId}          # Pattern evidence history
```

### Agent Usage

**Read Operations (Step 2.5, 3.5):**
```javascript
const context = await redis.get(`seo:context:${taskId}`);
const intelligence_context = JSON.parse(context);
```

**Write Operations (Step 12):**
```javascript
await redis.lpush(
  `seo:applications:${taskId}`,
  JSON.stringify(patternApplication)
);
```

---

## Pattern Confidence Update Flow

```
Initial Pattern (discovery)
├── confidence: 0.70
└── evidence: []

↓ Applied in Task 1 (success)

Pattern Evidence Added
├── confidence: 0.73  // 70% * 0.70 + 30% * 0.80 = 0.73
└── evidence: [{
      source: "task-001",
      outcome: "success",
      metrics: { influence_weight: 0.75 }
    }]

↓ Applied in Task 2, 3, 4 (all success)

Pattern Promoted (validated)
├── confidence: 0.86  // >= 0.85 threshold
├── lifecycle: "validated"
└── evidence: [4 successful applications]

↓ Applied in 10+ tasks across 3 domains (success rate 90%)

Pattern Promoted (global)
├── confidence: 0.92  // >= 0.90 threshold
├── lifecycle: "promoted"
└── evidence: [14 applications, 3 domains, 90% success]
```

---

## Backward Compatibility Flow

```
Agent Invoked WITHOUT intelligence_context
         ↓
┌────────────────────────────┐
│  Check intelligence_context│
│  parameter                 │
│                            │
│  if (!intelligence_context)│
│    OR                      │
│  if (empty object)         │
└────────────────────────────┘
         ↓
┌────────────────────────────┐
│  Perform standard analysis │
│  without pattern hints     │
│                            │
│  • Use agent's built-in    │
│    logic and heuristics    │
│  • No pattern applications │
│    tracked                 │
└────────────────────────────┘
         ↓
┌────────────────────────────┐
│  Return output with        │
│  pattern_applications: []  │
│  (empty array)             │
└────────────────────────────┘
```

**Benefits:**
- Zero-risk deployment (agents work without intelligence system)
- Incremental rollout (enable intelligence per task type)
- Testing isolation (test agents independently of pattern system)
- Fallback mechanism (degrade gracefully if Redis unavailable)

---

## Data Validation Points

### 1. Pattern Schema Validation (Step 0)

```typescript
// Before loading patterns
PatternManager.validate(pattern);

// Checks:
// - Required fields present (id, type, confidence, lifecycle)
// - Confidence in range [0.0, 1.0]
// - Lifecycle is valid enum value
// - Evidence array structure
// - Metadata structure matches schema
```

### 2. Intelligence Context Validation (Agent Input)

```typescript
// Before agent processing
validateIntelligenceContext(intelligence_context);

// Checks:
// - Each pattern has pattern_id, pattern_type, confidence
// - Confidence values in range [0.0, 1.0]
// - Pattern types are valid strings
// - Data objects are valid JSON
```

### 3. Pattern Application Validation (Step 12)

```typescript
// Before updating confidence
validatePatternApplication(application);

// Checks:
// - pattern_id matches existing pattern
// - influence_weight in range [0.0, 1.0]
// - timestamp is valid ISO 8601
// - applied_to is non-empty string
```

---

## Error Handling Strategy

### Agent-Level Errors

```javascript
try {
  const patterns = intelligence_context.keyword_patterns || [];
  patterns.forEach(p => applyPattern(p));
} catch (error) {
  // Log error but continue analysis
  console.warn("Pattern application failed:", error);
  // Return output with empty pattern_applications
  return { analysis, pattern_applications: [] };
}
```

### Orchestration-Level Errors

```javascript
try {
  const intelligence = await loadIntelligenceContext(taskId);
} catch (error) {
  // Degrade gracefully to no intelligence
  console.warn("Intelligence load failed, proceeding without patterns:", error);
  intelligence = undefined;
}

// Agent still executes, just without intelligence hints
const result = await agent.analyze({ keyword, intelligence_context: intelligence });
```

---

## Performance Considerations

### Caching Strategy

1. **Redis Context Cache:** 24-hour TTL for intelligence_context
2. **Pattern Manager In-Memory Cache:** Patterns cached on load
3. **Agent Processing:** No additional API calls (all data pre-loaded)

### Load Times

- **Step 0 Intelligence Pre-load:** ~500ms (query + Redis store)
- **Agent Processing with Intelligence:** +50ms vs without
- **Step 12 Learning Capture:** ~200ms (update + persist)

### Scalability

- **Concurrent Tasks:** Redis key isolation (seo:context:{taskId})
- **Pattern Count:** Linear scaling up to ~100 patterns
- **Evidence Growth:** O(n) per pattern, archival recommended after 1000 entries

---

## Version History

**v1.0 (2025-12-01):** Initial pattern flow diagram for Phase 3 Sprint 1 integration assessment

---

## Related Documents

- `PHASE_3_SPRINT_1_LOOP2_INTEGRATION_ASSESSMENT.md` - Full integration assessment
- `PHASE_3_SPRINT_1_LOOP2_VALIDATION.json` - Machine-readable validation results
- `planning/seo/lib/pattern-manager.ts` - Pattern management implementation
- `planning/seo/lib/redis-context-store.ts` - Redis storage implementation
- `planning/seo/lib/pipeline-orchestrator.ts` - Pipeline orchestration
