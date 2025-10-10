#!/bin/bash
# Advanced CLI Agent Coordination - Implementation Examples
# Companion to CLI_COORDINATION_RESEARCH.md
# Date: 2025-10-02

set -euo pipefail

# ============================================================================
# 1. COMPLETE AGENT POOL IMPLEMENTATION
# ============================================================================

agent_pool_demo() {
  echo "=== Agent Pool with Work Stealing ==="

  local POOL_SIZE=4
  local WORK_DIR="/tmp/agent_pool"
  mkdir -p "$WORK_DIR"/{pending,processing,completed}

  # Initialize worker pool
  for i in $(seq 1 $POOL_SIZE); do
    (
      worker_id="worker_$i"
      echo "[$worker_id] Started"

      while true; do
        # Atomic task claim using rename
        for task_file in "$WORK_DIR/pending"/*.task 2>/dev/null; do
          claimed="$WORK_DIR/processing/$(basename "$task_file").${worker_id}"

          if mv "$task_file" "$claimed" 2>/dev/null; then
            echo "[$worker_id] Processing: $(basename "$task_file")"

            # Simulate work
            task_data=$(cat "$claimed")
            sleep $((RANDOM % 3 + 1))
            result="Result: $task_data (processed by $worker_id)"

            # Mark complete
            completed="$WORK_DIR/completed/$(basename "$task_file")"
            echo "$result" > "$completed"
            rm "$claimed"

            echo "[$worker_id] Completed: $(basename "$task_file")"
            break
          fi
        done

        sleep 0.5
      done
    ) &
  done

  # Submit tasks
  for i in {1..10}; do
    echo "Task $i data" > "$WORK_DIR/pending/task_${i}.task"
  done

  # Wait for completion
  while [[ $(ls "$WORK_DIR/pending" 2>/dev/null | wc -l) -gt 0 ]] || \
        [[ $(ls "$WORK_DIR/processing" 2>/dev/null | wc -l) -gt 0 ]]; do
    echo "Waiting... Pending: $(ls "$WORK_DIR/pending" 2>/dev/null | wc -l), Processing: $(ls "$WORK_DIR/processing" 2>/dev/null | wc -l)"
    sleep 1
  done

  echo "All tasks completed!"
  ls -l "$WORK_DIR/completed"

  # Cleanup
  pkill -P $$
  rm -rf "$WORK_DIR"
}

# ============================================================================
# 2. EVENT-DRIVEN COORDINATOR WITH PUB/SUB
# ============================================================================

event_bus_demo() {
  echo "=== Event-Driven Pub/Sub System ==="

  local EVENT_DIR="/tmp/event_bus"
  mkdir -p "$EVENT_DIR/topics"

  # Event publisher
  publish_event() {
    local topic="$1"
    local event_data="$2"
    local timestamp=$(date +%s%N)

    # Atomic event log
    local event_record="${timestamp}|${topic}|${event_data}"
    (
      flock -x 200
      echo "$event_record" >> "$EVENT_DIR/event_log.txt"
    ) 200>"$EVENT_DIR/event_log.lock"

    # Notify subscribers via topic pipe
    local topic_pipe="$EVENT_DIR/topics/$topic"
    [[ -p "$topic_pipe" ]] || mkfifo "$topic_pipe"
    echo "$event_record" > "$topic_pipe" &
  }

  # Subscriber
  subscribe_to_topic() {
    local topic="$1"
    local handler="$2"
    local topic_pipe="$EVENT_DIR/topics/$topic"

    [[ -p "$topic_pipe" ]] || mkfifo "$topic_pipe"

    (
      while read -r event_record < "$topic_pipe"; do
        IFS='|' read -r timestamp topic_name event_data <<< "$event_record"
        echo "[Subscriber] Received $topic_name: $event_data"
        $handler "$event_data"
      done
    ) &
  }

  # Example handlers
  handle_task_created() {
    echo "  → Handler: Task created - $1"
  }

  handle_task_completed() {
    echo "  → Handler: Task completed - $1"
  }

  # Subscribe to topics
  subscribe_to_topic "task.created" handle_task_created
  subscribe_to_topic "task.completed" handle_task_completed

  # Publish events
  sleep 0.5  # Let subscribers initialize
  publish_event "task.created" "Task A"
  publish_event "task.created" "Task B"
  sleep 1
  publish_event "task.completed" "Task A"

  sleep 2

  # Cleanup
  pkill -P $$
  rm -rf "$EVENT_DIR"
}

# ============================================================================
# 3. STATE MACHINE WORKFLOW COORDINATOR
# ============================================================================

state_machine_demo() {
  echo "=== State Machine Workflow ==="

  local STATE_DIR="/tmp/state_machine"
  mkdir -p "$STATE_DIR/states"

  # Define state transitions
  declare -A TRANSITIONS=(
    ["init:start"]="designing"
    ["designing:approve"]="implementing"
    ["designing:reject"]="init"
    ["implementing:complete"]="testing"
    ["implementing:fail"]="designing"
    ["testing:pass"]="deploying"
    ["testing:fail"]="implementing"
    ["deploying:success"]="completed"
    ["deploying:fail"]="implementing"
  )

  # State transition function
  transition_state() {
    local workflow_id="$1"
    local event="$2"
    local state_file="$STATE_DIR/states/${workflow_id}.state"

    local current_state=$(cat "$state_file" 2>/dev/null || echo "init")
    local transition_key="${current_state}:${event}"

    if [[ -n "${TRANSITIONS[$transition_key]}" ]]; then
      local new_state="${TRANSITIONS[$transition_key]}"
      echo "$new_state" > "$state_file"
      echo "[$workflow_id] $current_state → $new_state (on $event)"

      # Trigger state entry actions
      on_enter_state "$workflow_id" "$new_state"
      return 0
    else
      echo "[$workflow_id] Invalid transition: $current_state → $event" >&2
      return 1
    fi
  }

  # State entry actions
  on_enter_state() {
    local workflow_id="$1"
    local state="$2"

    case "$state" in
      designing)
        echo "  → Action: Assign to architect"
        ;;
      implementing)
        echo "  → Action: Assign to coder"
        ;;
      testing)
        echo "  → Action: Run test suite"
        ;;
      deploying)
        echo "  → Action: Deploy to production"
        ;;
      completed)
        echo "  → Action: Notify stakeholders"
        ;;
    esac
  }

  # Simulate workflow
  transition_state "WF-001" "start"
  transition_state "WF-001" "approve"
  transition_state "WF-001" "complete"
  transition_state "WF-001" "pass"
  transition_state "WF-001" "success"

  # Show final state
  echo "Final state: $(cat "$STATE_DIR/states/WF-001.state")"

  # Cleanup
  rm -rf "$STATE_DIR"
}

# ============================================================================
# 4. LEADER ELECTION WITH FLOCK
# ============================================================================

leader_election_demo() {
  echo "=== Distributed Leader Election ==="

  local LOCK_FILE="/tmp/leader.lock"
  local LEADER_PID_FILE="/tmp/leader.pid"

  # Leader election function
  become_leader() {
    local instance_id="$1"

    exec 200>"$LOCK_FILE"
    if flock -n -x 200; then
      echo "[$instance_id] I am the LEADER"
      echo $$ > "$LEADER_PID_FILE"

      # Register cleanup
      trap 'echo "[$instance_id] Leader stepping down"; flock -u 200; rm -f "$LEADER_PID_FILE"' EXIT

      # Leader duties
      for i in {1..5}; do
        echo "[$instance_id] Leading (iteration $i)"
        sleep 1
      done
    else
      echo "[$instance_id] I am a follower"

      # Wait for leader to exit
      while [[ -f "$LEADER_PID_FILE" ]]; do
        echo "[$instance_id] Following leader (PID: $(cat "$LEADER_PID_FILE" 2>/dev/null))"
        sleep 1
      done

      echo "[$instance_id] Leader gone, attempting to become leader"
      become_leader "$instance_id"  # Recursive attempt
    fi
  }

  # Spawn multiple instances
  for i in {1..3}; do
    (become_leader "Instance-$i") &
    sleep 0.2
  done

  wait

  # Cleanup
  rm -f "$LOCK_FILE" "$LEADER_PID_FILE"
}

# ============================================================================
# 5. LOCK-FREE QUEUE WITH TIMESTAMPS
# ============================================================================

lockfree_queue_demo() {
  echo "=== Lock-Free Queue Implementation ==="

  local QUEUE_DIR="/tmp/lockfree_queue"
  mkdir -p "$QUEUE_DIR"

  # Enqueue (lock-free using atomic mkdir)
  enqueue() {
    local item="$1"
    local seq=$(date +%s%N)  # Nanosecond timestamp for ordering
    local item_file="$QUEUE_DIR/${seq}.item"

    echo "$item" > "$item_file"
    echo "Enqueued: $item (seq: $seq)"
  }

  # Dequeue (atomic claim via rename)
  dequeue() {
    # Get oldest item
    local oldest=$(ls "$QUEUE_DIR"/*.item 2>/dev/null | sort -n | head -n 1)

    if [[ -n "$oldest" ]]; then
      local claimed="${oldest}.claimed.$$"

      if mv "$oldest" "$claimed" 2>/dev/null; then
        local item=$(cat "$claimed")
        rm "$claimed"
        echo "$item"
        return 0
      fi
    fi

    return 1
  }

  # Producer
  (
    for i in {1..10}; do
      enqueue "Task-$i"
      sleep 0.1
    done
  ) &

  # Consumers
  for c in {1..3}; do
    (
      consumer_id="Consumer-$c"
      while true; do
        if item=$(dequeue); then
          echo "[$consumer_id] Processing: $item"
          sleep $((RANDOM % 2 + 1))
        else
          # Check if producer is done
          if ! jobs -r | grep -q "Producer"; then
            break
          fi
          sleep 0.2
        fi
      done
      echo "[$consumer_id] Finished"
    ) &
  done

  wait

  # Cleanup
  rm -rf "$QUEUE_DIR"
}

# ============================================================================
# 6. INCREMENTAL CONTEXT PASSING WITH DELTAS
# ============================================================================

incremental_context_demo() {
  echo "=== Incremental Context Transfer ==="

  local CONTEXT_DIR="/tmp/context"
  mkdir -p "$CONTEXT_DIR"

  # Initial context
  cat > "$CONTEXT_DIR/context_v1.json" <<'EOF'
{
  "project": "agent-coordination",
  "agents": ["coder", "tester"],
  "status": "running"
}
EOF

  # Updated context
  cat > "$CONTEXT_DIR/context_v2.json" <<'EOF'
{
  "project": "agent-coordination",
  "agents": ["coder", "tester", "reviewer"],
  "status": "running",
  "progress": 75
}
EOF

  # Generate delta
  diff -u "$CONTEXT_DIR/context_v1.json" "$CONTEXT_DIR/context_v2.json" > "$CONTEXT_DIR/delta.patch" || true

  echo "=== Delta Patch ==="
  cat "$CONTEXT_DIR/delta.patch"

  # Apply delta
  cp "$CONTEXT_DIR/context_v1.json" "$CONTEXT_DIR/context_reconstructed.json"
  patch -p0 "$CONTEXT_DIR/context_reconstructed.json" < "$CONTEXT_DIR/delta.patch"

  echo -e "\n=== Reconstructed Context ==="
  cat "$CONTEXT_DIR/context_reconstructed.json"

  # Calculate size savings
  original_size=$(wc -c < "$CONTEXT_DIR/context_v2.json")
  delta_size=$(wc -c < "$CONTEXT_DIR/delta.patch")
  savings=$((100 - (delta_size * 100 / original_size)))

  echo -e "\n=== Compression Stats ==="
  echo "Original: $original_size bytes"
  echo "Delta: $delta_size bytes"
  echo "Savings: $savings%"

  # Cleanup
  rm -rf "$CONTEXT_DIR"
}

# ============================================================================
# 7. PROCESS POOL WITH RESOURCE LIMITS (cgroups)
# ============================================================================

cgroup_pool_demo() {
  echo "=== Process Pool with cgroup Resource Limits ==="

  # Check if cgroups v2 is available
  if [[ ! -d /sys/fs/cgroup/cgroup.controllers ]]; then
    echo "cgroups v2 not available, skipping demo (requires root and modern kernel)"
    return
  fi

  echo "Note: This demo requires root privileges to manipulate cgroups"
  echo "Showing configuration only (not executing)..."

  cat <<'CGROUP_SCRIPT'
#!/bin/bash
# Run with sudo

CGROUP_NAME="agent_pool"
CGROUP_PATH="/sys/fs/cgroup/$CGROUP_NAME"

# Create cgroup
mkdir -p "$CGROUP_PATH"

# Set CPU limit (50% of one core)
echo "50000" > "$CGROUP_PATH/cpu.max"  # 50ms per 100ms

# Set memory limit (512MB)
echo "536870912" > "$CGROUP_PATH/memory.max"

# Launch agents in cgroup
for i in {1..4}; do
  echo "Spawning agent $i in cgroup"
  agent_worker &
  echo $! > "$CGROUP_PATH/cgroup.procs"
done

# Monitor resource usage
watch -n 1 'cat /sys/fs/cgroup/agent_pool/cpu.stat /sys/fs/cgroup/agent_pool/memory.current'
CGROUP_SCRIPT

  echo "Script saved conceptually (requires root to execute)"
}

# ============================================================================
# 8. INOTIFY-BASED REACTIVE COORDINATOR
# ============================================================================

inotify_coordinator_demo() {
  echo "=== Inotify-Based Reactive Coordinator ==="

  local TASK_DIR="/tmp/reactive_tasks"
  mkdir -p "$TASK_DIR"/{incoming,processing,completed}

  # Check if inotifywait is available
  if ! command -v inotifywait &> /dev/null; then
    echo "inotifywait not available, using polling fallback"

    # Polling fallback
    (
      while true; do
        for task in "$TASK_DIR/incoming"/*.task 2>/dev/null; do
          if [[ -f "$task" ]]; then
            filename=$(basename "$task")
            echo "Processing: $filename"

            mv "$task" "$TASK_DIR/processing/$filename"
            sleep 1  # Simulate work
            mv "$TASK_DIR/processing/$filename" "$TASK_DIR/completed/$filename"

            echo "Completed: $filename"
          fi
        done
        sleep 0.5
      done
    ) &
    WATCHER_PID=$!

  else
    # Inotify-based (efficient)
    inotifywait -m -e create "$TASK_DIR/incoming" | while read path action file; do
      if [[ "$file" =~ \.task$ ]]; then
        echo "Event: $action on $file"

        # Move to processing
        if mv "$TASK_DIR/incoming/$file" "$TASK_DIR/processing/$file" 2>/dev/null; then
          # Simulate work
          sleep 1
          mv "$TASK_DIR/processing/$file" "$TASK_DIR/completed/$file"
          echo "Completed: $file"
        fi
      fi
    done &
    WATCHER_PID=$!
  fi

  # Submit tasks
  sleep 0.5
  for i in {1..5}; do
    echo "Task $i data" > "$TASK_DIR/incoming/task_${i}.task"
    sleep 0.5
  done

  sleep 3

  # Cleanup
  kill $WATCHER_PID 2>/dev/null || true
  rm -rf "$TASK_DIR"
}

# ============================================================================
# 9. UNIX DOMAIN SOCKET BIDIRECTIONAL COMMUNICATION
# ============================================================================

unix_socket_demo() {
  echo "=== UNIX Domain Socket Bidirectional Communication ==="

  local SOCKET_PATH="/tmp/agent_socket.sock"

  # Check for required tools
  if ! command -v nc &> /dev/null; then
    echo "netcat (nc) not available, skipping demo"
    return
  fi

  # Server
  (
    while true; do
      nc -lU "$SOCKET_PATH" | while read -r request; do
        echo "Server received: $request"
        response="Response to: $request"
        echo "$response"
      done
    done
  ) &
  SERVER_PID=$!

  sleep 0.5

  # Clients
  for i in {1..3}; do
    (
      response=$(echo "Client $i request" | nc -U "$SOCKET_PATH")
      echo "Client $i received: $response"
    ) &
  done

  wait

  # Cleanup
  kill $SERVER_PID 2>/dev/null || true
  rm -f "$SOCKET_PATH"
}

# ============================================================================
# 10. SIGNAL-BASED BARRIER SYNCHRONIZATION
# ============================================================================

signal_barrier_demo() {
  echo "=== Signal-Based Barrier Synchronization ==="

  local BARRIER_DIR="/tmp/barrier"
  mkdir -p "$BARRIER_DIR"
  local BARRIER_COUNT=0
  local TOTAL_AGENTS=5

  # Barrier coordinator
  barrier_coordinator() {
    local barrier_file="$BARRIER_DIR/barrier_count"
    echo "0" > "$barrier_file"

    # Wait for all agents to signal
    while [[ $(cat "$barrier_file") -lt $TOTAL_AGENTS ]]; do
      sleep 0.1
    done

    echo "Barrier reached! Broadcasting continue signal..."

    # Signal all agents to continue
    for pid_file in "$BARRIER_DIR"/agent_*.pid; do
      if [[ -f "$pid_file" ]]; then
        local pid=$(cat "$pid_file")
        kill -USR1 "$pid" 2>/dev/null || true
      fi
    done
  }

  # Agent process
  agent_process() {
    local agent_id="$1"

    # Register PID
    echo $$ > "$BARRIER_DIR/agent_${agent_id}.pid"

    # Setup signal handler
    trap 'echo "[Agent $agent_id] Barrier released, continuing..."' USR1

    echo "[Agent $agent_id] Working on phase 1..."
    sleep $((RANDOM % 2 + 1))

    # Signal arrival at barrier
    echo "[Agent $agent_id] Reached barrier, waiting..."
    (
      flock -x 200
      count=$(cat "$BARRIER_DIR/barrier_count")
      echo $((count + 1)) > "$BARRIER_DIR/barrier_count"
    ) 200>"$BARRIER_DIR/barrier.lock"

    # Wait for barrier release signal
    sleep 10 &  # Wait up to 10 seconds
    wait $!

    echo "[Agent $agent_id] Phase 2 complete"

    # Cleanup
    rm -f "$BARRIER_DIR/agent_${agent_id}.pid"
  }

  # Spawn coordinator
  barrier_coordinator &
  COORD_PID=$!

  # Spawn agents
  for i in $(seq 1 $TOTAL_AGENTS); do
    agent_process "$i" &
  done

  wait

  # Cleanup
  rm -rf "$BARRIER_DIR"
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

main() {
  echo "========================================="
  echo "Advanced CLI Agent Coordination Examples"
  echo "========================================="
  echo

  local demos=(
    "agent_pool_demo"
    "event_bus_demo"
    "state_machine_demo"
    "leader_election_demo"
    "lockfree_queue_demo"
    "incremental_context_demo"
    "cgroup_pool_demo"
    "inotify_coordinator_demo"
    "unix_socket_demo"
    "signal_barrier_demo"
  )

  # Run all demos or specific one
  if [[ $# -gt 0 ]]; then
    for demo in "$@"; do
      if declare -F "$demo" > /dev/null; then
        echo
        "$demo"
        echo
      else
        echo "Unknown demo: $demo"
      fi
    done
  else
    for demo in "${demos[@]}"; do
      echo
      "$demo"
      echo
      sleep 1
    done
  fi

  echo "========================================="
  echo "All demos completed!"
  echo "========================================="
}

# Run main with all arguments
main "$@"
