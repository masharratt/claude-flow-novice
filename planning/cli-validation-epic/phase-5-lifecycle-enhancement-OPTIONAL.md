# Phase 5: Agent Lifecycle Enhancement - OPTIONAL

**Phase ID**: 5
**Priority**: OPTIONAL - Evaluate After Phase 4 Stage 2
**Dependencies**: Phase 4 Stage 2 complete and stable
**Timeline**: 4-6 weeks (if pursued)
**Status**: DEFERRED - Evaluate based on Phase 4 metrics

## Phase Goal

**CRITICAL**: This phase is **ENTIRELY OPTIONAL** and should only be pursued if Phase 4 demonstrates measurable inefficiencies.

Add WAITING state to agent lifecycle to enable:
1. Instant task reassignment without spawning new agents
2. Active dependency resolution and help request handling
3. Improved resource utilization by keeping capable agents alive
4. Reduced idle time through dynamic workload redistribution

**Success Criteria**: ≥15% improvement in idle time, dependency resolution, or reassignment latency

**If Phase 5 skipped**: Phase 4 dynamic spawning model remains production system

---

## Decision Criteria - EVALUATE BEFORE PROCEEDING

**Decision Point**: End of Phase 4 Stage 2 (after 300-agent hybrid topology stable for 1 week)

### When to PROCEED to Phase 5

Run these measurements after Phase 4 Stage 2 stabilizes:

```bash
# Measure agent idle time percentage
idle_time_pct=$(calculate_idle_time_percentage)
# Target: >30% idle time indicates opportunity for WAITING state

# Count blocked agents waiting for dependencies
dependency_blocks=$(count_dependency_blocked_agents)
# Target: >10 blocked agents indicates dependency resolution value

# Measure task reassignment latency
reassignment_latency=$(measure_task_assignment_time_ms)
# Target: >2000ms indicates pooling would help

# DECISION LOGIC
if [ "$idle_time_pct" -gt 30 ] ||
   [ "$dependency_blocks" -gt 10 ] ||
   [ "$reassignment_latency" -gt 2000 ]; then
  echo "PROCEED to Phase 5 - WAITING state provides measurable benefit"
else
  echo "SKIP Phase 5 - Phase 4 dynamic spawning model sufficient"
fi
```

### When to SKIP Phase 5

**Skip if Phase 4 demonstrates:**
- ✅ Idle time <30% (agents efficiently utilized)
- ✅ Dependency blocks <10 agents (rare occurrence)
- ✅ Task assignment <2s (spawn time acceptable)
- ✅ Coordination time meeting targets (<10s for 500 agents)
- ✅ Resource utilization acceptable (memory, CPU, FD count)

**Rationale for skipping:**
- Phase 4's dynamic spawning model is simpler (3-state vs 4-state lifecycle)
- Fewer moving parts = easier debugging and maintenance
- Memory efficient (agents terminate when done)
- Proven scalable (708 agents validated in MVP)

---

## Phase 5 Overview

### Current State (Phase 1-4): Dynamic Spawning Model

**3-State Lifecycle**:
```
SPAWNED → WORKING → COMPLETE (terminate)
```

**Characteristics**:
- Agents spawn on-demand for pending tasks
- Execute assigned work while helping other agents (collaboration enabled)
- Terminate after task completion and result reporting
- New tasks require spawning new agents

**Limitations**:
- No agent reuse (spawn overhead for each task)
- No explicit dependency resolution (reactive help only)
- Idle agents between tasks not captured (spawn → work → terminate)

### Proposed State (Phase 5): Enhanced Lifecycle Model

**4-State Lifecycle**:
```
SPAWNED → WORKING → WAITING → COMPLETE (terminate)
           ↑           ↓
           └───────────┘
         (task reassignment)
```

**WAITING State Features**:
- Accept new task assignments instantly (no spawn overhead)
- Actively monitor help request queue
- Provide peer review for completed work
- Participate in dependency resolution matching

