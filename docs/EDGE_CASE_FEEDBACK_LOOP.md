# Edge Case Feedback Loop

**Task 1.5: MVP Edge Case Feedback Loop**
**Status:** Phase 1 - Detection & Categorization (Complete)

## Overview

The Edge Case Feedback Loop is a continuous improvement system that automatically detects, categorizes, and tracks skill execution failures. This enables data-driven skill quality improvements over time.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Edge Case Feedback Loop                   │
└─────────────────────────────────────────────────────────────┘

Phase 1: Detection & Categorization (Current)
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Skill        │───▶│ Edge Case    │───▶│ Edge Case    │
│ Execution    │    │ Detector     │    │ Deduplicator │
│ (Failed)     │    │              │    │              │
└──────────────┘    └──────────────┘    └──────────────┘
                            │                    │
                            ▼                    ▼
                    ┌──────────────────────────────┐
                    │   Edge Cases Database        │
                    │   - Categorized errors       │
                    │   - Deduplication tracking   │
                    │   - Occurrence counts        │
                    └──────────────────────────────┘
                            │
                            ▼
                    ┌──────────────┐
                    │ Edge Case    │
                    │ Analyzer     │
                    │ (Pattern     │
                    │  Detection)  │
                    └──────────────┘
                            │
                            ▼
                    ┌──────────────┐
                    │ Failure      │
                    │ Patterns DB  │
                    └──────────────┘

Phase 2-4: Future Implementation
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Pattern      │───▶│ Improvement  │───▶│ Automated    │
│ Analysis     │    │ Proposals    │    │ Skill Fix    │
└──────────────┘    └──────────────┘    └──────────────┘
```

## Components

### 1. Edge Case Detector (`src/services/edge-case-detector.ts`)

**Purpose:** Detects and categorizes skill execution failures.

**Error Categories:**
- `syntax` - Parse errors, invalid code
- `runtime` - Execution failures
- `validation` - Input validation errors
- `timeout` - Execution timeouts
- `dependency` - Missing dependencies
- `unknown` - Uncategorized errors

**Severity Levels:**
- `low` - Rare, non-blocking (occasional edge cases)
- `medium` - Occasional, impacts quality (common issues)
- `high` - Frequent, blocks execution (major problems)
- `critical` - Systemic, requires immediate fix (widespread failures)

**Usage:**
```typescript
import { EdgeCaseDetector } from './services/edge-case-detector';
import { DatabaseService } from './lib/database-service';

const dbService = new DatabaseService({ sqlite: { type: 'sqlite', database: './data.db' } });
await dbService.connect();

const detector = new EdgeCaseDetector(dbService);

// Detect failure from skill execution
const execution = {
  skill_id: 'my-skill-001',
  input: { param: 'value' },
  success: false,
  error: new Error('Syntax error: unexpected token'),
  timestamp: new Date(),
};

const edgeCase = await detector.detectFailure(execution);

if (edgeCase) {
  console.log(`Edge case detected: ${edgeCase.id}`);
  console.log(`Category: ${edgeCase.error_type}, Severity: ${edgeCase.severity}`);
}
```

### 2. Edge Case Deduplicator (`src/services/edge-case-deduplicator.ts`)

**Purpose:** Prevents redundant tracking by detecting similar failures.

**Deduplication Strategy:**
- **Similarity threshold:** 90% (configurable)
- **Similarity calculation:**
  - Same skill + error type: 40%
  - Error message similarity: 30% (Levenshtein distance)
  - Stack trace similarity: 30% (Levenshtein distance)

**Usage:**
```typescript
import { EdgeCaseDeduplicator } from './services/edge-case-deduplicator';

const deduplicator = new EdgeCaseDeduplicator(dbService);

const isDuplicate = await deduplicator.deduplicateEdgeCase(edgeCase);

if (isDuplicate) {
  console.log('Edge case is duplicate, occurrence count incremented');
} else {
  console.log('Edge case is unique, stored as new');
}

// Get deduplication statistics
const stats = await deduplicator.getStats();
console.log(`Total edge cases: ${stats.totalEdgeCases}`);
console.log(`Avg occurrences: ${stats.avgOccurrenceCount}`);
```

### 3. Edge Case Analyzer (`src/jobs/edge-case-analyzer.ts`)

**Purpose:** Analyzes edge cases to detect patterns and generate dashboard data.

**Pattern Detection:**
- Groups edge cases by skill + error type
- Requires ≥3 occurrences to form a pattern
- Extracts common error substrings
- Identifies common input patterns
- Calculates average severity

**Usage:**
```typescript
import { EdgeCaseAnalyzer } from './jobs/edge-case-analyzer';

