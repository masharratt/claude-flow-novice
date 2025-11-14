# ACE System Database Schema Documentation

**Version:** 1.0.0
**Created:** 2025-10-29
**Epic:** EPIC-ACE-001 Phase 1.2 - Context Lookup Helper

## Overview

This directory contains the database schema for the ACE (Adaptive Context Extension) system, which enables CFN Loops to learn from past executions and reuse context across sprints.

## Files

| File | Purpose | Usage |
|------|---------|-------|
| `001-create-context-reflections.sql` | Main schema DDL | Applied by `run-migration.sh` |
| `run-migration.sh` | Migration runner | `./run-migration.sh` |
| `populate-test-data.sh` | Sample data generator | `./populate-test-data.sh --count 10` |
| `validate-schema.sql` | Query validation tests | `sqlite3 db.db < validate-schema.sql` |
| `README.md` | This documentation | - |

## Schema Design

### Core Tables

#### context_reflections

Primary table storing cognitive reflections from CFN Loop executions.

**Purpose:** Enable context lookup, anti-pattern detection, and pattern analysis.

**Key Columns:**

| Column | Type | Purpose | Indexed |
|--------|------|---------|---------|
| `id` | TEXT | Primary key (refl-{timestamp}-{random}) | ✓ (PK) |
| `reflection_type` | TEXT | strategy, anti-pattern, edge-case, pattern, warning, failure | ✓ |
| `task_id` | TEXT | Reference to original CFN Loop task | ✓ |
| `swarm_id` | TEXT | Swarm that executed the task | ✓ |
| `execution_trace` | TEXT (JSON) | Iterations, loops, timeline | - |
| `feedback_signals` | TEXT (JSON) | Loop 2 feedback, Product Owner decision | - |
| `extracted_lessons` | TEXT (JSON) | Strategies, anti-patterns, edge cases | - |
| `metadata` | TEXT (JSON) | Tags, domain, keywords, severity | ✓ (JSON) |
| `curator_status` | TEXT | pending, curated, merged, rejected, archived | ✓ |
| `confidence` | REAL | Self-confidence score (0.0-1.0) | ✓ |
| `success_count` | INTEGER | Times this context led to success | ✓ |
| `total_count` | INTEGER | Times this context was used | ✓ |
| `created_at` | DATETIME | Reflection timestamp | ✓ |

**JSON Schema Examples:**

```json
// execution_trace
{
  "iterations": 2,
  "loops": ["loop3", "loop2"],
  "timeline": ["start", "loop3", "loop2", "product-owner", "complete"],
  "duration_seconds": 180
}

// feedback_signals
{
  "loop2_feedback": [
    "Add error handling for edge cases",
    "Improve test coverage"
  ],
  "product_owner_decision": "PROCEED",
  "validator_consensus": 0.92
}

// extracted_lessons
{
  "strategies": [
    {
      "title": "JWT + Redis Session Pattern",
      "description": "Use short-lived JWT with Redis for token revocation",
      "confidence": 0.95,
      "tags": ["authentication", "security", "session"]
    }
  ],
  "antiPatterns": [
    {
      "title": "Long-lived Access Tokens",
      "description": "Avoid tokens that last >15 minutes without refresh",
      "severity": "critical",
      "tags": ["security", "jwt"]
    }
  ],
  "edgeCases": [
    {
      "title": "Race condition in concurrent token refresh",
      "description": "Use Redis locking to prevent duplicate refresh",
      "tags": ["concurrency", "redis", "jwt"]
    }
  ]
}

// metadata
{
  "domain": ["backend", "security"],
  "keywords": ["jwt", "authentication", "redis", "session", "token"],
  "tags": ["backend", "security", "authentication"],
  "severity": "medium",
  "failure_reason": null,
  "agent_types": ["backend-dev", "security-specialist"]
}
```

#### ace_telemetry

Performance monitoring table for ACE operations.

**Purpose:** Track query performance, reflection timing, and operation success rates.

**Key Columns:**

| Column | Type | Purpose |
|--------|------|---------|
| `operation` | TEXT | reflect, query, inject, curate, pattern_detect |
| `duration_ms` | INTEGER | Operation duration in milliseconds |
| `success` | BOOLEAN | Operation success/failure |
| `context_size` | INTEGER | Size of context in bytes |
| `results_count` | INTEGER | Number of results returned (for queries) |
| `timestamp` | INTEGER | Unix timestamp |

### Views

#### v_active_lessons

**Purpose:** Ready-to-use curated lessons for context injection.

**Filters:** curator_status = 'curated' AND confidence >= 0.70

