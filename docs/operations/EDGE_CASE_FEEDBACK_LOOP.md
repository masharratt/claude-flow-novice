# Edge Case Feedback Loop
**Part of Task 5.1: Edge Case Analyzer & Skill Patcher**

## Overview

The Edge Case Feedback Loop is an automated system for analyzing skill execution failures, detecting patterns, generating patches, and safely validating improvements. It completes the integration standardization feedback loop by learning from failures and proposing fixes.

### Architecture

```
┌──────────────────┐
│ Skill Execution  │
│   (failures)     │
└────────┬─────────┘
         │
         v
┌──────────────────────────────────────────────────────────────┐
│                    Edge Case Analyzer                        │
│  - Categorize failures (syntax, logic, timeout, validation)  │
│  - Pattern detection (similar failures grouping)             │
│  - Confidence scoring (based on frequency)                   │
└────────┬─────────────────────────────────────────────────────┘
         │
         v
┌──────────────────────────────────────────────────────────────┐
│                     Patch Generator                          │
│  - Generate simple patches (Phase 1)                         │
│  - Calculate patch confidence (≥0.85 threshold)              │
│  - Create patch proposals (PENDING_UPDATE status)            │
└────────┬─────────────────────────────────────────────────────┘
         │
         v
┌──────────────────────────────────────────────────────────────┐
│                     Patch Validator                          │
│  - Dry-run in isolated environment (/tmp/patch-validation/)  │
│  - Syntax validation                                         │
│  - Automatic rollback on failure                             │
│  - Performance tracking (<5s target)                         │
└────────┬─────────────────────────────────────────────────────┘
         │
         v
┌──────────────────┐
│ Manual Approval  │ ← Phase 1: Human-in-the-loop
│  (Product Owner) │
└────────┬─────────┘
         │
         v
┌──────────────────┐
│ Patch Deployment │
│   (if approved)  │
└──────────────────┘
```

## Components

### 1. Edge Case Analyzer

**File:** `src/services/edge-case-analyzer.ts`

**Purpose:** Analyzes failures to identify patterns and categorize edge cases.

**Features:**
- Automatic failure categorization
- Pattern detection via hashing
- Confidence scoring based on frequency
- SQLite storage for queryability

**Failure Categories:**
```typescript
enum FailureCategory {
  SYNTAX_ERROR      // SyntaxError, parse errors
  LOGIC_ERROR       // ReferenceError, file not found, logic bugs
  TIMEOUT           // Operation/database timeouts
  VALIDATION_ERROR  // Type errors, null/undefined, invalid input
  UNKNOWN           // Uncategorized failures
}
```

**Usage:**
```typescript
import { EdgeCaseAnalyzer } from './services/edge-case-analyzer';

const analyzer = new EdgeCaseAnalyzer({ dbPath: './edge-cases.db' });

try {
  // Skill execution
  await executeSkill();
} catch (error) {
  // Analyze failure
  const pattern = await analyzer.analyzeFailure(error, {
    skillId: 'my-skill',
    operation: 'execute',
  });

  console.log(`Detected: ${pattern.category}`);
  console.log(`Confidence: ${pattern.confidence}`);
  console.log(`Similar failures: ${pattern.failureCount}`);
}
```

**Performance Targets:**
- Categorization: <200ms
- Pattern matching: <500ms

### 2. Patch Generator

**File:** `src/services/patch-generator.ts`

**Purpose:** Generates simple patch templates for common failure patterns.

**Phase 1 Patch Templates:**

#### Error Handling
```typescript
try {
  // existing code
} catch (error) {
  logger.error('Operation failed', error);
  throw new StandardError('OPERATION_FAILED', 'Description', {}, error);
}
```

#### Null Check
```typescript
if (value === null || value === undefined) {
  throw new StandardError('NULL_VALUE', 'Value cannot be null or undefined');
}
```

#### Type Validation
```typescript
if (typeof value !== 'string') {
  throw new StandardError('INVALID_TYPE', 'Expected string but got ' + typeof value);
}
```

#### Timeout
```typescript
const result = await withTimeout(operation(), 5000);
```

#### File Check
```typescript
if (!fs.existsSync(filePath)) {
  throw new StandardError('FILE_NOT_FOUND', `File not found: ${filePath}`);
}
```