**Benefits** (if metrics justify):
- Instant reassignment (<100ms vs >2s spawn time)
- Active dependency resolution (not just reactive help)
- Reduced system churn (fewer spawn/terminate cycles)
- Better resource utilization (capable agents stay available)

---

## Deliverables

**If Phase 5 is pursued:**

1. **Bash state machine system** (`/dev/shm/cfn/agents/{id}/state`)
2. **Help request queue** (`/dev/shm/cfn/help-requests/`)
3. **Dependency graph tracker** (`/dev/shm/cfn/dependencies/`)
4. **Background help listener** for WAITING agents
5. **Task reassignment protocol** (WAITING → WORKING transition)
6. **Phase 5 vs Phase 4 benchmark comparison**
7. **Production deployment plan** (gradual rollout like Phase 4)
8. **Rollback procedures** to Phase 4 model if benefits insufficient

---

## Sprints

### Sprint 5.1: State Machine Implementation (2 weeks)

**Timeline**: 2 weeks
**Priority**: HIGH (if Phase 5 pursued)
**Estimated Agents**: 6 agents

**Deliverables**:
- Bash state tracking system using file-based storage
- State file format: `/dev/shm/cfn/agents/{agent_id}/state`
- State transition functions:
  - `transition_to_working()` - IDLE/WAITING → WORKING
  - `transition_to_waiting()` - WORKING → WAITING
  - `transition_to_complete()` - WORKING → COMPLETE
- State transition messaging (broadcast state changes to coordinator)
- State transition logging and metrics
- Integration with existing message-bus.sh

**Implementation Details**:

```bash
# State file format (/dev/shm/cfn/agents/{id}/state)
# Format: STATE|TIMESTAMP|TASK_ID|CAPABILITIES
WAITING|1696531200|task-123|backend-dev,rust-expert

# State transition function
transition_to_waiting() {
  local agent_id=$1
  local state_file="/dev/shm/cfn/agents/${agent_id}/state"
  local timestamp=$(date +%s)
  local capabilities=$(get_agent_capabilities "$agent_id")

  # Atomic write with flock
  (
    flock -x 200
    echo "WAITING|${timestamp}|${current_task_id}|${capabilities}" > "$state_file"
  ) 200>"${state_file}.lock"

  # Broadcast state change
  send_message "coordinator" "STATE_CHANGE|${agent_id}|WAITING"

  # Start help listener background process
  start_help_listener "$agent_id" &
}

# State query function
get_agent_state() {
  local agent_id=$1
  local state_file="/dev/shm/cfn/agents/${agent_id}/state"

  if [[ ! -f "$state_file" ]]; then
    echo "UNKNOWN"
    return 1
  fi

  cut -d'|' -f1 < "$state_file"
}
```

**Agent Team** (6 agents):
- backend-dev (2): Implement state machine in bash, state transition functions
- system-architect: Design state transition logic and validation
- tester: Test state transitions, edge cases, race conditions
- coder: Integration with existing message-bus.sh
- reviewer: Validate state machine correctness and performance

**Success Criteria**:
- ✅ All 4 states implemented (IDLE, WORKING, WAITING, COMPLETE)
- ✅ State transitions atomic and reliable (no race conditions)
- ✅ State file operations <100ms average
- ✅ State tracking overhead <5% of coordination time
- ✅ Integration with message-bus.sh seamless
- ✅ State transitions correctly logged and broadcast

**Failure Response**:
- Simplify state machine (remove IDLE state if problematic)
- Use in-memory state tracking instead of file-based
- Increase lock timeout for high-contention scenarios

**Decision Gate**: State machine working reliably → Proceed to Sprint 5.2

---

### Sprint 5.2: Help Request System (2 weeks)

**Timeline**: 2 weeks
**Priority**: HIGH (if Phase 5 pursued)
**Estimated Agents**: 6 agents

**Deliverables**:
- Help request queue implementation
- Help request file format: `/dev/shm/cfn/help-requests/{request_id}`
- Agent capability matching algorithm
- Help request/response protocol
- Background help listener for WAITING agents
- Help request timeout and cleanup

**Implementation Details**:

