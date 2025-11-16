#!/usr/bin/env bash
##############################################################################
# CFN Loop Executor - Self-Contained Orchestration
#
# Purpose: Eliminates need for coordinator agent by making orchestration
#          fully deterministic and self-contained in CLI layer.
#
# Usage:
#   ./cfn-loop-exec.sh --task "Build React dashboard" [options]
#
# What this does:
#   1. Analyzes task description
#   2. Selects optimal agents using registry
#   3. Spawns orchestrator in background
#   4. Monitors via Redis
#   5. Returns structured JSON result
#
# Benefits:
#   - No coordinator agent needed (more cost savings)
#   - Fully deterministic (no LLM interpretation)
#   - Direct Main Chat → orchestrator
#   - JSON output for easy parsing
##############################################################################

set -euo pipefail

# Configuration
TASK_DESCRIPTION=""
MODE="standard"
OUTPUT_FORMAT="json"
MAX_ITERATIONS=10
VERBOSE=false
WAIT_FOR_COMPLETION=true
DIFFICULTY="auto"  # auto | simple | standard | complex | enterprise

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --task)
      TASK_DESCRIPTION="$2"
      shift 2
      ;;
    --mode)
      MODE="$2"
      shift 2
      ;;
    --difficulty)
      DIFFICULTY="$2"
      shift 2
      ;;
    --output)
      OUTPUT_FORMAT="$2"
      shift 2
      ;;
    --max-iterations)
      MAX_ITERATIONS="$2"
      shift 2
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    --background)
      WAIT_FOR_COMPLETION=false
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Validation
if [ -z "$TASK_DESCRIPTION" ]; then
  echo "Error: --task required"
  echo "Usage: $0 --task \"Build React dashboard\" [--mode standard] [--output json]"
  exit 1
fi

##############################################################################
# Step 1: Analyze Task Complexity
##############################################################################

log() {
  if [ "$VERBOSE" = true ]; then
    echo "[CFN-EXEC] $*" >&2
  fi
}

log "Analyzing task complexity: $TASK_DESCRIPTION"

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Run complexity analyzer
COMPLEXITY_RESULT=$("$SCRIPT_DIR/analyze-task-complexity.sh" \
  --task "$TASK_DESCRIPTION" \
  --difficulty "$DIFFICULTY")

# Extract complexity metrics
CALCULATED_DIFFICULTY=$(echo "$COMPLEXITY_RESULT" | jq -r '.difficulty')
COMPLEXITY_SCORE=$(echo "$COMPLEXITY_RESULT" | jq -r '.complexity_score')
SUGGESTED_LOOP3=$(echo "$COMPLEXITY_RESULT" | jq -r '.suggested_agents.loop3_count')
SUGGESTED_LOOP2=$(echo "$COMPLEXITY_RESULT" | jq -r '.suggested_agents.loop2_count')
DETECTED_DOMAINS=$(echo "$COMPLEXITY_RESULT" | jq -r '.domains[]' | paste -sd ',' -)

log "Complexity: $CALCULATED_DIFFICULTY (score: $COMPLEXITY_SCORE)"
log "Suggested agents - Loop 3: $SUGGESTED_LOOP3, Loop 2: $SUGGESTED_LOOP2"
log "Detected domains: $DETECTED_DOMAINS"

##############################################################################
# Step 2: Select Agents Based on Domain & Complexity
##############################################################################

# Convert task to lowercase for matching
TASK_LOWER=$(echo "$TASK_DESCRIPTION" | tr '[:upper:]' '[:lower:]')

# Initialize agent lists with base validators
LOOP3_AGENTS=""
LOOP2_AGENTS="reviewer,tester"

# Track how many agents we need per domain
LOOP3_COUNT=0
LOOP3_MAX=$SUGGESTED_LOOP3

# Frontend detection (can add multiple frontend specialists if complex)
if [[ "$TASK_LOWER" =~ react|component|ui|frontend|dashboard|web.*app ]]; then
  LOOP3_AGENTS="react-frontend-engineer"
  LOOP3_COUNT=$((LOOP3_COUNT + 1))
  LOOP2_AGENTS="${LOOP2_AGENTS},accessibility-advocate"
  log "Added: Frontend specialist"

  # Add UI designer for complex frontend work
  if [ "$CALCULATED_DIFFICULTY" = "complex" ] || [ "$CALCULATED_DIFFICULTY" = "enterprise" ]; then
    if [ $LOOP3_COUNT -lt $LOOP3_MAX ]; then
      LOOP3_AGENTS="${LOOP3_AGENTS},ui-designer"
      LOOP3_COUNT=$((LOOP3_COUNT + 1))
      log "Added: UI designer (complex frontend)"
    fi
  fi
fi