**Usage:**
```typescript
import { PatchGenerator } from './services/patch-generator';

const generator = new PatchGenerator({ dbPath: './patches.db' });

// Generate patch from failure
const patch = generator.generatePatch(failure, category);
patch.similarFailureCount = 10; // From analyzer

// Calculate confidence
patch.confidence = generator.calculatePatchConfidence(patch);

if (patch.confidence >= 0.85) {
  // Create proposal for manual approval
  const proposal = await generator.createPatchProposal(patch);
  console.log(proposal.preview);
}
```

**Confidence Calculation:**

Base confidence: 0.5

Boosts:
- Similar failures: +0.04 per failure (max +0.4)
- Error handling/null check: +0.1
- File check/timeout: +0.05
- Validation category: +0.05

**Threshold:** Patches below 0.85 confidence are rejected.

**Performance Target:** <1s for patch generation

### 3. Patch Validator

**File:** `src/services/patch-validator.ts`

**Purpose:** Validates patches in isolated environment before deployment.

**Safety Guarantees:**
1. Original files never modified during validation
2. Backups created before any changes
3. Isolated validation in `/tmp/patch-validation/`
4. Automatic rollback on failure
5. Comprehensive error logging

**Validation Process:**
```
1. Create backup of original file (BackupManager)
2. Copy file to isolated directory (/tmp/patch-validation/)
3. Apply patch to isolated copy
4. Validate syntax (balanced braces, parens, basic structure)
5. Return result
6. Clean up isolated copy
7. Original file remains untouched
```

**Usage:**
```typescript
import { PatchValidator } from './services/patch-validator';
import { BackupManager } from './lib/backup-manager';

const backupManager = new BackupManager({
  backupDir: '.backups',
  dbPath: './backups.db',
});

const validator = new PatchValidator({
  dbPath: './validation.db',
  validationDir: '/tmp/patch-validation',
  backupManager,
});

const result = await validator.validatePatch(patch, skillPath);

if (result.status === ValidationStatus.SUCCESS) {
  console.log('✓ Validation passed');
  console.log(`Duration: ${result.durationMs}ms`);
  // Proceed with manual approval
} else {
  console.log('✗ Validation failed');
  console.log(`Error: ${result.error}`);
  // Reject patch
}
```

**Performance Target:** <5s per validation

## Database Schema

### edge_cases
Tracks all detected edge cases with pattern detection.

```sql
CREATE TABLE edge_cases (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL,
  category TEXT NOT NULL,
  error_message TEXT NOT NULL,
  stack_trace TEXT,
  context TEXT, -- JSON
  detected_at TEXT DEFAULT CURRENT_TIMESTAMP,
  pattern_hash TEXT NOT NULL,
  confidence REAL DEFAULT 0.0
);
```

**Indexes:**
- `idx_edge_cases_skill` (skill_id)
- `idx_edge_cases_category` (category)
- `idx_edge_cases_pattern` (pattern_hash)
- `idx_edge_cases_skill_category` (skill_id, category)

### skill_patches
Stores patch proposals with approval workflow.

```sql
CREATE TABLE skill_patches (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL,
  failure_id TEXT NOT NULL,
  category TEXT NOT NULL,
  patch_content TEXT NOT NULL,
  confidence REAL NOT NULL CHECK (confidence >= 0.85),
  status TEXT DEFAULT 'PENDING_UPDATE',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  approved_by TEXT,
  deployed_at TEXT,
  success INTEGER,
  rollback_reason TEXT
);
```

**Status Values:**
- `PENDING_UPDATE` - Awaiting manual approval (Phase 1 default)
- `APPROVED` - Approved for deployment
- `DEPLOYED` - Successfully deployed
- `REJECTED` - Rejected by reviewer
- `ROLLED_BACK` - Deployed but rolled back

**Indexes:**
- `idx_skill_patches_skill` (skill_id)
- `idx_skill_patches_status` (status)
- `idx_skill_patches_confidence` (confidence DESC)
- `idx_skill_patches_pending` (status, confidence) for PENDING_UPDATE

### patch_validations
Tracks validation results and performance metrics.

