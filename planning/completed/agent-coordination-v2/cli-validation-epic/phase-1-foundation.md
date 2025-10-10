# Phase 1: Foundation - CLI Coordination V2

## Phase Overview

**Objective**: Implement core coordination infrastructure with monitoring, health checks, and operational tooling to enable reliable 100-agent swarms.

**Timeline**: 4-6 weeks (5 sprints)

**Dependencies**: Sprint 0 MUST pass GO decision

**Coordination Model**: Dynamic spawning with collaboration during execution
- Simple 3-state lifecycle: SPAWNED → WORKING → COMPLETE (terminate)
- Agents collaborate while executing (answer questions, share data)
- Memory efficient (agents terminate when done)
- No explicit WAITING state (deferred to optional Phase 5)

**Success Criteria** (ALL must pass for Phase Gate):
- 100-agent swarm: ≥95% delivery rate
- Coordination time: <5s
- Metrics accurate and low-overhead (<1%)
- Health checks reliable (false positive <1%)
- Graceful shutdown working (all messages processed)
- Rate limiting prevents overflow (inbox <1000 messages)

**Exit Condition**: Phase 1 Decision Gate approval → Proceed to Phase 2

---

## Sprint 1.1: Monitoring & Metrics (1 Week)

### Objective
Implement comprehensive metrics emission and collection framework to enable observability of coordination behavior, performance bottlenecks, and system health.

### Deliverables

#### 1. Metrics Emission Framework
**File**: `src/coordination/v2/metrics.sh`

**Core Function**:
```bash
# emit_metric - Write metric to JSONL file
# Usage: emit_metric <type> <name> <value> [tags...]
emit_metric() {
  local metric_type="$1"  # counter, gauge, histogram
  local metric_name="$2"
  local metric_value="$3"
  shift 3
  local tags="$*"

  local timestamp=$(date +%s)
  local json=$(jq -n \
    --arg type "$metric_type" \
    --arg name "$metric_name" \
    --arg value "$metric_value" \
    --arg tags "$tags" \
    --arg ts "$timestamp" \
    '{type: $type, name: $name, value: ($value | tonumber), tags: $tags, timestamp: ($ts | tonumber)}')

  echo "$json" >> "${CFN_METRICS_FILE:-/dev/shm/cfn/metrics.jsonl}"
}
```

**Metric Types**:
- **counter**: Monotonically increasing (messages_sent, errors_total)
- **gauge**: Point-in-time value (active_agents, inbox_depth)
- **histogram**: Distribution tracking (coordination_time_ms, message_latency_ms)

**Example Usage**:
```bash
# Counter: increment message count
emit_metric counter messages_sent 1 "agent=coordinator-1"

# Gauge: current inbox depth
emit_metric gauge inbox_depth 47 "agent=worker-23"

# Histogram: coordination time
emit_metric histogram coordination_time_ms 4523 "topology=flat,agents=100"
```

#### 2. Metrics Collection Points
**Integration**: `src/coordination/v2/message-bus.sh`

**Key Metrics to Emit**:
```bash
# Coordination lifecycle
emit_metric histogram coordination_time_ms $duration "topology=$CFN_TOPOLOGY,agents=$agent_count"
emit_metric gauge delivery_rate $delivery_pct "topology=$CFN_TOPOLOGY"

# Message bus activity
emit_metric counter messages_sent 1 "from=$sender,to=$recipient"
emit_metric histogram message_latency_ms $latency "priority=$priority"

# Agent lifecycle
emit_metric counter agents_spawned 1 "role=$agent_role"
emit_metric counter agents_completed 1 "role=$agent_role,status=$exit_code"

# Resource utilization
emit_metric gauge inbox_depth $inbox_count "agent=$agent_id"
emit_metric gauge tmpfs_usage_bytes $shm_bytes
emit_metric gauge fd_count $open_fds
```

#### 3. JSONL Metrics File
**Location**: `/dev/shm/cfn/metrics.jsonl`

**Format**:
```jsonl
{"type":"histogram","name":"coordination_time_ms","value":4523,"tags":"topology=flat,agents=100","timestamp":1728234567}
{"type":"gauge","name":"delivery_rate","value":0.978,"tags":"topology=flat","timestamp":1728234567}
{"type":"counter","name":"messages_sent","value":1,"tags":"from=coordinator-1,to=worker-23","timestamp":1728234568}
```

**Rotation Strategy**:
```bash
# Rotate metrics file when >10MB to prevent unbounded growth
rotate_metrics() {
  local metrics_file="${CFN_METRICS_FILE:-/dev/shm/cfn/metrics.jsonl}"
  local metrics_size=$(stat -c%s "$metrics_file" 2>/dev/null || echo 0)

  if [ "$metrics_size" -gt 10485760 ]; then  # 10MB
    mv "$metrics_file" "$metrics_file.$(date +%s)"
    touch "$metrics_file"
    # Optionally: compress and archive old metrics
    gzip "$metrics_file".* 2>/dev/null || true
  fi
}
```

#### 4. Basic Alerting Thresholds
**File**: `src/coordination/v2/alerting.sh`

**Threshold Checks**:
```bash
# check_metrics_thresholds - Scan recent metrics for threshold violations
check_metrics_thresholds() {
  local metrics_file="${CFN_METRICS_FILE:-/dev/shm/cfn/metrics.jsonl}"
  local last_100=$(tail -100 "$metrics_file")

  # Coordination time threshold: >10s (2× target)
  local coord_time_avg=$(echo "$last_100" | jq -s '
    map(select(.name == "coordination_time_ms")) |
    map(.value) | add / length' 2>/dev/null || echo 0)

  if (( $(echo "$coord_time_avg > 10000" | bc -l) )); then
    emit_alert "coordination_time_high" "Average coordination time: ${coord_time_avg}ms (threshold: 10000ms)"
  fi

  # Delivery rate threshold: <90%
  local delivery_rate=$(echo "$last_100" | jq -s '
    map(select(.name == "delivery_rate")) | last | .value' 2>/dev/null || echo 1)

  if (( $(echo "$delivery_rate < 0.90" | bc -l) )); then
    emit_alert "delivery_rate_low" "Delivery rate: ${delivery_rate} (threshold: 0.90)"
  fi

  # Inbox overflow threshold: >1000 messages
  local max_inbox=$(echo "$last_100" | jq -s '
    map(select(.name == "inbox_depth")) | max_by(.value) | .value' 2>/dev/null || echo 0)

  if [ "$max_inbox" -gt 1000 ]; then
    emit_alert "inbox_overflow" "Max inbox depth: $max_inbox (threshold: 1000)"
  fi
}

# emit_alert - Write alert to alert log
emit_alert() {
  local alert_name="$1"
  local alert_msg="$2"
  local timestamp=$(date +%s)

  echo "[$timestamp] ALERT: $alert_name - $alert_msg" >> /dev/shm/cfn/alerts.log
}
```

### Agent Team (5 Agents)

**Swarm Initialization**:
```javascript
mcp__claude-flow-novice__swarm_init({
  topology: "mesh",
  maxAgents: 5,
  strategy: "balanced"
})
```

**Agent Assignments**:

1. **backend-dev**: Implement metrics emission in message-bus.sh
   - Add emit_metric() function to metrics.sh
   - Integrate metric collection points in coordination lifecycle
   - Implement metrics file rotation logic
   - MANDATORY: Run post-edit hook after EVERY file edit

2. **devops-engineer**: Set up metrics collection pipeline
   - Design JSONL metrics file structure
   - Implement metrics file rotation and archival
   - Create metrics query utilities (jq-based)
   - Test metrics collection under load

3. **coder**: Create metrics analysis scripts
   - Build metrics aggregation scripts (avg, p50, p95, p99)
   - Implement alerting threshold checks
   - Create metrics visualization utilities
   - Document metrics query examples

4. **tester**: Validate metrics accuracy
   - Test metric emission for all coordination events
   - Verify metrics file format correctness
   - Validate alerting threshold logic
   - Measure metrics overhead (<1% target)

5. **reviewer**: Code review and integration testing
   - Review metrics.sh implementation
   - Validate integration with message-bus.sh
   - Test end-to-end metrics pipeline
   - Verify no performance regression

### Implementation Details

#### Bash Function Signatures

```bash
# metrics.sh core functions
emit_metric <type> <name> <value> [tags...]
rotate_metrics
get_metric_value <name> [timeframe_seconds]
calculate_histogram <metric_name> <percentile>

# alerting.sh functions
check_metrics_thresholds
emit_alert <alert_name> <alert_msg>
get_alerts [timeframe_seconds]
clear_alerts
```

#### File Structure in `/dev/shm/cfn/`
```
/dev/shm/cfn/
├── metrics.jsonl              # Current metrics (rotates at 10MB)
├── metrics.jsonl.1728234567   # Archived metrics (timestamped)
├── alerts.log                 # Alert history
└── metrics/
    └── summary.json           # Hourly metrics summary (optional)
```

#### Message Bus Integration Points

**Coordination Start**:
```bash
coordination_start_ts=$(date +%s%3N)
# ... coordination logic ...
coordination_end_ts=$(date +%s%3N)
coordination_duration=$((coordination_end_ts - coordination_start_ts))
emit_metric histogram coordination_time_ms $coordination_duration "topology=$CFN_TOPOLOGY,agents=$total_agents"
```