```bash
# Help request file format
# /dev/shm/cfn/help-requests/{request_id}
# Format: REQUESTER_ID|CAPABILITIES_NEEDED|REQUEST_TYPE|PAYLOAD|TIMESTAMP
agent-42|rust-expert,backend-dev|code-review|/path/to/code.rs|1696531200

# Request help function
request_help() {
  local requester_id=$1
  local capabilities_needed=$2
  local request_type=$3
  local payload=$4
  local request_id="help-$(date +%s%N)"
  local request_file="/dev/shm/cfn/help-requests/${request_id}"
  local timestamp=$(date +%s)

  # Write help request
  echo "${requester_id}|${capabilities_needed}|${request_type}|${payload}|${timestamp}" > "$request_file"

  # Broadcast help request to WAITING agents
  send_message "broadcast" "HELP_REQUEST|${request_id}|${capabilities_needed}"

  # Wait for response (timeout 30s)
  local response_file="${request_file}.response"
  local timeout=30
  local start=$(date +%s)

  while [[ ! -f "$response_file" ]]; do
    sleep 0.1
    if [[ $(($(date +%s) - start)) -ge $timeout ]]; then
      echo "Help request timeout" >&2
      rm -f "$request_file"
      return 1
    fi
  done

  cat "$response_file"
  rm -f "$request_file" "$response_file"
}

# Background help listener (runs while agent in WAITING state)
help_listener() {
  local agent_id=$1
  local capabilities=$(get_agent_capabilities "$agent_id")

  while [[ "$(get_agent_state "$agent_id")" == "WAITING" ]]; do
    # Poll help requests every 200ms
    for request_file in /dev/shm/cfn/help-requests/help-*; do
      [[ ! -f "$request_file" ]] && continue

      # Parse request
      IFS='|' read -r requester_id capabilities_needed request_type payload timestamp < "$request_file"

      # Check capability match
      if capability_match "$capabilities" "$capabilities_needed"; then
        # Claim request (atomic rename)
        if mv "$request_file" "${request_file}.claimed.${agent_id}" 2>/dev/null; then
          # Process help request
          local response=$(handle_help_request "$request_type" "$payload")
          echo "$response" > "${request_file}.response"
          rm -f "${request_file}.claimed.${agent_id}"
        fi
      fi
    done

    sleep 0.2
  done
}

# Capability matching algorithm
capability_match() {
  local agent_capabilities=$1
  local needed_capabilities=$2

  # Check if agent has ALL needed capabilities
  IFS=',' read -ra needed <<< "$needed_capabilities"
  for cap in "${needed[@]}"; do
    if [[ ! "$agent_capabilities" =~ $cap ]]; then
      return 1  # Missing capability
    fi
  done
  return 0  # All capabilities present
}
```

**Agent Team** (6 agents):
- backend-dev (2): Implement help request system, capability matching
- system-architect: Design help request protocol and queue management
- coder: Background help listener implementation
- tester: Test help request matching, timeout, cleanup
- perf-analyzer: Benchmark help system overhead and response time
- reviewer: Validate help request reliability and edge cases

**Success Criteria**:
- ✅ Help requests matched to capable agents within 500ms
- ✅ WAITING agents respond to help requests correctly
- ✅ No deadlocks from circular help dependencies
- ✅ Help system overhead <10% of coordination time
- ✅ Help request queue cleanup prevents buildup
- ✅ Capability matching accuracy >90%

**Failure Response**:
- Increase help listener polling interval (reduce overhead)
- Simplify capability matching (exact match instead of partial)
- Add help request priority queue
- Implement backpressure when help queue overflows

**Decision Gate**: Help system working reliably → Proceed to Sprint 5.3

---

### Sprint 5.3: Dependency Resolution (2 weeks)

**Timeline**: 2 weeks
**Priority**: MEDIUM (if Phase 5 pursued)
**Estimated Agents**: 6 agents

**Deliverables**:
- Dependency graph tracking system
- Dependency file format: `/dev/shm/cfn/dependencies/{agent_id}`
- BLOCKED state handling (agent waiting for dependency)
- Provider matching for dependencies
- Dependency resolution protocol
- Circular dependency detection