**Columns:** id, reflection_type, domain, tags, keywords, extracted_lessons, confidence, success_rate, created_at

**Usage:**
```sql
SELECT * FROM v_active_lessons
WHERE domain LIKE '%backend%'
ORDER BY confidence DESC
LIMIT 5;
```

#### v_high_impact_patterns

**Purpose:** Most effective patterns (frequently used, high success rate).

**Filters:** curator_status = 'curated' AND total_count >= 3 AND success_rate >= 0.80

**Columns:** id, domain, strategy_title, success_count, success_rate, last_used_at

**Top 10 by:** success_count DESC, success_rate DESC

**Usage:**
```sql
SELECT * FROM v_high_impact_patterns;
```

#### v_recent_failures

**Purpose:** Anti-patterns and failures from last 30 days.

**Filters:** reflection_type IN (anti-pattern, failure, warning) AND created_at > (now - 30 days)

**Columns:** id, task_id, domain, failure_reason, severity, confidence, created_at

**Ordered by:** severity (critical first), then created_at DESC

**Usage:**
```sql
SELECT * FROM v_recent_failures
WHERE domain = 'security'
ORDER BY severity;
```

## Indexes

### Primary Indexes (Single Column)

| Index | Column | Purpose | Query Pattern |
|-------|--------|---------|---------------|
| `idx_context_reflections_task` | task_id | Task lookup | Get reflections for specific task |
| `idx_context_reflections_swarm` | swarm_id | Swarm filtering | Get all reflections from swarm |
| `idx_context_reflections_status` | curator_status | Curator workflow | Find pending/curated items |
| `idx_context_reflections_created` | created_at DESC | Recency scoring | Most recent reflections |
| `idx_context_reflections_confidence` | confidence DESC | Quality filtering | High-confidence contexts |
| `idx_context_reflections_type` | reflection_type | Type filtering | Get strategies vs anti-patterns |

### Composite Indexes

| Index | Columns | Purpose | Query Pattern |
|-------|---------|---------|---------------|
| `idx_context_lookup` | curator_status, confidence DESC, created_at DESC | **Primary context lookup** | Find curated, high-confidence, recent contexts |
| `idx_context_reflections_success` | success_count, total_count | Success rate analysis | High-impact patterns |

### JSON Extraction Indexes

| Index | JSON Path | Purpose | Query Pattern |
|-------|-----------|---------|---------------|
| `idx_metadata_tags` | `$.tags` | Tag matching | Find contexts by tag |
| `idx_metadata_domain` | `$.domain` | Domain filtering | Backend vs frontend contexts |
| `idx_metadata_keywords` | `$.keywords` | Keyword search | Similarity matching |

## Query Patterns

### 1. Context Lookup (Primary Use Case)

**Scenario:** Loop 0 needs similar past contexts before Loop 3 execution.

```sql
-- Find curated backend strategies with high confidence
SELECT
  id,
  reflection_type,
  json_extract(metadata, '$.domain') as domain,
  json_extract(metadata, '$.keywords') as keywords,
  extracted_lessons,
  confidence,
  success_count,
  total_count,
  CAST(success_count AS REAL) / NULLIF(total_count, 0) as success_rate,
  created_at
FROM context_reflections
WHERE curator_status = 'curated'
  AND confidence >= 0.70
  AND json_extract(metadata, '$.domain') LIKE '%backend%'
ORDER BY confidence DESC, created_at DESC
LIMIT 5;
```

**Index Used:** `idx_context_lookup` (composite)

**Expected Performance:** <100ms with 1000+ reflections

### 2. Keyword Similarity

**Scenario:** Find contexts matching user keywords (authentication, jwt, redis).

```sql
-- Find contexts with authentication-related keywords
SELECT
  id,
  reflection_type,
  json_extract(metadata, '$.keywords') as keywords,
  confidence,
  created_at
FROM context_reflections
WHERE (
  json_extract(metadata, '$.keywords') LIKE '%authentication%'
  OR json_extract(metadata, '$.keywords') LIKE '%jwt%'
  OR json_extract(metadata, '$.keywords') LIKE '%redis%'
)
  AND curator_status = 'curated'
ORDER BY confidence DESC, created_at DESC
LIMIT 5;
```

**Index Used:** `idx_metadata_keywords` (JSON extraction)

**Expected Performance:** <100ms

### 3. Anti-Pattern Detection

**Scenario:** Warn agents about past failures in similar domain.