# Backend detection
if [[ "$TASK_LOWER" =~ api|backend|server|endpoint|rest|graphql|database|auth ]]; then
  if [ $LOOP3_COUNT -lt $LOOP3_MAX ]; then
    if [ -n "$LOOP3_AGENTS" ]; then
      LOOP3_AGENTS="${LOOP3_AGENTS},backend-dev"
    else
      LOOP3_AGENTS="backend-dev"
    fi
    LOOP3_COUNT=$((LOOP3_COUNT + 1))
    LOOP2_AGENTS="${LOOP2_AGENTS},security-specialist"
    log "Added: Backend specialist"
  fi
fi

# Database specialist for complex data work
if [[ "$TASK_LOWER" =~ database|schema|migration|query|sql ]]; then
  if [ "$CALCULATED_DIFFICULTY" = "complex" ] || [ "$CALCULATED_DIFFICULTY" = "enterprise" ]; then
    if [ $LOOP3_COUNT -lt $LOOP3_MAX ]; then
      LOOP3_AGENTS="${LOOP3_AGENTS},backend-dev"  # Additional backend specialist for DB work
      LOOP3_COUNT=$((LOOP3_COUNT + 1))
      log "Added: Database specialist (complex data work)"
    fi
  fi
fi

# Rust detection
if [[ "$TASK_LOWER" =~ rust|cargo|tokio ]]; then
  if [ $LOOP3_COUNT -lt $LOOP3_MAX ]; then
    if [ -n "$LOOP3_AGENTS" ]; then
      LOOP3_AGENTS="${LOOP3_AGENTS},rust-developer"
    else
      LOOP3_AGENTS="rust-developer"
    fi
    LOOP3_COUNT=$((LOOP3_COUNT + 1))
    log "Added: Rust specialist"
  fi

  # Add enterprise Rust developer for production work
  if [ "$CALCULATED_DIFFICULTY" = "enterprise" ]; then
    if [ $LOOP3_COUNT -lt $LOOP3_MAX ]; then
      LOOP3_AGENTS="${LOOP3_AGENTS},rust-enterprise-developer"
      LOOP3_COUNT=$((LOOP3_COUNT + 1))
      log "Added: Enterprise Rust specialist"
    fi
  fi
fi

# Infrastructure detection
if [[ "$TASK_LOWER" =~ infra|devops|deploy|docker|k8s|kubernetes|aws ]]; then
  if [ $LOOP3_COUNT -lt $LOOP3_MAX ]; then
    if [ -n "$LOOP3_AGENTS" ]; then
      LOOP3_AGENTS="${LOOP3_AGENTS},devops-engineer"
    else
      LOOP3_AGENTS="devops-engineer"
    fi
    LOOP3_COUNT=$((LOOP3_COUNT + 1))
    log "Added: DevOps specialist"
  fi
fi

# Architecture detection (always add for complex tasks)
if [[ "$TASK_LOWER" =~ architect|design|system|scalab|pattern ]] || \
   [ "$CALCULATED_DIFFICULTY" = "complex" ] || [ "$CALCULATED_DIFFICULTY" = "enterprise" ]; then
  if [ $LOOP3_COUNT -lt $LOOP3_MAX ]; then
    if [ -n "$LOOP3_AGENTS" ]; then
      LOOP3_AGENTS="${LOOP3_AGENTS},system-architect"
    else
      LOOP3_AGENTS="system-architect"
    fi
    LOOP3_COUNT=$((LOOP3_COUNT + 1))
    LOOP2_AGENTS="${LOOP2_AGENTS},architect"
    log "Added: System architect"
  fi
fi

# Research detection (prepend for complex/unclear tasks)
if [[ "$TASK_LOWER" =~ research|explore|investigate|analyze|study ]] || \
   [ "$CALCULATED_DIFFICULTY" = "complex" ] || [ "$CALCULATED_DIFFICULTY" = "enterprise" ]; then
  # Researcher doesn't count against Loop 3 max (research is always valuable)
  if [ -n "$LOOP3_AGENTS" ]; then
    LOOP3_AGENTS="researcher,${LOOP3_AGENTS}"
  else
    LOOP3_AGENTS="researcher"
  fi
  log "Added: Researcher (complex task)"
fi

# Fill remaining slots with general specialists based on difficulty
REMAINING_SLOTS=$((LOOP3_MAX - LOOP3_COUNT))
if [ $REMAINING_SLOTS -gt 0 ] && [ -n "$LOOP3_AGENTS" ]; then
  log "Filling $REMAINING_SLOTS remaining slots with specialists..."

  # Add coder for general implementation
  if [ $REMAINING_SLOTS -gt 0 ]; then
    LOOP3_AGENTS="${LOOP3_AGENTS},coder"
    REMAINING_SLOTS=$((REMAINING_SLOTS - 1))
  fi

  # Add performance specialist for enterprise tasks
  if [ "$CALCULATED_DIFFICULTY" = "enterprise" ] && [ $REMAINING_SLOTS -gt 0 ]; then
    LOOP3_AGENTS="${LOOP3_AGENTS},perf-analyzer"
    REMAINING_SLOTS=$((REMAINING_SLOTS - 1))
  fi