**Implementation Details**:

```bash
# Dependency file format
# /dev/shm/cfn/dependencies/{agent_id}
# Format: DEPENDENCY_TYPE|PROVIDER_CAPABILITIES|PAYLOAD|STATUS|TIMESTAMP
data-fetch|api-dev|/api/users|PENDING|1696531200

# Declare dependency function
declare_dependency() {
  local agent_id=$1
  local dependency_type=$2
  local provider_capabilities=$3
  local payload=$4
  local dep_file="/dev/shm/cfn/dependencies/${agent_id}"
  local timestamp=$(date +%s)

  # Write dependency declaration
  echo "${dependency_type}|${provider_capabilities}|${payload}|PENDING|${timestamp}" > "$dep_file"

  # Transition to BLOCKED state
  transition_to_blocked "$agent_id"

  # Broadcast dependency request
  send_message "broadcast" "DEPENDENCY|${agent_id}|${provider_capabilities}|${payload}"

  # Wait for dependency resolution (timeout 60s)
  wait_for_dependency_resolution "$agent_id" "$dep_file" 60
}

# Wait for dependency resolution
wait_for_dependency_resolution() {
  local agent_id=$1
  local dep_file=$2
  local timeout=$3
  local start=$(date +%s)

  while [[ -f "$dep_file" ]]; do
    IFS='|' read -r dep_type provider_caps payload status timestamp < "$dep_file"

    if [[ "$status" == "RESOLVED" ]]; then
      # Dependency resolved, transition back to WORKING
      transition_to_working "$agent_id"
      rm -f "$dep_file"
      return 0
    fi

    if [[ $(($(date +%s) - start)) -ge $timeout ]]; then
      echo "Dependency resolution timeout" >&2
      transition_to_waiting "$agent_id"  # Can accept other work
      return 1
    fi

    sleep 0.5
  done
}

# Provide dependency (called by WAITING agents with matching capabilities)
provide_dependency() {
  local provider_id=$1
  local blocked_agent_id=$2
  local dep_file="/dev/shm/cfn/dependencies/${blocked_agent_id}"

  [[ ! -f "$dep_file" ]] && return 1

  IFS='|' read -r dep_type provider_caps payload status timestamp < "$dep_file"

  # Check capability match
  local provider_capabilities=$(get_agent_capabilities "$provider_id")
  if ! capability_match "$provider_capabilities" "$provider_caps"; then
    return 1  # Not capable of providing this dependency
  fi

  # Process dependency request
  local result=$(handle_dependency_request "$dep_type" "$payload")

  # Mark dependency as RESOLVED
  echo "${dep_type}|${provider_caps}|${result}|RESOLVED|$(date +%s)" > "$dep_file"

  # Notify blocked agent
  send_message "$blocked_agent_id" "DEPENDENCY_RESOLVED|${dep_type}|${result}"
}

# Circular dependency detection
detect_circular_dependency() {
  local agent_id=$1
  local visited=()

  check_dependency_chain() {
    local current_agent=$1

    # Check if already visited (circular)
    for v in "${visited[@]}"; do
      [[ "$v" == "$current_agent" ]] && return 1  # Circular detected
    done

    visited+=("$current_agent")

    local dep_file="/dev/shm/cfn/dependencies/${current_agent}"
    [[ ! -f "$dep_file" ]] && return 0  # No more dependencies

    IFS='|' read -r dep_type provider_caps payload status timestamp < "$dep_file"

    # Find provider agent (simplified - would need registry in practice)
    local provider_agent=$(find_capable_agent "$provider_caps")
    [[ -z "$provider_agent" ]] && return 0  # No provider found

    check_dependency_chain "$provider_agent"
  }

  check_dependency_chain "$agent_id"
}
```

**Agent Team** (6 agents):
- backend-dev (2): Implement dependency resolution system, graph tracking
- system-architect: Design dependency protocol and circular detection
- coder: BLOCKED state handling and provider matching
- tester: Test dependency resolution scenarios, circular dependencies
- reviewer: Validate dependency correctness and deadlock prevention