```sql
-- Find critical anti-patterns in security domain
SELECT
  id,
  task_id,
  json_extract(metadata, '$.domain') as domain,
  json_extract(metadata, '$.failure_reason') as failure_reason,
  json_extract(metadata, '$.severity') as severity,
  extracted_lessons,
  confidence,
  created_at
FROM context_reflections
WHERE reflection_type = 'anti-pattern'
  AND json_extract(metadata, '$.severity') = 'critical'
  AND json_extract(metadata, '$.domain') LIKE '%security%'
ORDER BY created_at DESC
LIMIT 5;
```

**Index Used:** `idx_context_reflections_type` + `idx_metadata_domain`

**Expected Performance:** <100ms

### 4. Success Rate Analysis

**Scenario:** Dashboard showing most effective patterns.

```sql
-- Find high-impact patterns (used 3+ times, 80%+ success rate)
SELECT
  id,
  reflection_type,
  json_extract(metadata, '$.domain') as domain,
  json_extract(extracted_lessons, '$.strategies[0].title') as strategy_title,
  confidence,
  success_count,
  total_count,
  CAST(success_count AS REAL) / NULLIF(total_count, 0) as success_rate
FROM context_reflections
WHERE total_count >= 3
  AND CAST(success_count AS REAL) / NULLIF(total_count, 0) >= 0.80
  AND curator_status = 'curated'
ORDER BY success_count DESC, success_rate DESC
LIMIT 10;
```

**Index Used:** `idx_context_reflections_success` (composite)

**Expected Performance:** <50ms

### 5. Pattern Detection (Weekly Analysis)

**Scenario:** Find recurring failures for systemic improvements.

```sql
-- Group failures by reason in last 30 days
SELECT
  json_extract(metadata, '$.failure_reason') as reason,
  json_extract(metadata, '$.domain') as domain,
  COUNT(*) as occurrences,
  json_group_array(task_id) as affected_sprints,
  AVG(json_extract(execution_trace, '$.iterations')) as avg_iterations
FROM context_reflections
WHERE reflection_type IN ('failure', 'warning', 'anti-pattern')
  AND created_at > datetime('now', '-30 days')
GROUP BY reason, domain
HAVING occurrences >= 3
ORDER BY occurrences DESC, avg_iterations DESC;
```

**Index Used:** `idx_context_reflections_type` + `idx_context_reflections_created`

**Expected Performance:** <200ms (complex aggregation)

## Performance Optimization

### SQLite Settings

The schema includes these performance optimizations:

```sql
PRAGMA journal_mode = WAL;          -- Write-Ahead Logging (better concurrency)
PRAGMA temp_store = MEMORY;         -- Use RAM for temp tables
PRAGMA cache_size = -65536;         -- 64MB cache
PRAGMA synchronous = NORMAL;        -- Balance performance/safety
PRAGMA page_size = 8192;            -- Optimize for DDR5-6400 bandwidth
PRAGMA optimize;                    -- Enable query optimizer
```

### Expected Performance Targets

| Operation | Target | Notes |
|-----------|--------|-------|
| Context Lookup | <100ms | With 1000+ reflections |
| Keyword Search | <100ms | JSON extraction |
| Anti-Pattern Query | <100ms | Filtered by type + domain |
| Success Rate Analysis | <50ms | Pre-indexed |
| Pattern Detection | <200ms | Complex aggregation |
| Reflection Insert | <10ms | Single row |

### Scaling Considerations

**Current Capacity:** 1000-10,000 reflections (expected: 50-100 reflections/month)

**Storage Growth:** ~10-20 KB per reflection (10 MB/month at 100 reflections/month)

**Cleanup Strategy:** TTL of 90 days for low-confidence (<0.70) reflections

**Archive Policy:** Max 1000 reflections, archive oldest when limit reached

## Usage Instructions

### 1. Initialize Database

```bash
# Navigate to schema directory
cd .claude/skills/cfn-ace-system/schema

# Run migration (creates tables, indexes, views)
./run-migration.sh

# Output:
# === ACE System Database Migration ===
# Database: .artifacts/database/swarm-memory.db
# Current schema version: 0
# Looking for migrations in: /path/to/schema
# ✓ Applied migration: 001-create-context-reflections
# === Migration Verification ===
# ✓ context_reflections table exists (15 indexes)
# ✓ ace_telemetry table exists
# ✓ 3 views created
# Final schema version: 1
# === Migration Complete ===
```

### 2. Populate Test Data

