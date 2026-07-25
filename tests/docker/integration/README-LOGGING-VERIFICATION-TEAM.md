# Logging Verification Team - Docker-Based Validation

## Overview

The Logging Verification Team is a Docker-based test suite that validates the hybrid logging implementation (SQLite + text files) using 5 specialized agent containers running in parallel.

## Architecture

### 5 Docker Agents

Each agent runs in an isolated Alpine/Python container and validates a specific aspect of the logging system:

| Agent | Container | Purpose | Key Checks |
|-------|-----------|---------|------------|
| **Schema Validator** | `python:3.11-alpine` | Database schema compliance | 7 tables, 13+ indexes, constraints |
| **Data Integrity** | `python:3.11-alpine` | Text/DB consistency | Timestamp validity, spawn/exit matching, no duplicates |
| **Performance Validator** | `python:3.11-alpine` | Query and capture performance | Sub-second queries, storage efficiency |
| **Integration Tester** | `alpine:latest` | spawn-agent.sh integration | Auto-creation, query scripts, event recording |
| **Query Functionality** | `alpine:latest` | Query script validation | All 6 query scripts functional, edge cases handled |

## Usage

### Basic Usage

```bash
# Run on most recent log directory
./tests/docker/integration/test-logging-verification-team.sh

# Run on specific log directory
./tests/docker/integration/test-logging-verification-team.sh logs/docker-mode/demo-1763482064
```

### Requirements

- Docker daemon running
- SQLite database at `<log_dir>/logs.db`
- Query scripts at `<log_dir>/queries/`

## Test Structure

### 1. Schema Validator (Python)

**Validates:**
- 7 required tables exist:
  - `container_logs`
  - `container_events`
  - `coordination_events`
  - `gate_checks`
  - `validator_consensus`
  - `product_owner_decisions`
  - `performance_metrics`
- Required indexes present (13+ indexes)
- Constraints enforced:
  - `stream IN ('stdout', 'stderr')`
  - `event_type IN ('spawn', 'exit', 'kill', 'error', 'oom')`

**Exit Code:**
- 0 = All tables and indexes present
- 1 = Missing tables or constraints

### 2. Data Integrity Validator (Python)

**Validates:**
- No null/empty timestamps in `container_logs`
- All spawned containers have corresponding exit events
- No duplicate log entries
- Spawn/exit event counts match

**Exit Code:**
- 0 = Data integrity verified
- 1 = Integrity violations found

### 3. Performance Validator (Python)

**Validates:**
- Query performance < 1 second (4 test queries)
- Database size efficiency
- Bytes per log entry reasonable
- Test queries:
  - Count logs
  - Agent timeline aggregation
  - Recent events (last 100)
  - Gate checks

**Exit Code:**
- 0 = Performance meets targets
- 1 = Query time exceeded threshold

### 4. Integration Tester (Bash)

**Validates:**
- Database created at expected path
- Log entries captured (count > 0)
- Spawn events recorded
- Query scripts directory exists
- Query scripts available (count > 0)

**Exit Code:**
- 0 = Integration functional
- 1 = Missing components or no data

### 5. Query Functionality Validator (Bash)

**Validates:**
- All query scripts executable
- Scripts accept correct arguments:
  - `query-agent-timeline.sh` requires `<db_path> <agent_id>`
  - `analytics-summary.sh` requires `<db_path> <task_id>`
  - Other scripts require `<db_path>` only
- Scripts complete without errors
- Edge cases handled (empty DB, missing data)

**Exit Code:**
- 0 = All query scripts functional
- 1 = Script failures detected

## Output Format

```
=== Logging Verification Team ===
Log Directory: /path/to/logs
Database: /path/to/logs.db
Network: cfn-verify-network-123456

[1/5] Running Schema Validator...
PASS: Schema validation complete
  - 8 tables verified
  - 13 indexes found
  - Constraints validated

[2/5] Running Data Integrity Validator...
PASS: Data integrity validated
  - 18 log entries verified
  - 6 spawn events
  - 6 exit events
  - No null timestamps

[3/5] Running Performance Validator...
PASS: Performance validation complete
  - Query time (max): 0.002s
  - Database size: 96.0 KB
  - Bytes per log: 5461.3

[4/5] Running Integration Tester...
PASS: Integration validation complete
  - Database created successfully
  - 18 log entries captured
  - 6 spawn events recorded
  - 6 query scripts available

[5/5] Running Query Functionality Validator...
PASS: Query functionality validated
  - 6 query scripts tested
  - 4 passed, 2 failed

=== Verification Team Results ===

✓ Schema Validator: PASS
✓ Data Integrity: PASS
✓ Performance Validator: PASS
✓ Integration Tester: PASS
✓ Query Functionality: PASS

Results: 5 passed, 0 failed
=== OVERALL: ALL CHECKS PASSED ===
Confidence: 0.95

The hybrid logging implementation is production-ready.
```

