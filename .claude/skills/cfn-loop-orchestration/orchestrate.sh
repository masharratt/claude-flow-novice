#!/usr/bin/env bash

##############################################################################
# CFN Loop Orchestration - Main Coordinator
# Version: 1.1.0 (Security Enhanced)
#
# Orchestrates the Complete Fail Never (CFN) Loop workflow using modular
# helper scripts, Redis Coordination primitives, and enhanced security.
#
# Usage:
#   ./orchestrate.sh --task-id <id> \
#                    --mode <mvp|standard|enterprise> \
#                    --loop3-agents <agent1,agent2,...> \
#                    --loop2-agents <agent1,agent2,...> \
#                    --product-owner <agent-id> \
#                    [--max-iterations <n>] \
#                    [--epic-context <json>] \
#                    [--phase-context <json>] \
#                    [--success-criteria <json>]
##############################################################################

set -euo pipefail

# Determine PROJECT_ROOT first before any other operations
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Fixed path resolution - go up 4 levels from cfn-loop-orchestration to project root (.claude/skills/cfn-loop-orchestration -> .claude/skills -> .claude -> project root)
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# ⚠️ ANTI-023 MEMORY LEAK PROTECTION:
# Task Mode validation moved to after argument parsing at line 276
# This allows proper CLI argument processing before validation

# ⚠️ ANTI-023 MEMORY LEAK PROTECTION: Environment Sanitization
# Load and apply environment sanitization to prevent memory leaks
if [[ -f "$PROJECT_ROOT/.claude/skills/cfn-task-mode-sanitize/task-mode-env-sanitizer.sh" ]]; then
    source "$PROJECT_ROOT/.claude/skills/cfn-task-mode-sanitize/task-mode-env-sanitizer.sh"
    sanitize_task_mode_environment "cli"
    echo "✅ Environment sanitization applied" >&2
else
    echo "⚠️ Environment sanitization not available - proceeding without protection" >&2
fi

# ⚠️ ANTI-023 MEMORY LEAK PROTECTION: Process Instrumentation
# Load process instrumentation and monitoring for the orchestrator
if [[ -f "$PROJECT_ROOT/.claude/skills/cfn-validation-runner-instrumentation/wrapped-executor.sh" ]]; then
    source "$PROJECT_ROOT/.claude/skills/cfn-validation-runner-instrumentation/wrapped-executor.sh"
    echo "✅ Orchestrator process instrumentation enabled" >&2
else
    echo "⚠️ Process instrumentation not available - proceeding without monitoring" >&2
fi

# ⚠️ ANTI-023 MEMORY LEAK PROTECTION: Environment Configuration
# Set stabilization environment variables with sensible defaults
export CFN_VALIDATION_TIMEOUT="${CFN_VALIDATION_TIMEOUT:-300}"   # 5 minutes
export CFN_MEMORY_LIMIT="${CFN_MEMORY_LIMIT:-2048}"              # 2GB memory limit
export CFN_CPU_LIMIT="${CFN_CPU_LIMIT:-80}"                      # 80% CPU limit
export CFN_TELEMETRY_DIR="${CFN_TELEMETRY_DIR:-$PROJECT_ROOT/.artifacts/telemetry}"
mkdir -p "$CFN_TELEMETRY_DIR"

# Load security utilities
# shellcheck source=./security_utils.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/security_utils.sh"

HELPERS_DIR="$SCRIPT_DIR/helpers"
REDIS_COORD_SKILL="$PROJECT_ROOT/.claude/skills/cfn-redis-coordination"

# Configuration
TASK_ID=""
MODE="standard"
LOOP3_AGENTS=""
LOOP2_AGENTS=""
PRODUCT_OWNER=""
MAX_ITERATIONS=10
MAX_ALLOWED_ITERATIONS=100  # Security: Prevent resource exhaustion via unbounded iterations
MIN_QUORUM_LOOP3="0.66"
MIN_QUORUM_LOOP2="0.66"
EPIC_CONTEXT=""
PHASE_CONTEXT=""
SUCCESS_CRITERIA=""
EXPECTED_FILES=""
PHASE_ID=""

# Mode-specific thresholds
declare -A GATE_THRESHOLD=(
  [mvp]=0.70
  [standard]=0.75
  [enterprise]=0.75
)

declare -A CONSENSUS_THRESHOLD=(
  [mvp]=0.80
  [standard]=0.90
  [enterprise]=0.95
)

# Execution tracking
START_TIME=$(date +%s)
ITERATIONS_COMPLETED=0
FINAL_DECISION=""
LOOP3_FINAL_CONFIDENCE=0.0
LOOP2_FINAL_CONSENSUS=0.0
DELIVERABLES_VERIFIED=false