**Message Send**:
```bash
send_message() {
  local recipient="$1"
  local message="$2"
  local send_start=$(date +%s%3N)

  # Send logic...
  echo "$message" >> "/dev/shm/cfn/agents/$recipient/inbox"

  local send_end=$(date +%s%3N)
  emit_metric histogram message_latency_ms $((send_end - send_start)) "to=$recipient"
  emit_metric counter messages_sent 1 "from=$AGENT_ID,to=$recipient"
}
```

**Inbox Depth Monitoring**:
```bash
poll_inbox() {
  local inbox_depth=$(find "/dev/shm/cfn/agents/$AGENT_ID/inbox" -type f | wc -l)
  emit_metric gauge inbox_depth $inbox_depth "agent=$AGENT_ID"

  # Process messages...
}
```

#### Performance Requirements

**Metric Emission Overhead**:
- Target: <1% of coordination time
- Measurement: Compare coordination time with/without metrics
- Optimization: Use `>>` append (no locking), batch metric writes if needed

**Metrics File Growth**:
- Rotation: At 10MB (approximately 50,000 metrics)
- Retention: Keep last 5 rotated files (50MB total)
- Archival: Compress with gzip for long-term storage

### Validation Checkpoints

**Checkpoint 1: Metrics Emission Coverage**
- ✅ All coordination events emit metrics (start, end, agent spawn, message send)
- ✅ Metrics file created and writable
- ✅ JSONL format validated with `jq`
- ✅ No metrics emission errors in logs

**Checkpoint 2: Metrics Accuracy**
```bash
# Test scenario: 10-agent coordination
bash message-bus.sh coordinate 10 agents

# Validate metrics
total_messages=$(grep '"name":"messages_sent"' /dev/shm/cfn/metrics.jsonl | wc -l)
coordination_time=$(grep '"name":"coordination_time_ms"' /dev/shm/cfn/metrics.jsonl | tail -1 | jq '.value')

echo "Total messages: $total_messages (expected: 20+ for 10 agents)"
echo "Coordination time: ${coordination_time}ms (expected: <5000ms)"
```

**Checkpoint 3: Performance Impact**
```bash
# Measure overhead with metrics enabled vs disabled
export CFN_METRICS_ENABLED=true
time bash message-bus.sh coordinate 100 agents  # Measure with metrics

export CFN_METRICS_ENABLED=false
time bash message-bus.sh coordinate 100 agents  # Measure without metrics

# Verify overhead <1%
```

**Checkpoint 4: Alerting Logic**
```bash
# Inject high coordination time
emit_metric histogram coordination_time_ms 15000 "topology=flat,agents=100"

# Run threshold check
bash alerting.sh check_metrics_thresholds

# Verify alert emitted
grep "coordination_time_high" /dev/shm/cfn/alerts.log
```

### Decision Gate

**Success Criteria** (ALL must pass):
- ✅ All coordination events emit metrics correctly
- ✅ Metrics file format valid and parseable with `jq`
- ✅ Metrics overhead <1% of coordination time
- ✅ Alerting thresholds detect violations accurately

**Decision Outcomes**:
- **PROCEED**: All criteria met → Proceed to Sprint 1.2 (Health Checks)
- **PIVOT**: Metrics overhead too high → Optimize emission (batch writes, reduce frequency)
- **BLOCK**: Critical issues → Fix bugs, re-validate before proceeding

---

## Sprint 1.2: Health Checks & Liveness (1 Week)

### Objective
Implement health check and liveness tracking system to detect failed or unhealthy agents within 30 seconds, enabling automatic recovery and alerting.

### Deliverables

#### 1. Health Check Function
**File**: `src/coordination/v2/health.sh`

**Core Function**:
```bash
# report_health - Write health status to agent health file
# Status: healthy, degraded, unhealthy
report_health() {
  local status="$1"  # healthy | degraded | unhealthy
  local reason="${2:-}"
  local agent_id="${AGENT_ID:-unknown}"
  local timestamp=$(date +%s)

  local health_file="/dev/shm/cfn/agents/$agent_id/health"
  local health_json=$(jq -n \
    --arg status "$status" \
    --arg reason "$reason" \
    --arg ts "$timestamp" \
    '{status: $status, reason: $reason, timestamp: ($ts | tonumber), agent_id: env.AGENT_ID}')

  echo "$health_json" > "$health_file"

  # Emit health metric
  local health_value=1
  case "$status" in
    healthy) health_value=1 ;;
    degraded) health_value=0.5 ;;
    unhealthy) health_value=0 ;;
  esac

  emit_metric gauge agent_health $health_value "agent=$agent_id,status=$status"
}
```

**Health Status Definitions**:
- **healthy**: Agent operating normally, processing messages
- **degraded**: Agent functional but experiencing issues (high latency, resource pressure)
- **unhealthy**: Agent failed or unresponsive, requires intervention

**Health Reporting Triggers**:
```bash
# Report health on agent startup
report_health healthy "Agent started successfully"

# Report degraded health on resource pressure
if [ "$inbox_depth" -gt 500 ]; then
  report_health degraded "High inbox depth: $inbox_depth"
fi

# Report unhealthy on critical error
if ! process_message "$msg"; then
  report_health unhealthy "Message processing failed: $msg"
fi
```

#### 2. Liveness Tracking for Coordinators and Workers
**File**: `src/coordination/v2/liveness.sh`

**Heartbeat Mechanism**:
```bash
# send_heartbeat - Write heartbeat to liveness file
send_heartbeat() {
  local agent_id="${AGENT_ID:-unknown}"
  local timestamp=$(date +%s)
  local heartbeat_file="/dev/shm/cfn/agents/$agent_id/heartbeat"

  echo "$timestamp" > "$heartbeat_file"
  emit_metric gauge agent_heartbeat $timestamp "agent=$agent_id"
}

# Heartbeat loop (background process)
start_heartbeat_loop() {
  local interval="${CFN_HEARTBEAT_INTERVAL:-10}"  # 10s default

  while true; do
    send_heartbeat
    sleep "$interval"
  done &

  echo $! > /dev/shm/cfn/agents/$AGENT_ID/heartbeat.pid
}

# Stop heartbeat on shutdown
stop_heartbeat_loop() {
  local heartbeat_pid=$(cat /dev/shm/cfn/agents/$AGENT_ID/heartbeat.pid 2>/dev/null)
  if [ -n "$heartbeat_pid" ]; then
    kill "$heartbeat_pid" 2>/dev/null || true
  fi
}
```

**Liveness Check**:
```bash
# check_agent_liveness - Verify agent is alive based on heartbeat
# Returns: 0 (alive), 1 (stale), 2 (dead)
check_agent_liveness() {
  local agent_id="$1"
  local heartbeat_file="/dev/shm/cfn/agents/$agent_id/heartbeat"
  local stale_threshold="${CFN_LIVENESS_THRESHOLD:-30}"  # 30s

  if [ ! -f "$heartbeat_file" ]; then
    return 2  # Dead (no heartbeat file)
  fi

  local last_heartbeat=$(cat "$heartbeat_file")
  local now=$(date +%s)
  local age=$((now - last_heartbeat))

  if [ "$age" -gt "$stale_threshold" ]; then
    return 1  # Stale (heartbeat too old)
  fi

  return 0  # Alive
}
```

**Liveness Monitoring Loop**:
```bash
# monitor_agent_liveness - Periodically check all agents
monitor_agent_liveness() {
  local check_interval="${CFN_LIVENESS_CHECK_INTERVAL:-15}"  # 15s

  while true; do
    for agent_dir in /dev/shm/cfn/agents/*/; do
      local agent_id=$(basename "$agent_dir")

      if ! check_agent_liveness "$agent_id"; then
        local liveness_status=$?
        if [ "$liveness_status" -eq 1 ]; then
          emit_alert "agent_stale" "Agent $agent_id heartbeat stale (>30s)"
        elif [ "$liveness_status" -eq 2 ]; then
          emit_alert "agent_dead" "Agent $agent_id has no heartbeat"
        fi
      fi
    done

    sleep "$check_interval"
  done
}
```

#### 3. Health Status API Endpoint
**File**: `src/coordination/v2/health-api.sh`

**Health Query Function**:
```bash
# get_health_status - Retrieve health status for all agents or specific agent
get_health_status() {
  local agent_id="${1:-all}"

  if [ "$agent_id" = "all" ]; then
    # Return health for all agents
    for health_file in /dev/shm/cfn/agents/*/health; do
      cat "$health_file" 2>/dev/null
    done | jq -s '.'
  else
    # Return health for specific agent
    cat "/dev/shm/cfn/agents/$agent_id/health" 2>/dev/null | jq '.'
  fi
}
```

**Health Summary**:
```bash
# get_health_summary - Aggregate health statistics
get_health_summary() {
  local health_data=$(get_health_status all)

  echo "$health_data" | jq '{
    total: length,
    healthy: map(select(.status == "healthy")) | length,
    degraded: map(select(.status == "degraded")) | length,
    unhealthy: map(select(.status == "unhealthy")) | length,
    health_percentage: (map(select(.status == "healthy")) | length) / length
  }'
}
```

**Example API Usage**:
```bash
# Get health for all agents
bash health-api.sh get_health_status all

# Get health for specific agent
bash health-api.sh get_health_status worker-23

# Get health summary
bash health-api.sh get_health_summary
# Output: {"total":100,"healthy":97,"degraded":2,"unhealthy":1,"health_percentage":0.97}
```