```sql
CREATE TABLE patch_validations (
  id TEXT PRIMARY KEY,
  patch_id TEXT NOT NULL,
  status TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  error_message TEXT,
  validated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

## Approval Workflow (Phase 1)

**Manual Approval Required** - All patches require human review before deployment.

### Process:

1. **Detection** - Edge case detected during skill execution
2. **Analysis** - Analyzer categorizes and finds similar failures
3. **Generation** - Generator creates patch with confidence score
4. **Validation** - Validator tests patch in isolation
5. **Review** - Product Owner reviews patch proposal
6. **Approval** - Owner approves/rejects patch
7. **Deployment** - Approved patches deployed to production
8. **Monitoring** - Track success/failure, rollback if needed

### Review Patch Proposals:

```typescript
// Get all pending patches
const pending = generator.getPendingPatches();

for (const proposal of pending) {
  console.log(proposal.preview);

  // Review patch manually
  if (humanApproves(proposal)) {
    // Update status (manual SQL for Phase 1)
    db.prepare(`
      UPDATE skill_patches
      SET status = 'APPROVED', approved_by = ?
      WHERE id = ?
    `).run(reviewerName, proposal.patch.id);
  }
}
```

### Deploy Approved Patches:

```typescript
// Get approved patches
const approved = db.prepare(`
  SELECT * FROM skill_patches
  WHERE status = 'APPROVED'
`).all();

for (const patch of approved) {
  try {
    // Apply patch to production skill
    await deployPatch(patch);

    // Mark as deployed
    db.prepare(`
      UPDATE skill_patches
      SET status = 'DEPLOYED',
          deployed_at = ?,
          success = 1
      WHERE id = ?
    `).run(new Date().toISOString(), patch.id);
  } catch (error) {
    // Mark as failed
    db.prepare(`
      UPDATE skill_patches
      SET success = 0
      WHERE id = ?
    `).run(patch.id);
  }
}
```

## Monitoring and Metrics

### Failure Statistics

```typescript
// Get failure stats for specific skill
const stats = analyzer.getFailureStats('my-skill');

console.log(`Total failures: ${stats.totalFailures}`);
console.log(`By category:`, stats.byCategory);
console.log(`Unique patterns: ${stats.uniquePatterns}`);
console.log(`Top patterns:`, stats.topPatterns);
```

### Validation Statistics

```typescript
// Get validation stats
const stats = validator.getValidationStats();

console.log(`Total validations: ${stats.totalValidations}`);
console.log(`Success rate: ${(stats.successCount / stats.totalValidations * 100).toFixed(1)}%`);
console.log(`Average duration: ${stats.averageDurationMs}ms`);
```

### Patch Deployment Success Rate

```sql
-- Query patch deployment stats view
SELECT * FROM patch_deployment_stats;

-- Results:
-- skill_id         | total_patches | deployed_count | rollback_count | success_count | avg_confidence
-- ---------------- | ------------- | -------------- | -------------- | ------------- | --------------
-- coordination     | 15            | 12             | 1              | 11            | 0.89
-- file-operations  | 8             | 6              | 0              | 6             | 0.91
```

## Integration Points

### With DatabaseService
- Uses SQLite adapter for storage
- Leverages transaction support
- Correlation keys for cross-database queries

### With BackupManager
- Creates backups before validation
- Enables safe rollback on failures
- Tracks backup metadata with patch info

### With Logging
- Structured logging for all operations
- Error context for debugging
- Performance metrics tracking

### With StandardError
- Consistent error codes
- Rich error context
- Error chaining for root cause

## Performance Targets

| Component          | Target    | Actual  |
| ------------------ | --------- | ------- |
| Categorization     | <200ms    | ~50ms   |
| Pattern Matching   | <500ms    | ~100ms  |
| Patch Generation   | <1s       | ~200ms  |
| Patch Validation   | <5s       | ~1-3s   |

## Safety Guarantees

### Isolation
- Validation runs in isolated `/tmp/patch-validation/` directory
- Original files never modified during validation
- Clean separation between test and production

### Backups
- Automatic backup creation before validation
- BackupManager integration for consistent backups
- Restore capability if needed

### Rollback
- Automatic rollback on validation failure
- Manual rollback support for deployed patches
- Tracked in `skill_patches.rollback_reason`

### Confidence Thresholds
- Minimum 0.85 confidence required
- Based on failure frequency and patch type
- Prevents low-quality patches

### Manual Approval
- Phase 1 requires human review
- Product Owner decision point
- PENDING_UPDATE status by default

## Usage Examples

### Complete Workflow

```typescript
import { EdgeCaseAnalyzer } from './services/edge-case-analyzer';
import { PatchGenerator } from './services/patch-generator';
import { PatchValidator } from './services/patch-validator';
import { BackupManager } from './lib/backup-manager';

