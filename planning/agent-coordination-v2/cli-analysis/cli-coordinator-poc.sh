#!/bin/bash
# CLI-Based Agent Coordinator - Proof of Concept
# Demonstrates advanced coordination WITHOUT SDK/API access
# Techniques: Named pipes, signals, shared memory, checkpoints

set -euo pipefail

# Configuration
SESSION_ID="${1:-demo-$(date +%s)}"
STATE_DIR="/dev/shm/cfn/${SESSION_ID}"
MAX_AGENTS=5
CHECKPOINT_INTERVAL=10  # seconds

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() { echo -e "${GREEN}[COORD]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }
info() { echo -e "${BLUE}[INFO]${NC} $*"; }

# ============================================================================
# 1. INITIALIZATION
# ============================================================================

init_coordinator() {
    log "Initializing coordinator for session: $SESSION_ID"

    # Create state directory in shared memory (tmpfs)
    mkdir -p "$STATE_DIR"/{control,checkpoints,messages,metrics}

    # Create global control files
    echo "$$" > "$STATE_DIR/coordinator.pid"
    echo '{"status": "initializing", "agents": []}' > "$STATE_DIR/state.json"

    # Setup signal handlers
    trap 'handle_sigterm' SIGTERM SIGINT
    trap 'handle_sigusr1' SIGUSR1
    trap 'handle_sigusr2' SIGUSR2

    log "Coordinator ready (PID: $$)"
}

# ============================================================================
# 2. AGENT POOLING - Eliminates spawn overhead
# ============================================================================

create_agent_pool() {
    local pool_size=$1
    log "Creating agent pool with $pool_size pre-warmed agents"

    for i in $(seq 1 "$pool_size"); do
        spawn_pooled_agent "$i" &
    done

    wait_for_pool_ready "$pool_size"
}

spawn_pooled_agent() {
    local agent_id=$1
    local agent_pid=$$
    local input_pipe="$STATE_DIR/control/agent_${agent_id}_input.pipe"
    local output_pipe="$STATE_DIR/control/agent_${agent_id}_output.pipe"

    # Create communication pipes
    mkfifo "$input_pipe" 2>/dev/null || true
    mkfifo "$output_pipe" 2>/dev/null || true

    # Agent metadata
    echo "{\"id\": $agent_id, \"pid\": $agent_pid, \"status\": \"idle\", \"tasks\": 0}" \
        > "$STATE_DIR/agents/agent_${agent_id}.json"

    info "Agent $agent_id spawned (PID: $agent_pid) - waiting for tasks..."

    # Agent event loop - waits for commands
    while true; do
        if read -r cmd < "$input_pipe"; then
            case "$cmd" in
                TASK:*)
                    task="${cmd#TASK:}"
                    execute_task "$agent_id" "$task" "$output_pipe"
                    ;;
                CHECKPOINT)
                    create_checkpoint "$agent_id"
                    echo "CHECKPOINT_CREATED" > "$output_pipe"
                    ;;
                PAUSE)
                    # Cooperative pause - enter wait state
                    echo "PAUSED" > "$output_pipe"
                    read -r resume_cmd < "$input_pipe"
                    if [[ "$resume_cmd" == "RESUME" ]]; then
                        echo "RESUMED" > "$output_pipe"
                    fi
                    ;;
                SHUTDOWN)
                    echo "SHUTDOWN_ACK" > "$output_pipe"
                    break
                    ;;
            esac
        fi
    done
}