#### 4. Unhealthy Agent Detection and Alerting
**Integration**: `liveness.sh` monitoring loop

**Detection Logic**:
```bash
# detect_unhealthy_agents - Scan health files for unhealthy agents
detect_unhealthy_agents() {
  local unhealthy_agents=$(jq -r 'map(select(.status == "unhealthy")) | .[].agent_id' \
    < <(get_health_status all))

  if [ -n "$unhealthy_agents" ]; then
    while IFS= read -r agent_id; do
      emit_alert "agent_unhealthy" "Agent $agent_id is unhealthy"

      # Optionally: trigger recovery action
      # restart_agent "$agent_id"
    done <<< "$unhealthy_agents"
  fi
}
```

### Agent Team (5 Agents)

**Swarm Initialization**:
```javascript
mcp__claude-flow-novice__swarm_init({
  topology: "mesh",
  maxAgents: 5,
  strategy: "balanced"
})
```

**Agent Assignments**:

1. **backend-dev**: Implement health check system
   - Add report_health() function to health.sh
   - Implement health status file writes
   - Integrate health reporting into agent lifecycle
   - MANDATORY: Run post-edit hook after EVERY file edit

2. **system-architect**: Design liveness tracking architecture
   - Design heartbeat mechanism (interval, thresholds)
   - Define liveness check algorithm
   - Specify health vs. liveness separation of concerns
   - Document failure detection timelines

3. **devops-engineer**: Health check monitoring integration
   - Implement liveness monitoring loop
   - Build health status API queries
   - Create health dashboard utilities
   - Test monitoring under agent failures

4. **tester**: Test failure detection accuracy
   - Simulate agent failures (kill processes, block heartbeats)
   - Verify detection within 30s threshold
   - Measure false positive rate (<1% target)
   - Test health recovery scenarios

5. **reviewer**: Validate health check reliability
   - Review health.sh and liveness.sh implementations
   - Validate heartbeat loop stability
   - Test end-to-end health monitoring
   - Verify no performance regression

### Implementation Details

#### Bash Function Signatures

```bash
# health.sh core functions
report_health <status> [reason]
get_agent_health <agent_id>
is_agent_healthy <agent_id>

# liveness.sh core functions
send_heartbeat
start_heartbeat_loop
stop_heartbeat_loop
check_agent_liveness <agent_id>
monitor_agent_liveness

# health-api.sh functions
get_health_status [agent_id]
get_health_summary
detect_unhealthy_agents
```

#### File Structure in `/dev/shm/cfn/`
```
/dev/shm/cfn/agents/{agent_id}/
├── health                 # Health status JSON
├── heartbeat              # Last heartbeat timestamp
└── heartbeat.pid          # Heartbeat loop PID
```

#### Message Bus Integration Points

**Agent Initialization**:
```bash
# agent-wrapper.sh startup
export AGENT_ID="worker-$RANDOM"
mkdir -p "/dev/shm/cfn/agents/$AGENT_ID"

# Report initial health
report_health healthy "Agent initialized"

# Start heartbeat loop
start_heartbeat_loop
```

**Message Processing Loop**:
```bash
while read -r message; do
  if process_message "$message"; then
    report_health healthy
  else
    report_health degraded "Message processing failed"
  fi

  # Check inbox depth
  local inbox_depth=$(find "/dev/shm/cfn/agents/$AGENT_ID/inbox" -type f | wc -l)
  if [ "$inbox_depth" -gt 500 ]; then
    report_health degraded "High inbox depth: $inbox_depth"
  fi
done
```

**Agent Shutdown**:
```bash
# Graceful shutdown
report_health unhealthy "Agent shutting down"
stop_heartbeat_loop
cleanup_agent_files
```

#### Performance Requirements

**Health Check Overhead**:
- Target: <0.5% of coordination time
- Heartbeat interval: 10s (configurable)
- Liveness check interval: 15s (configurable)

**Detection Latency**:
- Target: Detect failed agents within 30s
- Liveness threshold: 30s since last heartbeat
- Monitoring loop: 15s check interval

### Validation Checkpoints

**Checkpoint 1: Health Reporting**
```bash
# Start agent and verify health
export AGENT_ID="test-agent-1"
mkdir -p "/dev/shm/cfn/agents/$AGENT_ID"
report_health healthy "Test agent started"

# Verify health file created
cat "/dev/shm/cfn/agents/$AGENT_ID/health" | jq '.status'
# Expected: "healthy"
```

**Checkpoint 2: Heartbeat Mechanism**
```bash
# Start heartbeat loop
start_heartbeat_loop

# Wait 5 seconds
sleep 5

# Verify heartbeat updated
local heartbeat=$(cat "/dev/shm/cfn/agents/$AGENT_ID/heartbeat")
local now=$(date +%s)
echo "Heartbeat age: $((now - heartbeat))s (expected: <10s)"
```

**Checkpoint 3: Failure Detection**
```bash
# Simulate agent failure (stop heartbeat)
stop_heartbeat_loop

# Wait for liveness threshold + check interval (30s + 15s)
sleep 45

# Verify alert emitted
grep "agent_stale.*$AGENT_ID" /dev/shm/cfn/alerts.log
```

**Checkpoint 4: False Positive Rate**
```bash
# Run 100 agents for 5 minutes
bash message-bus.sh coordinate 100 agents &
COORD_PID=$!
sleep 300
kill $COORD_PID

# Count false positive alerts (agents marked unhealthy but actually healthy)
false_positives=$(grep "agent_stale\|agent_dead" /dev/shm/cfn/alerts.log | wc -l)
total_agents=100
false_positive_rate=$(echo "scale=4; $false_positives / $total_agents" | bc)

echo "False positive rate: $false_positive_rate (target: <0.01)"
```

### Decision Gate

**Success Criteria** (ALL must pass):
- ✅ Health checks detect failed agents within 30s
- ✅ False positive rate <1% (agents incorrectly marked unhealthy)
- ✅ Health status accurate for 100-agent swarm
- ✅ Heartbeat mechanism stable (no heartbeat loop crashes)

**Decision Outcomes**:
- **PROCEED**: All criteria met → Proceed to Sprint 1.3 (Configuration Management)
- **PIVOT**: Detection latency too high → Reduce heartbeat/check intervals
- **BLOCK**: High false positive rate → Adjust liveness thresholds, re-validate

---

## Sprint 1.3: Configuration Management (1 Week)

### Objective
Implement robust configuration system with validation, environment variable overrides, and comprehensive documentation to ensure deployments are correctly configured across environments.

### Deliverables

#### 1. Configuration File
**File**: `src/coordination/v2/coordination-config.sh`

**Configuration Structure**:
```bash
#!/bin/bash
# coordination-config.sh - CLI Coordination V2 Configuration

# Coordination topology
export CFN_COORDINATION_VERSION="${CFN_COORDINATION_VERSION:-v1}"  # v1 | v2
export CFN_TOPOLOGY="${CFN_TOPOLOGY:-flat}"                        # flat | hybrid | hierarchical
export CFN_MAX_AGENTS="${CFN_MAX_AGENTS:-100}"

# Hybrid topology settings (when CFN_TOPOLOGY=hybrid)
export CFN_COORDINATORS="${CFN_COORDINATORS:-7}"
export CFN_WORKERS_PER_COORDINATOR="${CFN_WORKERS_PER_COORDINATOR:-43}"

# Message bus settings
export CFN_MESSAGE_BUS_DIR="${CFN_MESSAGE_BUS_DIR:-/dev/shm/cfn}"
export CFN_MAX_INBOX_SIZE="${CFN_MAX_INBOX_SIZE:-1000}"
export CFN_MESSAGE_TIMEOUT="${CFN_MESSAGE_TIMEOUT:-30}"            # seconds

# Performance tuning
export CFN_BATCH_SIZE="${CFN_BATCH_SIZE:-10}"
export CFN_PARALLEL_SPAWN_COUNT="${CFN_PARALLEL_SPAWN_COUNT:-50}"
export CFN_SHARD_COUNT="${CFN_SHARD_COUNT:-8}"

# Health check settings
export CFN_HEARTBEAT_INTERVAL="${CFN_HEARTBEAT_INTERVAL:-10}"      # seconds
export CFN_LIVENESS_THRESHOLD="${CFN_LIVENESS_THRESHOLD:-30}"      # seconds
export CFN_LIVENESS_CHECK_INTERVAL="${CFN_LIVENESS_CHECK_INTERVAL:-15}"  # seconds

# Metrics settings
export CFN_METRICS_ENABLED="${CFN_METRICS_ENABLED:-true}"
export CFN_METRICS_FILE="${CFN_METRICS_FILE:-/dev/shm/cfn/metrics.jsonl}"
export CFN_METRICS_ROTATION_SIZE="${CFN_METRICS_ROTATION_SIZE:-10485760}"  # 10MB

# Alerting settings
export CFN_ALERTS_FILE="${CFN_ALERTS_FILE:-/dev/shm/cfn/alerts.log}"
export CFN_ALERT_COORDINATION_TIME_MS="${CFN_ALERT_COORDINATION_TIME_MS:-10000}"
export CFN_ALERT_DELIVERY_RATE="${CFN_ALERT_DELIVERY_RATE:-0.90}"

# Resource limits
export CFN_MAX_FD="${CFN_MAX_FD:-65536}"
export CFN_TMPFS_SIZE="${CFN_TMPFS_SIZE:-1073741824}"              # 1GB

# Debugging and logging
export CFN_LOG_LEVEL="${CFN_LOG_LEVEL:-INFO}"                      # DEBUG | INFO | WARN | ERROR
export CFN_LOG_FILE="${CFN_LOG_FILE:-/dev/shm/cfn/coordination.log}"
export CFN_DEBUG_MODE="${CFN_DEBUG_MODE:-false}"
```