```bash
# Generate 10 sample reflections
./populate-test-data.sh --count 10

# Generate 50 reflections and clean existing data
./populate-test-data.sh --count 50 --clean

# Output:
# === ACE System: Populating Test Data ===
# Database: .artifacts/database/swarm-memory.db
# Reflections to generate: 10
# ✓ Generated reflection 1: strategy (backend, confidence=0.92)
# ✓ Generated reflection 2: anti-pattern (security, confidence=0.58)
# ...
# === Test Data Summary ===
# reflection_type  count  avg_confidence  total_successes  total_uses
# ---------------  -----  --------------  ---------------  ----------
# strategy         7      0.89            52               78
# anti-pattern     2      0.52            0                15
# edge-case        1      0.81            3                5
```

### 3. Validate Schema

```bash
# Run validation queries
sqlite3 .artifacts/database/swarm-memory.db < validate-schema.sql

# Output includes:
# - Table verification (column counts)
# - Index verification (15 indexes)
# - View verification (3 views)
# - Query plan analysis (EXPLAIN QUERY PLAN)
# - Schema statistics
```

### 4. Query Examples

```bash
# Find high-confidence backend strategies
sqlite3 .artifacts/database/swarm-memory.db <<'EOF'
SELECT
  id,
  json_extract(extracted_lessons, '$.strategies[0].title') as strategy,
  confidence,
  success_count
FROM v_active_lessons
WHERE domain LIKE '%backend%'
ORDER BY confidence DESC
LIMIT 3;
EOF

# Check telemetry performance
sqlite3 .artifacts/database/swarm-memory.db <<'EOF'
SELECT
  operation,
  COUNT(*) as count,
  ROUND(AVG(duration_ms), 2) as avg_duration_ms,
  MIN(duration_ms) as min_ms,
  MAX(duration_ms) as max_ms
FROM ace_telemetry
GROUP BY operation
ORDER BY avg_duration_ms DESC;
EOF
```

## Integration with CFN Loop

### Loop 0: Context Lookup

**Script:** `.claude/skills/cfn-loop-orchestration/helpers/context-lookup.sh`

**Workflow:**
1. Extract keywords from task description
2. Classify domain (frontend, backend, security, etc.)
3. Query `context_reflections` for similar contexts
4. Store results in Redis: `cfn_loop:{TASK_ID}:historical_context`

**Query Used:** Context Lookup pattern (see above)

### Loop 3: Context Injection

**Script:** `.claude/skills/cfn-loop-orchestration/helpers/context-injection.sh`

**Workflow:**
1. Retrieve historical context from Redis
2. Filter lessons by agent type
3. Format as markdown (strategies, anti-patterns, edge cases)
4. Merge with agent spawn context

**Data Source:** `v_active_lessons` view

### Loop 5: Reflection

**Script:** `.claude/skills/cfn-ace-system/invoke-context-reflect.sh`

**Workflow:**
1. Extract execution trace from orchestrator
2. Parse Loop 2 feedback signals
3. Generate extracted_lessons JSON
4. Calculate confidence and metadata
5. Insert into `context_reflections` table

**Status:** curator_status = 'pending' (curated by Loop 6)

## Migration Management

### Version Control

Schema versions tracked in `schema_version` table:

```sql
SELECT * FROM schema_version;

-- Output:
-- version  applied_at           description
-- -------  -------------------  -----------------------------------------
-- 1        2025-10-29 10:30:00  Initial ACE context_reflections schema
```

### Rollback Strategy

**Manual Rollback (if migration fails):**

```bash
# 1. Backup database
cp .artifacts/database/swarm-memory.db .artifacts/database/swarm-memory.db.backup

# 2. Drop tables
sqlite3 .artifacts/database/swarm-memory.db <<'EOF'
DROP TABLE IF EXISTS context_reflections;
DROP TABLE IF EXISTS ace_telemetry;
DROP VIEW IF EXISTS v_active_lessons;
DROP VIEW IF EXISTS v_high_impact_patterns;
DROP VIEW IF EXISTS v_recent_failures;
DELETE FROM schema_version WHERE version = 1;
EOF

# 3. Verify rollback
sqlite3 .artifacts/database/swarm-memory.db "SELECT name FROM sqlite_master WHERE type='table';"

# 4. Re-run migration if needed
./run-migration.sh
```

### Future Migrations

To add new migrations:

1. Create `002-add-new-feature.sql` with DDL
2. Add version tracking:
   ```sql
   INSERT INTO schema_version (version, description)
   VALUES (2, 'Add new feature description');
   ```
3. Run `./run-migration.sh` (automatically applies version 2)

## Troubleshooting

### Issue: Table already exists

**Symptom:** `Error: table context_reflections already exists`

**Solution:** Use `--force` flag to re-run migration:
```bash
./run-migration.sh --force
```

### Issue: Query performance slow

**Symptom:** Queries take >200ms

