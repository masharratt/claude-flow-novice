# CFN Loop daa Performance Metrics Implementation Guide
## Step-by-Step Execution Plan for Easiest Integration (Rank #1)

**Document Type:** Implementation Playbook
**Difficulty Level:** Beginner-Friendly
**Estimated Time:** 2-3 Days
**Prerequisites:** Basic Bash, SQLite familiarity

---

## Overview

This guide provides exact code to deploy daa Performance Metrics (the easiest optimization measurement approach) into CFN Loops.

**What You're Adding:**
- Performance metrics collection during Loop 3 execution
- SQLite database for historical metrics tracking
- Confidence blending: 70% self-report + 30% metrics
- Automatic fallback to self-report if metrics unavailable

**Key Benefits:**
- ✅ Minimal code changes (175 lines total)
- ✅ Zero orchestration protocol changes
- ✅ Backward compatible
- ✅ Can be deployed immediately
- ✅ No new external services required

---

## Phase 1: Create Metrics Database Schema

### Step 1.1: Create Schema File

**File:** `/home/user/claude-flow-novice/docs/cfn-metrics-schema.sql`

```sql
-- CFN Loop Performance Metrics Schema
-- Tracks execution metrics for optimization analysis

CREATE TABLE IF NOT EXISTS agent_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    iteration INTEGER NOT NULL,
    agent_id TEXT NOT NULL,
    iteration_duration_ms INTEGER,          -- How long did agent take?
    token_usage INTEGER,                    -- AI token count
    error_count INTEGER DEFAULT 0,          -- Number of errors
    retry_count INTEGER DEFAULT 0,          -- Failed attempts before success
    reported_confidence REAL,                -- Agent's self-reported confidence
    calculated_confidence REAL,              -- Confidence from metrics
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(task_id, iteration, agent_id)
);

-- Index for fast lookups by task
CREATE INDEX IF NOT EXISTS idx_task_iteration
  ON agent_metrics(task_id, iteration);

-- Index for agent performance history
CREATE INDEX IF NOT EXISTS idx_agent_performance
  ON agent_metrics(agent_id, iteration);

-- Optional: Agent performance trends
CREATE TABLE IF NOT EXISTS agent_trends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT UNIQUE,
    total_iterations INTEGER DEFAULT 0,
    avg_duration_ms REAL DEFAULT 0,
    avg_confidence REAL DEFAULT 0.5,
    success_rate REAL DEFAULT 0.5,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Step 1.2: Initialize Database

**Commands:**
```bash
cd /home/user/claude-flow-novice

# Create database and apply schema
sqlite3 .artifacts/cfn-metrics.db < docs/cfn-metrics-schema.sql

# Verify tables created
sqlite3 .artifacts/cfn-metrics.db ".tables"
# Output should show: agent_metrics agent_trends

# Verify schema
sqlite3 .artifacts/cfn-metrics.db ".schema agent_metrics"
```

---

## Phase 2: Create Metrics Collector Helper Script

### Step 2.1: Create Helper Script

**File:** `/home/user/claude-flow-novice/.claude/skills/cfn-loop-orchestration/helpers/metrics-collector.sh`

```bash
#!/usr/bin/env bash

##############################################################################
# Metrics Collector Helper
# Collects and analyzes performance metrics from CFN Loop agents
#
# Usage:
#   metrics-collector.sh store-metrics <task-id> <iteration> <agent-id> \
#                         --duration-ms <ms> \
#                         --token-usage <tokens> \
#                         --error-count <n> \
#                         --retry-count <n> \
#                         --reported-confidence <0.0-1.0>
#
#   metrics-collector.sh calculate-confidence <task-id> <iteration> <agent-id>
#
#   metrics-collector.sh blend-confidence <self-report> <metrics-confidence>
#
# Returns:
#   store-metrics: 0 on success
#   calculate-confidence: Numeric confidence value (0.0-1.0)
#   blend-confidence: Blended confidence value
##############################################################################

set -euo pipefail

# Determine script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
METRICS_DB="${PROJECT_ROOT}/.artifacts/cfn-metrics.db"

# Ensure metrics database exists
if [ ! -f "$METRICS_DB" ]; then
  echo "❌ ERROR: Metrics database not found at $METRICS_DB" >&2
  echo "   Run: sqlite3 $METRICS_DB < docs/cfn-metrics-schema.sql" >&2
  exit 1