execute_task() {
    local agent_id=$1
    local task=$2
    local output_pipe=$3

    info "Agent $agent_id executing: $task"

    # Simulate task execution with incremental checkpoints
    local checkpoint_file="$STATE_DIR/checkpoints/agent_${agent_id}_latest.json"

    echo "{
        \"agent_id\": $agent_id,
        \"task\": \"$task\",
        \"status\": \"running\",
        \"progress\": 0,
        \"timestamp\": $(date +%s)
    }" > "$checkpoint_file"

    # Simulate progressive work with checkpoints
    for progress in 25 50 75 100; do
        sleep 1

        # Update checkpoint
        echo "{
            \"agent_id\": $agent_id,
            \"task\": \"$task\",
            \"status\": \"running\",
            \"progress\": $progress,
            \"timestamp\": $(date +%s)
        }" > "$checkpoint_file"

        info "Agent $agent_id: ${progress}% complete"
    done

    # Final result
    local result="COMPLETED:$task:agent_$agent_id"
    echo "$result" > "$output_pipe"

    # Update agent metrics
    local metrics_file="$STATE_DIR/metrics/agent_${agent_id}.json"
    local task_count=$(jq -r '.tasks // 0' "$metrics_file" 2>/dev/null || echo 0)
    echo "{\"tasks\": $((task_count + 1)), \"last_task\": \"$task\"}" > "$metrics_file"
}

# ============================================================================
# 3. NAMED PIPE COORDINATION - Real-time messaging
# ============================================================================

send_task_to_agent() {
    local agent_id=$1
    local task=$2
    local input_pipe="$STATE_DIR/control/agent_${agent_id}_input.pipe"

    log "Sending task to agent $agent_id: $task"
    echo "TASK:$task" > "$input_pipe"
}

wait_for_agent_result() {
    local agent_id=$1
    local output_pipe="$STATE_DIR/control/agent_${agent_id}_output.pipe"
    local timeout=30

    if timeout "$timeout" cat "$output_pipe"; then
        return 0
    else
        error "Agent $agent_id timed out after ${timeout}s"
        return 1
    fi
}

# ============================================================================
# 4. SIGNAL-BASED CONTROL - Instant communication
# ============================================================================

pause_agent_with_signal() {
    local agent_id=$1
    log "Pausing agent $agent_id via cooperative pause..."

    # Send cooperative pause command
    echo "PAUSE" > "$STATE_DIR/control/agent_${agent_id}_input.pipe"

    # Wait for acknowledgment
    local ack
    ack=$(cat "$STATE_DIR/control/agent_${agent_id}_output.pipe")
    if [[ "$ack" == "PAUSED" ]]; then
        log "Agent $agent_id paused successfully"
        return 0
    else
        error "Failed to pause agent $agent_id"
        return 1
    fi
}

resume_agent_with_instruction() {
    local agent_id=$1
    local new_instruction=$2

    log "Resuming agent $agent_id with new instruction: $new_instruction"

    # Resume agent
    echo "RESUME" > "$STATE_DIR/control/agent_${agent_id}_input.pipe"

    # Wait for resume acknowledgment
    local ack
    ack=$(cat "$STATE_DIR/control/agent_${agent_id}_output.pipe")

    if [[ "$ack" == "RESUMED" ]]; then
        # Inject new task
        send_task_to_agent "$agent_id" "$new_instruction"
        log "Agent $agent_id resumed with new task"
    fi
}

# ============================================================================
# 5. CHECKPOINT/RESTORE - State management
# ============================================================================

create_checkpoint() {
    local agent_id=$1
    local checkpoint_id="ckpt_$(date +%s)"
    local checkpoint_file="$STATE_DIR/checkpoints/agent_${agent_id}_${checkpoint_id}.json"

    # Request checkpoint from agent
    echo "CHECKPOINT" > "$STATE_DIR/control/agent_${agent_id}_input.pipe"

    # Wait for completion
    cat "$STATE_DIR/control/agent_${agent_id}_output.pipe" > /dev/null

    log "Checkpoint created for agent $agent_id: $checkpoint_id"
}

restore_from_checkpoint() {
    local agent_id=$1
    local checkpoint_file

    # Find latest checkpoint
    checkpoint_file=$(ls -t "$STATE_DIR/checkpoints/agent_${agent_id}_"*.json 2>/dev/null | head -1)

    if [[ -n "$checkpoint_file" ]]; then
        log "Restoring agent $agent_id from: $(basename "$checkpoint_file")"
        # Implementation would restore agent state
        cat "$checkpoint_file"
    else
        error "No checkpoint found for agent $agent_id"
        return 1
    fi
}