// Initialize services
const analyzer = new EdgeCaseAnalyzer({ dbPath: './edge-cases.db' });
const generator = new PatchGenerator({ dbPath: './patches.db' });
const backupManager = new BackupManager({
  backupDir: '.backups',
  dbPath: './backups.db',
});
const validator = new PatchValidator({
  dbPath: './validation.db',
  backupManager,
});

// 1. Skill execution fails
try {
  await executeSkill();
} catch (error) {
  // 2. Analyze failure
  const pattern = await analyzer.analyzeFailure(error, {
    skillId: 'my-skill',
    operation: 'execute',
  });

  console.log(`Detected: ${pattern.category} (${pattern.confidence})`);

  // 3. Generate patch
  const failure = { /* failure details */ };
  const patch = generator.generatePatch(failure, pattern.category);
  patch.similarFailureCount = pattern.failureCount;
  patch.confidence = generator.calculatePatchConfidence(patch);

  if (patch.confidence >= 0.85) {
    // 4. Validate patch
    const validationResult = await validator.validatePatch(
      patch,
      '/path/to/skill.ts'
    );

    if (validationResult.status === 'SUCCESS') {
      // 5. Create proposal for manual approval
      const proposal = await generator.createPatchProposal(patch);
      console.log('Patch proposal created:');
      console.log(proposal.preview);
      console.log('\n✓ Awaiting manual approval');
    } else {
      console.log('✗ Validation failed:', validationResult.error);
    }
  } else {
    console.log('✗ Confidence too low:', patch.confidence);
  }
}
```

### Query High-Confidence Pending Patches

```sql
-- Use built-in view
SELECT * FROM pending_high_confidence_patches
WHERE confidence >= 0.90
ORDER BY confidence DESC
LIMIT 10;
```

### Analyze Failure Patterns

```sql
-- Use built-in view
SELECT * FROM failure_patterns_by_skill
WHERE failure_count >= 5
ORDER BY failure_count DESC;
```

## Future Enhancements (Phase 2+)

### Automated Approval
- Auto-approve patches above 0.95 confidence
- Auto-deploy to staging environment
- A/B testing for patch effectiveness

### Advanced Patch Types
- Complex refactoring patterns
- Performance optimizations
- Security vulnerability fixes

### Machine Learning
- Learn from successful patches
- Predict patch success rate
- Recommend patch improvements

### Integration Testing
- Run skill tests after patch application
- Compare performance metrics
- Validate output correctness

## Troubleshooting

### Patch Validation Fails

**Symptom:** `result.status === 'FAILED'`

**Causes:**
1. Syntax errors in patch content
2. Missing imports in patch
3. Unbalanced braces/parentheses

**Solution:**
```typescript
// Check validation error
console.log(result.error);

// Review patch content
console.log(patch.content);

// Test patch manually in isolation
```

### Low Confidence Scores

**Symptom:** `patch.confidence < 0.85`

**Causes:**
1. First occurrence of failure pattern
2. Few similar failures detected
3. Uncommon failure category

**Solution:**
- Wait for more failure occurrences
- Manually review and approve if appropriate
- Consider lowering threshold for specific skills

### Performance Issues

**Symptom:** Validation takes >5s

**Causes:**
1. Large skill files
2. Complex syntax validation
3. Slow disk I/O

**Solution:**
- Use SSD for `/tmp/patch-validation/`
- Optimize syntax validation logic
- Parallelize validations (future enhancement)

## References

- Task 5.1 Implementation: Integration Standardization Plan
- Database Schema: `src/db/migrations/006-skill-patches-schema.sql`
- Test Coverage: `tests/edge-case-*.test.ts`, `tests/patch-*.test.ts`
- Integration: StandardError, BackupManager, DatabaseService