const analyzer = new EdgeCaseAnalyzer(dbService);

// Generate comprehensive analysis report
const report = await analyzer.analyzeEdgeCases();

console.log(`Total edge cases: ${report.totalEdgeCases}`);
console.log(`New edge cases: ${report.newEdgeCases}`);
console.log(`Patterns detected: ${report.patternsDetected}`);

// Top failures
for (const failure of report.topFailures) {
  console.log(`${failure.skill_id}: ${failure.total_failures} failures (${failure.error_type})`);
}

// Generate failure patterns
const patterns = await analyzer.generatePatterns();

for (const pattern of patterns) {
  console.log(`Pattern ${pattern.pattern_id}:`);
  console.log(`  Skill: ${pattern.skill_id}`);
  console.log(`  Error Type: ${pattern.error_type}`);
  console.log(`  Occurrences: ${pattern.occurrence_count}`);
  console.log(`  Common Errors: ${pattern.common_errors.join(', ')}`);
}
```

## Database Schema

### Edge Cases Table

```sql
CREATE TABLE edge_cases (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL,
  error_type TEXT NOT NULL,       -- syntax, runtime, validation, timeout, dependency, unknown
  severity TEXT NOT NULL,          -- low, medium, high, critical
  error_message TEXT,
  stack_trace TEXT,
  input_context TEXT,              -- JSON string of skill input
  output_context TEXT,             -- Skill output (if any)
  first_seen DATETIME,
  last_seen DATETIME,
  occurrence_count INTEGER,
  status TEXT,                     -- new, acknowledged, fixed, ignored
  metadata TEXT                    -- JSON string
);
```

### Failure Patterns Table

```sql
CREATE TABLE failure_patterns (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL,
  error_type TEXT NOT NULL,
  common_errors TEXT,              -- JSON array of common error substrings
  common_inputs TEXT,              -- JSON array of common input patterns
  occurrence_count INTEGER,
  severity TEXT,
  suggested_fix TEXT,              -- NULL in Phase 1, populated in Phase 4
  status TEXT,                     -- detected, analyzing, fixed, ignored
  first_detected DATETIME,
  last_updated DATETIME,
  metadata TEXT                    -- JSON string
);
```

## Monitoring Dashboard Queries

### Most Common Failures

```sql
SELECT skill_id, error_type, SUM(occurrence_count) as total_failures
FROM edge_cases
WHERE status = 'new'
GROUP BY skill_id, error_type
ORDER BY total_failures DESC
LIMIT 10;
```

**Example Output:**
```
skill_id            | error_type  | total_failures
--------------------|-------------|---------------
cfn-coordination    | timeout     | 127
skill-deployment    | validation  | 89
edge-case-detector  | dependency  | 42
```

### High Severity Failures

```sql
SELECT * FROM edge_cases
WHERE severity IN ('critical', 'high')
  AND status = 'new'
ORDER BY last_seen DESC;
```

### Failure Trends (Last 30 Days)

```sql
SELECT DATE(first_seen) as date, COUNT(*) as failures
FROM edge_cases
GROUP BY DATE(first_seen)
ORDER BY date DESC
LIMIT 30;
```

### Pattern Detection Results

```sql
SELECT
  skill_id,
  error_type,
  occurrence_count,
  severity,
  common_errors
FROM failure_patterns
WHERE status = 'detected'
ORDER BY occurrence_count DESC;
```

## Integration with Phase 4 (Future)

Phase 4 will close the feedback loop by:

1. **Automated Fix Generation:**
   - LLM analyzes failure patterns
   - Generates skill improvement proposals
   - Validates proposals against test cases

2. **Success Tracking:**
   - Monitors fix effectiveness
   - Tracks reduction in edge case occurrences
   - Measures skill quality improvement over time

3. **Continuous Learning:**
   - Feeds successful fixes back into skill templates
   - Updates skill documentation with common pitfalls
   - Builds knowledge base of error resolutions

**Database Linkage:**
- Edge cases and patterns are stored with `status` field
- Phase 4 will update status: `new` → `analyzing` → `fixed`
- `suggested_fix` field will be populated by LLM analysis
- Success metrics tracked in new `edge_case_resolutions` table

## Configuration

### Detector Configuration

```typescript
const detector = new EdgeCaseDetector(dbService, logger, {
  enableDeduplication: true,        // Enable automatic deduplication
  minSeverity: Severity.LOW,        // Minimum severity to track
  customRules: [                    // Custom categorization rules
    {
      pattern: /database connection/i,
      category: ErrorCategory.DEPENDENCY,
      severity: Severity.HIGH,
    },
  ],
});
```

### Deduplicator Configuration

```typescript
const deduplicator = new EdgeCaseDeduplicator(dbService, logger, {
  similarityThreshold: 0.90,        // 90% similarity = duplicate
  maxAgedays: 30,                   // Only compare to cases <30 days old
  maxCandidates: 50,                // Max candidates to check per edge case
});
```

### Analyzer Configuration

```typescript
const analyzer = new EdgeCaseAnalyzer(dbService, logger, {
  minPatternOccurrences: 3,         // Min occurrences to form pattern
  maxPatterns: 50,                  // Max patterns per analysis run
  minSubstringLength: 10,           // Min length for common substrings
});
```

## Scheduled Analysis (Cron Job)

```typescript
import { CronJob } from 'cron';
import { EdgeCaseAnalyzer } from './jobs/edge-case-analyzer';

