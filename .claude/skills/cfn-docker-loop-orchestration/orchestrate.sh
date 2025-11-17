#!/bin/bash
set -euo pipefail

# CFN Docker Loop Orchestration Implementation
# Usage: ./orchestrate.sh [OPERATION] [TASK_ID] [OPTIONS]

# Determine PROJECT_ROOT
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Default configuration
DEFAULT_MAX_ITERATIONS=10
DEFAULT_GATE_THRESHOLD=0.75
DEFAULT_CONSENSUS_THRESHOLD=0.90
DEFAULT_LOOP3_TIMEOUT=600
DEFAULT_LOOP2_TIMEOUT=300
DEFAULT_PO_TIMEOUT=180

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $*" >&2
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*" >&2
}

log_loop() {
    echo -e "${PURPLE}[LOOP]${NC} $*" >&2
}

# Function to display usage
usage() {
    cat << EOF
CFN Docker Loop Orchestration

Usage: $0 [OPERATION] [TASK_ID] [OPTIONS]

Operations:
  execute                Execute complete CFN Loop
  init                   Initialize loop orchestration
  spawn-loop3           Spawn Loop 3 implementer agents
  monitor-loop3         Monitor Loop 3 completion
  gate-check            Check Loop 3 gate and decide next steps
  spawn-loop2           Spawn Loop 2 validator agents
  collect-consensus     Collect Loop 2 consensus
  trigger-po-decision   Trigger Product Owner decision
  analyze-task          Analyze task and select agents
  monitor-progress      Monitor overall loop progress
  validate-deliverables Validate required deliverables
  handle-error          Handle execution errors
  execute-waves         Execute complete wave-based execution (Mode A)
  spawn-wave            Spawn specific wave of containers
  monitor-wave          Monitor wave container completion
  cleanup-wave          Remove wave containers and artifacts
  validate-errors       Run error validation and count results

Options:
  --task-description TEXT    Task description
  --mode MODE              Execution mode (mvp|standard|enterprise)
  --agents LIST            Comma-separated agent types
  --max-iterations NUM     Maximum iterations (default: 10)
  --gate-threshold NUM     Gate threshold (default: 0.75)
  --consensus-threshold NUM Consensus threshold (default: 0.90)
  --context-file PATH      Task context file
  --success-criteria JSON  Success criteria for test-driven validation
  --timeout SECONDS        Operation timeout
  --memory-limit LIMIT     Agent memory limit
  --network NAME           Docker network
  --adaptive-selection     Enable adaptive agent selection
  --force-iteration NUM    Force specific iteration
  --dry-run               Show configuration without execution
  --verbose               Enable verbose logging
  --help                  Show this help message

Examples:
  $0 execute --task-id task-auth --task-description "Implement user authentication" --mode standard
  $0 spawn-loop3 --task-id task-auth --agents backend-developer,frontend-engineer,security-specialist
  $0 monitor-loop3 --task-id task-auth --gate-threshold 0.80
  $0 collect-consensus --task-id task-auth --required-consensus 0.90
  $0 execute-waves --task-id task-fix --batching-plan /tmp/waves.json
  $0 spawn-wave --task-id task-fix --wave-number 1 --batching-plan /tmp/waves.json
  $0 monitor-wave --task-id task-fix --wave-number 1 --expected-count 28
  $0 cleanup-wave --task-id task-fix --wave-number 1
  $0 validate-errors --task-id task-fix --command "tsc --noEmit"

EOF
}

# JSON validation helper with security bounds checking
validate_json_context() {
    local json_str="$1"

    if [ -z "$json_str" ]; then
        return 1
    fi

    # Security: Check size (max 10MB) BEFORE parsing
    local size=$(echo -n "$json_str" | wc -c)
    local MAX_JSON_SIZE=10485760  # 10MB limit

    if [ "$size" -gt "$MAX_JSON_SIZE" ]; then
        log_error "JSON exceeds maximum size (10MB): ${size} bytes"
        log_error "Security Risk: DoS via excessive memory consumption"
        return 1
    fi

    # Validate JSON structure
    if ! echo "$json_str" | jq empty 2>/dev/null; then
        log_error "Invalid JSON structure"
        return 1
    fi

    # Security: Bounds check - validate array sizes if success criteria
    if echo "$json_str" | jq -e '.test_suites' >/dev/null 2>&1; then
        local TEST_SUITE_COUNT=$(echo "$json_str" | jq '.test_suites | length' 2>/dev/null || echo "0")
        local MAX_TEST_SUITES=50

        if [ "$TEST_SUITE_COUNT" -gt "$MAX_TEST_SUITES" ]; then
            log_error "Test suites exceed maximum ($MAX_TEST_SUITES): $TEST_SUITE_COUNT"
            log_error "Security Risk: DoS via resource exhaustion"
            return 1
        fi
    fi

    return 0
}