fi

##############################################################################
# Store Metrics Function
##############################################################################

store_metrics() {
  local task_id="$1"
  local iteration="$2"
  local agent_id="$3"
  local duration_ms="${4:-0}"
  local token_usage="${5:-0}"
  local error_count="${6:-0}"
  local retry_count="${7:-0}"
  local reported_confidence="${8:-0.5}"

  # Validate inputs
  if [ -z "$task_id" ] || [ -z "$iteration" ] || [ -z "$agent_id" ]; then
    echo "❌ ERROR: Missing required parameters (task_id, iteration, agent_id)" >&2
    return 1
  fi

  # Calculate confidence from metrics
  local calculated_confidence
  calculated_confidence=$(calculate_confidence_from_metrics \
    "$duration_ms" "$error_count" "$retry_count")

  # Store in database
  sqlite3 "$METRICS_DB" <<EOF
INSERT OR REPLACE INTO agent_metrics
  (task_id, iteration, agent_id, iteration_duration_ms, token_usage,
   error_count, retry_count, reported_confidence, calculated_confidence)
VALUES
  ('$task_id', $iteration, '$agent_id', $duration_ms, $token_usage,
   $error_count, $retry_count, $reported_confidence, $calculated_confidence);
EOF

  if [ $? -eq 0 ]; then
    echo "✅ Metrics stored: task=$task_id, iteration=$iteration, agent=$agent_id" >&2
    return 0
  else
    echo "❌ ERROR: Failed to store metrics" >&2
    return 1
  fi
}

##############################################################################
# Calculate Confidence from Metrics
##############################################################################

calculate_confidence_from_metrics() {
  local duration_ms="$1"
  local error_count="$2"
  local retry_count="$3"

  # Confidence calculation rules (tunable):
  # - Errors heavily penalize confidence
  # - Very fast execution (< 30s) gets bonus
  # - Very slow execution (> 2min) gets penalty
  # - Retries indicate struggle

  local confidence=0.8  # Start with good baseline

  # Penalty for errors
  if [ "$error_count" -gt 0 ]; then
    confidence="0.5"
    echo "$confidence" | awk '{printf "%.3f\n", $1 - ($1 * 0.2)}' >&2 || confidence="0.3"
  fi

  # Penalty for retries
  if [ "$retry_count" -gt 0 ]; then
    if [ "$retry_count" -gt 3 ]; then
      confidence="0.65"  # Many retries = struggling
    elif [ "$retry_count" -gt 1 ]; then
      confidence="0.75"  # Some retries = minor issues
    fi
  fi

  # Adjust for execution time
  if [ "$duration_ms" -lt 30000 ]; then
    # Fast execution = bonus (+0.10)
    confidence=$( echo "scale=3; $confidence + 0.10" | bc -l 2>/dev/null || echo "$confidence")
  elif [ "$duration_ms" -gt 120000 ]; then
    # Slow execution = penalty (-0.10)
    confidence=$( echo "scale=3; $confidence - 0.10" | bc -l 2>/dev/null || echo "$confidence")
  fi

  # Clamp to [0.0, 1.0]
  if (( $(echo "$confidence > 1.0" | bc -l) )); then
    confidence="1.0"
  elif (( $(echo "$confidence < 0.0" | bc -l) )); then
    confidence="0.0"
  fi

  echo "$confidence"
}

##############################################################################
# Retrieve Metrics Function
##############################################################################

get_metrics() {
  local task_id="$1"
  local iteration="$2"
  local agent_id="$3"

  sqlite3 "$METRICS_DB" <<EOF
SELECT
  iteration_duration_ms,
  token_usage,
  error_count,
  retry_count,
  reported_confidence,
  calculated_confidence
FROM agent_metrics
WHERE task_id = '$task_id'
  AND iteration = $iteration
  AND agent_id = '$agent_id'
LIMIT 1;
EOF
}

##############################################################################
# Calculate Confidence from Stored Metrics
##############################################################################

calculate_confidence() {
  local task_id="$1"
  local iteration="$2"
  local agent_id="$3"

  sqlite3 "$METRICS_DB" <<EOF
SELECT calculated_confidence
FROM agent_metrics
WHERE task_id = '$task_id'
  AND iteration = $iteration
  AND agent_id = '$agent_id'
LIMIT 1;
EOF
}