// Run analysis daily at 2 AM
const job = new CronJob('0 2 * * *', async () => {
  const analyzer = new EdgeCaseAnalyzer(dbService);
  const report = await analyzer.analyzeEdgeCases();

  // Send report to dashboard/notification system
  await sendReport(report);
});

job.start();
```

## Best Practices

1. **Capture Context:**
   - Always include input parameters
   - Capture partial output if available
   - Include agent_id and task_id for tracing

2. **Categorize Accurately:**
   - Use custom rules for domain-specific errors
   - Keep error messages descriptive
   - Include stack traces when available

3. **Monitor Regularly:**
   - Review high severity failures daily
   - Analyze patterns weekly
   - Track trends monthly

4. **Act on Patterns:**
   - Prioritize by severity + occurrence count
   - Address critical patterns immediately
   - Document fixes in `suggested_fix` field (Phase 4)

5. **Clean Up:**
   - Mark resolved edge cases as `fixed`
   - Archive old edge cases after 90 days
   - Keep patterns for historical analysis

## Performance Considerations

- **Deduplication cost:** O(n) where n = maxCandidates (default: 50)
- **Pattern detection cost:** O(m*k) where m = edge cases, k = patterns
- **Database indexes:** Optimize queries with indexes on `skill_id`, `error_type`, `severity`
- **Batch processing:** Process edge cases in batches for large volumes

## Testing

Run comprehensive test suite:

```bash
npm test tests/edge-case-detector.test.ts
```

**Coverage Target:** ≥85%

**Test Categories:**
- Edge case detection (all error types)
- Categorization logic
- Deduplication algorithm
- Similarity calculations
- Pattern detection
- Dashboard queries
- Integration scenarios

## API Reference

See inline TypeScript documentation in:
- `src/services/edge-case-detector.ts`
- `src/services/edge-case-deduplicator.ts`
- `src/jobs/edge-case-analyzer.ts`

## Migration

Apply database migration:

```bash
# SQLite
sqlite3 data/skills.db < src/db/migrations/002-add-edge-cases.sql

# PostgreSQL
psql -d skills_db -f src/db/migrations/002-add-edge-cases.sql
```

## Troubleshooting

### Edge cases not being detected

**Cause:** Execution marked as `success: true`
**Solution:** Ensure failed executions have `success: false` and `error` field set

### Duplicate edge cases stored

**Cause:** Deduplication disabled or similarity threshold too high
**Solution:** Enable deduplication: `enableDeduplication: true`, lower threshold to 0.85

### No patterns detected

**Cause:** Insufficient edge cases (< 3 per skill+error type)
**Solution:** Wait for more failures or lower `minPatternOccurrences`

### High database growth

**Cause:** All edge cases stored without cleanup
**Solution:** Implement periodic cleanup job to archive old edge cases

## Future Enhancements

- **Phase 2:** LLM-powered root cause analysis
- **Phase 3:** Automated test case generation
- **Phase 4:** Self-healing skills (auto-fix generation)
- **Real-time alerts:** Slack/email notifications for critical failures
- **Dashboard UI:** Web interface for monitoring edge cases
- **Skill health scores:** Aggregate quality metrics per skill

## References

- **Integration Plan:** `planning/INTEGRATION_STANDARDIZATION_PLAN.md`
- **Database Schema:** `src/db/migrations/002-add-edge-cases.sql`
- **Tests:** `tests/edge-case-detector.test.ts`
- **Phase 4 Design:** TBD (future work)