**Loading Configuration**:
```bash
# Load configuration in all coordination scripts
load_config() {
  local config_file="${CFN_CONFIG_FILE:-/etc/cfn/coordination-config.sh}"

  if [ -f "$config_file" ]; then
    source "$config_file"
  else
    # Use defaults (already exported above)
    :
  fi

  # Validate configuration after loading
  validate_config
}
```

#### 2. Environment Variable Overrides
**Priority Order**:
1. Environment variables (highest priority)
2. Configuration file (`coordination-config.sh`)
3. Defaults (hardcoded in scripts)

**Example Override**:
```bash
# Override max agents via environment variable
export CFN_MAX_AGENTS=200

# Load config (env var takes precedence)
bash message-bus.sh coordinate 200 agents
# Uses CFN_MAX_AGENTS=200 from environment
```

**Override Patterns**:
```bash
# Development environment: high verbosity, small scale
export CFN_LOG_LEVEL=DEBUG
export CFN_MAX_AGENTS=10
export CFN_DEBUG_MODE=true

# Production environment: optimized settings
export CFN_LOG_LEVEL=WARN
export CFN_MAX_AGENTS=500
export CFN_SHARD_COUNT=16
export CFN_PARALLEL_SPAWN_COUNT=100
```

#### 3. Configuration Validation on Startup
**File**: `src/coordination/v2/config-validation.sh`

**Validation Function**:
```bash
# validate_config - Check configuration validity and consistency
validate_config() {
  local errors=0

  # Validate CFN_COORDINATION_VERSION
  if [[ ! "$CFN_COORDINATION_VERSION" =~ ^(v1|v2)$ ]]; then
    echo "ERROR: Invalid CFN_COORDINATION_VERSION: $CFN_COORDINATION_VERSION (must be v1 or v2)" >&2
    ((errors++))
  fi

  # Validate CFN_TOPOLOGY
  if [[ ! "$CFN_TOPOLOGY" =~ ^(flat|hybrid|hierarchical)$ ]]; then
    echo "ERROR: Invalid CFN_TOPOLOGY: $CFN_TOPOLOGY (must be flat, hybrid, or hierarchical)" >&2
    ((errors++))
  fi

  # Validate CFN_MAX_AGENTS (must be positive integer)
  if ! [[ "$CFN_MAX_AGENTS" =~ ^[0-9]+$ ]] || [ "$CFN_MAX_AGENTS" -lt 1 ]; then
    echo "ERROR: Invalid CFN_MAX_AGENTS: $CFN_MAX_AGENTS (must be positive integer)" >&2
    ((errors++))
  fi

  # Validate hybrid topology settings
  if [ "$CFN_TOPOLOGY" = "hybrid" ]; then
    if ! [[ "$CFN_COORDINATORS" =~ ^[0-9]+$ ]] || [ "$CFN_COORDINATORS" -lt 1 ]; then
      echo "ERROR: Invalid CFN_COORDINATORS: $CFN_COORDINATORS (must be positive integer)" >&2
      ((errors++))
    fi

    if ! [[ "$CFN_WORKERS_PER_COORDINATOR" =~ ^[0-9]+$ ]] || [ "$CFN_WORKERS_PER_COORDINATOR" -lt 1 ]; then
      echo "ERROR: Invalid CFN_WORKERS_PER_COORDINATOR: $CFN_WORKERS_PER_COORDINATOR" >&2
      ((errors++))
    fi

    # Check that coordinators * workers matches max agents
    local expected_agents=$((CFN_COORDINATORS * CFN_WORKERS_PER_COORDINATOR))
    if [ "$expected_agents" -ne "$CFN_MAX_AGENTS" ]; then
      echo "WARN: CFN_COORDINATORS ($CFN_COORDINATORS) × CFN_WORKERS_PER_COORDINATOR ($CFN_WORKERS_PER_COORDINATOR) = $expected_agents, but CFN_MAX_AGENTS=$CFN_MAX_AGENTS" >&2
    fi
  fi

  # Validate CFN_MESSAGE_BUS_DIR is writable
  if [ ! -w "$CFN_MESSAGE_BUS_DIR" ]; then
    echo "ERROR: CFN_MESSAGE_BUS_DIR not writable: $CFN_MESSAGE_BUS_DIR" >&2
    ((errors++))
  fi

  # Validate CFN_MAX_INBOX_SIZE (must be positive)
  if ! [[ "$CFN_MAX_INBOX_SIZE" =~ ^[0-9]+$ ]] || [ "$CFN_MAX_INBOX_SIZE" -lt 1 ]; then
    echo "ERROR: Invalid CFN_MAX_INBOX_SIZE: $CFN_MAX_INBOX_SIZE" >&2
    ((errors++))
  fi

  # Validate file descriptor limit
  local current_fd_limit=$(ulimit -n)
  if [ "$current_fd_limit" -lt "$CFN_MAX_FD" ]; then
    echo "WARN: Current FD limit ($current_fd_limit) < CFN_MAX_FD ($CFN_MAX_FD). May hit limits with large swarms." >&2
  fi

  # Validate tmpfs size
  local shm_size=$(df -B1 /dev/shm | tail -1 | awk '{print $2}')
  if [ "$shm_size" -lt "$CFN_TMPFS_SIZE" ]; then
    echo "WARN: /dev/shm size ($shm_size bytes) < CFN_TMPFS_SIZE ($CFN_TMPFS_SIZE bytes). May run out of space." >&2
  fi

  # Exit if critical errors found
  if [ "$errors" -gt 0 ]; then
    echo "Configuration validation failed with $errors errors. Fix configuration and retry." >&2
    return 1
  fi

  echo "Configuration validation passed."
  return 0
}
```

**Validation Integration**:
```bash
# message-bus.sh startup
load_config || exit 1  # Exit if config validation fails
```

#### 4. Documentation for All Config Options
**File**: `docs/configuration.md`

**Documentation Structure**:
```markdown
# CLI Coordination V2 - Configuration Reference

## Core Settings

### CFN_COORDINATION_VERSION
- **Type**: string (v1 | v2)
- **Default**: v1
- **Description**: Coordination system version. Set to v2 to use new CLI-based coordination.
- **Example**: `export CFN_COORDINATION_VERSION=v2`

### CFN_TOPOLOGY
- **Type**: string (flat | hybrid | hierarchical)
- **Default**: flat
- **Description**: Coordination topology.
  - `flat`: All agents coordinate directly (best for <100 agents)
  - `hybrid`: Coordinator-worker teams (best for 100-500 agents)
  - `hierarchical`: Multi-level hierarchy (future, for 500+ agents)
- **Example**: `export CFN_TOPOLOGY=hybrid`

### CFN_MAX_AGENTS
- **Type**: integer (1-708)
- **Default**: 100
- **Description**: Maximum number of agents in coordination swarm.
- **Example**: `export CFN_MAX_AGENTS=300`

[... continue for all config options ...]

## Environment-Specific Configurations

### Development
```bash
export CFN_LOG_LEVEL=DEBUG
export CFN_MAX_AGENTS=10
export CFN_DEBUG_MODE=true
```

### Staging
```bash
export CFN_LOG_LEVEL=INFO
export CFN_MAX_AGENTS=100
export CFN_METRICS_ENABLED=true
```

### Production
```bash
export CFN_LOG_LEVEL=WARN
export CFN_MAX_AGENTS=500
export CFN_SHARD_COUNT=16
export CFN_PARALLEL_SPAWN_COUNT=100
```
```

### Agent Team (4 Agents)

**Swarm Initialization**:
```javascript
mcp__claude-flow-novice__swarm_init({
  topology: "mesh",
  maxAgents: 4,
  strategy: "balanced"
})
```

**Agent Assignments**:

1. **coder**: Implement configuration system
   - Create coordination-config.sh with all settings
   - Implement load_config() function
   - Add configuration validation logic
   - MANDATORY: Run post-edit hook after EVERY file edit

2. **api-docs**: Document configuration options
   - Create comprehensive docs/configuration.md
   - Document all config variables with types, defaults, examples
   - Provide environment-specific configuration examples
   - Create configuration troubleshooting guide

3. **tester**: Test configuration edge cases
   - Test invalid configuration values (negative numbers, wrong types)
   - Verify validation catches configuration errors
   - Test environment variable overrides
   - Validate default configurations work

4. **reviewer**: Validate configuration loading
   - Review coordination-config.sh implementation
   - Validate config validation logic
   - Test configuration loading in all coordination scripts
   - Verify no configuration-related crashes

### Implementation Details

#### Bash Function Signatures

```bash
# config-validation.sh functions
load_config
validate_config
get_config_value <key>
set_config_value <key> <value>
print_config_summary
```

#### File Structure
```
src/coordination/v2/
├── coordination-config.sh       # Main configuration file
├── config-validation.sh         # Validation logic
└── message-bus.sh               # Loads config on startup

/etc/cfn/
└── coordination-config.sh       # System-wide config (optional)

docs/
└── configuration.md             # Configuration documentation
```