**Success Criteria**:
- ✅ Dependencies resolved successfully (>95% success rate)
- ✅ BLOCKED agents correctly unblocked after resolution
- ✅ No deadlocks from circular dependencies
- ✅ Dependency resolution time <1s average
- ✅ Dependency tracking overhead <5% of coordination time
- ✅ Circular dependency detection prevents infinite waits

**Failure Response**:
- Simplify dependency resolution (timeout faster)
- Remove circular dependency detection (accept some timeouts)
- Implement dependency priority queue
- Add manual intervention for stuck dependencies

**Decision Gate**: Dependency resolution working reliably → Proceed to Sprint 5.4

---

### Sprint 5.4: Integration Testing & Validation (1 week)

**Timeline**: 1 week
**Priority**: CRITICAL (if Phase 5 pursued)
**Estimated Agents**: 5 agents

**Deliverables**:
- End-to-end lifecycle testing suite
- Performance benchmarks comparing Phase 5 vs Phase 4
- WAITING state utilization metrics
- Production readiness validation
- Rollback procedures to Phase 4 model
- Phase 5 deployment recommendation

**Test Scenarios**:

```bash
# Scenario 1: Task reassignment speed
# Phase 4: spawn new agent (2-5s)
# Phase 5: reassign to WAITING agent (<100ms)
test_task_reassignment_speed() {
  # Spawn 100 agents, complete 50 tasks
  # Measure time to assign next 50 tasks

  # Phase 4 (baseline)
  local phase4_time=$(measure_spawn_and_assign 50)

  # Phase 5 (with WAITING state)
  local phase5_time=$(measure_reassign_to_waiting 50)

  local improvement=$((100 - (phase5_time * 100 / phase4_time)))

  if [[ $improvement -ge 15 ]]; then
    echo "✅ Task reassignment ${improvement}% faster in Phase 5"
  else
    echo "❌ Phase 5 improvement only ${improvement}% (target: ≥15%)"
  fi
}

# Scenario 2: Dependency resolution effectiveness
test_dependency_resolution() {
  # Create 20 agents with dependencies on each other
  # Measure time to resolve all dependencies

  local phase4_time=$(measure_reactive_help_time)  # Reactive help only
  local phase5_time=$(measure_active_resolution_time)  # Active dependency resolution

  local improvement=$((100 - (phase5_time * 100 / phase4_time)))

  if [[ $improvement -ge 15 ]]; then
    echo "✅ Dependency resolution ${improvement}% faster in Phase 5"
  else
    echo "❌ Phase 5 improvement only ${improvement}% (target: ≥15%)"
  fi
}

# Scenario 3: Idle time reduction
test_idle_time_reduction() {
  # Run 100-agent coordination for 1 hour
  # Measure % of time agents are idle (not working, not helping)

  local phase4_idle_pct=$(measure_phase4_idle_time)
  local phase5_idle_pct=$(measure_phase5_idle_time)

  local reduction=$((phase4_idle_pct - phase5_idle_pct))
  local pct_improvement=$((reduction * 100 / phase4_idle_pct))

  if [[ $pct_improvement -ge 15 ]]; then
    echo "✅ Idle time reduced by ${reduction}% (${pct_improvement}% improvement)"
  else
    echo "❌ Idle time reduction only ${reduction}% (target: ≥15%)"
  fi
}

# Combined benchmark
run_phase5_benchmark() {
  echo "=== Phase 5 vs Phase 4 Benchmark ==="

  local reassignment_result=$(test_task_reassignment_speed)
  local dependency_result=$(test_dependency_resolution)
  local idle_result=$(test_idle_time_reduction)

  echo "$reassignment_result"
  echo "$dependency_result"
  echo "$idle_result"

  # Overall decision
  local improvements=0
  [[ "$reassignment_result" =~ ✅ ]] && improvements=$((improvements + 1))
  [[ "$dependency_result" =~ ✅ ]] && improvements=$((improvements + 1))
  [[ "$idle_result" =~ ✅ ]] && improvements=$((improvements + 1))

  if [[ $improvements -ge 1 ]]; then
    echo ""
    echo "DECISION: DEPLOY Phase 5 (≥1 metric shows ≥15% improvement)"
  else
    echo ""
    echo "DECISION: DEFER Phase 5 (no metric shows ≥15% improvement)"
    echo "RECOMMENDATION: Revert to Phase 4 model"
  fi
}
```