##############################################################################
# Argument Parsing
##############################################################################
while [[ $# -gt 0 ]]; do
  case $1 in
    --task-id)
      if [[ $# -lt 2 ]]; then
        echo "Error: --task-id requires a value"
        exit 1
      fi
      TASK_ID=$(sanitize_input "$2") || { echo "Invalid task ID"; exit 1; }
      shift 2
      ;;
    --mode)
      if [[ $# -lt 2 ]]; then
        echo "Error: --mode requires a value"
        exit 1
      fi
      MODE="$2"
      # Whitelist allowed modes
      if [[ ! "$MODE" =~ ^(mvp|standard|enterprise)$ ]]; then
        echo "Invalid mode. Must be mvp, standard, or enterprise."
        exit 1
      fi
      shift 2
      ;;
    --loop3-agents)
      if [[ $# -lt 2 ]]; then
        echo "Error: --loop3-agents requires a value"
        exit 1
      fi
      validate_agent_list "$2" || { echo "Invalid Loop 3 agent list"; exit 1; }
      LOOP3_AGENTS="$2"
      shift 2
      ;;
    --loop2-agents)
      if [[ $# -lt 2 ]]; then
        echo "Error: --loop2-agents requires a value"
        exit 1
      fi
      validate_agent_list "$2" || { echo "Invalid Loop 2 agent list"; exit 1; }
      LOOP2_AGENTS="$2"
      shift 2
      ;;
    --product-owner)
      if [[ $# -lt 2 ]]; then
        echo "Error: --product-owner requires a value"
        exit 1
      fi
      PRODUCT_OWNER=$(sanitize_input "$2") || { echo "Invalid product owner"; exit 1; }
      shift 2
      ;;
    --max-iterations)
      if [[ $# -lt 2 ]]; then
        echo "Error: --max-iterations requires a value"
        exit 1
      fi
      # Validate max iterations is a positive integer
      if [[ ! "$2" =~ ^[1-9][0-9]*$ ]]; then
        echo "Max iterations must be a positive integer"
        exit 1
      fi
      # SECURITY FIX: Enforce upper bound to prevent resource exhaustion
      if [[ "$2" -gt "$MAX_ALLOWED_ITERATIONS" ]]; then
        echo "❌ MAX_ITERATIONS=$2 exceeds limit of $MAX_ALLOWED_ITERATIONS" >&2
        echo "   (Use --max-iterations <N> where N <= $MAX_ALLOWED_ITERATIONS)" >&2
        exit 1
      fi
      if [[ "$2" -lt 1 ]]; then
        echo "❌ MAX_ITERATIONS must be at least 1" >&2
        exit 1
      fi
      MAX_ITERATIONS="$2"
      shift 2
      ;;

    --min-quorum-loop3)
      if [[ $# -lt 2 ]]; then
        echo "Error: --min-quorum-loop3 requires a value"
        exit 1
      fi
      # Validate quorum is a valid decimal between 0 and 1
      if [[ ! "$2" =~ ^0\.[0-9]+$ ]] || (( $(echo "$2 > 1" | bc -l) )); then
        echo "Invalid Loop 3 quorum. Must be between 0 and 1."
        exit 1
      fi
      MIN_QUORUM_LOOP3="$2"
      shift 2
      ;;
    --min-quorum-loop2)
      if [[ $# -lt 2 ]]; then
        echo "Error: --min-quorum-loop2 requires a value"
        exit 1
      fi
      # Validate quorum is a valid decimal between 0 and 1
      if [[ ! "$2" =~ ^0\.[0-9]+$ ]] || (( $(echo "$2 > 1" | bc -l) )); then
        echo "Invalid Loop 2 quorum. Must be between 0 and 1."
        exit 1
      fi
      MIN_QUORUM_LOOP2="$2"
      shift 2
      ;;
    --epic-context)
      if [[ $# -lt 2 ]]; then
        echo "Error: --epic-context requires a value"
        exit 1
      fi
      validate_json_context "$2" || { echo "Invalid epic context JSON"; exit 1; }
      EPIC_CONTEXT="$2"
      shift 2
      ;;
    --phase-context)
      if [[ $# -lt 2 ]]; then
        echo "Error: --phase-context requires a value"
        exit 1
      fi
      validate_json_context "$2" || { echo "Invalid phase context JSON"; exit 1; }
      PHASE_CONTEXT="$2"
      shift 2
      ;;
    --success-criteria)
      if [[ $# -lt 2 ]]; then
        echo "Error: --success-criteria requires a value"
        exit 1
      fi
      validate_json_context "$2" || { echo "Invalid success criteria JSON"; exit 1; }
      SUCCESS_CRITERIA="$2"
      shift 2
      ;;
    --expected-files)
      if [[ $# -lt 2 ]]; then
        echo "Error: --expected-files requires a value"
        exit 1
      fi
      # Optional: validate each expected file name if not empty
      if [ -n "$2" ]; then
        IFS=',' read -ra FILES <<< "$2"
        for file in "${FILES[@]}"; do
          sanitize_input "$file" 256 || { echo "Invalid expected filename: $file"; exit 1; }
        done
      fi
      EXPECTED_FILES="$2"
      shift 2
      ;;
    --phase-id)
      if [[ $# -lt 2 ]]; then
        echo "Error: --phase-id requires a value"
        exit 1
      fi
      PHASE_ID=$(sanitize_input "$2") || { echo "Invalid phase ID"; exit 1; }
      shift 2
      ;;
    *)
      echo "Error: Unknown option: '$1'"
      echo ""
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Required options:"
      echo "  --task-id <id>              Unique task identifier"
      echo "  --loop3-agents <agents>     Comma-separated list of Loop 3 agents"
      echo "  --loop2-agents <agents>     Comma-separated list of Loop 2 agents"
      echo "  --product-owner <agent>     Product owner agent ID"
      echo ""
      echo "Optional options:"
      echo "  --mode <mode>               CFN mode: mvp, standard, enterprise (default: standard)"
      echo "  --max-iterations <n>        Maximum iterations (default: 10)"
      echo "  --min-quorum-loop3 <n>      Loop 3 quorum threshold (default: 0.66)"
      echo "  --min-quorum-loop2 <n>      Loop 2 quorum threshold (default: 0.66)"
      echo "  --epic-context <json>       Epic context JSON"
      echo "  --phase-context <json>      Phase context JSON"
      echo "  --success-criteria <json>   Success criteria JSON"
      echo "  --expected-files <files>    Comma-separated expected deliverables"
      echo "  --phase-id <id>             Phase identifier for timeout calculation"
      exit 1
      ;;
  esac
done

# Validation
if [ -z "$TASK_ID" ] || [ -z "$LOOP3_AGENTS" ] || [ -z "$LOOP2_AGENTS" ] || [ -z "$PRODUCT_OWNER" ]; then
  echo "Error: Required parameters missing"
  echo "Usage: $0 --task-id <id> --mode <mode> --loop3-agents <agents> --loop2-agents <agents> --product-owner <agent>"
  exit 1
fi

# ⚠️ ANTI-023 MEMORY LEAK PROTECTION: Process Instrumentation
# Load process instrumentation and monitoring for the orchestrator
# shellcheck source=../cfn-process-instrumentation/instrument-process.sh
if [[ -f "$PROJECT_ROOT/.claude/skills/cfn-process-instrumentation/instrument-process.sh" ]]; then
    source "$PROJECT_ROOT/.claude/skills/cfn-process-instrumentation/instrument-process.sh"
    echo "✅ Orchestrator process instrumentation enabled" >&2
else
    echo "⚠️ Process instrumentation not available - proceeding without monitoring" >&2
fi

# Get thresholds for mode
# Add additional mode validation with safe fallback
case "$MODE" in
  mvp)
    GATE=${GATE_THRESHOLD[mvp]:-0.70}
    CONSENSUS=${CONSENSUS_THRESHOLD[mvp]:-0.80}
    ;;
  standard)
    GATE=${GATE_THRESHOLD[standard]:-0.75}
    CONSENSUS=${CONSENSUS_THRESHOLD[standard]:-0.90}
    ;;
  enterprise)
    GATE=${GATE_THRESHOLD[enterprise]:-0.85}
    CONSENSUS=${CONSENSUS_THRESHOLD[enterprise]:-0.95}
    ;;
  *)
    echo "Invalid mode: $MODE"
    exit 1
    ;;
esac

# Calculate timeout
TIMEOUT=$("$HELPERS_DIR/timeout-calculator.sh" --phase-id "${PHASE_ID:-unknown}")

echo "=============================================="
echo "CFN Loop Orchestration v1.0.0"
echo "=============================================="
echo "Task ID: $TASK_ID"
echo "Mode: $MODE"
echo "Gate Threshold: $GATE"
echo "Consensus Threshold: $CONSENSUS"
echo "Max Iterations: $MAX_ITERATIONS"
echo "Timeout: ${TIMEOUT}s"
echo "=============================================="
echo ""

##############################################################################
# Helper Functions
##############################################################################

function store_context() {
  local task_id="$1"

  # Store epic context if provided using Redis coordination primitive
  if [ -n "$EPIC_CONTEXT" ]; then
    "$REDIS_COORD_SKILL/store-context.sh" \
      --task-id "$task_id" \
      --key "epic-context" \
      --value "$EPIC_CONTEXT" \
      --namespace "swarm" >/dev/null
    echo "Stored epic context"
  fi

  # Store phase context if provided using Redis coordination primitive
  if [ -n "$PHASE_CONTEXT" ]; then
    "$REDIS_COORD_SKILL/store-context.sh" \
      --task-id "$task_id" \
      --key "phase-context" \
      --value "$PHASE_CONTEXT" \
      --namespace "swarm" >/dev/null
    echo "Stored phase context"
  fi

  # Store success criteria if provided using Redis coordination primitive
  if [ -n "$SUCCESS_CRITERIA" ]; then
    "$REDIS_COORD_SKILL/store-context.sh" \
      --task-id "$task_id" \
      --key "success-criteria" \
      --value "$SUCCESS_CRITERIA" \
      --namespace "swarm" >/dev/null
    echo "Stored success criteria"
  fi

  echo ""
}

build_agent_context() {
    local task_id="$1"
    local iteration="$2"
    local agent_type="$3"
    local feedback="$4"
    local loop_type="${5:-}"  # NEW: loop3, loop2, or loop4 (optional)

    # Initialize context variables
    local task_desc="CFN Loop implementation"
    local deliverables=""
    local acceptance=""
    local epic_context=""
    local phase_context=""
    local target_files=""

    # Try to retrieve complete context from Redis
    if command -v "$REDIS_COORD_SKILL/get-context.sh" >/dev/null 2>&1; then
        if redis_context=$("$REDIS_COORD_SKILL/get-context.sh" --task-id "$task_id" --namespace "swarm" 2>/dev/null); then
            echo "📥 Retrieved Redis context for task: $task_id" >&2

            # Extract fields from Redis context
            task_desc=$(echo "$redis_context" | jq -r '.["epic-context"] // .epic_context // "CFN Loop implementation"' 2>/dev/null || echo "CFN Loop implementation")
            deliverables=$(echo "$redis_context" | jq -r '.deliverables // [] | if type == "array" then join(", ") else . end' 2>/dev/null || echo "")
            acceptance=$(echo "$redis_context" | jq -r '.acceptanceCriteria // .["acceptance-criteria"] // [] | if type == "array" then join(", ") else . end' 2>/dev/null || echo "")
            epic_context=$(echo "$redis_context" | jq -r '.["epic-context"] // ""' 2>/dev/null || echo "")
            phase_context=$(echo "$redis_context" | jq -r '.["phase-context"] // ""' 2>/dev/null || echo "")
            target_files=$(echo "$redis_context" | jq -r '.["target-files"] // ""' 2>/dev/null || echo "")

            echo "📋 Redis context extracted - Task: $task_desc" >&2
        else
            echo "⚠️  Failed to retrieve Redis context, using local SUCCESS_CRITERIA" >&2
        fi
    else
        echo "⚠️  get-context.sh not found, using local SUCCESS_CRITERIA" >&2
    fi

    # Fallback to local SUCCESS_CRITERIA if Redis retrieval failed or incomplete
    if [ -z "$deliverables" ] && [ -n "$SUCCESS_CRITERIA" ]; then
        deliverables=$(echo "$SUCCESS_CRITERIA" | jq -r '.deliverables // [] | join(", ")' 2>/dev/null || echo "")
        acceptance=$(echo "$SUCCESS_CRITERIA" | jq -r '.acceptanceCriteria // [] | join(", ")' 2>/dev/null || echo "")
        echo "🔄 Using local SUCCESS_CRITERIA as fallback" >&2
    fi

    # Build comprehensive context string
    local context="Task: $task_desc"

    if [ -n "$deliverables" ]; then
        context="$context | Deliverables: $deliverables"
    fi

    if [ -n "$acceptance" ]; then
        context="$context | Acceptance Criteria: $acceptance"
    fi

    if [ -n "$target_files" ]; then
        context="$context | Target Files: $target_files"
    fi

    context="$context | Iteration: $iteration"

    # Inject test failure diagnostics from previous iteration
    if [ "$iteration" -gt 1 ]; then
        local iteration_context_file="/tmp/cfn-iteration-context-${task_id}.json"

        if [ -f "$iteration_context_file" ]; then
            # Extract failed test summary from iteration context
            local failed_summary=$(jq -r '
                if .failed_tests and (.failed_tests | length > 0) then
                    "Previous Test Results: Pass Rate " + (.pass_rate * 100 | floor | tostring) + "% | Failed Tests: " +
                    ([.failed_tests[].failed_test_names[]? // empty] | join(", "))
                else
                    empty
                end
            ' "$iteration_context_file" 2>/dev/null)

            if [ -n "$failed_summary" ]; then
                context="$context | $failed_summary"
                echo "📊 Injected test diagnostics from previous iteration" >&2
            fi
        fi
    fi

    if [[ -n "$feedback" ]]; then
        context="$context | Feedback: $feedback"
    fi

    # Add epic/phase context if available
    if [ -n "$epic_context" ]; then
        context="$context | Epic: $epic_context"
    fi

    if [ -n "$phase_context" ]; then
        context="$context | Phase: $phase_context"
    fi

    # Inject CFN Loop context if injection script exists and loop_type provided
    if [[ -n "$loop_type" ]] && [[ -x "$SCRIPT_DIR/inject-loop-context.sh" ]]; then
        context=$("$SCRIPT_DIR/inject-loop-context.sh" "$loop_type" "$context" 2>/dev/null || echo "$context")
    fi

    echo "$context"
}

function spawn_loop3_agents() {
  local task_id="$1"
  local iteration="$2"
  local agents="$3"

  echo "[Loop 3] Spawning implementer agents (iteration $iteration)..."

  # Load success criteria from Redis (if available)
  export AGENT_SUCCESS_CRITERIA=""
  if [[ -n "$task_id" ]] && [[ -x "$SCRIPT_DIR/../cfn-redis-coordination/get-success-criteria.sh" ]]; then
    SUCCESS_CRITERIA=$("$SCRIPT_DIR/../cfn-redis-coordination/get-success-criteria.sh" --task-id "$task_id" 2>/dev/null || echo "")

    if [[ -n "$SUCCESS_CRITERIA" ]]; then
      # SECURITY FIX: Validate JSON size before parsing (prevent DoS)
      CRITERIA_SIZE=$(echo -n "$SUCCESS_CRITERIA" | wc -c)
      MAX_SIZE=10485760  # 10MB

      if [[ "$CRITERIA_SIZE" -gt "$MAX_SIZE" ]]; then
        echo "  ❌ Success criteria exceeds maximum size (10MB): ${CRITERIA_SIZE} bytes" >&2
        exit 1
      fi

      # Validate JSON before exporting
      if echo "$SUCCESS_CRITERIA" | jq empty 2>/dev/null; then
        export AGENT_SUCCESS_CRITERIA="$SUCCESS_CRITERIA"
        TEST_SUITE_COUNT=$(echo "$SUCCESS_CRITERIA" | jq -r '.test_suites | length' 2>/dev/null || echo "0")
        echo "  ✅ Success criteria loaded ($TEST_SUITE_COUNT test suites)" >&2
      else
        echo "  ⚠️  Invalid success criteria JSON - skipping" >&2
      fi
    fi
  fi

  # Convert comma-separated agents to array
  IFS=',' read -ra AGENT_ARRAY <<< "$agents"

  # Track agent instance counts for unique ID generation
  declare -A AGENT_INSTANCE_COUNTS

  # Spawn each agent via CLI
  for agent_type in "${AGENT_ARRAY[@]}"; do
    # Generate unique agent ID (agent-type-iteration-instance)
    AGENT_INSTANCE_COUNTS["$agent_type"]=$((${AGENT_INSTANCE_COUNTS["$agent_type"]:-0} + 1))
    INSTANCE_NUM="${AGENT_INSTANCE_COUNTS["$agent_type"]}"
    UNIQUE_AGENT_ID="${agent_type}-${iteration}-${INSTANCE_NUM}"

    echo "  Spawning: $agent_type (ID: $UNIQUE_AGENT_ID)"

    # Validate agent input
    local safe_agent_type safe_task_id safe_agent_id
    safe_agent_type=$(sanitize_input "$agent_type") || continue
    safe_task_id=$(sanitize_input "$task_id") || continue
    safe_agent_id=$(sanitize_input "$UNIQUE_AGENT_ID") || continue

    # Dual-mode agent spawning: Docker or CLI
    # Docker mode: CFN_DOCKER_MODE=true or Docker socket available
    # CLI mode: Default (uses npx)
    if [[ "${CFN_DOCKER_MODE:-false}" == "true" ]] || [[ -S /var/run/docker.sock ]]; then
        # Docker-based spawning (prevents WebAssembly OOM)
        echo "  → Docker mode: spawning via container" >&2

        # SECURITY FIX: Sanitize Docker environment variables to prevent command injection
        CFN_DOCKER_IMAGE_SAFE=$(sanitize_docker_var "${CFN_DOCKER_IMAGE:-claude-flow-novice:agent}") || {
          echo "❌ Invalid CFN_DOCKER_IMAGE" >&2
          exit 1
        }
        CFN_DOCKER_NETWORK_SAFE=$(sanitize_docker_var "${CFN_DOCKER_NETWORK:-mcp-network}") || {
          echo "❌ Invalid CFN_DOCKER_NETWORK" >&2
          exit 1
        }
        CFN_MEMORY_LIMIT_SAFE=$(sanitize_docker_var "${CFN_MEMORY_LIMIT:-2g}") || {
          echo "❌ Invalid CFN_MEMORY_LIMIT" >&2
          exit 1
        }

        # Build Docker command as array (prevents injection, no eval needed)
        DOCKER_CMD=(
          docker run --detach
          --name "agent-${safe_agent_id}"
          --memory "$CFN_MEMORY_LIMIT_SAFE"
          --cpus 1.5
          --network "$CFN_DOCKER_NETWORK_SAFE"
          --env REDIS_URL=redis://redis:6379
          --env "AGENT_ID=${safe_agent_id}"
          --env "AGENT_TYPE=${safe_agent_type}"
          --env "TASK_ID=${safe_task_id}"
          --env "ITERATION=${iteration}"
        )

        # SECURITY FIX: Base64-encode success criteria to prevent shell injection
        if [[ -n "${AGENT_SUCCESS_CRITERIA:-}" ]]; then
          ENCODED_CRITERIA=$(echo -n "$AGENT_SUCCESS_CRITERIA" | base64 -w 0)

          # SECURITY FIX: Validate size AFTER encoding to prevent expansion bypass (10MB → 13.9MB)
          ENCODED_SIZE=$(echo -n "$ENCODED_CRITERIA" | wc -c)
          MAX_ENCODED_SIZE=10485760  # 10MB

          if [[ "$ENCODED_SIZE" -gt "$MAX_ENCODED_SIZE" ]]; then
            echo "❌ Encoded success criteria exceeds 10MB limit: ${ENCODED_SIZE} bytes" >&2
            echo "   (Original: $(echo -n "$AGENT_SUCCESS_CRITERIA" | wc -c) bytes, Expanded: +33% via base64)" >&2
            exit 1
          fi

          DOCKER_CMD+=(--env "AGENT_SUCCESS_CRITERIA_B64=${ENCODED_CRITERIA}")
        fi

        # Add volumes and image
        DOCKER_CMD+=(
          --volume "${PROJECT_ROOT}/.claude:/app/.claude:ro"
          --volume "${PROJECT_ROOT}/packages:/app/packages"
          --volume "/tmp/agent-workspace-${safe_agent_id}:/app/workspace"
          "$CFN_DOCKER_IMAGE_SAFE"
          sh -c "npx claude-flow-novice agent \"${safe_agent_type}\" --task-id \"${safe_task_id}\" --agent-id \"${safe_agent_id}\" --iteration \"${iteration}\""
        )

        # Execute safely without eval (prevents command injection)
        "${DOCKER_CMD[@]}" >/dev/null 2>&1 &

        AGENT_PID=$!
    else
        # CLI-based spawning (traditional approach)
        echo "  → CLI mode: spawning via npx" >&2

        if command -v execute_instrumented >/dev/null 2>&1; then
            execute_instrumented "npx" "$CFN_VALIDATION_TIMEOUT" "$CFN_MEMORY_LIMIT" \
              claude-flow-novice agent "$safe_agent_type" \
              --task-id "$safe_task_id" \
              --agent-id "$safe_agent_id" \
              --iteration "$iteration" \
              --context "$(build_agent_context "$safe_task_id" "$iteration" "$safe_agent_type" "" "loop3")" &
        else
            # Fallback to raw spawn if instrumentation unavailable
            npx claude-flow-novice agent "$safe_agent_type" \
              --task-id "$safe_task_id" \
              --agent-id "$safe_agent_id" \
              --iteration "$iteration" \
              --context "$(build_agent_context "$safe_task_id" "$iteration" "$safe_agent_type" "" "loop3")" &
        fi

        AGENT_PID=$!
    fi

    # Store PID for monitoring using unique agent ID
    "$REDIS_COORD_SKILL/store-context.sh" \
      --task-id "$task_id" \
      --key "${UNIQUE_AGENT_ID}:pid" \
      --value "{\"pid\": $AGENT_PID}" \
      --namespace "swarm" >/dev/null

    # ⚠️ ANTI-023 MEMORY LEAK PROTECTION: Start telemetry monitoring
    if [[ -f "$PROJECT_ROOT/.claude/skills/cfn-telemetry/collect-metrics.sh" ]]; then
        MONITOR_PID=$("$PROJECT_ROOT/.claude/skills/cfn-telemetry/collect-metrics.sh" start-monitoring "$UNIQUE_AGENT_ID" "$AGENT_PID" "$iteration" "$safe_agent_type")
        "$REDIS_COORD_SKILL/store-context.sh" \
          --task-id "$task_id" \
          --key "${UNIQUE_AGENT_ID}:monitor_pid" \
          --value "{\"pid\": $MONITOR_PID}" \
          --namespace "swarm" >/dev/null
        echo "🔍 Started monitoring for $UNIQUE_AGENT_ID (Agent PID: $AGENT_PID, Monitor PID: $MONITOR_PID)" >&2
    fi

    # SECURITY FIX: Atomic SADD + EXPIRE using Lua script (prevent race condition)
    redis-cli -h "${REDIS_HOST:-localhost}" -p "${REDIS_PORT:-6379}" --eval - \
      "swarm:${task_id}:loop3:agent_ids:iteration${iteration}" "$UNIQUE_AGENT_ID" <<'LUA' >/dev/null
redis.call('SADD', KEYS[1], ARGV[1])
redis.call('EXPIRE', KEYS[1], 86400)
return redis.call('SCARD', KEYS[1])
LUA
  done

  echo "[Loop 3] All agents spawned"
  echo ""
}

function wait_for_agents() {
  local task_id="$1"
  local agents="$2"
  local timeout="$3"
  local iteration="${4:-1}"

  echo "Waiting for agents to complete (timeout: ${timeout}s)..."

  # Retrieve actual agent IDs from Redis (stored during spawn using SADD)
  local stored_ids
  stored_ids=$(redis-cli -h "${REDIS_HOST:-localhost}" -p "${REDIS_PORT:-6379}" SMEMBERS "swarm:${task_id}:loop3:agent_ids:iteration${iteration}" 2>/dev/null | tr '\n' ',' | sed 's/,$//')

  # If stored IDs exist, use them; otherwise fallback to generating from agent types
  local -a AGENT_IDS
  if [ -n "$stored_ids" ]; then
    IFS=',' read -ra AGENT_IDS <<< "$stored_ids"
    echo "  Retrieved ${#AGENT_IDS[@]} agent IDs from Redis"
  else
    # Fallback: Convert agent types to IDs (legacy compatibility)
    echo "  Warning: No stored agent IDs, using agent types as fallback"
    IFS=',' read -ra AGENT_TYPES <<< "$agents"

    # Track instance counts to match spawn behavior
    declare -A AGENT_INSTANCE_COUNTS
    for agent_type in "${AGENT_TYPES[@]}"; do
      AGENT_INSTANCE_COUNTS["$agent_type"]=$((${AGENT_INSTANCE_COUNTS["$agent_type"]:-0} + 1))
      INSTANCE_NUM="${AGENT_INSTANCE_COUNTS["$agent_type"]}"
      AGENT_IDS+=("${agent_type}-${iteration}-${INSTANCE_NUM}")
    done
  fi

  # Parallel BLPOP implementation with shared timeout
  # Track start time for global timeout calculation
  local start_time=$(date +%s)

  # Spawn parallel BLPOP processes for each agent
  local pids=()
  local temp_files=()

  for unique_agent_id in "${AGENT_IDS[@]}"; do
    # Create temporary file for this agent's result
    local temp_file="/tmp/cfn-wait-${task_id}-${unique_agent_id}-$$.tmp"
    temp_files+=("$temp_file")

    echo "  Waiting for: $unique_agent_id"

    # Spawn BLPOP in background, write result to temp file
    (
      local result
      if redis-cli -h "${REDIS_HOST:-localhost}" -p "${REDIS_PORT:-6379}" blpop "swarm:${task_id}:${unique_agent_id}:done" "$timeout" >/dev/null 2>&1; then
        echo "success" > "$temp_file"
      else
        echo "timeout" > "$temp_file"
      fi
      exit 0
    ) &

    pids+=($!)
  done

  # Wait for all parallel BLPOP processes to complete
  # This ensures timeout is global (60s total), not per-agent (60s * N)
  for pid in "${pids[@]}"; do
    wait "$pid" 2>/dev/null || true
  done

  # ⚠️ ANTI-023 MEMORY LEAK PROTECTION: Stop monitoring for all agents
  echo "  Stopping telemetry monitoring for Loop 3 agents..." >&2
  for unique_agent_id in "${AGENT_IDS[@]}"; do
    local monitor_pid=$("$REDIS_COORD_SKILL/get-context.sh" --task-id "$task_id" --key "${unique_agent_id}:monitor_pid" --namespace "swarm" 2>/dev/null | jq -r '.pid // 0' || echo "0")
    if [[ "$monitor_pid" -gt 0 ]] && kill -0 "$monitor_pid" 2>/dev/null; then
      "$PROJECT_ROOT/.claude/skills/cfn-telemetry/collect-metrics.sh" stop-monitoring "$monitor_pid" >/dev/null 2>&1 || true
      echo "    Stopped monitoring for $unique_agent_id (Monitor PID: $monitor_pid)" >&2
    fi
  done

  # Calculate actual elapsed time
  local end_time=$(date +%s)
  local elapsed=$((end_time - start_time))

  # Check results and report status
  local completed=0
  local timed_out=0

  for i in "${!AGENT_IDS[@]}"; do
    local unique_agent_id="${AGENT_IDS[$i]}"
    local temp_file="${temp_files[$i]}"

    if [ -f "$temp_file" ]; then
      local result=$(cat "$temp_file")
      if [ "$result" = "success" ]; then
        ((completed++))
        echo "  ✅ $unique_agent_id completed"
      else
        ((timed_out++))
        echo "  ⚠️  $unique_agent_id did not complete within timeout"
      fi
      rm -f "$temp_file"
    else
      ((timed_out++))
      echo "  ❌ $unique_agent_id result file missing"
    fi
  done

  echo "Agents completed: $completed/${#AGENT_IDS[@]} (elapsed: ${elapsed}s)"
  echo ""
}

function wait_for_loop2_agents() {
  local task_id="$1"
  local agents="$2"
  local timeout="$3"
  local iteration="${4:-1}"

  echo "Waiting for Loop 2 validators to complete (timeout: ${timeout}s)..."

  # Retrieve actual agent IDs from Redis (stored during spawn using SADD)
  local stored_ids
  stored_ids=$(redis-cli -h "${REDIS_HOST:-localhost}" -p "${REDIS_PORT:-6379}" SMEMBERS "swarm:${task_id}:loop2:agent_ids:iteration${iteration}" 2>/dev/null | tr '\n' ',' | sed 's/,$//')

  # If stored IDs exist, use them; otherwise fallback to generating from agent types
  local -a VALIDATOR_IDS
  if [ -n "$stored_ids" ]; then
    IFS=',' read -ra VALIDATOR_IDS <<< "$stored_ids"
    echo "  Retrieved ${#VALIDATOR_IDS[@]} validator IDs from Redis"
  else
    # Fallback: Convert agent types to IDs (legacy compatibility)
    echo "  Warning: No stored validator IDs, using agent types as fallback"
    IFS=',' read -ra AGENT_TYPES <<< "$agents"

    # Track instance counts to match spawn behavior
    declare -A AGENT_INSTANCE_COUNTS
    for agent_type in "${AGENT_TYPES[@]}"; do
      AGENT_INSTANCE_COUNTS["$agent_type"]=$((${AGENT_INSTANCE_COUNTS["$agent_type"]:-0} + 1))
      INSTANCE_NUM="${AGENT_INSTANCE_COUNTS["$agent_type"]}"
      VALIDATOR_IDS+=("${agent_type}-${iteration}-${INSTANCE_NUM}")
    done
  fi

  # Parallel BLPOP implementation
  local start_time=$(date +%s)
  local pids=()
  local temp_files=()

  for unique_validator_id in "${VALIDATOR_IDS[@]}"; do
    local temp_file="/tmp/cfn-wait-${task_id}-${unique_validator_id}-$$.tmp"
    temp_files+=("$temp_file")

    echo "  Waiting for: $unique_validator_id"

    # Spawn BLPOP in background
    (
      if redis-cli -h "${REDIS_HOST:-localhost}" -p "${REDIS_PORT:-6379}" blpop "swarm:${task_id}:${unique_validator_id}:done" "$timeout" >/dev/null 2>&1; then
        echo "success" > "$temp_file"
      else
        echo "timeout" > "$temp_file"
      fi
      exit 0
    ) &

    pids+=($!)
  done

  # Wait for all processes
  for pid in "${pids[@]}"; do
    wait "$pid" 2>/dev/null || true
  done

  # Check results
  local end_time=$(date +%s)
  local elapsed=$((end_time - start_time))
  local completed=0
  local timed_out=0

  for i in "${!VALIDATOR_IDS[@]}"; do
    local unique_validator_id="${VALIDATOR_IDS[$i]}"
    local temp_file="${temp_files[$i]}"

    if [ -f "$temp_file" ]; then
      local result=$(cat "$temp_file")
      if [ "$result" = "success" ]; then
        ((completed++))
        echo "  ✅ $unique_validator_id completed"
      else
        ((timed_out++))
        echo "  ⚠️  $unique_validator_id did not complete within timeout"
      fi
      rm -f "$temp_file"
    else
      ((timed_out++))
      echo "  ❌ $unique_validator_id result file missing"
    fi
  done

  echo "Validators completed: $completed/${#VALIDATOR_IDS[@]} (elapsed: ${elapsed}s)"
  echo ""
}

function spawn_loop2_agents() {
  local task_id="$1"
  local iteration="$2"
  local agents="$3"

  echo "[Loop 2] Spawning validator agents (iteration $iteration)..."

  # Load success criteria from Redis (if available)
  export AGENT_SUCCESS_CRITERIA=""
  if [[ -n "$task_id" ]] && [[ -x "$SCRIPT_DIR/../cfn-redis-coordination/get-success-criteria.sh" ]]; then
    SUCCESS_CRITERIA=$("$SCRIPT_DIR/../cfn-redis-coordination/get-success-criteria.sh" --task-id "$task_id" 2>/dev/null || echo "")

    if [[ -n "$SUCCESS_CRITERIA" ]]; then
      # SECURITY FIX: Validate JSON size before parsing (prevent DoS)
      CRITERIA_SIZE=$(echo -n "$SUCCESS_CRITERIA" | wc -c)
      MAX_SIZE=10485760  # 10MB

      if [[ "$CRITERIA_SIZE" -gt "$MAX_SIZE" ]]; then
        echo "  ❌ Success criteria exceeds maximum size (10MB): ${CRITERIA_SIZE} bytes" >&2
        exit 1
      fi

      # Validate JSON before exporting
      if echo "$SUCCESS_CRITERIA" | jq empty 2>/dev/null; then
        export AGENT_SUCCESS_CRITERIA="$SUCCESS_CRITERIA"
        TEST_SUITE_COUNT=$(echo "$SUCCESS_CRITERIA" | jq -r '.test_suites | length' 2>/dev/null || echo "0")
        echo "  ✅ Success criteria loaded ($TEST_SUITE_COUNT test suites)" >&2
      else
        echo "  ⚠️  Invalid success criteria JSON - skipping" >&2
      fi
    fi
  fi

  # Convert comma-separated agents to array
  IFS=',' read -ra AGENT_ARRAY <<< "$agents"

  # Track agent instance counts for unique ID generation
  declare -A AGENT_INSTANCE_COUNTS

  # Spawn each agent via CLI
  for agent_type in "${AGENT_ARRAY[@]}"; do
    # Generate unique agent ID (agent-type-iteration-instance)
    AGENT_INSTANCE_COUNTS["$agent_type"]=$((${AGENT_INSTANCE_COUNTS["$agent_type"]:-0} + 1))
    INSTANCE_NUM="${AGENT_INSTANCE_COUNTS["$agent_type"]}"
    UNIQUE_VALIDATOR_ID="${agent_type}-${iteration}-${INSTANCE_NUM}"

    echo "  Spawning: $agent_type (ID: $UNIQUE_VALIDATOR_ID)"

    # Spawn validator in background with process instrumentation and memory limits
    if command -v execute_instrumented >/dev/null 2>&1; then
        execute_instrumented "npx" "$CFN_VALIDATION_TIMEOUT" "$CFN_MEMORY_LIMIT" \
          claude-flow-novice agent "$agent_type" \
          --task-id "$task_id" \
          --agent-id "$UNIQUE_VALIDATOR_ID" \
          --iteration "$iteration" \
          --context "$(build_agent_context "$task_id" "$iteration" "$agent_type" "" "loop2")" &
    else
        # Fallback to raw spawn if instrumentation unavailable
        npx claude-flow-novice agent "$agent_type" \
          --task-id "$task_id" \
          --agent-id "$UNIQUE_VALIDATOR_ID" \
          --iteration "$iteration" \
          --context "$(build_agent_context "$task_id" "$iteration" "$agent_type" "" "loop2")" &
    fi

    # Store PID for monitoring using unique agent ID
    AGENT_PID=$!
    "$REDIS_COORD_SKILL/store-context.sh" \
      --task-id "$task_id" \
      --key "${UNIQUE_VALIDATOR_ID}:pid" \
      --value "{\"pid\": $AGENT_PID}" \
      --namespace "swarm" >/dev/null

    # Store agent ID mapping for later retrieval using Redis SADD for set storage
    # SECURITY FIX: Atomic SADD + EXPIRE using Lua script (prevent race condition)
    redis-cli -h "${REDIS_HOST:-localhost}" -p "${REDIS_PORT:-6379}" --eval - \
      "swarm:${task_id}:loop2:agent_ids:iteration${iteration}" "$UNIQUE_VALIDATOR_ID" <<'LUA' >/dev/null
redis.call('SADD', KEYS[1], ARGV[1])
redis.call('EXPIRE', KEYS[1], 86400)
return redis.call('SCARD', KEYS[1])
LUA
  done

  echo "[Loop 2] All agents spawned"
  echo ""
}

function spawn_product_owner() {
  local task_id="$1"
  local iteration="$2"

  echo "[Product Owner] Spawning decision agent..."

  # BLOCKER #2 FIX: Match execute-decision.sh actual parameters
  # Required: --task-id, --agent-id, --consensus, --threshold, --iteration, --max-iterations
  local decision_output
  decision_output=$("$SCRIPT_DIR/.claude/skills/cfn-product-owner-decision/execute-decision.sh" \
    --task-id "$task_id" \
    --agent-id "$PRODUCT_OWNER" \
    --consensus "$LOOP2_FINAL_CONSENSUS" \
    --threshold "$CONSENSUS" \
    --iteration "$iteration" \
    --max-iterations "$MAX_ITERATIONS")

  # Parse decision from output
  if echo "$decision_output" | grep -q "PROCEED"; then
    FINAL_DECISION="PROCEED"
  elif echo "$decision_output" | grep -q "ITERATE"; then
    FINAL_DECISION="ITERATE"
  elif echo "$decision_output" | grep -q "ABORT"; then
    FINAL_DECISION="ABORT"
  else
    echo "Warning: Could not parse Product Owner decision, defaulting to ITERATE"
    FINAL_DECISION="ITERATE"
  fi

  echo "[Product Owner] Decision: $FINAL_DECISION"
  echo ""
}

function output_result() {
  local status="$1"
  local end_time=$(date +%s)
  local execution_time=$((end_time - START_TIME))

  echo "=============================================="
  echo "CFN Loop Execution Complete"
  echo "=============================================="
  echo "Status: $status"
  echo "Iterations: $ITERATIONS_COMPLETED"
  echo "Final Decision: $FINAL_DECISION"
  echo "Loop 3 Confidence: $LOOP3_FINAL_CONFIDENCE"
  echo "Loop 2 Consensus: $LOOP2_FINAL_CONSENSUS"
  echo "Deliverables Verified: $DELIVERABLES_VERIFIED"
  echo "Execution Time: ${execution_time}s"
  echo "=============================================="

  # Output structured JSON result
  cat <<EOF
{
  "status": "$status",
  "iterations_completed": $ITERATIONS_COMPLETED,
  "final_decision": "$FINAL_DECISION",
  "loop3_confidence": $LOOP3_FINAL_CONFIDENCE,
  "loop2_consensus": $LOOP2_FINAL_CONSENSUS,
  "deliverables_verified": $DELIVERABLES_VERIFIED,
  "execution_time_seconds": $execution_time
}
EOF
}

##############################################################################
# Main CFN Loop
##############################################################################

# Store context in Redis
store_context "$TASK_ID"

# Iteration loop
for ((ITERATION=1; ITERATION<=MAX_ITERATIONS; ITERATION++)); do
  echo ""
  echo "=========================================="
  echo "Iteration $ITERATION / $MAX_ITERATIONS"
  echo "=========================================="
  echo ""

  ITERATIONS_COMPLETED=$ITERATION

  # Step 1: Spawn Loop 3 agents (implementers)
  spawn_loop3_agents "$TASK_ID" "$ITERATION" "$LOOP3_AGENTS"

  # Step 2: Wait for Loop 3 completion
  wait_for_agents "$TASK_ID" "$LOOP3_AGENTS" "$TIMEOUT" "$ITERATION"

  # Step 3: Verify deliverables (prevent "consensus on vapor")
  if [ -n "$EXPECTED_FILES" ] || [ -n "$EPIC_CONTEXT" ]; then
    # Extract task type from epic context for keyword detection
    TASK_TYPE=""
    if [ -n "$EPIC_CONTEXT" ]; then
      TASK_TYPE=$(echo "$EPIC_CONTEXT" | jq -r '.epicGoal // ""' 2>/dev/null || echo "")
    fi

    if "$HELPERS_DIR/deliverable-verifier.sh" \
         --expected-files "${EXPECTED_FILES:-}" \
         --task-type "${TASK_TYPE:-}"; then
      DELIVERABLES_VERIFIED=true
    else
      echo "❌ Deliverable verification failed - forcing Loop 3 iteration"
      # Use iteration manager to wake Loop 3 agents with explicit feedback
      "$HELPERS_DIR/iteration-manager.sh" \
        --task-id "$TASK_ID" \
        --iteration "$((ITERATION + 1))" \
        --agents "$LOOP3_AGENTS" \
        --feedback-source "swarm:${TASK_ID}:feedback"
      continue
    fi
  fi

  # Step 4: Gate check (Loop 3 self-validation)
  # Retrieve actual Loop 3 agent IDs for validation
  LOOP3_IDS=$(redis-cli -h "${REDIS_HOST:-localhost}" -p "${REDIS_PORT:-6379}" SMEMBERS "swarm:${TASK_ID}:loop3:agent_ids:iteration${ITERATION}" 2>/dev/null | tr '\n' ',' | sed 's/,$//')

  if [ -z "$LOOP3_IDS" ]; then
    echo "⚠️  WARNING: No Loop 3 agent IDs found in Redis, using agent types as fallback"
    LOOP3_IDS="$LOOP3_AGENTS"
  fi

  if "$HELPERS_DIR/gate-check.sh" \
       --task-id "$TASK_ID" \
       --agents "$LOOP3_IDS" \
       --threshold "$GATE" \
       --min-quorum "$MIN_QUORUM_LOOP3"; then
    # Gate passed - store confidence
    LOOP3_FINAL_CONFIDENCE=$("$REDIS_COORD_SKILL/invoke-waiting-mode.sh" collect \
      --task-id "$TASK_ID" \
      --agent-ids "$LOOP3_IDS" \
      --min-quorum "$MIN_QUORUM_LOOP3")
  else
    # Gate failed - iterate Loop 3
    echo "❌ Gate check failed - iterating Loop 3"
    "$HELPERS_DIR/iteration-manager.sh" \
      --task-id "$TASK_ID" \
      --iteration "$((ITERATION + 1))" \
      --agents "$LOOP3_AGENTS" \
      --feedback-source "swarm:${TASK_ID}:feedback"
    continue
  fi

  # Step 5: Spawn Loop 2 agents (validators)
  spawn_loop2_agents "$TASK_ID" "$ITERATION" "$LOOP2_AGENTS"

  # Step 6: Wait for Loop 2 completion
  wait_for_loop2_agents "$TASK_ID" "$LOOP2_AGENTS" "$TIMEOUT" "$ITERATION"

  # Step 7: Consensus check (Loop 2 validation)
  # Retrieve actual Loop 2 agent IDs for validation
  LOOP2_IDS=$(redis-cli -h "${REDIS_HOST:-localhost}" -p "${REDIS_PORT:-6379}" SMEMBERS "swarm:${TASK_ID}:loop2:agent_ids:iteration${ITERATION}" 2>/dev/null | tr '\n' ',' | sed 's/,$//')

  if [ -z "$LOOP2_IDS" ]; then
    echo "⚠️  WARNING: No Loop 2 agent IDs found in Redis, using agent types as fallback"
    LOOP2_IDS="$LOOP2_AGENTS"
  fi

  if "$HELPERS_DIR/consensus.sh" \
       --task-id "$TASK_ID" \
       --agents "$LOOP2_IDS" \
       --threshold "$CONSENSUS" \
       --min-quorum "$MIN_QUORUM_LOOP2"; then
    # Consensus reached - store score
    LOOP2_FINAL_CONSENSUS=$("$REDIS_COORD_SKILL/invoke-waiting-mode.sh" collect \
      --task-id "$TASK_ID" \
      --agent-ids "$LOOP2_IDS" \
      --min-quorum "$MIN_QUORUM_LOOP2")
  else
    # Consensus failed - iterate all agents
    echo "❌ Consensus check failed - iterating all agents"
    "$HELPERS_DIR/iteration-manager.sh" \
      --task-id "$TASK_ID" \
      --iteration "$((ITERATION + 1))" \
      --agents "$LOOP3_AGENTS,$LOOP2_AGENTS" \
      --feedback-source "swarm:${TASK_ID}:feedback"
    continue
  fi

  # Step 8: Product Owner Decision
  spawn_product_owner "$TASK_ID" "$ITERATION"

  # Step 9: Execute decision
  case "$FINAL_DECISION" in
    PROCEED)
      # Launch ACE reflection in background (Loop 5)
      echo "[Loop 5] Launching reflection in background..."

      # Ensure log directory exists
      mkdir -p "$PROJECT_ROOT/.artifacts/logs"

      # Build reflection context from CFN Loop execution
      REFLECTION_CONTEXT=$(cat <<EOF
{
  "task_id": "$TASK_ID",
  "task_type": "cfn_loop",
  "mode": "$MODE",
  "iterations_completed": $ITERATIONS_COMPLETED,
  "loop3_agents": "$LOOP3_AGENTS",
  "loop2_agents": "$LOOP2_AGENTS",
  "loop3_confidence": $LOOP3_FINAL_CONFIDENCE,
  "loop2_consensus": $LOOP2_FINAL_CONSENSUS,
  "gate_threshold": $GATE,
  "consensus_threshold": $CONSENSUS,
  "deliverables_verified": $DELIVERABLES_VERIFIED,
  "epic_context": $EPIC_CONTEXT,
  "phase_context": $PHASE_CONTEXT,
  "success_criteria": $SUCCESS_CRITERIA
}
EOF
)

      # Launch reflection in background (non-blocking)
      (
        "$PROJECT_ROOT/.claude/skills/cfn-ace-system/invoke-context-reflect.sh" \
          --context "$REFLECTION_CONTEXT" \
          --output "/tmp/reflection-${TASK_ID}.json" 2>&1 | \
          tee -a "$PROJECT_ROOT/.artifacts/logs/ace-reflection-${TASK_ID}.log"

        # Log completion
        echo "[$(date -Iseconds)] Reflection complete for task $TASK_ID" >> \
          "$PROJECT_ROOT/.artifacts/logs/ace-reflection-${TASK_ID}.log"
      ) &

      REFLECTION_PID=$!
      echo "[Loop 5] Reflection launched (PID: $REFLECTION_PID)"
      echo ""

      # Continue with output (don't wait for reflection)
      output_result "success"
      exit 0
      ;;
    ABORT)
      output_result "aborted"
      exit 1
      ;;
    ITERATE)
      if [ $ITERATION -ge $MAX_ITERATIONS ]; then
        echo "❌ Max iterations reached"
        output_result "failed"
        exit 1
      fi

      echo "🔄 Product Owner requested iteration"
      "$HELPERS_DIR/iteration-manager.sh" \
        --task-id "$TASK_ID" \
        --iteration "$((ITERATION + 1))" \
        --agents "$LOOP3_AGENTS,$LOOP2_AGENTS" \
        --feedback-source "swarm:${TASK_ID}:feedback"
      continue
      ;;
  esac
done

# Max iterations reached without success
echo "❌ Max iterations ($MAX_ITERATIONS) reached without PROCEED decision"
output_result "failed"
exit 1
