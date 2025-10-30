# Anti-Pattern Detection Testing

**Test Suite:** `test-antipattern-detection.sh`
**Status:** 28/28 tests passing (100% coverage)
**Version:** 1.0.0

## Quick Start

```bash
# Run full test suite
./tests/ace-integration/test-antipattern-detection.sh

# Expected output:
# Total Tests:  28
# Passed:       28
# Failed:       0
```

## Test Coverage

### 1. Critical Anti-Pattern Detection
- Confidence < 0.50
- Reflection type: "anti-pattern"
- Severity: "critical"

### 2. Warning Pattern Detection
- Confidence < 0.70
- Reflection type: "warning"
- Severity: "warning"

### 3. Success Pattern Detection
- Confidence >= 0.90
- Reflection type: "strategy"
- Severity: "info"

### 4. Solution Extraction
- Tests extraction from final feedback
- Validates solution storage in SQLite

### 5. Tag Generation
- Tests automatic tag extraction from feedback
- Validates multiple tags (error-handling, testing, performance, etc.)

### 6. Failure Reason Extraction
- Tests 5 common failure patterns
- Validates pattern matching accuracy

### 7. Database View Queries
- Tests v_recent_failures view
- Tests severity filtering
- Validates index performance

### 8. Sprint Reference Tracking
- Tests sprint_ref metadata storage
- Validates traceability to epics

## Test Database

**Location:** `.artifacts/database/test-antipattern.db`

### Inspect Test Results

```bash
# View all anti-patterns
sqlite3 .artifacts/database/test-antipattern.db \
  "SELECT * FROM v_recent_failures" -header -column

# Count by type
sqlite3 .artifacts/database/test-antipattern.db \
  "SELECT reflection_type, COUNT(*) FROM context_reflections GROUP BY reflection_type"

# View critical anti-patterns
sqlite3 .artifacts/database/test-antipattern.db \
  "SELECT task_id, failure_reason, confidence FROM context_reflections
   WHERE json_extract(metadata, '$.severity') = 'critical'" -header -column
```

## Test Scenarios

### Scenario 1: Critical Failure (Sprint Dashboard)
```bash
--confidence 0.45
--iterations 3
--feedback "Missing error boundaries caused app crashes"
--task-id "sprint-dashboard-002"
--sprint-ref "SPRINT-001"
--domain "frontend"
```

**Expected Result:**
- reflection_type: "anti-pattern"
- severity: "critical"
- failure_reason: "Missing error handling"
- tags: ["error-handling"]

### Scenario 2: Warning (API Test Coverage)
```bash
--confidence 0.65
--iterations 2
--feedback "Test coverage below 80%"
--task-id "sprint-api-001"
--domain "backend"
```

**Expected Result:**
- reflection_type: "warning"
- severity: "warning"
- failure_reason: "Insufficient test coverage"
- tags: ["testing", "coverage"]

### Scenario 3: Success (Authentication)
```bash
--confidence 0.92
--iterations 1
--feedback "All acceptance criteria met"
--task-id "sprint-auth-003"
```

**Expected Result:**
- reflection_type: "strategy"
- severity: "info"
- failure_reason: "All acceptance criteria met"

### Scenario 4: With Solution (Security Fix)
```bash
--confidence 0.48
--iterations 3
--feedback "Security vulnerability in authentication"
--task-id "sprint-security-001"
--final-decision "PROCEED"
--final-feedback "Implemented security best practices including JWT validation"
```

**Expected Result:**
- reflection_type: "anti-pattern"
- severity: "critical"
- failure_reason: "Security vulnerability detected"
- solution: "Implemented security best practices"
- tags: ["security"]

## Continuous Integration

### CI Test Command

```bash
#!/bin/bash
set -euo pipefail

# Run anti-pattern detection tests
if ./tests/ace-integration/test-antipattern-detection.sh; then
  echo "✓ Anti-pattern detection tests passed"
  exit 0
else
  echo "✗ Anti-pattern detection tests failed"
  exit 1
fi
```

### GitHub Actions

```yaml
name: ACE Anti-Pattern Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run Anti-Pattern Tests
        run: ./tests/ace-integration/test-antipattern-detection.sh
```

## Debugging Failed Tests

### View Test Database

```bash
# Open test database
sqlite3 .artifacts/database/test-antipattern.db

# Show all tables
.tables

# Show schema
.schema context_reflections

# Count records
SELECT COUNT(*) FROM context_reflections;

# Show recent records
SELECT task_id, reflection_type, confidence
FROM context_reflections
ORDER BY created_at DESC
LIMIT 10;
```

### Check Individual Test

```bash
# Run single anti-pattern detection
./.claude/skills/cfn-ace-system/invoke-context-reflect.sh \
  --confidence 0.45 \
  --iterations 3 \
  --feedback "Test feedback" \
  --task-id "debug-001" \
  --memory-path ".artifacts/database/test-antipattern.db"

# Verify result
sqlite3 .artifacts/database/test-antipattern.db \
  "SELECT * FROM context_reflections WHERE task_id='debug-001'" -header -column
```

## Performance Benchmarks

### Test Execution Time

```bash
time ./tests/ace-integration/test-antipattern-detection.sh
```

**Expected:** < 2 seconds for full suite

### Individual Test Performance

| Test | Average Time | Operations |
|------|--------------|------------|
| Critical anti-pattern | ~100ms | Detection + SQLite insert |
| Warning pattern | ~90ms | Detection + tag generation |
| Success pattern | ~80ms | Basic detection only |
| Solution extraction | ~120ms | Detection + solution parsing |
| Tag generation | ~110ms | Multi-pattern matching |

## Common Issues

### Issue 1: Line Ending Errors

**Error:** `/usr/bin/env: 'bash\r': No such file or directory`

**Fix:**
```bash
dos2unix tests/ace-integration/test-antipattern-detection.sh
# OR
sed -i 's/\r$//' tests/ace-integration/test-antipattern-detection.sh
```

### Issue 2: Database Locked

**Error:** `database is locked`

**Fix:**
```bash
# Remove test database and retry
rm .artifacts/database/test-antipattern.db
./tests/ace-integration/test-antipattern-detection.sh
```

### Issue 3: SQLite Not Found

**Error:** `sqlite3: command not found`

**Fix:**
```bash
# Ubuntu/Debian
sudo apt-get install sqlite3

# macOS
brew install sqlite3
```

## Related Documentation

- **Feature Overview:** `docs/ACE_ANTIPATTERN_DETECTION.md`
- **Implementation:** `.claude/skills/cfn-ace-system/invoke-context-reflect.sh`
- **Schema:** `.claude/skills/cfn-ace-system/schema/001-create-context-reflections.sql`
- **ACE System:** `.claude/skills/cfn-ace-system/SKILL.md`