# ============================================================================
# 6. SIGNAL HANDLERS - Graceful shutdown
# ============================================================================

handle_sigterm() {
    log "Received SIGTERM - shutting down gracefully..."

    # Send shutdown to all agents
    for agent_file in "$STATE_DIR"/agents/agent_*.json; do
        [[ -f "$agent_file" ]] || continue
        agent_id=$(basename "$agent_file" | sed 's/agent_//;s/.json//')
        echo "SHUTDOWN" > "$STATE_DIR/control/agent_${agent_id}_input.pipe" || true
    done

    # Cleanup
    rm -rf "$STATE_DIR"
    exit 0
}

handle_sigusr1() {
    log "Received SIGUSR1 - triggering global checkpoint..."
    for agent_file in "$STATE_DIR"/agents/agent_*.json; do
        [[ -f "$agent_file" ]] || continue
        agent_id=$(basename "$agent_file" | sed 's/agent_//;s/.json//')
        create_checkpoint "$agent_id" &
    done
    wait
}

handle_sigusr2() {
    log "Received SIGUSR2 - printing status..."
    cat "$STATE_DIR/state.json" | jq '.'
}

# ============================================================================
# 7. DEMO ORCHESTRATION
# ============================================================================

run_demo() {
    log "Starting CLI Coordinator Demo"

    # Initialize
    init_coordinator
    mkdir -p "$STATE_DIR/agents"

    # Create agent pool (eliminates spawn overhead)
    create_agent_pool 3 &
    sleep 2  # Let agents initialize

    log "===== DEMO: Parallel Task Execution ====="
    send_task_to_agent 1 "Analyze codebase" &
    send_task_to_agent 2 "Run tests" &
    send_task_to_agent 3 "Generate docs" &

    # Collect results
    log "Waiting for results..."
    result1=$(wait_for_agent_result 1)
    result2=$(wait_for_agent_result 2)
    result3=$(wait_for_agent_result 3)

    log "Results:"
    echo "  Agent 1: $result1"
    echo "  Agent 2: $result2"
    echo "  Agent 3: $result3"

    log ""
    log "===== DEMO: Pause/Resume with Injection ====="

    # Send long-running task
    send_task_to_agent 1 "Long analysis task" &
    sleep 2  # Let it run a bit

    # Pause mid-execution
    pause_agent_with_signal 1

    # Inject new instruction
    resume_agent_with_instruction 1 "Quick security scan instead"

    # Get result
    result=$(wait_for_agent_result 1)
    log "Final result after injection: $result"

    log ""
    log "===== DEMO: Checkpointing ====="

    # Trigger checkpoint via signal
    kill -SIGUSR1 $$
    sleep 1

    log "Checkpoint contents:"
    cat "$STATE_DIR/checkpoints/agent_1_latest.json" | jq '.'

    log ""
    log "Demo complete! State directory: $STATE_DIR"
    log "Try: kill -SIGUSR2 $$ to see status"
}

wait_for_pool_ready() {
    local expected=$1
    local timeout=10
    local elapsed=0

    while [[ $elapsed -lt $timeout ]]; do
        local ready_count
        ready_count=$(ls "$STATE_DIR/agents/" 2>/dev/null | wc -l)

        if [[ $ready_count -ge $expected ]]; then
            log "Agent pool ready ($ready_count/$expected agents)"
            return 0
        fi

        sleep 1
        ((elapsed++))
    done

    error "Timeout waiting for agent pool"
    return 1
}

# ============================================================================
# MAIN
# ============================================================================

main() {
    echo ""
    echo -e "${YELLOW}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}║     CLI-Based Agent Coordinator - Proof of Concept        ║${NC}"
    echo -e "${YELLOW}║  Demonstrates: Pooling, Signals, Pipes, Checkpoints       ║${NC}"
    echo -e "${YELLOW}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    if command -v jq >/dev/null 2>&1; then
        run_demo
    else
        error "This demo requires 'jq' for JSON processing"
        error "Install: sudo apt-get install jq"
        exit 1
    fi
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