# Input sanitization helper
sanitize_input() {
    local input="$1"
    local max_length="${2:-256}"

    # SECURITY FIX #2: Command injection prevention - strict alphanumeric whitelist
    # Allows ONLY: letters, numbers, dash, underscore, space, comma, period, colon
    local sanitized=$(echo "$input" | tr -cd '[:alnum:] _,.:-')

    # Length bounds check
    if [ ${#input} -gt "$max_length" ]; then
        log_error "Input exceeds maximum length ($max_length): ${#input}"
        return 1
    fi

    # Reject if input contains shell metacharacters: $, `, ;, |, &, >, <, (, ), {, }, [, ], \, ", ', =
    if [[ "$input" =~ (\$|`|;|\||&|>|<|\(|\)|\{|\}|\[|\]|\\|\"|\'|=) ]]; then
        log_error "Input contains dangerous shell metacharacters"
        log_error "Original: $input"
        log_error "Security Risk: Command injection attack prevented"
        return 1
    fi

    echo "$sanitized"
    return 0
}

# Mode configuration
get_mode_config() {
    local mode="$1"

    case "$mode" in
        "mvp")
            echo '{"maxIterations":3,"gateThreshold":0.70,"consensusThreshold":0.80,"validators":2}'
            ;;
        "standard")
            echo '{"maxIterations":10,"gateThreshold":0.75,"consensusThreshold":0.90,"validators":3}'
            ;;
        "enterprise")
            echo '{"maxIterations":15,"gateThreshold":0.85,"consensusThreshold":0.95,"validators":5}'
            ;;
        *)
            echo '{"maxIterations":10,"gateThreshold":0.75,"consensusThreshold":0.90,"validators":3}'
            ;;
    esac
}

# Path to skills
REDIS_COORDINATION_SKILL="$PROJECT_ROOT/.claude/skills/cfn-docker-redis-coordination/coordinate.sh"
AGENT_SPAWNING_SKILL="$PROJECT_ROOT/.claude/skills/cfn-docker-agent-spawning/spawn-agent.sh"
WAVE_EXECUTION_SKILL="$PROJECT_ROOT/.claude/skills/cfn-docker-wave-execution"
WAVE_SPAWN_SCRIPT="$WAVE_EXECUTION_SKILL/spawn-wave.sh"
WAVE_HELPERS="$WAVE_EXECUTION_SKILL/lib/docker-helpers.sh"
WAVE_CHECKPOINT_SKILL="$PROJECT_ROOT/.claude/skills/cfn-wave-checkpoint"
CHECKPOINT_SAVE_SCRIPT="$WAVE_CHECKPOINT_SKILL/save-checkpoint.sh"
CHECKPOINT_RESUME_SCRIPT="$WAVE_CHECKPOINT_SKILL/resume-wave.sh"
CHECKPOINT_CLEANUP_SCRIPT="$WAVE_CHECKPOINT_SKILL/cleanup-orphans.sh"

# Parse command line arguments
OPERATION=""
TASK_ID=""
TASK_DESCRIPTION=""
MODE="standard"
AGENTS=""
MAX_ITERATIONS="$DEFAULT_MAX_ITERATIONS"
GATE_THRESHOLD="$DEFAULT_GATE_THRESHOLD"
CONSENSUS_THRESHOLD="$DEFAULT_CONSENSUS_THRESHOLD"
CONTEXT_FILE=""
TIMEOUT=""
SUCCESS_CRITERIA=""
MEMORY_LIMIT=""
NETWORK=""
ADAPTIVE_SELECTION=false
FORCE_ITERATION=""
DRY_RUN=false
VERBOSE=false

# Mode A: Wave execution parameters
BATCHING_PLAN=""
WAVE_NUMBER=""
EXPECTED_COUNT=""
VALIDATION_COMMAND=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --task-description)
            TASK_DESCRIPTION="$2"
            shift 2
            ;;
        --mode)
            MODE="$2"
            shift 2
            ;;
        --agents)
            AGENTS="$2"
            shift 2
            ;;
        --max-iterations)
            MAX_ITERATIONS="$2"
            shift 2
            ;;
        --gate-threshold)
            GATE_THRESHOLD="$2"
            shift 2
            ;;
        --consensus-threshold)
            CONSENSUS_THRESHOLD="$2"
            shift 2
            ;;
        --context-file)
            CONTEXT_FILE="$2"
            shift 2
            ;;
        --success-criteria)
            SUCCESS_CRITERIA="$2"
            shift 2
            ;;
        --timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        --memory-limit)
            MEMORY_LIMIT="$2"
            shift 2
            ;;
        --network)
            NETWORK="$2"
            shift 2
            ;;
        --adaptive-selection)
            ADAPTIVE_SELECTION=true
            shift
            ;;
        --force-iteration)
            FORCE_ITERATION="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        --batching-plan)
            BATCHING_PLAN="$2"
            shift 2
            ;;
        --wave-number)
            WAVE_NUMBER="$2"
            shift 2
            ;;
        --expected-count)
            EXPECTED_COUNT="$2"
            shift 2
            ;;
        --command)
            VALIDATION_COMMAND="$2"
            shift 2
            ;;
        --help)
            usage
            exit 0
            ;;
        -*)
            log_error "Unknown option: $1"
            usage
            exit 1
            ;;
        *)
            if [[ -z "$OPERATION" ]]; then
                OPERATION="$1"
            elif [[ -z "$TASK_ID" ]]; then
                TASK_ID="$1"
            else
                log_error "Too many arguments"
                usage
                exit 1
            fi
            shift
            ;;
    esac
done

# Apply mode configuration
MODE_CONFIG=$(get_mode_config "$MODE")
MAX_ITERATIONS=$(echo "$MODE_CONFIG" | jq -r '.maxIterations // 10')
GATE_THRESHOLD=$(echo "$MODE_CONFIG" | jq -r '.gateThreshold // 0.75')
CONSENSUS_THRESHOLD=$(echo "$MODE_CONFIG" | jq -r '.consensusThreshold // 0.90')

# Validate required arguments
if [[ -z "$OPERATION" ]]; then
    log_error "Operation is required"
    usage
    exit 1
fi

if [[ -z "$TASK_ID" && "$OPERATION" != "analyze-task" ]]; then
    log_error "Task ID is required"
    usage
    exit 1
fi

# Check dependencies
for dependency in "$REDIS_COORDINATION_SKILL" "$AGENT_SPAWNING_SKILL"; do
    if [[ ! -f "$dependency" ]]; then
        log_error "Required skill not found: $dependency"
        exit 1
    fi
done

# Validate Docker agent image exists
AGENT_IMAGE="${AGENT_IMAGE:-claude-flow-novice-agent:latest}"
if ! docker image inspect "$AGENT_IMAGE" &>/dev/null; then
    log_error "Required Docker image not found: $AGENT_IMAGE"
    log_error "Please build the image first or set AGENT_IMAGE environment variable"
    exit 1
fi
log "Using agent image: $AGENT_IMAGE"

# Change to project root
cd "$PROJECT_ROOT"

# Operation implementations

# Planning phase: Decompose task into atomic units
plan_task() {
    local task_description="$1"
    local task_id="$2"

    if [[ -z "$task_description" ]]; then
        log_error "Task description is required for planning"
        return 1
    fi

    log "Planning phase: Decomposing task into atomic units"
    log "Task: $task_description"

    # Create plan file
    local plan_file="/tmp/cfn-docker-plan-${task_id}.json"

    # Check if plan file already exists (from pre-planning)
    if [[ -f "$plan_file" ]]; then
        log "Using existing plan file: $plan_file"

        # Validate plan structure
        if ! jq -e '.atomic_tasks' "$plan_file" > /dev/null 2>&1; then
            log_error "Invalid existing plan format: missing atomic_tasks"
            return 1
        fi

        log_success "Task planning complete: $(jq -r '.atomic_tasks | length' "$plan_file") atomic tasks"

        # Extract agent assignments from plan
        local agents
        agents=$(jq -r '.atomic_tasks[].agent_type' "$plan_file" | sort -u | tr '\n' ' ')
        echo "$agents"
        return 0
    fi

    # Generate plan via LLM API call (for Docker mode)
    if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
        log "Generating plan via Anthropic API..."

        # Create planning prompt
        local planning_prompt="You are a task planning expert. Decompose this task into atomic units for parallel execution.

Task: ${task_description}

Requirements:
1. Break task into 15-30 minute atomic units
2. Each atomic task should have: description, estimated time, dependencies, agent type, deliverables
3. Agent types available: backend-developer, react-frontend-engineer, security-specialist, tester, reviewer, devops-engineer
4. Assign 1 atomic task per agent (2-3 max if shared context helps)
5. Identify which tasks can run in parallel vs sequential
6. Use simple dependency notation: [] for no dependencies, [\"task-1\"] for dependencies

Output ONLY valid JSON in this exact format:
{
  \"atomic_tasks\": [
    {
      \"id\": \"task-1\",
      \"description\": \"Implement JWT token generation middleware\",
      \"estimated_time\": \"20 min\",
      \"dependencies\": [],
      \"agent_type\": \"backend-developer\",
      \"deliverables\": [\"src/middleware/jwt.ts\", \"tests\"]
    }
  ],
  \"execution_phases\": {
    \"phase_1_parallel\": [\"task-1\", \"task-3\"],
    \"phase_2_sequential\": [\"task-2\"]
  }
}"

        # Call Anthropic API
        local api_response
        api_response=$(curl -s -X POST https://api.anthropic.com/v1/messages \
            -H "x-api-key: ${ANTHROPIC_API_KEY}" \
            -H "anthropic-version: 2023-06-01" \
            -H "content-type: application/json" \
            -d "{
                \"model\": \"claude-sonnet-4-20250514\",
                \"max_tokens\": 2048,
                \"messages\": [{
                    \"role\": \"user\",
                    \"content\": $(echo "$planning_prompt" | jq -Rs .)
                }]
            }")

        # Extract plan from response
        local plan_content
        plan_content=$(echo "$api_response" | jq -r '.content[0].text' 2>/dev/null)

        if [[ -z "$plan_content" || "$plan_content" == "null" ]]; then
            log_error "Failed to get plan from API"
            log_warning "API response: $(echo "$api_response" | head -100)"
            return 1
        fi

        # Clean JSON (remove markdown code blocks if present)
        plan_content=$(echo "$plan_content" | sed -n '/^{/,/^}/p')

        # Save plan file
        echo "$plan_content" > "$plan_file"

        # Validate plan structure
        if ! jq -e '.atomic_tasks' "$plan_file" > /dev/null 2>&1; then
            log_error "Invalid plan format from API: missing atomic_tasks"
            log_warning "Plan content: $(cat "$plan_file" | head -50)"
            return 1
        fi

        log_success "Task planning complete via API: $(jq -r '.atomic_tasks | length' "$plan_file") atomic tasks"

        # Extract agent assignments from plan
        local agents
        agents=$(jq -r '.atomic_tasks[].agent_type' "$plan_file" | sort -u | tr '\n' ' ')
        echo "$agents"
        return 0
    fi

    # No API key - wait for external plan file (Task mode)
    log_warning "No ANTHROPIC_API_KEY found, waiting for external plan file..."
    local wait_count=0
    while [[ ! -f "$plan_file" && $wait_count -lt 30 ]]; do
        sleep 1
        ((wait_count++))
    done

    if [[ ! -f "$plan_file" ]]; then
        log_warning "No plan file created, falling back to analyze_task"
        return 1
    fi

    # Validate plan structure
    if ! jq -e '.atomic_tasks' "$plan_file" > /dev/null 2>&1; then
        log_error "Invalid plan format: missing atomic_tasks"
        return 1
    fi

    log_success "Task planning complete: $(jq -r '.atomic_tasks | length' "$plan_file") atomic tasks"

    # Extract agent assignments from plan
    local agents
    agents=$(jq -r '.atomic_tasks[].agent_type' "$plan_file" | sort -u | tr '\n' ' ')
    echo "$agents"
}

analyze_task() {
    local task_description="$1"
    local task_id="${2:-}"

    if [[ -z "$task_description" ]]; then
        log_error "Task description is required for task analysis"
        return 1
    fi

    log "Analyzing task: $task_description"

    # Try planning first if task_id provided
    if [[ -n "$task_id" ]]; then
        local planned_agents
        if planned_agents=$(plan_task "$task_description" "$task_id" 2>/dev/null); then
            log "Using planned agent assignments: $planned_agents"
            echo "$planned_agents"
            return 0
        fi
    fi

    # Fallback: Simple keyword-based agent selection
    log_warning "Using fallback keyword-based agent selection"
    local selected_agents=()

    if [[ "$task_description" =~ (frontend|ui|user.interface|react|vue|angular) ]]; then
        selected_agents+=("react-frontend-engineer")
    fi

    if [[ "$task_description" =~ (backend|api|server|database|authentication|security) ]]; then
        selected_agents+=("backend-developer")
        if [[ "$task_description" =~ (security|auth|encryption|password) ]]; then
            selected_agents+=("security-specialist")
        fi
    fi

    if [[ "$task_description" =~ (test|testing|quality|qa) ]]; then
        selected_agents+=("tester")
    fi

    if [[ "$task_description" =~ (review|code.quality|refactor) ]]; then
        selected_agents+=("reviewer")
    fi

    if [[ "$task_description" =~ (devops|deployment|docker|infrastructure) ]]; then
        selected_agents+=("devops-engineer")
    fi

    # Default agents if none selected
    if [[ ${#selected_agents[@]} -eq 0 ]]; then
        selected_agents=("backend-developer" "react-frontend-engineer" "reviewer")
    fi

    # Limit to 3 agents for Loop 3
    local loop3_agents=("${selected_agents[@]:0:3}")

    log "Recommended Loop 3 agents: $(IFS=','; echo "${loop3_agents[*]}")"
    log "Recommended Loop 2 agents: reviewer,tester"

    echo "${loop3_agents[*]}"
}

init() {
    local task_id="$1"
    local context_file="$2"

    log "Initializing loop orchestration for task: $task_id"

    # Initialize Redis coordination
    if [[ -n "$context_file" ]]; then
        "$REDIS_COORDINATION_SKILL" init-task \
            --task-id "$task_id" \
            --context-file "$context_file"
    else
        "$REDIS_COORDINATION_SKILL" init-task \
            --task-id "$task_id"
    fi

    # Store loop configuration
    local config_file="/tmp/loop-config-${task_id}.json"
    cat > "$config_file" << EOF
{
  "taskId": "$task_id",
  "mode": "$MODE",
  "maxIterations": $MAX_ITERATIONS,
  "gateThreshold": $GATE_THRESHOLD,
  "consensusThreshold": $CONSENSUS_THRESHOLD,
  "currentIteration": 1,
  "currentLoop": 3,
  "status": "initialized",
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

    # Store success criteria if provided
    if [[ -n "$SUCCESS_CRITERIA" ]]; then
        if validate_json_context "$SUCCESS_CRITERIA"; then
            # Store in Redis using coordination skill
            if command -v redis-cli >/dev/null 2>&1; then
                redis-cli HSET "task:${task_id}:context" "success-criteria" "$SUCCESS_CRITERIA" >/dev/null 2>&1 || {
                    log_warning "Failed to store success criteria in Redis, will pass via env vars"
                }
                log "Stored success criteria ($(echo "$SUCCESS_CRITERIA" | jq -r '.test_suites | length' 2>/dev/null || echo '0') test suites)"
            else
                log_warning "Redis not available, success criteria will be passed via environment variables"
            fi
        else
            log_error "Invalid success criteria JSON, skipping storage"
        fi
    fi

    log_success "Loop orchestration initialized: $task_id"
}

spawn_loop3() {
    local task_id="$1"
    local agents="$2"
    local iteration="${3:-1}"

    if [[ -z "$agents" ]]; then
        log_error "Agent list is required for Loop 3 spawning"
        return 1
    fi

    log_loop "Spawning Loop 3 implementers (iteration $iteration)"
    log "Agents: $agents"

    # Load success criteria from Redis (if available)
    local AGENT_SUCCESS_CRITERIA=""
    local AGENT_SUCCESS_CRITERIA_B64=""

    if command -v redis-cli >/dev/null 2>&1; then
        local LOADED_CRITERIA=$(redis-cli HGET "task:${task_id}:context" "success-criteria" 2>/dev/null || echo "")

        if [[ -n "$LOADED_CRITERIA" && "$LOADED_CRITERIA" != "null" ]]; then
            # Validate JSON
            if echo "$LOADED_CRITERIA" | jq empty 2>/dev/null; then
                AGENT_SUCCESS_CRITERIA="$LOADED_CRITERIA"

                # Base64-encode for safe environment variable passing
                AGENT_SUCCESS_CRITERIA_B64=$(echo -n "$AGENT_SUCCESS_CRITERIA" | base64 -w 0 2>/dev/null || echo -n "$AGENT_SUCCESS_CRITERIA" | base64)

                local TEST_SUITE_COUNT=$(echo "$AGENT_SUCCESS_CRITERIA" | jq -r '.test_suites | length' 2>/dev/null || echo "0")
                log "Success criteria loaded ($TEST_SUITE_COUNT test suites)"
            else
                log_warning "Invalid success criteria JSON in Redis, skipping"
            fi
        fi
    fi

    # Fallback to global SUCCESS_CRITERIA if not in Redis
    if [[ -z "$AGENT_SUCCESS_CRITERIA" && -n "$SUCCESS_CRITERIA" ]]; then
        AGENT_SUCCESS_CRITERIA="$SUCCESS_CRITERIA"
        AGENT_SUCCESS_CRITERIA_B64=$(echo -n "$AGENT_SUCCESS_CRITERIA" | base64 -w 0 2>/dev/null || echo -n "$AGENT_SUCCESS_CRITERIA" | base64)
        log "Using global success criteria (not in Redis)"
    fi

    # Check for execution plan
    local plan_file="/tmp/cfn-docker-plan-${task_id}.json"
    local has_plan=false
    if [[ -f "$plan_file" ]] && jq -e '.atomic_tasks' "$plan_file" > /dev/null 2>&1; then
        has_plan=true
        log "Using execution plan with $(jq -r '.atomic_tasks | length' "$plan_file") atomic tasks"
    fi

    # Spawn agents
    IFS=',' read -ra AGENT_ARRAY <<< "$agents"
    local agent_ids=()
    local task_index=0

    for agent_type in "${AGENT_ARRAY[@]}"; do
        agent_type=$(echo "$agent_type" | xargs)  # trim whitespace

        # Get atomic task assignment from plan (if available)
        local atomic_task_desc="$TASK_DESCRIPTION"
        local atomic_task_deliverables=""

        if [[ "$has_plan" == true ]]; then
            # Find atomic tasks assigned to this agent type
            atomic_task_desc=$(jq -r ".atomic_tasks[] | select(.agent_type == \"$agent_type\") | .description" "$plan_file" | head -1)
            atomic_task_deliverables=$(jq -r ".atomic_tasks[] | select(.agent_type == \"$agent_type\") | .deliverables | join(\", \")" "$plan_file" | head -1)

            if [[ -n "$atomic_task_desc" && "$atomic_task_desc" != "null" ]]; then
                log "Atomic task for $agent_type: $atomic_task_desc"
            else
                log_warning "No atomic task found in plan for $agent_type, using full task description"
                atomic_task_desc="$TASK_DESCRIPTION"
            fi
        fi

        # Store task context for this specific agent
        local context_file="/tmp/task-context-${task_id}-loop3-${iteration}-${agent_type}.json"

        # Create enhanced context with atomic task assignment
        local context_json=$(cat << EOF
{
  "task_id": "$task_id",
  "loop_number": 3,
  "iteration": $iteration,
  "mode": "$MODE",
  "role": "implementer",
  "agent_type": "$agent_type",
  "atomic_task": "$atomic_task_desc",
  "expected_deliverables": "$atomic_task_deliverables",
  "gate_threshold": $GATE_THRESHOLD,
  "max_iterations": $MAX_ITERATIONS,
  "instructions": "Complete your assigned atomic task (15-30 min scope). Focus on: $atomic_task_desc. Deliver working, tested code. Report confidence (0.0-1.0).",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
)

        # Add success criteria if available (stored separately due to potential size)
        if [[ -n "$AGENT_SUCCESS_CRITERIA_B64" ]]; then
            context_json=$(echo "$context_json" | jq --arg criteria_b64 "$AGENT_SUCCESS_CRITERIA_B64" '. + {success_criteria_b64: $criteria_b64}')
        fi

        echo "$context_json" > "$context_file"

        # Get task context from Redis if available
        if [[ -n "$CONTEXT_FILE" ]]; then
            # Merge with existing context
            local merged_context=$(jq -s '.[0] * .[1]' "$CONTEXT_FILE" "$context_file")
            echo "$merged_context" > "$context_file"
        fi

        if [[ "$DRY_RUN" == false ]]; then
            # Docker container environment: Agent spawning skill will extract
            # success_criteria_b64 from context file and pass to container via:
            # docker run --env AGENT_SUCCESS_CRITERIA_B64=<base64-encoded-json>
            # This enables secure test-driven validation in containerized agents

            local agent_id
            agent_id=$("$AGENT_SPAWNING_SKILL" \
                "$agent_type" \
                "$task_id" \
                "" \
                --context "$context_file" \
                --memory-limit "${MEMORY_LIMIT:-1g}" \
                --network "${NETWORK:-mcp-network}" 2>&1 | grep -o '^Agent ID: [^[:space:]]*' | cut -d' ' -f3)

            if [[ -n "$agent_id" ]]; then
                agent_ids+=("$agent_id")

                # Register agent in Redis
                "$REDIS_COORDINATION_SKILL" register-agent \
                    --agent-id "$agent_id" \
                    --agent-type "$agent_type" \
                    --task-id "$task_id"

                log_success "Agent spawned: $agent_id ($agent_type)"
            else
                log_error "Failed to spawn agent: $agent_type"
                return 1
            fi
        else
            log "DRY RUN: Would spawn agent: $agent_type"
        fi
    done

    # Validate agents were spawned successfully
    if [[ "$DRY_RUN" == false && ${#agent_ids[@]} -eq 0 ]]; then
        log_error "No agents were spawned successfully"
        return 1
    fi

    if [[ "$DRY_RUN" == false && ${#agent_ids[@]} -gt 0 ]]; then
        log_loop "Loop 3 agents spawned: ${#agent_ids[@]} agents"
        # Store agent IDs for monitoring
        printf '%s\n' "${agent_ids[@]}" > "/tmp/loop3-agents-${task_id}-${iteration}.txt"
    fi

    # Cleanup
    rm -f "$context_file"
}

monitor_loop3() {
    local task_id="$1"
    local gate_threshold="${2:-$GATE_THRESHOLD}"
    local iteration="${3:-1}"

    log_loop "Monitoring Loop 3 completion (iteration $iteration)"

    # Get spawned agents
    local agents_file="/tmp/loop3-agents-${task_id}-${iteration}.txt"
    if [[ ! -f "$agents_file" ]]; then
        log_error "No Loop 3 agents found for task: $task_id"
        return 1
    fi

    local agent_count=$(wc -l < "$agents_file")
    log "Waiting for $agent_count agents to complete"

    # Wait for agent completion
    if "$REDIS_COORDINATION_SKILL" wait-loop \
        --task-id "$task_id" \
        --loop-number 3 \
        --agent-count "$agent_count" \
        --timeout "${TIMEOUT:-$DEFAULT_LOOP3_TIMEOUT}"; then

        log_success "All Loop 3 agents completed"

        # Collect confidence scores for gate check
        local total_confidence=0
        local completed_agents=0

        while IFS= read -r agent_id; do
            local confidence=$("$REDIS_COORDINATION_SKILL" get-context "$task_id" "$agent_id" 2>/dev/null | jq -r '.confidence // 0.0')
            if [[ "$confidence" != "0.0" && "$confidence" != "null" ]]; then
                total_confidence=$(echo "$total_confidence + $confidence" | bc -l)
                ((completed_agents++))
                if [[ "$VERBOSE" == true ]]; then
                    log "Agent $agent_id confidence: $confidence"
                fi
            fi
        done < "$agents_file"

        if [[ $completed_agents -gt 0 ]]; then
            local average_confidence=$(echo "scale=3; $total_confidence / $completed_agents" | bc -l)
            log "Gate result: $average_confidence >= $gate_threshold"

            if (( $(echo "$average_confidence >= $gate_threshold" | bc -l) )); then
                log_success "Loop 3 gate PASSED (confidence: $average_confidence)"
                return 0
            else
                log_warning "Loop 3 gate FAILED (confidence: $average_confidence)"
                return 1
            fi
        else
            log_error "No confidence scores collected from agents"
            return 1
        fi
    else
        log_error "Loop 3 completion timeout or failure"
        return 1
    fi
}

gate_check() {
    local task_id="$1"
    local gate_threshold="${2:-$GATE_THRESHOLD}"
    local iteration="${3:-1}"
    local max_iterations="${4:-$MAX_ITERATIONS}"

    log_loop "Performing gate check for iteration $iteration"

    # First, ensure Loop 3 agents have completed
    if ! monitor_loop3 "$task_id" "$gate_threshold" "$iteration"; then
        log_error "Loop 3 monitoring failed"
        return 1
    fi

    # Get Loop 3 agent IDs for gate check
    local agents_file="/tmp/loop3-agents-${task_id}-${iteration}.txt"
    local loop3_agent_ids=""

    if [[ -f "$agents_file" ]]; then
        loop3_agent_ids=$(cat "$agents_file" | tr '\n' ',' | sed 's/,$//')
    else
        log_error "No Loop 3 agent IDs found for gate check"
        return 1
    fi

    # Load success criteria from Redis
    local gate_success_criteria=""
    if command -v redis-cli >/dev/null 2>&1; then
        gate_success_criteria=$(redis-cli HGET "task:${task_id}:context" "success-criteria" 2>/dev/null || echo "")
    fi

    # Fallback to global SUCCESS_CRITERIA
    if [[ -z "$gate_success_criteria" && -n "$SUCCESS_CRITERIA" ]]; then
        gate_success_criteria="$SUCCESS_CRITERIA"
    fi

    # Use test-driven gate check helper if available
    local GATE_CHECK_HELPER="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/helpers/gate-check.sh"

    if [[ -x "$GATE_CHECK_HELPER" ]]; then
        log "Using test-driven gate check"

        # Prepare arguments
        local gate_args=(
            --task-id "$task_id"
            --agents "$loop3_agent_ids"
            --threshold "$gate_threshold"
            --min-quorum "0.66"
            --mode "$MODE"
        )

        # Add success criteria if available
        if [[ -n "$gate_success_criteria" ]]; then
            gate_args+=(--success-criteria "$gate_success_criteria")
            gate_args+=(--strategy "test-driven")
        else
            gate_args+=(--strategy "confidence")
            log_warning "No success criteria available, using confidence-based gate check"
        fi

        if "$GATE_CHECK_HELPER" "${gate_args[@]}"; then
            # Gate passed - proceed to Loop 2
            log_success "Gate PASSED - proceeding to Loop 2 validation"

            # Signal gate passed for Loop 2 agents
            if command -v redis-cli >/dev/null 2>&1; then
                redis-cli LPUSH "cfn_docker:task:$task_id:gate-passed" "proceed" > /dev/null 2>&1 || true
            fi

            return 0
        else
            # Gate failed - check if we can iterate
            if [[ $iteration -lt $max_iterations ]]; then
                log_warning "Gate FAILED - iterating Loop 3 ($iteration/$max_iterations)"

                # Force next iteration
                spawn_loop3 "$task_id" "$AGENTS" $((iteration + 1))
                return 2  # Signal to iterate
            else
                log_error "Gate FAILED - max iterations reached ($max_iterations)"
                return 1
            fi
        fi
    else
        # Fallback to legacy confidence-based gate check
        log_warning "Gate check helper not found, using legacy confidence-based validation"

        # The monitor_loop3 function already checked confidence
        # If we got here, monitoring succeeded, so gate passes
        log_success "Gate PASSED (legacy mode)"

        # Signal gate passed
        if command -v redis-cli >/dev/null 2>&1; then
            redis-cli LPUSH "cfn_docker:task:$task_id:gate-passed" "proceed" > /dev/null 2>&1 || true
        fi

        return 0
    fi
}

spawn_loop2() {
    local task_id="$1"
    local loop3_work="$2"

    log_loop "Spawning Loop 2 validators"

    # Standard Loop 2 agents
    local validators="reviewer,tester"

    # Add security specialist for sensitive tasks
    if [[ "$TASK_DESCRIPTION" =~ (security|auth|password|encryption) ]]; then
        validators="$validators,security-specialist"
    fi

    # Create Loop 2 context
    local context_file="/tmp/task-context-${task_id}-loop2.json"
    cat > "$context_file" << EOF
{
  "task_id": "$task_id",
  "loop_number": 2,
  "iteration": 1,
  "mode": "$MODE",
  "role": "validator",
  "task_description": "$TASK_DESCRIPTION",
  "consensus_threshold": $CONSENSUS_THRESHOLD,
  "loop3_work": "$loop3_work",
  "instructions": "Review and validate the implementation from Loop 3. Check for quality, correctness, and adherence to requirements. Provide your confidence in the implementation (0.0-1.0) and specific feedback.",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

    # Spawn validator agents
    IFS=',' read -ra VALIDATOR_ARRAY <<< "$validators"
    local validator_ids=()

    for validator_type in "${VALIDATOR_ARRAY[@]}"; do
        validator_type=$(echo "$validator_type" | xargs)  # trim whitespace

        log "Spawning validator: $validator_type"

        if [[ "$DRY_RUN" == false ]]; then
            local validator_id
            validator_id=$("$AGENT_SPAWNING_SKILL" \
                "$validator_type" \
                "$task_id" \
                "" \
                --context "$context_file" \
                --memory-limit "${MEMORY_LIMIT:-1g}" \
                --network "${NETWORK:-mcp-network}" 2>&1 | grep -o '^Agent ID: [^[:space]]*' | cut -d' ' -f3)

            if [[ -n "$validator_id" ]]; then
                validator_ids+=("$validator_id")

                # Register validator in Redis
                "$REDIS_COORDINATION_SKILL" register-agent \
                    --agent-id "$validator_id" \
                    --agent-type "$validator_type" \
                    --task-id "$task_id"

                log_success "Validator spawned: $validator_id ($validator_type)"
            else
                log_error "Failed to spawn validator: $validator_type"
            fi
        else
            log "DRY RUN: Would spawn validator: $validator_type"
        fi
    done

    if [[ "$DRY_RUN" == false && ${#validator_ids[@]} -gt 0 ]]; then
        log_loop "Loop 2 validators spawned: ${#validator_ids[@]} validators"
        # Store validator IDs for monitoring
        printf '%s\n' "${validator_ids[@]}" > "/tmp/loop2-agents-${task_id}.txt"
    fi

    # Cleanup
    rm -f "$context_file"
}

collect_consensus() {
    local task_id="$1"
    local consensus_threshold="${2:-$CONSENSUS_THRESHOLD}"

    log_loop "Collecting Loop 2 consensus (threshold: $consensus_threshold)"

    # Get spawned validators
    local validators_file="/tmp/loop2-agents-${task_id}.txt"
    if [[ ! -f "$validators_file" ]]; then
        log_error "No Loop 2 validators found for task: $task_id"
        return 1
    fi

    local validator_count=$(wc -l < "$validators_file")
    log "Waiting for $validator_count validators to complete"

    # Wait for validator completion
    if "$REDIS_COORDINATION_SKILL" wait-loop \
        --task-id "$task_id" \
        --loop-number 2 \
        --agent-count "$validator_count" \
        --timeout "${TIMEOUT:-$DEFAULT_LOOP2_TIMEOUT}"; then

        # Collect consensus
        if "$REDIS_COORDINATION_SKILL" collect-consensus \
            --task-id "$task_id" \
            --loop-number 2 \
            --required-consensus "$consensus_threshold"; then

            log_success "Loop 2 consensus collected and PASSED"
            return 0
        else
            log_error "Loop 2 consensus collection FAILED or threshold not met"
            return 1
        fi
    else
        log_error "Loop 2 validator completion timeout"
        return 1
    fi
}

trigger_po_decision() {
    local task_id="$1"
    local consensus_data="$2"

    log_loop "Triggering Product Owner decision"

    # Create PO context
    local context_file="/tmp/task-context-${task_id}-po.json"
    cat > "$context_file" << EOF
{
  "task_id": "$task_id",
  "loop_number": 4,
  "role": "product-owner",
  "mode": "$MODE",
  "task_description": "$TASK_DESCRIPTION",
  "consensus_data": "$consensus_data",
  "instructions": "Review the consensus data and make a strategic decision: PROCEED (implementation complete), ITERATE (needs more work), or ABORT (task not feasible). Use GOAP methodology for decision analysis.",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

    # Spawn Product Owner
    log "Spawning Product Owner for decision"

    if [[ "$DRY_RUN" == false ]]; then
        local po_id
        po_id=$("$AGENT_SPAWNING_SKILL" \
            "product-owner" \
            "$task_id" \
            "" \
            --context "$context_file" \
            --memory-limit "${MEMORY_LIMIT:-1g}" \
            --network "${NETWORK:-mcp-network}" 2>&1 | grep -o '^Agent ID: [^[:space:]]*' | cut -d' ' -f3)

        if [[ -n "$po_id" ]]; then
            log_success "Product Owner spawned: $po_id"

            # Wait for PO decision (with timeout)
            if "$REDIS_COORDINATION_SKILL" wait-loop \
                --task-id "$task_id" \
                --loop-number 4 \
                --agent-count 1 \
                --timeout "${TIMEOUT:-$DEFAULT_PO_TIMEOUT}"; then

                log_success "Product Owner decision completed"
                return 0
            else
                log_error "Product Owner decision timeout"
                return 1
            fi
        else
            log_error "Failed to spawn Product Owner"
            return 1
        fi
    else
        log "DRY RUN: Would spawn Product Owner"
    fi

    # Cleanup
    rm -f "$context_file"
}

################################################################################
# MEMORY BUDGET VALIDATION
################################################################################

validate_memory_budget() {
    local batching_plan="$1"

    if [[ ! -f "$batching_plan" ]]; then
        log_error "Batching plan not found: $batching_plan"
        return 1
    fi

    # Parse available Docker memory
    local available_memory
    available_memory=$(docker info --format '{{.MemTotal}}' 2>/dev/null || echo "0")

    if [[ "$available_memory" -eq 0 ]]; then
        log_warning "Cannot determine Docker memory - skipping memory validation"
        return 0
    fi

    # Calculate required memory from plan
    local total_memory=0
    local wave_count
    wave_count=$(jq '.waves | length' "$batching_plan" 2>/dev/null || echo "0")

    for wave_idx in $(seq 0 $((wave_count - 1))); do
        local containers_in_wave
        containers_in_wave=$(jq ".waves[$wave_idx].batch_count // 0" "$batching_plan" 2>/dev/null || echo "0")

        # Default memory per container (512MB)
        local memory_per_container=$((512 * 1024 * 1024))

        # Check for tier-specific memory
        local tier
        tier=$(jq ".waves[$wave_idx].tier // 1" "$batching_plan" 2>/dev/null || echo "1")

        case "$tier" in
            1) memory_per_container=$((512 * 1024 * 1024)) ;;
            2) memory_per_container=$((600 * 1024 * 1024)) ;;
            3) memory_per_container=$((800 * 1024 * 1024)) ;;
            4) memory_per_container=$((1024 * 1024 * 1024)) ;;
        esac

        local wave_memory=$((containers_in_wave * memory_per_container))
        total_memory=$((total_memory + wave_memory))

        log "Wave $((wave_idx + 1)): $containers_in_wave containers × $((memory_per_container / 1024 / 1024))MB = $((wave_memory / 1024 / 1024))MB"
    done

    # Compare with available memory
    local total_memory_gb=$((total_memory / 1024 / 1024 / 1024))
    local available_memory_gb=$((available_memory / 1024 / 1024 / 1024))

    log "Memory validation: Required $total_memory_gb GB / Available $available_memory_gb GB"

    if [[ $total_memory -gt $available_memory ]]; then
        log_error "Insufficient memory: Required $total_memory_gb GB exceeds available $available_memory_gb GB"
        return 1
    fi

    log_success "Memory validation passed"
    return 0
}

################################################################################
# CHECKPOINT MANAGEMENT
################################################################################

check_checkpoint_recovery() {
    local task_id="$1"

    if [[ -z "$task_id" ]]; then
        log_error "check_checkpoint_recovery requires: task_id"
        return 1
    fi

    if [[ ! -x "$CHECKPOINT_RESUME_SCRIPT" ]]; then
        log_warning "Checkpoint recovery script not found: $CHECKPOINT_RESUME_SCRIPT"
        return 1
    fi

    log "Checking for existing checkpoints for task: $task_id"

    # Source the resume script functions
    source "$CHECKPOINT_RESUME_SCRIPT" 2>/dev/null || {
        log_warning "Failed to source checkpoint resume script"
        return 1
    }

    # Check if resumable waves exist
    if get_resumable_waves "$task_id" > /tmp/resumable_waves.txt 2>/dev/null; then
        local wave_count
        wave_count=$(wc -l < /tmp/resumable_waves.txt)

        if [[ $wave_count -gt 0 ]]; then
            log_success "Found $wave_count checkpoint(s) for recovery"
            return 0
        fi
    fi

    return 1
}

resume_from_checkpoint() {
    local task_id="$1"

    if [[ -z "$task_id" ]]; then
        log_error "resume_from_checkpoint requires: task_id"
        return 1
    fi

    if [[ ! -x "$CHECKPOINT_RESUME_SCRIPT" ]]; then
        log_error "Checkpoint recovery script not found: $CHECKPOINT_RESUME_SCRIPT"
        return 1
    fi

    log "Attempting to resume from checkpoint for task: $task_id"

    # Call resume script
    if "$CHECKPOINT_RESUME_SCRIPT" resume "$task_id"; then
        log_success "Successfully resumed from checkpoint"
        return 0
    else
        log_error "Failed to resume from checkpoint"
        return 1
    fi
}

save_wave_checkpoint() {
    local task_id="$1"
    local wave_number="$2"
    local container_ids="$3"
    local batch_count="$4"

    if [[ -z "$task_id" ]] || [[ -z "$wave_number" ]] || [[ -z "$container_ids" ]]; then
        log_warning "Invalid checkpoint parameters, skipping checkpoint save"
        return 0  # Non-fatal
    fi

    if [[ ! -x "$CHECKPOINT_SAVE_SCRIPT" ]]; then
        log_warning "Checkpoint save script not found, skipping checkpoint"
        return 0  # Non-fatal
    fi

    log "Saving checkpoint for wave $wave_number"

    # Call save script
    if "$CHECKPOINT_SAVE_SCRIPT" \
        save "$task_id" "$wave_number" "$container_ids" "$(date +%s)" "$batch_count" >/dev/null 2>&1; then
        log_success "Checkpoint saved for wave $wave_number"
        return 0
    else
        log_warning "Failed to save checkpoint (execution will continue)"
        return 0  # Non-fatal
    fi
}

cleanup_orphaned_containers() {
    local task_id="$1"
    local wave_number="${2:-}"

    if [[ -z "$task_id" ]]; then
        log_error "cleanup_orphaned_containers requires: task_id"
        return 1
    fi

    if [[ ! -x "$CHECKPOINT_CLEANUP_SCRIPT" ]]; then
        log_warning "Checkpoint cleanup script not found, skipping orphan cleanup"
        return 0
    fi

    log "Cleaning up orphaned containers for task: $task_id"

    if [[ -z "$wave_number" ]]; then
        # Cleanup all waves
        if "$CHECKPOINT_CLEANUP_SCRIPT" cleanup "$task_id" >/dev/null 2>&1; then
            log_success "Orphan cleanup completed"
            return 0
        fi
    else
        # Cleanup specific wave
        if "$CHECKPOINT_CLEANUP_SCRIPT" cleanup "$task_id" "$wave_number" >/dev/null 2>&1; then
            log_success "Orphan cleanup completed for wave $wave_number"
            return 0
        fi
    fi

    log_warning "Orphan cleanup encountered errors (non-fatal)"
    return 0
}

# Mode A: Wave Execution Operations

spawn_wave() {
    local task_id="$1"
    local wave_number="$2"
    local plan_file="$3"

    if [[ -z "$task_id" ]] || [[ -z "$wave_number" ]] || [[ -z "$plan_file" ]]; then
        log_error "spawn_wave requires: task_id, wave_number, plan_file"
        return 1
    fi

    if [[ ! -f "$plan_file" ]]; then
        log_error "Batching plan not found: $plan_file"
        return 1
    fi

    log "Spawning wave $wave_number for task: $task_id"

    # Validate plan has expected wave
    if ! jq -e ".waves[$((wave_number - 1))]" "$plan_file" > /dev/null 2>&1; then
        log_error "Wave $wave_number not found in plan"
        return 1
    fi

    # Call wave-execution skill
    if [[ ! -x "$WAVE_SPAWN_SCRIPT" ]]; then
        log_error "Wave spawn script not found or not executable: $WAVE_SPAWN_SCRIPT"
        return 1
    fi

    # Spawn containers for this wave
    local output_file="/tmp/cfn-wave-${task_id}-${wave_number}-spawned.json"
    if "$WAVE_SPAWN_SCRIPT" \
        --wave-plan "$plan_file" \
        --wave-number "$wave_number" \
        --base-image "claude-flow-novice:latest" \
        --workspace "$PROJECT_ROOT" \
        --network "${NETWORK:-mcp-network}" \
        --output "$output_file"; then

        log_success "Wave $wave_number spawned successfully"

        # Output spawned container IDs for tracking
        if [[ -f "$output_file" ]]; then
            cat "$output_file"
        fi
        return 0
    else
        log_error "Failed to spawn wave $wave_number"
        return 1
    fi
}

monitor_wave() {
    local task_id="$1"
    local wave_number="$2"
    local expected_count="$3"

    if [[ -z "$task_id" ]] || [[ -z "$wave_number" ]]; then
        log_error "monitor_wave requires: task_id, wave_number"
        return 1
    fi

    log "Monitoring wave $wave_number for task: $task_id"
    log "Expected container count: ${expected_count:-N/A}"

    # Use wave execution skill monitoring
    local timeout="${TIMEOUT:-600}"
    local monitor_script="$WAVE_EXECUTION_SKILL/monitor-wave.sh"

    if [[ ! -x "$monitor_script" ]]; then
        log_error "Wave monitor script not found: $monitor_script"
        return 1
    fi

    # Monitor containers until completion or timeout
    if "$monitor_script" \
        --task-id "$task_id" \
        --wave-number "$wave_number" \
        --expected-count "${expected_count:-0}" \
        --timeout "$timeout"; then

        log_success "Wave $wave_number completed successfully"
        return 0
    else
        local exit_code=$?
        if [[ $exit_code -eq 2 ]]; then
            log_error "Wave $wave_number monitoring timeout"
        else
            log_error "Wave $wave_number failed"
        fi
        return $exit_code
    fi
}

cleanup_wave() {
    local task_id="$1"
    local wave_number="$2"

    if [[ -z "$task_id" ]] || [[ -z "$wave_number" ]]; then
        log_error "cleanup_wave requires: task_id, wave_number"
        return 1
    fi

    log "Cleaning up wave $wave_number for task: $task_id"

    # Use wave execution skill cleanup
    local cleanup_script="$WAVE_EXECUTION_SKILL/cleanup-wave.sh"

    if [[ ! -x "$cleanup_script" ]]; then
        log_error "Wave cleanup script not found: $cleanup_script"
        return 1
    fi

    # Remove containers and artifacts
    if "$cleanup_script" \
        --task-id "$task_id" \
        --wave-number "$wave_number"; then

        log_success "Wave $wave_number cleaned up successfully"
        return 0
    else
        log_warning "Wave $wave_number cleanup had errors (partial cleanup)"
        return 1
    fi
}

validate_errors() {
    local task_id="$1"
    local command="$2"

    if [[ -z "$task_id" ]] || [[ -z "$command" ]]; then
        log_error "validate_errors requires: task_id, command"
        return 1
    fi

    log "Running error validation for task: $task_id"
    log "Command: $command"

    # Create temporary output file for results
    local output_file="/tmp/cfn-validate-errors-${task_id}.log"

    # Execute validation command and capture output
    if eval "$command" > "$output_file" 2>&1; then
        local error_count=0
    else
        # Command failed, count errors from output
        local error_count=$(grep -i "error" "$output_file" 2>/dev/null | wc -l)
    fi

    log_success "Error validation complete"
    log "Error count: $error_count"

    # Return JSON results
    cat << EOF
{
  "task_id": "$task_id",
  "command": "$command",
  "error_count": $error_count,
  "output_file": "$output_file",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

    return 0
}

execute_waves() {
    local task_id="$1"
    local plan_file="$2"

    if [[ -z "$task_id" ]] || [[ -z "$plan_file" ]]; then
        log_error "execute_waves requires: task_id, plan_file"
        return 1
    fi

    if [[ ! -f "$plan_file" ]]; then
        log_error "Batching plan not found: $plan_file"
        return 1
    fi

    log "Starting complete wave-based execution for task: $task_id"
    log "Plan file: $plan_file"

    # Parse wave count from plan
    local wave_count
    wave_count=$(jq '.waves | length' "$plan_file" 2>/dev/null)

    if [[ -z "$wave_count" ]] || [[ "$wave_count" -lt 1 ]]; then
        log_error "Invalid plan: no waves found"
        return 1
    fi

    log "Total waves to execute: $wave_count"

    # Validate memory budget before starting
    if ! validate_memory_budget "$plan_file"; then
        log_error "Memory budget validation failed - aborting execution"
        return 1
    fi

    # Check for checkpoint recovery
    if check_checkpoint_recovery "$task_id"; then
        log_warning "Found existing checkpoint for task: $task_id"
        if resume_from_checkpoint "$task_id"; then
            log_success "Resumed execution from checkpoint"
            # Continue monitoring remaining waves
        else
            log_warning "Checkpoint resume failed, starting fresh execution"
        fi
    fi

    # Track results
    local results_file="/tmp/cfn-wave-results-${task_id}.json"
    echo '{"waves": [], "summary": {"total": 0, "succeeded": 0, "failed": 0}}' > "$results_file"

    # Execute each wave sequentially
    for wave_num in $(seq 1 "$wave_count"); do
        log_loop "=== Wave $wave_num/$wave_count ==="

        # Get batch count for this wave
        local batch_count
        batch_count=$(jq ".waves[$((wave_num - 1))].batch_count // 0" "$plan_file" 2>/dev/null)

        # Spawn wave
        if ! spawn_wave "$task_id" "$wave_num" "$plan_file"; then
            log_error "Failed to spawn wave $wave_num"
            # Attempt orphan cleanup before exiting
            cleanup_orphaned_containers "$task_id" "$wave_num"
            return 1
        fi

        # Get container IDs from spawn output for checkpoint
        local container_ids
        container_ids=$(docker ps -a --filter "label=cfn.task=$task_id" --filter "label=cfn.wave=$wave_num" --format "{{.ID}}" 2>/dev/null | tr '\n' ',' | sed 's/,$//')

        # Validate container IDs before saving checkpoint
        if [[ -z "$container_ids" ]]; then
            log_error "No containers found for wave $wave_num - checkpoint not saved"
            cleanup_orphaned_containers "$task_id" "$wave_num"
            return 1
        fi

        # Save checkpoint after successful spawn
        save_wave_checkpoint "$task_id" "$wave_num" "$container_ids" "$batch_count"

        # Monitor wave completion
        if ! monitor_wave "$task_id" "$wave_num" "$batch_count"; then
            log_error "Wave $wave_num failed or timed out"
            # Attempt orphan cleanup before exiting
            cleanup_orphaned_containers "$task_id" "$wave_num"
            return 1
        fi

        # Update results
        jq --arg wn "$wave_num" --arg status "completed" '.waves += [{wave_number: ($wn | tonumber), status: $status}]' "$results_file" > "${results_file}.tmp" && \
            mv "${results_file}.tmp" "$results_file"

        log_success "Wave $wave_num completed"
    done

    # Final cleanup and validation
    log "Finalizing wave execution..."

    for wave_num in $(seq 1 "$wave_count"); do
        # Don't cleanup yet - logs may be needed
        log "Preparing to cleanup wave $wave_num (logs preserved)"
    done

    # Output final results
    log_success "Wave execution completed for task: $task_id"
    cat "$results_file"

    return 0
}

execute() {
    local task_id="$1"
    local task_description="$2"

    log "Starting complete CFN Loop execution for task: $task_id"
    log "Description: $task_description"
    log "Mode: $MODE"

    # Analyze task and select agents if not specified (includes planning phase)
    if [[ -z "$AGENTS" ]]; then
        AGENTS=$(analyze_task "$task_description" "$task_id")
    fi

    # Initialize orchestration
    init "$task_id" "$CONTEXT_FILE"

    # Main loop execution
    local iteration=1
    while [[ $iteration -le $MAX_ITERATIONS ]]; do
        log_loop "=== Iteration $iteration/$MAX_ITERATIONS ==="

        # Spawn Loop 3 implementers
        spawn_loop3 "$task_id" "$AGENTS" "$iteration"

        # Gate check
        gate_check "$task_id" "$GATE_THRESHOLD" "$iteration" "$MAX_ITERATIONS"
        gate_result=$?
        case $gate_result in
            0) # Gate passed
                log_loop "Gate PASSED - proceeding to Loop 2"
                break
                ;;
            1) # Gate failed, max iterations reached
                log_error "Gate FAILED - max iterations reached"
                return 1
                ;;
            2) # Gate failed, iterate
                ((iteration++))
                continue
                ;;
            *)
                log_error "Invalid gate result: $gate_result"
                return 1
                ;;
        esac
    done

    # Spawn Loop 2 validators
    spawn_loop2 "$task_id" "Loop 3 implementation completed"

    # Collect consensus
    if collect_consensus "$task_id" "$CONSENSUS_THRESHOLD"; then
        # Trigger Product Owner decision
        trigger_po_decision "$task_id" "Consensus achieved"
        log_success "CFN Loop execution completed successfully"
    else
        log_error "CFN Loop execution failed at consensus stage"
        return 1
    fi
}

# Main operation dispatcher
case "$OPERATION" in
    execute)
        execute "$TASK_ID" "$TASK_DESCRIPTION"
        ;;
    init)
        init "$TASK_ID" "$CONTEXT_FILE"
        ;;
    analyze-task)
        analyze_task "$TASK_DESCRIPTION"
        ;;
    spawn-loop3)
        spawn_loop3 "$TASK_ID" "$AGENTS" "${FORCE_ITERATION:-1}"
        ;;
    monitor-loop3)
        monitor_loop3 "$TASK_ID" "$GATE_THRESHOLD" "${FORCE_ITERATION:-1}"
        ;;
    gate-check)
        gate_check "$TASK_ID" "$GATE_THRESHOLD" "${FORCE_ITERATION:-1}" "$MAX_ITERATIONS"
        ;;
    spawn-loop2)
        spawn_loop2 "$TASK_ID" ""
        ;;
    collect-consensus)
        collect_consensus "$TASK_ID" "$CONSENSUS_THRESHOLD"
        ;;
    trigger-po-decision)
        trigger_po_decision "$TASK_ID" ""
        ;;
    execute-waves)
        execute_waves "$TASK_ID" "$BATCHING_PLAN"
        ;;
    spawn-wave)
        spawn_wave "$TASK_ID" "$WAVE_NUMBER" "$BATCHING_PLAN"
        ;;
    monitor-wave)
        monitor_wave "$TASK_ID" "$WAVE_NUMBER" "$EXPECTED_COUNT"
        ;;
    cleanup-wave)
        cleanup_wave "$TASK_ID" "$WAVE_NUMBER"
        ;;
    validate-errors)
        validate_errors "$TASK_ID" "$VALIDATION_COMMAND"
        ;;
    *)
        log_error "Unknown operation: $OPERATION"
        usage
        exit 1
        ;;
esac