#### Message Bus Integration Points

**Startup Sequence**:
```bash
# message-bus.sh startup
#!/bin/bash
set -euo pipefail

# Load configuration
source "$(dirname "$0")/coordination-config.sh"
source "$(dirname "$0")/config-validation.sh"

load_config || {
  echo "Configuration loading failed. Exiting." >&2
  exit 1
}

# Proceed with coordination
echo "Configuration loaded successfully. Starting coordination..."
```

#### Performance Requirements

**Configuration Loading Time**:
- Target: <100ms to load and validate configuration
- Measurement: Time from script start to "Configuration loaded" message

**Validation Coverage**:
- All critical configuration options validated
- Invalid configurations rejected with clear error messages
- Default configurations work out-of-box for 100-agent swarm

### Validation Checkpoints

**Checkpoint 1: Configuration Loading**
```bash
# Test configuration loading
source coordination-config.sh
load_config

echo "CFN_TOPOLOGY: $CFN_TOPOLOGY (expected: flat)"
echo "CFN_MAX_AGENTS: $CFN_MAX_AGENTS (expected: 100)"
```

**Checkpoint 2: Environment Variable Override**
```bash
# Override via environment variable
export CFN_MAX_AGENTS=200

source coordination-config.sh
load_config

echo "CFN_MAX_AGENTS: $CFN_MAX_AGENTS (expected: 200)"
```

**Checkpoint 3: Invalid Configuration Detection**
```bash
# Test invalid topology
export CFN_TOPOLOGY=invalid

source coordination-config.sh
load_config
# Expected: ERROR message and exit code 1
```

**Checkpoint 4: Validation Logic**
```bash
# Test hybrid topology validation
export CFN_TOPOLOGY=hybrid
export CFN_COORDINATORS=7
export CFN_WORKERS_PER_COORDINATOR=43
export CFN_MAX_AGENTS=301  # Mismatch: 7×43=301, but this matches

source coordination-config.sh
load_config
# Expected: Validation passes (301 = 7×43)

export CFN_MAX_AGENTS=300  # Mismatch: 7×43=301, but set to 300
load_config
# Expected: WARNING about mismatch
```

### Decision Gate

**Success Criteria** (ALL must pass):
- ✅ All configuration options documented
- ✅ Invalid configurations detected on startup
- ✅ Defaults work for 100-agent swarm
- ✅ Environment variable overrides work correctly

**Decision Outcomes**:
- **PROCEED**: All criteria met → Proceed to Sprint 1.4 (Graceful Shutdown)
- **PIVOT**: Documentation incomplete → Extend documentation, re-review
- **BLOCK**: Validation logic broken → Fix validation, re-test

---

## Sprint 1.4: Graceful Shutdown (1 Week)

### Objective
Implement graceful shutdown mechanism ensuring all messages are processed, resources are cleaned up, and agents terminate without orphaned processes or files.

### Deliverables

#### 1. Shutdown Hook
**File**: `src/coordination/v2/shutdown.sh`

**Core Function**:
```bash
# shutdown_agent - Gracefully shut down agent
# 1. Stop accepting new messages
# 2. Drain inbox (process remaining messages)
# 3. Clean up resources
# 4. Exit
shutdown_agent() {
  local agent_id="${AGENT_ID:-unknown}"
  local shutdown_reason="${1:-normal}"

  echo "[$agent_id] Initiating graceful shutdown: $shutdown_reason"

  # 1. Mark agent as shutting down
  report_health unhealthy "Shutting down: $shutdown_reason"
  echo "shutting_down" > "/dev/shm/cfn/agents/$agent_id/state"

  # 2. Drain inbox
  echo "[$agent_id] Draining inbox..."
  drain_inbox

  # 3. Clean up resources
  echo "[$agent_id] Cleaning up resources..."
  cleanup_resources

  # 4. Report shutdown complete
  emit_metric counter agent_shutdowns 1 "agent=$agent_id,reason=$shutdown_reason"
  echo "[$agent_id] Shutdown complete."

  exit 0
}
```

#### 2. Inbox Draining Logic
**Implementation**:
```bash
# drain_inbox - Process all remaining messages in inbox
drain_inbox() {
  local agent_id="${AGENT_ID:-unknown}"
  local inbox_dir="/dev/shm/cfn/agents/$agent_id/inbox"
  local drain_timeout="${CFN_DRAIN_TIMEOUT:-30}"  # 30s max drain time
  local drain_start=$(date +%s)

  if [ ! -d "$inbox_dir" ]; then
    return 0  # No inbox to drain
  fi

  local remaining_messages=$(find "$inbox_dir" -type f | wc -l)
  echo "[$agent_id] Draining $remaining_messages messages (timeout: ${drain_timeout}s)"

  while [ "$remaining_messages" -gt 0 ]; do
    # Check timeout
    local now=$(date +%s)
    local elapsed=$((now - drain_start))
    if [ "$elapsed" -gt "$drain_timeout" ]; then
      echo "[$agent_id] Drain timeout reached. $remaining_messages messages remaining." >&2
      emit_metric counter inbox_drain_timeouts 1 "agent=$agent_id,remaining=$remaining_messages"
      break
    fi

    # Process one message
    local message_file=$(find "$inbox_dir" -type f | head -1)
    if [ -n "$message_file" ]; then
      local message=$(cat "$message_file")
      rm "$message_file"

      # Process message
      process_message "$message" || {
        echo "[$agent_id] Failed to process message during drain: $message" >&2
      }
    fi

    # Update remaining count
    remaining_messages=$(find "$inbox_dir" -type f | wc -l)
  done

  echo "[$agent_id] Inbox drained. $remaining_messages messages remaining."
  emit_metric gauge inbox_drain_remaining $remaining_messages "agent=$agent_id"
}
```

#### 3. Cleanup on Exit
**Resource Cleanup Function**:
```bash
# cleanup_resources - Clean up all agent resources
cleanup_resources() {
  local agent_id="${AGENT_ID:-unknown}"

  # Stop heartbeat loop
  stop_heartbeat_loop

  # Remove agent files
  local agent_dir="/dev/shm/cfn/agents/$agent_id"
  if [ -d "$agent_dir" ]; then
    rm -rf "$agent_dir"
  fi

  # Close file descriptors (if any open)
  # (Bash automatically closes FDs on exit, but explicit close for clarity)

  # Clear environment variables (optional)
  unset AGENT_ID

  echo "[$agent_id] Resources cleaned up."
}
```

#### 4. Signal Handler Integration
**File**: `src/coordination/v2/agent-wrapper.sh`

**Signal Handler Setup**:
```bash
# setup_signal_handlers - Trap signals for graceful shutdown
setup_signal_handlers() {
  trap 'shutdown_agent "SIGTERM"' SIGTERM
  trap 'shutdown_agent "SIGINT"' SIGINT
  trap 'shutdown_agent "EXIT"' EXIT
}

# Agent wrapper main
main() {
  export AGENT_ID="worker-$RANDOM"
  mkdir -p "/dev/shm/cfn/agents/$AGENT_ID/inbox"

  # Setup signal handlers
  setup_signal_handlers

  # Start agent
  report_health healthy "Agent started"
  start_heartbeat_loop

  # Main message processing loop
  while true; do
    # Check for shutdown signal
    local state=$(cat "/dev/shm/cfn/agents/$AGENT_ID/state" 2>/dev/null || echo "running")
    if [ "$state" = "shutting_down" ]; then
      break  # Exit loop, shutdown_agent will be called via trap
    fi

    # Process messages
    poll_inbox
    sleep 1
  done
}

main "$@"
```

**Signal Handler Testing**:
```bash
# Test SIGTERM handling
bash agent-wrapper.sh &
AGENT_PID=$!

sleep 5  # Let agent initialize

kill -TERM $AGENT_PID  # Send SIGTERM

wait $AGENT_PID
echo "Agent exited with code $?"

# Verify cleanup
ls /dev/shm/cfn/agents/  # Should not contain test agent directory
```

### Agent Team (4 Agents)

**Swarm Initialization**:
```javascript
mcp__claude-flow-novice__swarm_init({
  topology: "mesh",
  maxAgents: 4,
  strategy: "balanced"
})
```

**Agent Assignments**:

1. **backend-dev**: Implement shutdown hooks
   - Create shutdown_agent() function in shutdown.sh
   - Implement inbox draining logic
   - Add cleanup_resources() function
   - MANDATORY: Run post-edit hook after EVERY file edit

2. **coder**: Signal handler integration
   - Add setup_signal_handlers() to agent-wrapper.sh
   - Integrate shutdown hooks with signal traps
   - Test signal handling (SIGTERM, SIGINT, EXIT)
   - Verify graceful shutdown on all signal types

3. **tester**: Test shutdown scenarios
   - Test normal shutdown (no messages in inbox)
   - Test shutdown with pending messages (verify drain)
   - Test shutdown timeout (inbox drain timeout)
   - Test signal handling (kill -TERM, Ctrl+C)

4. **reviewer**: Validate resource cleanup
   - Review shutdown.sh implementation
   - Verify no orphaned processes after shutdown
   - Verify no orphaned files in /dev/shm/cfn/
   - Test shutdown under load (100 agents)

### Implementation Details

#### Bash Function Signatures

```bash
# shutdown.sh functions
shutdown_agent [reason]
drain_inbox
cleanup_resources
is_shutting_down

# agent-wrapper.sh functions
setup_signal_handlers
graceful_exit
```