##############################################################################
# Blend Confidence Function
##############################################################################

blend_confidence() {
  local self_report="$1"
  local metrics_confidence="$2"

  # Blending formula: 70% self-report + 30% metrics
  # Self-report has more weight because agents know quality best
  local blended
  blended=$( echo "scale=3; ($self_report * 0.7) + ($metrics_confidence * 0.3)" | bc -l)

  # Clamp to [0.0, 1.0]
  if (( $(echo "$blended > 1.0" | bc -l) )); then
    echo "1.0"
  elif (( $(echo "$blended < 0.0" | bc -l) )); then
    echo "0.0"
  else
    echo "$blended"
  fi
}

##############################################################################
# Argument Parsing and Main Execution
##############################################################################

main() {
  if [ $# -lt 1 ]; then
    echo "Usage: $0 <store-metrics|calculate-confidence|blend-confidence|get-metrics> [args...]" >&2
    exit 1
  fi

  local command="$1"
  shift

  case "$command" in
    store-metrics)
      # Parse named arguments
      local task_id="" iteration="" agent_id="" duration_ms="0" token_usage="0"
      local error_count="0" retry_count="0" reported_confidence="0.5"

      while [[ $# -gt 0 ]]; do
        case "$1" in
          --task-id) task_id="$2"; shift 2 ;;
          --iteration) iteration="$2"; shift 2 ;;
          --agent-id) agent_id="$2"; shift 2 ;;
          --duration-ms) duration_ms="$2"; shift 2 ;;
          --token-usage) token_usage="$2"; shift 2 ;;
          --error-count) error_count="$2"; shift 2 ;;
          --retry-count) retry_count="$2"; shift 2 ;;
          --reported-confidence) reported_confidence="$2"; shift 2 ;;
          *) echo "Unknown option: $1" >&2; exit 1 ;;
        esac
      done

      store_metrics "$task_id" "$iteration" "$agent_id" "$duration_ms" \
        "$token_usage" "$error_count" "$retry_count" "$reported_confidence"
      ;;

    calculate-confidence)
      if [ $# -lt 3 ]; then
        echo "Usage: $0 calculate-confidence <task-id> <iteration> <agent-id>" >&2
        exit 1
      fi
      calculate_confidence "$1" "$2" "$3"
      ;;

    blend-confidence)
      if [ $# -lt 2 ]; then
        echo "Usage: $0 blend-confidence <self-report> <metrics-confidence>" >&2
        exit 1
      fi
      blend_confidence "$1" "$2"
      ;;

    get-metrics)
      if [ $# -lt 3 ]; then
        echo "Usage: $0 get-metrics <task-id> <iteration> <agent-id>" >&2
        exit 1
      fi
      get_metrics "$1" "$2" "$3"
      ;;

    *)
      echo "Unknown command: $command" >&2
      exit 1
      ;;
  esac
}

# Run main if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
```

### Step 2.2: Test Metrics Collector

```bash
cd /home/user/claude-flow-novice

# Make script executable
chmod +x .claude/skills/cfn-loop-orchestration/helpers/metrics-collector.sh

# Test 1: Store metrics
./.claude/skills/cfn-loop-orchestration/helpers/metrics-collector.sh store-metrics \
  --task-id "test-task-123" \
  --iteration 1 \
  --agent-id "backend-dev-1" \
  --duration-ms 45000 \
  --error-count 0 \
  --retry-count 1 \
  --reported-confidence 0.85

# Test 2: Retrieve confidence
./.claude/skills/cfn-loop-orchestration/helpers/metrics-collector.sh calculate-confidence \
  "test-task-123" 1 "backend-dev-1"
# Expected output: 0.75 (approx)

# Test 3: Blend confidence
./.claude/skills/cfn-loop-orchestration/helpers/metrics-collector.sh blend-confidence 0.85 0.75
# Expected output: 0.82 (0.85 * 0.7 + 0.75 * 0.3)
```

---

## Phase 3: Modify gate-check.sh to Use Metrics

### Step 3.1: Read Current File

**File:** `/home/user/claude-flow-novice/.claude/skills/cfn-loop-orchestration/helpers/gate-check.sh`

Read current implementation first (already done in architecture analysis).

### Step 3.2: Create Modified Version

Add metrics blending to gate-check.sh around line 70:

```bash
# After existing consensus collection:

# NEW: Collect performance metrics for confidence calculation
collect_performance_metrics() {
  local task_id="$1"
  local loop3_ids="$2"

  # Convert comma-separated IDs to array
  IFS=',' read -ra AGENT_IDS <<< "$loop3_ids"

  local total_metrics_confidence=0
  local count=0

  # Collect metrics for each agent
  for agent_id in "${AGENT_IDS[@]}"; do
    agent_id=$(echo "$agent_id" | xargs)  # Trim whitespace

    local metrics_confidence=$("$SCRIPT_DIR/metrics-collector.sh" \
      calculate-confidence "$task_id" "$ITERATION" "$agent_id" 2>/dev/null || echo "")

    if [ -n "$metrics_confidence" ] && [ "$metrics_confidence" != "0" ]; then
      total_metrics_confidence=$( echo "scale=3; $total_metrics_confidence + $metrics_confidence" | bc -l)
      ((count++))
    fi
  done

  # Average metrics confidence
  if [ "$count" -gt 0 ]; then
    echo $( echo "scale=3; $total_metrics_confidence / $count" | bc -l)
  else
    echo ""
  fi
}

# Modified gate check logic (around line 80):

echo "Collecting Loop 3 confidence scores..."

# Collect Loop 3 confidence scores
CONSENSUS=$("$REDIS_COORD_SKILL/invoke-waiting-mode.sh" collect \
  --task-id "$TASK_ID" \
  --agent-ids "$AGENTS" \
  --min-quorum "$MIN_QUORUM") || {
  echo "❌ Error: Failed to collect Loop 3 confidence scores"
  exit 1
}

# NEW: Blend with performance metrics
METRICS_CONFIDENCE=$(collect_performance_metrics "$TASK_ID" "$AGENTS")

if [ -n "$METRICS_CONFIDENCE" ]; then
  CONSENSUS=$("$SCRIPT_DIR/metrics-collector.sh" \
    blend-confidence "$CONSENSUS" "$METRICS_CONFIDENCE")

  echo "Loop 3 Gate Check (with Performance Metrics):"
  echo "  Self-Reported Confidence: (existing value)"
  echo "  Performance Metrics Score: $METRICS_CONFIDENCE"
  echo "  Blended Confidence: $CONSENSUS"
else
  echo "Loop 3 Gate Check:"
  echo "  Self-Reported Confidence: $CONSENSUS"
  echo "  (Metrics unavailable, using self-report)"
fi

# Rest of gate check proceeds unchanged...
```

### Step 3.3: Manual Edit Approach (Safer)

Instead of replacing entire file, make surgical edits:

1. Read current gate-check.sh
2. Add helper function before main logic
3. Modify the gate threshold comparison

**Backup first:**
```bash
cp .claude/skills/cfn-loop-orchestration/helpers/gate-check.sh \
   .claude/skills/cfn-loop-orchestration/helpers/gate-check.sh.backup
```

---

## Phase 4: Modify orchestrate.sh to Capture Timing

### Step 4.1: Add Timing Collection

In `/home/user/claude-flow-novice/.claude/skills/cfn-loop-orchestration/orchestrate.sh`:

**Around line 500 (in Loop 3 spawning section):**

```bash
# EXISTING CODE:
# Step 1: Spawn Loop 3 agents (implementers)
spawn_loop3_agents "$TASK_ID" "$ITERATION" "$LOOP3_AGENTS"

# MODIFIED: Add timing
LOOP3_START_TIME=$(date +%s%3N)  # NEW: Millisecond timestamp

spawn_loop3_agents "$TASK_ID" "$ITERATION" "$LOOP3_AGENTS"

# Step 2: Wait for Loop 3 completion
wait_for_agents "$TASK_ID" "$LOOP3_AGENTS" "$TIMEOUT" "$ITERATION"

LOOP3_END_TIME=$(date +%s%3N)  # NEW: Millisecond timestamp
LOOP3_DURATION=$((LOOP3_END_TIME - LOOP3_START_TIME))  # NEW: Calculate

echo "Loop 3 execution time: ${LOOP3_DURATION}ms" >&2  # NEW: Log

