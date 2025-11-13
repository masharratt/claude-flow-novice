#!/bin/bash

# CFN Docker Loop Orchestration Implementation
# Usage: ./orchestrate.sh [OPERATION] [TASK_ID] [OPTIONS]

set -euo pipefail

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
    echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*"
}

log_loop() {
    echo -e "${PURPLE}[LOOP]${NC} $*"
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

Options:
  --task-description TEXT    Task description
  --mode MODE              Execution mode (mvp|standard|enterprise)
  --agents LIST            Comma-separated agent types
  --max-iterations NUM     Maximum iterations (default: 10)
  --gate-threshold NUM     Gate threshold (default: 0.75)
  --consensus-threshold NUM Consensus threshold (default: 0.90)
  --context-file PATH      Task context file
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

EOF
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

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$(dirname "$SCRIPT_DIR")/../.." && pwd)"

# Path to skills
REDIS_COORDINATION_SKILL="$PROJECT_ROOT/.claude/skills/cfn-docker-redis-coordination/coordinate.sh"
AGENT_SPAWNING_SKILL="$PROJECT_ROOT/.claude/skills/cfn-docker-agent-spawning/spawn-agent.sh"

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
MEMORY_LIMIT=""
NETWORK=""
ADAPTIVE_SELECTION=false
FORCE_ITERATION=""
DRY_RUN=false
VERBOSE=false

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
        cat > "$context_file" << EOF
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

        # Get task context from Redis if available
        if [[ -n "$CONTEXT_FILE" ]]; then
            # Merge with existing context
            local merged_context=$(jq -s '.[0] * .[1]' "$CONTEXT_FILE" "$context_file")
            echo "$merged_context" > "$context_file"
        fi

        if [[ "$DRY_RUN" == false ]]; then
            local agent_id
            agent_id=$("$AGENT_SPAWNING_SKILL" \
                "$agent_type" \
                "$task_id" \
                "" \
                --context-file "$context_file" \
                --memory-limit "${MEMORY_LIMIT:-1g}" \
                --network "${NETWORK:-mcp-network}" \
                --mcp-auto-select 2>&1 | grep -o 'Agent ID: [^[:space:]]*' | cut -d' ' -f3)

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
            fi
        else
            log "DRY RUN: Would spawn agent: $agent_type"
        fi
    done

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

    if monitor_loop3 "$task_id" "$gate_threshold" "$iteration"; then
        # Gate passed - proceed to Loop 2
        log_success "Gate PASSED - proceeding to Loop 2 validation"

        # Signal gate passed for Loop 2 agents
        "$REDIS_COORDINATION_SKILL" "$REDIS_CMD" LPUSH "cfn_docker:task:$task_id:gate-passed" "proceed" > /dev/null

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
                --context-file "$context_file" \
                --memory-limit "${MEMORY_LIMIT:-1g}" \
                --network "${NETWORK:-mcp-network}" \
                --mcp-auto-select 2>&1 | grep -o 'Agent ID: [^[:space:]]*' | cut -d' ' -f3)

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
            --context-file "$context_file" \
            --memory-limit "${MEMORY_LIMIT:-1g}" \
            --network "${NETWORK:-mcp-network}" 2>&1 | grep -o 'Agent ID: [^[:space:]]*' | cut -d' ' -f3)

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
        gate_result=$(gate_check "$task_id" "$GATE_THRESHOLD" "$iteration" "$MAX_ITERATIONS")
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
    *)
        log_error "Unknown operation: $OPERATION"
        usage
        exit 1
        ;;
esac