fi

# Default fallback (if no agents selected)
if [ -z "$LOOP3_AGENTS" ]; then
  LOOP3_AGENTS="coder"
  log "No specific domain detected, using general coder"
fi

# Ensure Loop 2 count matches suggestion
CURRENT_LOOP2_COUNT=$(echo "$LOOP2_AGENTS" | tr ',' '\n' | wc -l)
if [ "$CURRENT_LOOP2_COUNT" -lt "$SUGGESTED_LOOP2" ]; then
  ADDITIONAL_VALIDATORS=$((SUGGESTED_LOOP2 - CURRENT_LOOP2_COUNT))
  log "Adding $ADDITIONAL_VALIDATORS additional validators for $CALCULATED_DIFFICULTY difficulty"

  # Add code-quality-validator for comprehensive review
  if [ $ADDITIONAL_VALIDATORS -gt 0 ]; then
    LOOP2_AGENTS="${LOOP2_AGENTS},code-quality-validator"
    ADDITIONAL_VALIDATORS=$((ADDITIONAL_VALIDATORS - 1))
  fi

  # Add performance benchmarker for enterprise
  if [ "$CALCULATED_DIFFICULTY" = "enterprise" ] && [ $ADDITIONAL_VALIDATORS -gt 0 ]; then
    LOOP2_AGENTS="${LOOP2_AGENTS},performance-benchmarker"
  fi
fi

# Product Owner (always included)
PRODUCT_OWNER="product-owner"

# Generate unique task ID
TASK_ID="cfn-$(echo "$TASK_DESCRIPTION" | tr ' ' '-' | tr '[:upper:]' '[:lower:]' | cut -c1-30)-$(date +%s)"

log "Task ID: $TASK_ID"
log "Loop 3 agents: $LOOP3_AGENTS"
log "Loop 2 agents: $LOOP2_AGENTS"
log "Product Owner: $PRODUCT_OWNER"

##############################################################################
# Step 2: Invoke Orchestrator in Background
##############################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORCHESTRATOR="$SCRIPT_DIR/orchestrate-cfn-loop.sh"

if [ ! -f "$ORCHESTRATOR" ]; then
  echo "Error: Orchestrator not found at $ORCHESTRATOR"
  exit 1
fi

log "Launching orchestrator..."

# Build success criteria from task
SUCCESS_CRITERIA=$(jq -nc \
  --arg task "$TASK_DESCRIPTION" \
  '{
    acceptanceCriteria: ["Implementation complete", "Tests passing", "Code reviewed"],
    gateThreshold: 0.75,
    consensusThreshold: 0.90
  }')

# Launch orchestrator in background
"$ORCHESTRATOR" \
  --task-id "$TASK_ID" \
  --mode "$MODE" \
  --loop3-agents "$LOOP3_AGENTS" \
  --loop2-agents "$LOOP2_AGENTS" \
  --product-owner "$PRODUCT_OWNER" \
  --max-iterations "$MAX_ITERATIONS" \
  --epic-context "{\"epicGoal\": \"$TASK_DESCRIPTION\"}" \
  --success-criteria "$SUCCESS_CRITERIA" \
  > "/tmp/cfn-exec-${TASK_ID}.log" 2>&1 &

ORCHESTRATOR_PID=$!

log "Orchestrator started (PID: $ORCHESTRATOR_PID)"

# If background mode, return immediately
if [ "$WAIT_FOR_COMPLETION" = false ]; then
  if [ "$OUTPUT_FORMAT" = "json" ]; then
    MONITOR_CMD="redis-cli get \"swarm:${TASK_ID}:status\""
    jq -nc \
      --arg task_id "$TASK_ID" \
      --arg pid "$ORCHESTRATOR_PID" \
      --arg loop3 "$LOOP3_AGENTS" \
      --arg loop2 "$LOOP2_AGENTS" \
      --arg monitor "$MONITOR_CMD" \
      '{
        status: "running",
        task_id: $task_id,
        orchestrator_pid: ($pid | tonumber),
        agents: {
          loop3: ($loop3 | split(",")),
          loop2: ($loop2 | split(","))
        },
        monitor: $monitor
      }'
  else
    echo "Task ID: $TASK_ID"
    echo "PID: $ORCHESTRATOR_PID"
    echo "Monitor: redis-cli get 'swarm:${TASK_ID}:status'"
  fi
  exit 0