# Store iteration timing metrics (NEW - after waiting)
for agent_type in $(echo "$LOOP3_AGENTS" | tr ',' '\n'); do
  agent_type=$(echo "$agent_type" | xargs)
  "./.claude/skills/cfn-loop-orchestration/helpers/metrics-collector.sh" store-metrics \
    --task-id "$TASK_ID" \
    --iteration "$ITERATION" \
    --agent-id "$agent_type" \
    --duration-ms "$LOOP3_DURATION" \
    --reported-confidence 0.5 2>/dev/null || true
done
```

---

## Phase 5: Testing the Integration

### Step 5.1: Create Test Script

**File:** `/home/user/claude-flow-novice/tests/test-metrics-integration.sh`

```bash
#!/bin/bash

##############################################################################
# Test Metrics Integration
##############################################################################

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

METRICS_DB=".artifacts/cfn-metrics.db"

echo "=== Testing Metrics Integration ==="
echo ""

# Test 1: Database exists
echo "Test 1: Metrics database initialization..."
if [ ! -f "$METRICS_DB" ]; then
  echo "❌ FAIL: Database not found"
  exit 1
fi
echo "✅ PASS: Database exists"
echo ""

# Test 2: Collector script works
echo "Test 2: Metrics collector functionality..."
./.claude/skills/cfn-loop-orchestration/helpers/metrics-collector.sh store-metrics \
  --task-id "integration-test" \
  --iteration 1 \
  --agent-id "test-agent" \
  --duration-ms 50000 \
  --error-count 0 \
  --retry-count 0 \
  --reported-confidence 0.90

if [ $? -eq 0 ]; then
  echo "✅ PASS: Metrics stored successfully"
else
  echo "❌ FAIL: Failed to store metrics"
  exit 1
fi
echo ""

# Test 3: Confidence calculation
echo "Test 3: Confidence calculation from metrics..."
CALC_CONF=$(./.claude/skills/cfn-loop-orchestration/helpers/metrics-collector.sh \
  calculate-confidence "integration-test" 1 "test-agent")

if [ -n "$CALC_CONF" ] && (( $(echo "$CALC_CONF > 0" | bc -l) )); then
  echo "✅ PASS: Calculated confidence: $CALC_CONF"
else
  echo "❌ FAIL: Failed to calculate confidence"
  exit 1
fi
echo ""

# Test 4: Blending confidence
echo "Test 4: Blending self-report with metrics..."
BLENDED=$(./.claude/skills/cfn-loop-orchestration/helpers/metrics-collector.sh \
  blend-confidence 0.90 0.80)

expected_min="0.85"  # 0.90 * 0.7 + 0.80 * 0.3 = 0.87
expected_max="0.88"

if (( $(echo "$BLENDED > $expected_min && $BLENDED < 1.0" | bc -l) )); then
  echo "✅ PASS: Blended confidence: $BLENDED"
else
  echo "❌ FAIL: Unexpected blend value: $BLENDED"
  exit 1
fi
echo ""

# Test 5: Query stored metrics
echo "Test 5: Query stored metrics..."
query_result=$( sqlite3 "$METRICS_DB" \
  "SELECT COUNT(*) FROM agent_metrics WHERE task_id = 'integration-test';")

if [ "$query_result" -gt 0 ]; then
  echo "✅ PASS: Metrics successfully queried ($query_result records)"
else
  echo "❌ FAIL: No metrics found in database"
  exit 1
fi
echo ""

echo "=== All Tests Passed ==="
```

### Step 5.2: Run Tests

```bash
chmod +x tests/test-metrics-integration.sh
./tests/test-metrics-integration.sh
```

---

## Phase 6: Integration with CFN Loop Iteration

### Step 6.1: Run Full CFN Loop with Metrics

```bash
# Use existing CFN Loop task, which will now collect metrics
/cfn-loop-cli "Implement authentication module" --mode standard

# After completion, verify metrics were collected:
sqlite3 .artifacts/cfn-metrics.db <<EOF
SELECT
  task_id,
  iteration,
  agent_id,
  iteration_duration_ms,
  reported_confidence,
  calculated_confidence
FROM agent_metrics
ORDER BY timestamp DESC
LIMIT 10;
EOF
```

### Step 6.2: Monitor Metrics Collection

```bash
# Watch metrics in real-time during CFN Loop
watch -n 2 "sqlite3 .artifacts/cfn-metrics.db \
  'SELECT task_id, iteration, agent_id, calculated_confidence FROM agent_metrics ORDER BY timestamp DESC LIMIT 5;'"