#### File Structure in `/dev/shm/cfn/`
```
/dev/shm/cfn/agents/{agent_id}/
├── state                  # Agent state: running | shutting_down
├── inbox/                 # Messages to drain before shutdown
└── shutdown.lock          # Shutdown in progress marker
```

#### Message Bus Integration Points

**Shutdown Sequence**:
```bash
# 1. Receive shutdown signal (SIGTERM, SIGINT, or explicit call)
# 2. Set state to shutting_down
echo "shutting_down" > "/dev/shm/cfn/agents/$AGENT_ID/state"

# 3. Drain inbox (process remaining messages)
drain_inbox

# 4. Clean up resources
cleanup_resources

# 5. Exit
exit 0
```

**Coordinator Shutdown**:
```bash
# Coordinator shutdown logic
shutdown_coordinator() {
  # 1. Send shutdown signal to all workers
  for worker_id in $(ls /dev/shm/cfn/agents/); do
    send_message "$worker_id" "SHUTDOWN"
  done

  # 2. Wait for workers to complete (max 60s)
  local shutdown_start=$(date +%s)
  while [ "$(ls /dev/shm/cfn/agents/ | wc -l)" -gt 1 ]; do  # >1 because coordinator still alive
    sleep 1

    local now=$(date +%s)
    if [ $((now - shutdown_start)) -gt 60 ]; then
      echo "Coordinator shutdown timeout. Force killing remaining workers." >&2
      break
    fi
  done

  # 3. Shutdown coordinator
  shutdown_agent "coordinator_shutdown"
}
```

#### Performance Requirements

**Shutdown Time**:
- Target: <5s for 100 agents
- Measurement: Time from shutdown signal to process exit
- Constraint: All messages must be processed (no message loss)

**Resource Cleanup**:
- Target: Zero orphaned processes
- Target: Zero orphaned files in /dev/shm/cfn/
- Verification: Check process list and filesystem after shutdown

### Validation Checkpoints

**Checkpoint 1: Normal Shutdown**
```bash
# Start agent
bash agent-wrapper.sh &
AGENT_PID=$!

# Wait for initialization
sleep 2

# Graceful shutdown
shutdown_agent normal

# Verify exit code
wait $AGENT_PID
echo "Exit code: $? (expected: 0)"

# Verify cleanup
ls /dev/shm/cfn/agents/  # Should be empty
```

**Checkpoint 2: Shutdown with Pending Messages**
```bash
# Start agent
export AGENT_ID="test-agent-drain"
bash agent-wrapper.sh &
AGENT_PID=$!

# Add messages to inbox
mkdir -p "/dev/shm/cfn/agents/$AGENT_ID/inbox"
for i in {1..10}; do
  echo "MESSAGE_$i" > "/dev/shm/cfn/agents/$AGENT_ID/inbox/msg_$i"
done

# Shutdown (should drain all 10 messages)
shutdown_agent normal

# Verify inbox drained
remaining=$(find "/dev/shm/cfn/agents/$AGENT_ID/inbox" -type f 2>/dev/null | wc -l)
echo "Remaining messages: $remaining (expected: 0)"
```

**Checkpoint 3: Signal Handling**
```bash
# Start agent
bash agent-wrapper.sh &
AGENT_PID=$!

sleep 2

# Send SIGTERM
kill -TERM $AGENT_PID

# Wait for graceful shutdown
wait $AGENT_PID
echo "Shutdown via SIGTERM successful"

# Verify cleanup
ps aux | grep agent-wrapper  # Should not be running
ls /dev/shm/cfn/agents/  # Should be empty
```

**Checkpoint 4: 100-Agent Shutdown**
```bash
# Start 100 agents
bash message-bus.sh coordinate 100 agents &
COORD_PID=$!

# Wait for coordination to start
sleep 5

# Send shutdown signal
kill -TERM $COORD_PID

# Measure shutdown time
time wait $COORD_PID
# Expected: <5s

# Verify all agents cleaned up
agent_count=$(ls /dev/shm/cfn/agents/ 2>/dev/null | wc -l)
echo "Remaining agents: $agent_count (expected: 0)"
```

### Decision Gate

**Success Criteria** (ALL must pass):
- ✅ All messages processed before shutdown (inbox drained)
- ✅ No orphaned processes or files after shutdown
- ✅ Shutdown time <5s for 100 agents
- ✅ Signal handlers work (SIGTERM, SIGINT)

**Decision Outcomes**:
- **PROCEED**: All criteria met → Proceed to Sprint 1.5 (Rate Limiting)
- **PIVOT**: Shutdown timeout too long → Reduce drain timeout or optimize message processing
- **BLOCK**: Resource leaks detected → Fix cleanup logic, re-validate

---

## Sprint 1.5: Rate Limiting & Backpressure (1-2 Weeks)

### Objective
Implement rate limiting and backpressure mechanism to prevent inbox overflow and maintain system stability under high message load.

### Deliverables

#### 1. Inbox Size Limits (MAX_INBOX_SIZE)
**Configuration**: `coordination-config.sh`

```bash
export CFN_MAX_INBOX_SIZE="${CFN_MAX_INBOX_SIZE:-1000}"
```

**Enforcement**:
```bash
# check_inbox_capacity - Verify inbox has capacity for new message
check_inbox_capacity() {
  local recipient="$1"
  local inbox_dir="/dev/shm/cfn/agents/$recipient/inbox"

  if [ ! -d "$inbox_dir" ]; then
    return 0  # Inbox doesn't exist yet, assume capacity
  fi

  local inbox_depth=$(find "$inbox_dir" -type f | wc -l)

  if [ "$inbox_depth" -ge "$CFN_MAX_INBOX_SIZE" ]; then
    return 1  # Inbox at capacity
  fi

  return 0  # Inbox has capacity
}
```

#### 2. Backpressure Mechanism (Sender Waits if Full)
**File**: `src/coordination/v2/backpressure.sh`

**Send with Backpressure**:
```bash
# send_message_with_limit - Send message with backpressure support
# Blocks sender if recipient inbox is full
send_message_with_limit() {
  local recipient="$1"
  local message="$2"
  local max_wait="${CFN_BACKPRESSURE_TIMEOUT:-30}"  # 30s max wait
  local wait_start=$(date +%s)

  while true; do
    # Check inbox capacity
    if check_inbox_capacity "$recipient"; then
      # Inbox has capacity, send message
      send_message "$recipient" "$message"
      return 0
    fi

    # Inbox full, apply backpressure
    local now=$(date +%s)
    local elapsed=$((now - wait_start))

    if [ "$elapsed" -ge "$max_wait" ]; then
      # Timeout reached, fail send
      echo "ERROR: Backpressure timeout sending to $recipient (inbox full for ${max_wait}s)" >&2
      emit_metric counter backpressure_timeouts 1 "recipient=$recipient"
      return 1
    fi

    # Wait and retry
    emit_metric counter backpressure_waits 1 "recipient=$recipient"
    sleep 0.1  # 100ms backoff
  done
}

# send_message - Core message send (no backpressure)
send_message() {
  local recipient="$1"
  local message="$2"
  local inbox_dir="/dev/shm/cfn/agents/$recipient/inbox"

  mkdir -p "$inbox_dir"

  local message_id="msg_$(date +%s%N)"
  echo "$message" > "$inbox_dir/$message_id"

  emit_metric counter messages_sent 1 "to=$recipient"
}
```

**Backpressure Strategy**:
- Sender blocks if recipient inbox ≥ MAX_INBOX_SIZE
- Exponential backoff: 100ms → 200ms → 400ms (optional enhancement)
- Timeout after 30s (configurable via CFN_BACKPRESSURE_TIMEOUT)
- Emit metrics for backpressure events

#### 3. Overflow Detection and Alerting
**Integration**: `backpressure.sh` and `alerting.sh`

**Overflow Detection**:
```bash
# detect_inbox_overflow - Monitor all inboxes for overflow
detect_inbox_overflow() {
  for agent_dir in /dev/shm/cfn/agents/*/; do
    local agent_id=$(basename "$agent_dir")
    local inbox_dir="$agent_dir/inbox"

    if [ ! -d "$inbox_dir" ]; then
      continue
    fi

    local inbox_depth=$(find "$inbox_dir" -type f | wc -l)

    # Alert on high inbox depth (>80% of max)
    local warning_threshold=$((CFN_MAX_INBOX_SIZE * 80 / 100))
    if [ "$inbox_depth" -ge "$warning_threshold" ]; then
      emit_alert "inbox_high" "Agent $agent_id inbox depth: $inbox_depth (threshold: $warning_threshold)"
    fi

    # Alert on overflow (≥max)
    if [ "$inbox_depth" -ge "$CFN_MAX_INBOX_SIZE" ]; then
      emit_alert "inbox_overflow" "Agent $agent_id inbox overflow: $inbox_depth (max: $CFN_MAX_INBOX_SIZE)"
    fi
  done
}
```

**Periodic Overflow Monitoring**:
```bash
# monitor_inbox_overflow - Background monitoring loop
monitor_inbox_overflow() {
  local check_interval="${CFN_OVERFLOW_CHECK_INTERVAL:-10}"  # 10s

  while true; do
    detect_inbox_overflow
    sleep "$check_interval"
  done
}
```

#### 4. Dynamic Rate Limiting Based on System Load
**File**: `src/coordination/v2/rate-limiting.sh`