fi

##############################################################################
# Step 3: Monitor via Redis (Zero-Token Polling)
##############################################################################

log "Monitoring orchestrator completion..."

TIMEOUT=21600  # 6 hours max (10 iterations × 60min = 10hrs worst case, but realistically much less)
ELAPSED=0
CHECK_INTERVAL=30

while [ $ELAPSED -lt $TIMEOUT ]; do
  # Check orchestrator status
  STATUS=$(redis-cli get "swarm:${TASK_ID}:status" 2>/dev/null || echo "")

  log "Status: ${STATUS:-initializing} (elapsed: ${ELAPSED}s)"

  # Check for completion
  if [ "$STATUS" = "complete" ] || [ "$STATUS" = "cancelled" ] || [ "$STATUS" = "failed" ]; then
    log "Orchestrator finished: $STATUS"
    break
  fi

  # Check if orchestrator process still running
  if ! kill -0 "$ORCHESTRATOR_PID" 2>/dev/null; then
    log "Orchestrator process exited"
    # Check final status
    STATUS=$(redis-cli get "swarm:${TASK_ID}:status" 2>/dev/null || echo "failed")
    break
  fi

  sleep $CHECK_INTERVAL
  ELAPSED=$((ELAPSED + CHECK_INTERVAL))
done

if [ $ELAPSED -ge $TIMEOUT ]; then
  log "Timeout reached, orchestrator still running"
  STATUS="timeout"
fi

##############################################################################
# Step 4: Collect Results from Redis
##############################################################################

log "Collecting results..."

# Get final consensus
FINAL_CONSENSUS=$(redis-cli lindex "swarm:${TASK_ID}:metrics:loop2_consensus" 0 2>/dev/null || echo '{"consensus": 0}')
CONSENSUS_VALUE=$(echo "$FINAL_CONSENSUS" | jq -r '.consensus // 0')

# Get iteration count
ITERATIONS=$(redis-cli llen "swarm:${TASK_ID}:metrics:iteration_start" 2>/dev/null || echo "0")

# Get deliverables
DELIVERABLES=$(redis-cli smembers "swarm:${TASK_ID}:deliverables" 2>/dev/null | jq -R -s -c 'split("\n") | map(select(length > 0))')

# Get execution time (first iteration start to last iteration end)
FIRST_START=$(redis-cli lindex "swarm:${TASK_ID}:metrics:iteration_start" -1 2>/dev/null || echo "0")
LAST_END=$(redis-cli lindex "swarm:${TASK_ID}:metrics:iteration_duration" 0 2>/dev/null | jq -r '.duration_ms // 0')
TOTAL_DURATION=$((LAST_END))

##############################################################################
# Step 5: Return Structured Output
##############################################################################

if [ "$OUTPUT_FORMAT" = "json" ]; then
  jq -nc \
    --arg status "$STATUS" \
    --arg task "$TASK_DESCRIPTION" \
    --arg task_id "$TASK_ID" \
    --arg iterations "$ITERATIONS" \
    --arg consensus "$CONSENSUS_VALUE" \
    --arg loop3 "$LOOP3_AGENTS" \
    --arg loop2 "$LOOP2_AGENTS" \
    --arg duration "$TOTAL_DURATION" \
    --argjson deliverables "$DELIVERABLES" \
    '{
      status: $status,
      task: $task,
      task_id: $task_id,
      iterations: ($iterations | tonumber),
      final_consensus: ($consensus | tonumber),
      agents_selected: {
        loop3: ($loop3 | split(",")),
        loop2: ($loop2 | split(","))
      },
      deliverables: $deliverables,
      execution_time_ms: ($duration | tonumber),
      cost_model: "cli-spawning-95-98pct-savings"
    }'
else
  cat <<EOF
=== CFN Loop Execution Complete ===
Status: $STATUS
Task: $TASK_DESCRIPTION
Task ID: $TASK_ID
Iterations: $ITERATIONS
Final Consensus: $CONSENSUS_VALUE
Loop 3 Agents: $LOOP3_AGENTS
Loop 2 Agents: $LOOP2_AGENTS
Deliverables: $DELIVERABLES
Execution Time: ${TOTAL_DURATION}ms
EOF
fi

# Cleanup
if [ "$STATUS" != "timeout" ]; then
  log "Cleaning up Redis keys..."
  redis-cli --scan --pattern "swarm:${TASK_ID}:*" | xargs -r redis-cli DEL >/dev/null 2>&1 || true
fi

# Exit with appropriate code
if [ "$STATUS" = "complete" ]; then
  exit 0
elif [ "$STATUS" = "timeout" ]; then
  exit 124
else
  exit 1
fi
