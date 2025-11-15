# Edge Case Tracking System

## Overview

The Edge Case Tracking System captures skill execution failures, detects recurring patterns, and automatically generates skill update proposals to improve system resilience.

## Architecture

```
Skill Execution
    ├─ Success (exit 0) ──> Continue
    └─ Failure (exit ≠0) ──> track-edge-case.sh
                                 ├─ Record edge case
                                 ├─ Calculate occurrence count
                                 └─ Check threshold (≥3)
                                     ├─ Below threshold ──> Store only
                                     └─ Above threshold ──> generate-skill-update.sh
                                                                ├─ Create test case
                                                                ├─ Propose logic changes
                                                                ├─ Update documentation
                                                                └─ Increment version
```

## Database Schema

### edge_cases Table

```sql
CREATE TABLE edge_cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    skill_name TEXT NOT NULL,
    skill_version TEXT NOT NULL,
    exit_code INTEGER NOT NULL,
    input_params TEXT NOT NULL,
    expected_output TEXT,
    actual_output TEXT,
    error_message TEXT,
    timestamp TEXT DEFAULT (datetime('now')),
    occurrence_count INTEGER DEFAULT 1,
    edge_case_hash TEXT NOT NULL UNIQUE,
    status TEXT DEFAULT 'new' CHECK(status IN ('new', 'analyzing', 'proposal_generated', 'resolved')),
    metadata TEXT
);
```

### Indexes

- `idx_edge_cases_skill`: (skill_name, skill_version)
- `idx_edge_cases_status`: (status)
- `idx_edge_cases_hash`: (edge_case_hash)
- `idx_edge_cases_timestamp`: (timestamp)

## Usage

### 1. Record Edge Case

```bash
track-edge-case.sh --action record \
  --skill-name "cfn-coordination" \
  --skill-version "1.0.0" \
  --exit-code 1 \
  --input-params "task-id=123 timeout=30" \
  --expected-output "success" \
  --actual-output "" \
  --error-message "Connection timeout after 30s"
```

**Output:**
```
Recorded new edge case: a3f8b2c1d4e5f6...
```

### 2. Query Recurring Edge Cases

```bash
track-edge-case.sh --action query --skill-name "cfn-coordination"
```

**Output:**
```
skill_name         skill_version  exit_code  occurrence_count  status                timestamp
-----------------  -------------  ---------  ----------------  --------------------  -------------------
cfn-coordination   1.0.0          1          5                 proposal_generated    2025-11-15 10:30:00
cfn-agent-spawn    2.1.0          127        3                 new                   2025-11-15 09:15:00
```

### 3. Get Edge Case Details

```bash
track-edge-case.sh --action details --edge-case-hash "a3f8b2c1d4e5f6..."
```

**Output (JSON):**
```json
[
  {
    "id": 1,
    "skill_name": "cfn-coordination",
    "skill_version": "1.0.0",
    "exit_code": 1,
    "input_params": "task-id=123 timeout=30",
    "expected_output": "success",
    "actual_output": "",
    "error_message": "Connection timeout after 30s",
    "timestamp": "2025-11-15 10:30:00",
    "occurrence_count": 5,
    "edge_case_hash": "a3f8b2c1d4e5f6...",
    "status": "proposal_generated",
    "metadata": "{}"
  }
]
```

### 4. Update Edge Case Status

```bash
track-edge-case.sh --action update-status \
  --edge-case-hash "a3f8b2c1d4e5f6..." \
  --status "resolved"
```

## Edge Case Hash Calculation

The system generates a unique hash for each edge case pattern:

```bash
hash = SHA256(skill_name:exit_code:input_params)
```

**Example:**
- skill_name: `cfn-coordination`
- exit_code: `1`
- input_params: `task-id=123 timeout=30`
- hash: `a3f8b2c1d4e5f6a7b8c9d0e1f2...`

This ensures identical failures are tracked together, incrementing the occurrence count.

## Recurrence Detection

**Threshold:** ≥3 occurrences

When an edge case reaches the recurrence threshold, the system:
1. Logs warning message
2. Automatically triggers `generate-skill-update.sh`
3. Updates status to `analyzing`
4. Creates proposal artifacts

## Skill Update Proposal

When threshold is reached, `generate-skill-update.sh` creates:

```
proposals/
└── cfn-coordination_a3f8b2c1_v1.0.1/
    ├── PROPOSAL_SUMMARY.md      # Overview and next steps
    ├── test_case.md              # Regression test
    ├── logic_proposal.md         # Proposed code changes
    └── documentation_update.md   # Changelog and migration guide
```

### Proposal Contents

#### PROPOSAL_SUMMARY.md
- Edge case overview
- Pattern analysis
- Approval checklist
- Execution commands

#### test_case.md
- Input parameters
- Expected vs actual output
- Executable test script
- Validation criteria

#### logic_proposal.md
- Input validation enhancements
- Error handling improvements
- Edge case handling logic
- Implementation priority

#### documentation_update.md
- Changelog entry (semantic versioning)
- Migration guide
- Updated examples
- Testing recommendations

## Integration Patterns

### Pattern 1: Skill Wrapper

```bash
#!/usr/bin/env bash
set -euo pipefail

SKILL_NAME="cfn-coordination"
SKILL_VERSION="1.0.0"
INPUT_PARAMS="$*"

# Execute skill
START_TIME=$(date +%s%3N)
output=$(./cfn-coordination.sh "$@" 2>&1) || exit_code=$?
END_TIME=$(date +%s%3N)

if [[ ${exit_code:-0} -ne 0 ]]; then
    # Track edge case
    /path/to/track-edge-case.sh --action record \
        --skill-name "$SKILL_NAME" \
        --skill-version "$SKILL_VERSION" \
        --exit-code "$exit_code" \
        --input-params "$INPUT_PARAMS" \
        --actual-output "$output" \
        --error-message "$output"
fi

exit ${exit_code:-0}
```