**Adaptive Rate Limiting**:
```bash
# get_adaptive_send_delay - Calculate send delay based on system load
get_adaptive_send_delay() {
  local base_delay="${CFN_BASE_SEND_DELAY:-0}"  # No delay by default

  # Get system load average (1-minute)
  local load_avg=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | tr -d ',')
  local cpu_count=$(nproc)

  # Calculate load percentage
  local load_pct=$(echo "scale=2; $load_avg / $cpu_count * 100" | bc)

  # Increase delay if load high
  if (( $(echo "$load_pct > 80" | bc -l) )); then
    # High load: 10ms delay
    echo "10"
  elif (( $(echo "$load_pct > 60" | bc -l) )); then
    # Medium load: 5ms delay
    echo "5"
  else
    # Low load: no delay
    echo "$base_delay"
  fi
}

# send_message_rate_limited - Send message with adaptive rate limiting
send_message_rate_limited() {
  local recipient="$1"
  local message="$2"

  # Get adaptive delay
  local delay_ms=$(get_adaptive_send_delay)

  # Apply delay if needed
  if [ "$delay_ms" -gt 0 ]; then
    sleep "$(echo "scale=3; $delay_ms / 1000" | bc)"
    emit_metric counter rate_limit_delays 1 "delay_ms=$delay_ms"
  fi

  # Send message with backpressure
  send_message_with_limit "$recipient" "$message"
}
```

**Load-Based Send Strategy**:
- Monitor system load average (1-minute)
- Low load (<60%): No send delay
- Medium load (60-80%): 5ms send delay
- High load (>80%): 10ms send delay
- Prevents system saturation under heavy coordination

### Agent Team (5 Agents)

**Swarm Initialization**:
```javascript
mcp__claude-flow-novice__swarm_init({
  topology: "mesh",
  maxAgents: 5,
  strategy: "balanced"
})
```

**Agent Assignments**:

1. **backend-dev**: Implement rate limiting
   - Create send_message_with_limit() in backpressure.sh
   - Implement check_inbox_capacity() logic
   - Add backpressure timeout handling
   - MANDATORY: Run post-edit hook after EVERY file edit

2. **perf-analyzer**: Tune rate limit thresholds
   - Benchmark backpressure performance
   - Determine optimal MAX_INBOX_SIZE (1000 default)
   - Test adaptive rate limiting under varying loads
   - Measure backpressure impact on coordination time

3. **system-architect**: Design backpressure mechanism
   - Design sender blocking vs. dropping strategy
   - Specify backpressure timeout values
   - Design adaptive rate limiting algorithm
   - Document backpressure behavior

4. **tester**: Test overflow scenarios
   - Simulate inbox overflow (flood single agent)
   - Verify backpressure prevents overflow
   - Test backpressure timeout
   - Validate no deadlocks from backpressure

5. **reviewer**: Validate rate limiting logic
   - Review backpressure.sh implementation
   - Validate rate limiting doesn't cause deadlocks
   - Test end-to-end message flow with rate limiting
   - Verify no coordination time regression

### Implementation Details

#### Bash Function Signatures

```bash
# backpressure.sh functions
send_message_with_limit <recipient> <message>
check_inbox_capacity <recipient>
detect_inbox_overflow
monitor_inbox_overflow

# rate-limiting.sh functions
get_adaptive_send_delay
send_message_rate_limited <recipient> <message>
calculate_system_load
```

#### File Structure in `/dev/shm/cfn/`
```
/dev/shm/cfn/agents/{agent_id}/inbox/
├── msg_1728234567123456789   # Message file (timestamped ID)
├── msg_1728234567234567890
└── ...                        # Up to CFN_MAX_INBOX_SIZE messages
```

#### Message Bus Integration Points

**Replace Direct Sends**:
```bash
# OLD: Direct send (no backpressure)
send_message "$recipient" "$message"

# NEW: Send with backpressure
send_message_with_limit "$recipient" "$message"

# NEW: Send with rate limiting (adaptive)
send_message_rate_limited "$recipient" "$message"
```

**Coordinator Broadcast**:
```bash
# Broadcast to all workers with rate limiting
broadcast_to_workers() {
  local message="$1"

  for worker_id in $(ls /dev/shm/cfn/agents/); do
    send_message_rate_limited "$worker_id" "$message" || {
      echo "WARN: Failed to send to $worker_id (backpressure timeout)" >&2
    }
  done
}
```

#### Performance Requirements

**Backpressure Overhead**:
- Target: <5% coordination time increase
- Measurement: Compare coordination time with/without backpressure
- Optimization: Short wait intervals (100ms), fast capacity checks

**Overflow Prevention**:
- Target: Inbox depth <1000 messages (configurable)
- Measurement: Monitor inbox_depth gauge metric
- Enforcement: Backpressure blocks sender if inbox ≥ MAX_INBOX_SIZE

### Validation Checkpoints

**Checkpoint 1: Inbox Capacity Check**
```bash
# Create agent inbox
export AGENT_ID="test-agent-capacity"
mkdir -p "/dev/shm/cfn/agents/$AGENT_ID/inbox"

# Fill inbox to max
for i in $(seq 1 $CFN_MAX_INBOX_SIZE); do
  echo "MESSAGE_$i" > "/dev/shm/cfn/agents/$AGENT_ID/inbox/msg_$i"
done

# Check capacity (should fail)
check_inbox_capacity "$AGENT_ID"
echo "Capacity check result: $? (expected: 1 = no capacity)"
```

**Checkpoint 2: Backpressure Blocking**
```bash
# Start agent with slow message processing
export AGENT_ID="test-agent-slow"
bash agent-wrapper.sh &  # Processes messages slowly

# Fill inbox to max
for i in $(seq 1 $CFN_MAX_INBOX_SIZE); do
  send_message "$AGENT_ID" "MESSAGE_$i"
done

# Try to send with backpressure (should block until space available)
time send_message_with_limit "$AGENT_ID" "OVERFLOW_MESSAGE"
# Expected: Blocks until inbox space available OR timeout
```

**Checkpoint 3: Overflow Detection**
```bash
# Create overflowed inbox
export AGENT_ID="test-agent-overflow"
mkdir -p "/dev/shm/cfn/agents/$AGENT_ID/inbox"
for i in $(seq 1 1100); do  # Exceed max
  echo "MESSAGE_$i" > "/dev/shm/cfn/agents/$AGENT_ID/inbox/msg_$i"
done

# Run overflow detection
detect_inbox_overflow

# Verify alert emitted
grep "inbox_overflow.*$AGENT_ID" /dev/shm/cfn/alerts.log
```

**Checkpoint 4: No Deadlocks**
```bash
# Test scenario: A sends to B, B sends to A (circular)
# Both inboxes at capacity
export AGENT_A="agent-a"
export AGENT_B="agent-b"

# Fill both inboxes to max
mkdir -p "/dev/shm/cfn/agents/$AGENT_A/inbox"
mkdir -p "/dev/shm/cfn/agents/$AGENT_B/inbox"
for i in $(seq 1 $CFN_MAX_INBOX_SIZE); do
  echo "MESSAGE_$i" > "/dev/shm/cfn/agents/$AGENT_A/inbox/msg_$i"
  echo "MESSAGE_$i" > "/dev/shm/cfn/agents/$AGENT_B/inbox/msg_$i"
done

# Try to send A→B and B→A with backpressure
send_message_with_limit "$AGENT_B" "A_TO_B" &
send_message_with_limit "$AGENT_A" "B_TO_A" &

# Wait for both (should timeout, not deadlock)
wait
echo "Both sends completed (timeout expected, not deadlock)"
```

### Decision Gate

**Success Criteria** (ALL must pass):
- ✅ Inbox overflow prevented (depth <1000 messages)
- ✅ Backpressure maintains stability under load
- ✅ No deadlocks from rate limiting
- ✅ Backpressure overhead <5% coordination time

**Decision Outcomes**:
- **PROCEED**: All criteria met → Proceed to Phase 1 Decision Gate
- **PIVOT**: Deadlocks detected → Adjust backpressure strategy (timeout, dropping)
- **BLOCK**: Overflow not prevented → Fix capacity checks, re-validate

---

## Phase 1 Decision Gate

### Success Criteria (ALL Must Pass)

**Functional Requirements**:
- ✅ 100-agent swarm: ≥95% delivery rate
- ✅ Coordination time: <5s
- ✅ All messages processed before shutdown
- ✅ No orphaned processes or files after shutdown

**Observability Requirements**:
- ✅ Metrics accurate and low-overhead (<1%)
- ✅ Health checks reliable (false positive <1%)
- ✅ Alerting detects threshold violations

**Stability Requirements**:
- ✅ Graceful shutdown working (inbox drained)
- ✅ Rate limiting prevents overflow (inbox <1000)
- ✅ No deadlocks or resource leaks

**Configuration Requirements**:
- ✅ All configuration options documented
- ✅ Invalid configurations detected on startup
- ✅ Defaults work for 100-agent swarm

### Decision Outcomes

#### GO Decision
**Criteria**: ALL success criteria met

**Actions**:
1. Tag Phase 1 completion in git
2. Generate Phase 1 completion report
3. IMMEDIATELY proceed to Phase 2 (Testing & Validation)
4. NO approval needed - autonomous transition

**Next Phase**: Phase 2 Sprint 2.1 (Unit Testing)