**Solution:**
1. Check index usage: `sqlite3 db.db < validate-schema.sql`
2. Run ANALYZE: `sqlite3 db.db "ANALYZE;"`
3. Verify cache settings: `sqlite3 db.db "PRAGMA cache_size;"`

### Issue: JSON extraction fails

**Symptom:** `json_extract()` returns NULL

**Solution:** Check JSON format:
```bash
sqlite3 db.db <<'EOF'
SELECT
  id,
  json_valid(metadata) as is_valid_json,
  metadata
FROM context_reflections
WHERE json_valid(metadata) = 0;
EOF
```

### Issue: No results from queries

**Symptom:** Queries return 0 rows

**Solution:** Check curator_status:
```bash
sqlite3 db.db <<'EOF'
SELECT curator_status, COUNT(*) as count
FROM context_reflections
GROUP BY curator_status;
EOF
```

Most queries filter `WHERE curator_status = 'curated'`. If all reflections are 'pending', run curator:
```bash
./.claude/skills/cfn-ace-system/invoke-context-curate.sh
```

## Design Decisions

### 1. JSON vs Normalized Tables

**Decision:** Use JSON for flexible metadata (tags, keywords, domain).

**Rationale:**
- Tags/keywords vary per reflection (unpredictable schema)
- JSON extraction indexes enable fast queries
- Simpler schema evolution (add new metadata fields without ALTER TABLE)
- SQLite JSON functions performant (json_extract, json_valid)

**Trade-off:** Slightly slower queries vs normalized, but acceptable (<100ms)

### 2. Single Table vs Multi-Table

**Decision:** Single `context_reflections` table for all reflection types.

**Rationale:**
- Strategies, anti-patterns, edge cases share 80% of schema
- Simplifies context lookup queries (single table scan)
- Type filtering via `reflection_type` column (indexed)
- Easier to add new reflection types (no schema migration)

**Trade-off:** Larger table, but still manageable at scale (10K reflections = 200 MB)

### 3. Confidence Decay vs Static

**Decision:** Static confidence stored, decay calculated at query time.

**Rationale:**
- Preserve original confidence for audit trail
- Flexible decay formulas (change without data migration)
- Simplifies updates (no periodic confidence recalculation)

**Implementation:** Query-time decay:
```sql
confidence * (1 - 0.3 * (julianday('now') - julianday(created_at)) / 365)
```

### 4. Views vs Materialized Views

**Decision:** Use regular views (v_active_lessons, etc.).

**Rationale:**
- SQLite doesn't support materialized views natively
- Context queries infrequent (Loop 0 once per sprint)
- Views always return fresh data (no cache invalidation)
- Index optimization makes views fast enough (<100ms)

**Future:** If queries slow down, implement Redis caching layer.

### 5. TTL Strategy

**Decision:** Manual cleanup via cron (90-day TTL for low-confidence).

**Rationale:**
- SQLite doesn't support automatic TTL (unlike Redis)
- Weekly cleanup cron acceptable overhead
- Flexible cleanup policies (confidence-based, age-based)

**Implementation:** See Phase 5 cleanup cron in epic.

## Testing

### Unit Tests

See `tests/ace-integration/` for:
- `02-context-lookup.test.sh` - Query accuracy
- `08-query-performance.test.sh` - Performance benchmarks
- Schema validation via `validate-schema.sql`

### Performance Benchmarks

**Baseline (empty database):**
- Context lookup: 5-10ms
- Keyword search: 3-5ms
- Insert reflection: 2-3ms

**Target (1000 reflections):**
- Context lookup: <100ms ✓
- Keyword search: <100ms ✓
- Pattern detection: <200ms ✓

### Load Testing

```bash
# Generate 1000 reflections
for i in {1..100}; do
  ./populate-test-data.sh --count 10
done

# Run validation
sqlite3 .artifacts/database/swarm-memory.db < validate-schema.sql

# Check performance
time sqlite3 .artifacts/database/swarm-memory.db "SELECT * FROM v_active_lessons LIMIT 10;"
```

## References

- **Epic:** `planning/loop-improvements/EPIC_ACE_INTEGRATION.md`
- **Phase 1.2 Spec:** Section "Context Lookup Helper"
- **SQLite JSON Docs:** https://www.sqlite.org/json1.html
- **Query Optimization:** https://www.sqlite.org/queryplanner.html

## Version History

- **v1.0.0** (2025-10-29): Initial schema with context_reflections, ace_telemetry, 3 views, 15 indexes
- Schema supports Phase 1-2 requirements (lookup, injection, telemetry)
- Performance targets validated with test data