### Pattern 2: Post-Execution Hook

```bash
# .claude/hooks/cfn-skill-execution.sh
#!/usr/bin/env bash
set -euo pipefail

SKILL_NAME="$1"
SKILL_VERSION="$2"
EXIT_CODE="$3"
INPUT_PARAMS="$4"
OUTPUT="$5"

if [[ $EXIT_CODE -ne 0 ]]; then
    /path/to/track-edge-case.sh --action record \
        --skill-name "$SKILL_NAME" \
        --skill-version "$SKILL_VERSION" \
        --exit-code "$EXIT_CODE" \
        --input-params "$INPUT_PARAMS" \
        --actual-output "$OUTPUT"
fi
```

### Pattern 3: Agent Integration

```bash
# Within agent execution
execute_skill() {
    local skill_name="$1"
    local skill_version="$2"
    shift 2
    local params="$*"

    local output exit_code
    output=$("${skill_name}.sh" "$@" 2>&1) || exit_code=$?

    if [[ ${exit_code:-0} -ne 0 ]]; then
        # Track edge case
        track-edge-case.sh --action record \
            --skill-name "$skill_name" \
            --skill-version "$skill_version" \
            --exit-code "$exit_code" \
            --input-params "$params" \
            --actual-output "$output" \
            --metadata "{\"agent_id\": \"$AGENT_ID\"}"
    fi

    return ${exit_code:-0}
}
```

## Pattern Analysis

The system performs automatic pattern analysis to categorize failures:

### Timeout Patterns
- **Detection:** Error message contains "timeout"
- **Proposal:** Increase timeout threshold, implement retry logic

### Connection Patterns
- **Detection:** Error message contains "connection"
- **Proposal:** Implement connection retry with exponential backoff

### Not Found Patterns
- **Detection:** Error message contains "not found"
- **Proposal:** Add existence check before operation

### Permission Patterns
- **Detection:** Error message contains "permission"
- **Proposal:** Validate permissions before execution

### Command Not Found
- **Detection:** Exit code 127
- **Proposal:** Add dependency validation at script initialization

## Lifecycle Management

### Edge Case States

1. **new** - Newly recorded, below threshold
2. **analyzing** - Threshold reached, analysis in progress
3. **proposal_generated** - Proposal created, awaiting review
4. **resolved** - Fix implemented and validated

### State Transitions

```
new ─────────────> analyzing ─────────> proposal_generated ─────────> resolved
  (threshold=3)      (auto)              (manual review)          (deployment)
```

## Metrics and Reporting

### Query All Edge Cases

```bash
sqlite3 workflow-codification.db "SELECT skill_name, COUNT(*), SUM(occurrence_count) FROM edge_cases GROUP BY skill_name ORDER BY SUM(occurrence_count) DESC;"
```

### Query by Status

```bash
sqlite3 workflow-codification.db "SELECT * FROM edge_cases WHERE status = 'proposal_generated';"
```

### Monthly Trend

```bash
sqlite3 workflow-codification.db "
SELECT
    date(timestamp) as date,
    COUNT(*) as new_edge_cases,
    SUM(occurrence_count) as total_occurrences
FROM edge_cases
WHERE timestamp >= date('now', '-30 days')
GROUP BY date(timestamp)
ORDER BY date;
"
```

## Best Practices

### 1. Always Record Failures
Track all skill failures, even if they seem transient. Pattern detection requires data.

### 2. Include Context
Provide `expected_output` when possible to help pattern analysis.

### 3. Review Proposals Promptly
Edge cases impact production. Review and implement proposals within 48 hours.

### 4. Update Status
Mark edge cases as `resolved` after fix deployment to track effectiveness.

### 5. Monitor Occurrence Trends
Weekly review of high-occurrence edge cases to prioritize fixes.

### 6. Use Metadata
Store additional context (agent_id, task_id, environment) for debugging.

## Troubleshooting

### Issue: Duplicate Edge Cases
**Cause:** Hash collision or parameter variations
**Solution:** Review `edge_case_hash` calculation, ensure parameters are normalized

### Issue: Threshold Not Triggering
**Cause:** Each variation creates new hash
**Solution:** Normalize input parameters before hashing

### Issue: Proposal Generation Fails
**Cause:** Missing database record or invalid hash
**Solution:** Verify edge case exists: `track-edge-case.sh --action details --edge-case-hash <hash>`

## Security Considerations

### Sensitive Data in Parameters
- **Risk:** Input parameters may contain credentials
- **Mitigation:** Sanitize parameters before storage, use `metadata` for sensitive context

### Database Access
- **Risk:** Unauthorized access to failure patterns
- **Mitigation:** Set restrictive file permissions (600) on database file

### Proposal Review
- **Risk:** Automatic proposals may introduce vulnerabilities
- **Mitigation:** Always manually review before implementation

## Environment Variables

- `DB_PATH` - Database location (default: `./workflow-codification.db`)
- `RECURRENCE_THRESHOLD` - Threshold for proposal generation (default: 3)
- `PROPOSALS_DIR` - Proposal output directory (default: `./proposals`)

## Dependencies

- `bash` ≥4.0
- `sqlite3` ≥3.0
- `coreutils` (sha256sum, date, bc)

## Version History

- **v1.0.0** (2025-11-15) - Initial implementation
  - Edge case recording
  - Recurrence detection
  - Automatic proposal generation
  - Pattern analysis