#### PIVOT Decision
**Criteria**: 1-2 criteria not met, but fixable

**Common Pivot Scenarios**:
- Coordination time 6-8s (above 5s target) → Optimize message sending, reduce overhead
- Delivery rate 92-94% (below 95% target) → Debug message loss, improve reliability
- Health check false positive 2-3% → Adjust liveness thresholds
- Rate limiting overhead 6-8% → Optimize backpressure checks

**Actions**:
1. Product Owner GOAP decision: PROCEED with targeted fixes
2. Spawn Loop 3 swarm with specialists (perf-analyzer, backend-dev)
3. Fix specific issues, re-validate Phase 1 gate
4. NO approval needed - autonomous retry

#### NO-GO Decision
**Criteria**: 3+ criteria not met OR critical stability issues

**Escalation Actions**:
1. Generate diagnostic report with root cause analysis
2. Suggest alternative approaches (pivot options)
3. Human decision required for epic re-evaluation
4. ONLY stop if explicit human halt request

**Pivot Options**:
- Extend Phase 1 timeline (+1-2 weeks for stabilization)
- Reduce agent count targets (100 → 50 agents for Phase 1)
- Simplify architecture (defer rate limiting to Phase 3)
- Re-evaluate epic scope (focus on smaller scale first)

### Validation Procedure

**Phase 1 Gate Validation Script**:
```bash
#!/bin/bash
# validate-phase-1.sh - Phase 1 decision gate validation

echo "=== Phase 1 Decision Gate Validation ==="

# Test 1: 100-agent coordination
echo "Test 1: 100-agent swarm..."
bash message-bus.sh coordinate 100 agents > /tmp/phase1-test.log 2>&1

# Extract metrics
delivery_rate=$(grep '"name":"delivery_rate"' /dev/shm/cfn/metrics.jsonl | tail -1 | jq '.value')
coordination_time=$(grep '"name":"coordination_time_ms"' /dev/shm/cfn/metrics.jsonl | tail -1 | jq '.value')

echo "  Delivery rate: $delivery_rate (target: ≥0.95)"
echo "  Coordination time: ${coordination_time}ms (target: <5000ms)"

# Test 2: Metrics overhead
echo "Test 2: Metrics overhead..."
export CFN_METRICS_ENABLED=false
time_no_metrics=$(bash message-bus.sh coordinate 50 agents 2>&1 | grep "real" | awk '{print $2}')

export CFN_METRICS_ENABLED=true
time_with_metrics=$(bash message-bus.sh coordinate 50 agents 2>&1 | grep "real" | awk '{print $2}')

overhead_pct=$(echo "scale=2; ($time_with_metrics - $time_no_metrics) / $time_no_metrics * 100" | bc)
echo "  Metrics overhead: ${overhead_pct}% (target: <1%)"

# Test 3: Health check false positive rate
echo "Test 3: Health check false positive rate..."
bash monitor_agent_liveness &
MONITOR_PID=$!

sleep 60  # Monitor for 1 minute

kill $MONITOR_PID
false_positives=$(grep "agent_stale\|agent_dead" /dev/shm/cfn/alerts.log | wc -l)
echo "  False positives: $false_positives (target: <1)"

# Test 4: Graceful shutdown
echo "Test 4: Graceful shutdown..."
bash message-bus.sh coordinate 100 agents &
COORD_PID=$!

sleep 5
kill -TERM $COORD_PID

time wait $COORD_PID
shutdown_time=$(echo "...")  # Extract from time output

orphaned_agents=$(ls /dev/shm/cfn/agents/ 2>/dev/null | wc -l)
echo "  Shutdown time: ${shutdown_time}s (target: <5s)"
echo "  Orphaned agents: $orphaned_agents (target: 0)"

# Test 5: Rate limiting
echo "Test 5: Rate limiting overflow prevention..."
# Flood single agent
export AGENT_ID="test-agent-flood"
for i in $(seq 1 2000); do
  send_message_rate_limited "$AGENT_ID" "MESSAGE_$i" &
done
wait

max_inbox=$(find "/dev/shm/cfn/agents/$AGENT_ID/inbox" -type f | wc -l)
echo "  Max inbox depth: $max_inbox (target: <1000)"

# Summary
echo ""
echo "=== Phase 1 Gate Summary ==="
echo "Delivery rate: $delivery_rate (✅ ≥0.95 | ❌ <0.95)"
echo "Coordination time: ${coordination_time}ms (✅ <5000 | ❌ ≥5000)"
echo "Metrics overhead: ${overhead_pct}% (✅ <1 | ❌ ≥1)"
echo "False positives: $false_positives (✅ <1 | ❌ ≥1)"
echo "Shutdown time: ${shutdown_time}s (✅ <5 | ❌ ≥5)"
echo "Orphaned agents: $orphaned_agents (✅ 0 | ❌ >0)"
echo "Max inbox: $max_inbox (✅ <1000 | ❌ ≥1000)"

# Decision
# ... (implement decision logic based on criteria)
```

---

## Technical Implementation Details

### Performance Requirements Summary

| Metric | Target | Validation Method |
|--------|--------|-------------------|
| Coordination time (100 agents) | <5s | Histogram metric, p95 |
| Delivery rate | ≥95% | Gauge metric, last value |
| Metrics overhead | <1% | Compare with/without metrics |
| Health check false positive | <1% | Alert count / agent count |
| Shutdown time | <5s | Time measurement |
| Inbox overflow prevention | <1000 messages | Gauge metric, max value |
| Backpressure overhead | <5% | Compare with/without backpressure |

### File Structure Overview

```
src/coordination/v2/
├── coordination-config.sh       # Configuration file
├── config-validation.sh         # Configuration validation
├── metrics.sh                   # Metrics emission framework
├── alerting.sh                  # Alerting thresholds
├── health.sh                    # Health check system
├── liveness.sh                  # Liveness tracking
├── health-api.sh                # Health status queries
├── shutdown.sh                  # Graceful shutdown hooks
├── backpressure.sh              # Rate limiting & backpressure
├── rate-limiting.sh             # Adaptive rate limiting
├── message-bus.sh               # Core message bus (integrates all)
└── agent-wrapper.sh             # Agent execution wrapper

/dev/shm/cfn/
├── metrics.jsonl                # Metrics data
├── alerts.log                   # Alert history
├── coordination.log             # Coordination events log
└── agents/
    └── {agent_id}/
        ├── inbox/               # Message queue
        ├── health               # Health status
        ├── heartbeat            # Liveness heartbeat
        ├── state                # Agent state
        └── heartbeat.pid        # Heartbeat loop PID

docs/
└── configuration.md             # Configuration documentation
```

### Integration Testing Strategy

**Test Scenarios**:
1. Normal operation (100 agents, no errors)
2. Agent failures (kill random agents, verify detection)
3. High message load (flood coordinator, verify backpressure)
4. Graceful shutdown (SIGTERM, verify cleanup)
5. Configuration errors (invalid values, verify rejection)
6. Resource exhaustion (fill tmpfs, verify graceful degradation)

**Test Automation**:
```bash
# Phase 1 integration test suite
bash tests/integration/phase1-foundation.test.sh

# Individual sprint tests
bash tests/integration/sprint-1.1-metrics.test.sh
bash tests/integration/sprint-1.2-health.test.sh
bash tests/integration/sprint-1.3-config.test.sh
bash tests/integration/sprint-1.4-shutdown.test.sh
bash tests/integration/sprint-1.5-rate-limiting.test.sh
```

---

## Risk Mitigation

### High-Risk Items

**Risk**: Metrics overhead degrades performance
**Mitigation**: Benchmark overhead in Sprint 1.1, optimize if needed
**Fallback**: Reduce metric frequency or disable metrics in production

**Risk**: Health check false positives trigger unnecessary alerts
**Mitigation**: Tune liveness thresholds in Sprint 1.2 based on empirical data
**Fallback**: Increase liveness threshold or disable health checks

**Risk**: Backpressure causes deadlocks
**Mitigation**: Test circular send scenarios in Sprint 1.5
**Fallback**: Implement timeout-based backpressure (drop messages on timeout)

**Risk**: Graceful shutdown times out with large message queues
**Mitigation**: Set drain timeout to reasonable value (30s), test with large queues
**Fallback**: Force shutdown after timeout, log unprocessed message count

### Medium-Risk Items

**Risk**: Configuration validation too strict, rejects valid configs
**Mitigation**: Test edge cases in Sprint 1.3, relax validation if needed
**Fallback**: Add override flag to skip validation (for advanced users)

**Risk**: Rate limiting overhead too high
**Mitigation**: Benchmark in Sprint 1.5, optimize capacity checks
**Fallback**: Disable rate limiting or increase MAX_INBOX_SIZE

---

## Document Metadata

**Version**: 1.0
**Created**: 2025-10-06
**Author**: Coder Agent (Phase 1 Documentation Task)
**Status**: READY FOR IMPLEMENTATION
**Parent Epic**: CLI Coordination V2 Epic
**Next Phase**: Phase 2 (Testing & Validation)

**Related Documents**:
- `planning/cli-validation-epic/CLI_COORDINATION_V2_EPIC.md` - Parent epic
- `planning/cli-validation-epic/phase-2-testing.md` - Next phase
- `docs/configuration.md` - Configuration reference (to be created in Sprint 1.3)

**Changelog**:
- v1.0 (2025-10-06): Initial Phase 1 documentation created from epic