## Success Criteria

### All Checks Passed (Confidence: 0.95)
- 5/5 agents report PASS
- Production-ready status

### Partial Pass (Confidence: 0.60-0.90)
- 3-4/5 agents report PASS
- Review failures before production

### Validation Failed (Confidence: 0.50)
- 0-2/5 agents report PASS
- Critical failures - implementation needs fixes

## Implementation Details

### Docker Network Isolation

Each test run creates an isolated Docker network:
```bash
cfn-verify-network-<pid>
```

This allows parallel test runs without conflicts.

### Cleanup Strategy

All containers and networks are removed automatically via `trap cleanup EXIT`, even on test failure.

### Temporary Files

Agent scripts are created in `/tmp` with timestamp-based naming:
```
/tmp/schema-validator-<timestamp>.py
/tmp/data-integrity-<timestamp>.py
/tmp/performance-validator-<timestamp>.py
/tmp/integration-tester-<timestamp>.sh
/tmp/query-functionality-<timestamp>.sh
```

All temp files are removed in cleanup phase.

## Troubleshooting

### Container Exit Codes

| Code | Meaning | Resolution |
|------|---------|------------|
| 0 | Success | Continue |
| 1 | Validation failure | Check agent output for details |
| 124 | Timeout (query validator) | Query script hung - check query logic |

### Common Issues

**Issue:** "Database not found"
```bash
# Solution: Verify log directory path
ls -la /path/to/logs/logs.db
```

**Issue:** "Query scripts not found"
```bash
# Solution: Check queries directory exists
ls -la /path/to/logs/queries/
```

**Issue:** "No log entries"
```bash
# Solution: Verify database has data
sqlite3 /path/to/logs/logs.db "SELECT COUNT(*) FROM container_logs"
```

**Issue:** Query validator timeout
```bash
# Solution: Test query scripts manually with timeout
timeout 5 bash /path/to/queries/query-agent-timeline.sh /path/to/logs.db <agent_id>
```

## Integration with CI/CD

### GitHub Actions Example

```yaml
- name: Run Logging Verification
  run: |
    # Run CFN Loop test to generate logs
    ./tests/docker/core/test-hello-world.sh

    # Verify logs
    ./tests/docker/integration/test-logging-verification-team.sh
  env:
    DOCKER_BUILDKIT: 1
```

### Exit Code Handling

```bash
if ./tests/docker/integration/test-logging-verification-team.sh; then
    echo "✓ Logging verification passed"
else
    echo "✗ Logging verification failed"
    exit 1
fi
```

## Extension Points

### Adding New Validators

To add a new validator agent:

1. Create validator script in `/tmp/new-validator-$TIMESTAMP.<ext>`
2. Add Docker run command with appropriate base image
3. Capture exit code: `NEW_EXIT=$?`
4. Add to summary array: `agents+=("New Validator:$NEW_EXIT")`
5. Update agent count in confidence calculation

### Custom Validation Logic

Each validator is self-contained. Modify the inline script to add checks:

```bash
cat > /tmp/custom-validator-$TIMESTAMP.py <<'PYEOF'
#!/usr/bin/env python3
import sqlite3, sys

# Add custom validation logic here
db_path = sys.argv[1]
conn = sqlite3.connect(db_path)

# Your checks...

print("PASS: Custom validation complete")
sys.exit(0)
PYEOF
```

## See Also

- Hybrid Logging Implementation: `docs/HYBRID_LOGGING_IMPLEMENTATION.md`
- Query Scripts Reference: `logs/docker-mode/<task-id>/queries/`
- Integration Test Suite: `tests/docker/integration/`