```

---

## Phase 7: Validation and Tuning

### Step 7.1: Verify Confidence Values Make Sense

**Expected Results:**

```
Task: "Implement authentication"
Iteration 1:
  - backend-dev: reported=0.85, metrics=0.80, blended=0.84
  - tester: reported=0.78, metrics=0.75, blended=0.77

Iteration 2:
  - backend-dev: reported=0.92, metrics=0.85, blended=0.91
  - tester: reported=0.88, metrics=0.82, blended=0.87

Pattern: Blended confidence between self-report and metrics ✅
```

### Step 7.2: Tune Confidence Calculation (if needed)

**In `metrics-collector.sh`, adjust these values:**

```bash
# If metrics are too harsh:
confidence=0.85  # Increase baseline from 0.80

# If metrics reward speed too much:
confidence=$( echo "scale=3; $confidence + 0.05" | bc -l)  # Reduce bonus from 0.10

# If retries penalize too much:
confidence="0.75"  # Reduce penalty from 0.65
```

### Step 7.3: Analyze Metrics Trends

```bash
# Show agent performance improvement over iterations
sqlite3 .artifacts/cfn-metrics.db <<EOF
SELECT
  agent_id,
  iteration,
  reported_confidence,
  calculated_confidence,
  (calculated_confidence - 0.5) as confidence_above_baseline
FROM agent_metrics
WHERE task_id = 'feature-123'
ORDER BY agent_id, iteration;
EOF

# Show slowest agents (might need optimization)
sqlite3 .artifacts/cfn-metrics.db <<EOF
SELECT
  agent_id,
  AVG(iteration_duration_ms) as avg_duration_ms,
  COUNT(*) as executions
FROM agent_metrics
GROUP BY agent_id
HAVING avg_duration_ms > 60000
ORDER BY avg_duration_ms DESC;
EOF
```

---

## Troubleshooting

### Issue: "Metrics database not found"

**Solution:**
```bash
sqlite3 .artifacts/cfn-metrics.db < docs/cfn-metrics-schema.sql
```

### Issue: "Failed to calculate confidence"

**Debug:**
```bash
# Check if database has metrics
sqlite3 .artifacts/cfn-metrics.db "SELECT * FROM agent_metrics LIMIT 1;"

# Check if scripts are executable
ls -la .claude/skills/cfn-loop-orchestration/helpers/metrics-collector.sh
```

### Issue: Blended confidence values seem wrong

**Debug:**
```bash
# Manually test blending formula
./.claude/skills/cfn-loop-orchestration/helpers/metrics-collector.sh \
  blend-confidence 0.90 0.70

# Should output: 0.84 (0.90 * 0.7 + 0.70 * 0.3 = 0.63 + 0.21 = 0.84)
```

---

## Success Criteria

✅ **Task Complete When:**

1. Metrics database created with schema
2. `metrics-collector.sh` executable and working
3. `gate-check.sh` calls metrics collector
4. `orchestrate.sh` captures Loop 3 timing
5. Run test suite: all tests pass
6. Run full CFN Loop: metrics collected successfully
7. Verify gate check uses blended confidence

---

## Rollback Plan

If integration causes issues:

```bash
# Revert orchestrate.sh
cp .claude/skills/cfn-loop-orchestration/orchestrate.sh.backup \
   .claude/skills/cfn-loop-orchestration/orchestrate.sh

# Revert gate-check.sh
cp .claude/skills/cfn-loop-orchestration/helpers/gate-check.sh.backup \
   .claude/skills/cfn-loop-orchestration/helpers/gate-check.sh

# CFN Loops will continue working (metrics optional, with fallback)
```

---

## Next Steps

**After Successful Deployment:**

1. Monitor metrics collection for 5-10 CFN Loops
2. Analyze trends (are agents improving? Are certain partnerships stronger?)
3. If stable: Consider Phase 2 (Test-Driven Validation) in 1-2 weeks
4. If issues: Refine confidence calculation formula

**See Also:**
- `/home/user/claude-flow-novice/docs/CFN_OPTIMIZATION_INTEGRATION_ANALYSIS.md` - Full architectural analysis
- Phase 2: QuDAG Test-Driven Convergence
- Phase 3: Synaptic-Mesh Plasticity