**Agent Team** (5 agents):
- tester (2): Comprehensive lifecycle testing, benchmark implementation
- perf-analyzer: Benchmark Phase 5 vs Phase 4, analyze utilization improvements
- system-architect: Analyze benefits, production readiness validation
- reviewer: Results validation, deployment recommendation

**Success Criteria**:
- ✅ WAITING state provides ≥15% improvement in AT LEAST ONE metric:
  - Task reassignment speed
  - Dependency resolution time
  - Idle time percentage
- ✅ No regression in coordination time vs Phase 4
- ✅ System remains stable with lifecycle features
- ✅ Memory usage acceptable (agents in WAITING state don't leak)
- ✅ FD count manageable (help listeners don't exhaust FDs)

**Failure Response**:
- Extend testing duration (1 hour → 8 hours)
- Tune WAITING state parameters (help listener polling interval)
- Analyze specific workloads where Phase 5 helps
- Consider hybrid approach (WAITING state for certain agent types only)

**Decision Gate**: Phase 5 benefits proven → Deploy to production OR Phase 5 benefits marginal → Revert to Phase 4 model

---

## Phase 5 Decision Gate (DEPLOY / DEFER / REVERT)

**Success Criteria**:
- ✅ **DEPLOY** if:
  - WAITING state provides ≥15% improvement in idle time, dependency resolution, OR reassignment latency
  - No coordination time regression vs Phase 4
  - System stable with lifecycle features
  - Benefits justify added complexity

- ⏸️ **DEFER** if:
  - Benefits present but <15% improvement
  - Specific workloads benefit, but not general-purpose
  - Complexity concerns outweigh marginal gains
  - RECOMMENDATION: Keep Phase 4 model, revisit Phase 5 later

- ⏮️ **REVERT** if:
  - No measurable benefit in any metric
  - Coordination time regression
  - Stability issues with lifecycle features
  - Complexity too high for maintenance burden
  - RECOMMENDATION: Stay with Phase 4 dynamic spawning model

**Deployment Plan (if DEPLOY decision)**:

Stage 1: WAITING state for 10% of agents (1 week)
Stage 2: WAITING state for 50% of agents (1 week)
Stage 3: WAITING state for 100% of agents (2 weeks)

**Rollback Plan**:

```bash
# Disable Phase 5 features, revert to Phase 4
export CFN_LIFECYCLE_MODE="phase4"  # phase4 (default) | phase5

# Cleanup Phase 5 state files
rm -rf /dev/shm/cfn/help-requests/
rm -rf /dev/shm/cfn/dependencies/
find /dev/shm/cfn/agents/ -name 'state' -delete

# Restart coordination with Phase 4 model
bash message-bus.sh coordinate 500 agents
```

---

## Technical Implementation Details

### State Machine Design

**State Transition Diagram**:
```
     ┌─────────┐
     │ SPAWNED │
     └────┬────┘
          │ initialize
          ↓
     ┌─────────┐
     │  IDLE   │
     └────┬────┘
          │ assign_task()
          ↓
     ┌──────────┐      transition_to_waiting()
     │ WORKING  ├──────────────────────────────┐
     └─────┬────┘                               │
           │ task_complete()                    ↓
           │                               ┌──────────┐
           │                               │ WAITING  │
           │                               └────┬─────┘
           │ final_task_complete()              │
           │            ←───────────────────────┘
           │              assign_task()
           ↓
     ┌──────────┐
     │ COMPLETE │
     └──────────┘
        (terminate)
```

**State Transition Rules**:
1. SPAWNED → IDLE: Initialization complete
2. IDLE → WORKING: First task assigned
3. WORKING → WAITING: Task complete, agent has remaining capacity
4. WAITING → WORKING: New task assigned (instant reassignment)
5. WAITING → COMPLETE: Timeout or coordinator shutdown signal
6. WORKING → COMPLETE: Final task complete, no more work available

### Help Request Queue Architecture

**Queue Structure**:
```
/dev/shm/cfn/help-requests/
├── help-1696531200000  # Request ID = timestamp
├── help-1696531201000
└── help-1696531202000

Each file contains:
REQUESTER_ID|CAPABILITIES_NEEDED|REQUEST_TYPE|PAYLOAD|TIMESTAMP
agent-42|rust-expert|code-review|/path/to/code.rs|1696531200
```

**Help Listener Lifecycle**:
```bash
# Spawned when agent transitions to WAITING
start_help_listener() {
  local agent_id=$1
  (
    while [[ "$(get_agent_state "$agent_id")" == "WAITING" ]]; do
      poll_help_requests "$agent_id"
      sleep 0.2  # Poll every 200ms
    done
  ) &
  echo $! > "/dev/shm/cfn/agents/${agent_id}/help_listener.pid"
}

# Killed when agent transitions away from WAITING
stop_help_listener() {
  local agent_id=$1
  local pid_file="/dev/shm/cfn/agents/${agent_id}/help_listener.pid"
  [[ -f "$pid_file" ]] && kill "$(cat "$pid_file")" 2>/dev/null
  rm -f "$pid_file"
}
```

### Dependency Resolution Protocol

**Dependency Graph Format**:
```
/dev/shm/cfn/dependencies/
├── agent-10  # Blocked on data from agent-5
├── agent-15  # Blocked on API response from agent-3
└── agent-22  # Blocked on DB query from agent-7

Each file contains:
DEPENDENCY_TYPE|PROVIDER_CAPABILITIES|PAYLOAD|STATUS|TIMESTAMP
```

**Resolution Flow**:
```
1. Agent declares dependency → transitions to BLOCKED
2. Coordinator broadcasts dependency request
3. WAITING agents with matching capabilities claim request
4. Provider agent processes dependency, writes result
5. Blocked agent receives result → transitions to WORKING
6. Dependency file cleanup
```

---

## Testing Strategy

### Unit Tests

**State Machine Tests**:
- Test all state transitions (valid and invalid)
- Test atomic state file updates (no race conditions)
- Test state query performance (<10ms)
- Test state transition logging

**Help Request Tests**:
- Test help request creation and cleanup
- Test capability matching accuracy
- Test help listener startup/shutdown
- Test help request timeout handling

**Dependency Resolution Tests**:
- Test dependency declaration and resolution
- Test circular dependency detection
- Test provider matching
- Test dependency timeout and cleanup

### Integration Tests

**End-to-End Lifecycle Test**:
```bash
# Spawn agent → IDLE → WORKING → WAITING → reassign → WORKING → COMPLETE
test_full_lifecycle() {
  local agent_id="test-agent-1"

  # Spawn and verify IDLE
  spawn_agent "$agent_id"
  assert_state "$agent_id" "IDLE"

  # Assign task and verify WORKING
  assign_task "$agent_id" "task-1"
  assert_state "$agent_id" "WORKING"

  # Complete task and verify WAITING
  complete_task "$agent_id" "task-1"
  assert_state "$agent_id" "WAITING"

  # Reassign new task and verify WORKING
  assign_task "$agent_id" "task-2"
  assert_state "$agent_id" "WORKING"

  # Final completion and verify COMPLETE
  complete_task "$agent_id" "task-2" --final
  assert_state "$agent_id" "COMPLETE"
}
```

**Help Request Flow Test**:
```bash
test_help_request_flow() {
  # Spawn requester and provider agents
  spawn_agent "requester-1"
  spawn_agent "provider-1" --capabilities "rust-expert"

  # Transition provider to WAITING
  transition_to_waiting "provider-1"

  # Requester sends help request
  request_help "requester-1" "rust-expert" "code-review" "/path/to/code.rs"

  # Verify provider claims and processes request
  sleep 1
  assert_help_request_claimed "provider-1"
  assert_help_response_sent
}
```

**Dependency Resolution Test**:
```bash
test_dependency_resolution() {
  # Spawn agents with dependency chain
  spawn_agent "agent-A"
  spawn_agent "agent-B" --capabilities "data-provider"

  # Agent-A declares dependency on agent-B
  declare_dependency "agent-A" "data-fetch" "data-provider" "/api/users"
  assert_state "agent-A" "BLOCKED"

  # Transition agent-B to WAITING (can provide dependencies)
  transition_to_waiting "agent-B"

  # Verify dependency resolution
  sleep 1
  assert_state "agent-A" "WORKING"  # Unblocked
  assert_dependency_resolved "agent-A"
}
```

### Performance Tests

**Reassignment Speed Benchmark**:
- Measure Phase 4: spawn new agent time
- Measure Phase 5: reassign to WAITING agent time
- Target: ≥15% improvement (or absolute <100ms)

**Help Request Latency**:
- Measure time from request to response
- Target: <500ms average
- Test with 10, 50, 100 concurrent help requests

**Dependency Resolution Speed**:
- Measure blocked agent time
- Compare Phase 4 (reactive help) vs Phase 5 (active resolution)
- Target: ≥15% improvement

---

## Risk Mitigation

### Complexity Risk

**Risk**: Phase 5 adds significant complexity (4-state vs 3-state lifecycle)
**Mitigation**: Comprehensive testing, gradual rollout, rollback plan
**Fallback**: Revert to Phase 4 model if complexity outweighs benefits

### Performance Risk

**Risk**: WAITING state overhead (help listeners, state tracking) degrades performance
**Mitigation**: Benchmark Phase 5 vs Phase 4, measure overhead
**Fallback**: Tune polling intervals, simplify help system, or revert

### Resource Leak Risk

**Risk**: WAITING agents stay alive indefinitely, causing memory/FD leaks
**Mitigation**: Implement timeout for WAITING state (e.g., 5 minutes idle → COMPLETE)
**Fallback**: Periodic agent pool recycling, forced cleanup

### Deadlock Risk

**Risk**: Circular dependencies or help request loops cause deadlocks
**Mitigation**: Circular dependency detection, help request timeout
**Fallback**: Manual intervention, dependency graph analysis tools

---

## Decision Matrix

**Proceed to Phase 5 if**:
| Metric | Phase 4 Baseline | Phase 5 Target | Decision |
|--------|------------------|----------------|----------|
| Idle time percentage | >30% | <20% (≥33% improvement) | PROCEED |
| Dependency blocks | >10 agents | <3 agents (≥70% improvement) | PROCEED |
| Task reassignment | >2000ms | <500ms (≥75% improvement) | PROCEED |

**Skip Phase 5 if**:
| Metric | Phase 4 Baseline | Observed | Decision |
|--------|------------------|----------|----------|
| Idle time percentage | <30% | Acceptable | SKIP |
| Dependency blocks | <10 agents | Rare occurrence | SKIP |
| Task reassignment | <2000ms | Spawn time acceptable | SKIP |
| Coordination time | <10s (500 agents) | Meeting targets | SKIP |

---

## Document Metadata

**Version**: 1.0
**Created**: 2025-10-06
**Last Updated**: 2025-10-06
**Author**: CLI Coordination V2 Epic Planning Team
**Status**: DRAFT - Awaiting Phase 4 completion for evaluation
**Next Review**: After Phase 4 Stage 2 stabilizes

**Related Documents**:
- `planning/cli-validation-epic/CLI_COORDINATION_V2_EPIC.md` - Parent epic document
- `planning/cli-validation-epic/phase-4-production-deployment.md` - Phase 4 details
- `planning/agent-coordination-v2/MVP_CONCLUSIONS.md` - MVP validation results

**Changelog**:
- v1.0 (2025-10-06): Initial Phase 5 documentation created, clearly marked as OPTIONAL
