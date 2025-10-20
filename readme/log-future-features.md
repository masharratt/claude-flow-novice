# Future Features Log

## Session Resumption for CLI-Spawned Agents

**Date:** 2025-10-19
**Status:** Proposed
**Priority:** Medium
**Category:** Resilience & Recovery

### Problem

CLI-spawned agents don't return resumable session information. If a coordinator crashes mid-execution:

1. **Coordinator state is lost** - iteration count, agent IDs, orchestration progress
2. **Agent execution context is lost** - which agents completed, which are waiting
3. **Agents in waiting mode block indefinitely** - no wake signal arrives
4. **Manual recovery required** - inspecting Redis keys, restarting orchestrator
5. **Risk of duplicate work or skipped steps** - no checkpoint mechanism

### Current Behavior

```bash
# CLI spawn
npx cfn-spawn agent backend-dev --task-id abc123

# Agent executes, writes to Redis, then exits
# NO session handle or resumption token returned
# Coordinator crash = orphaned agents + lost state
```

### Proposed Solution

**Coordinator Checkpoint/Resume Capability**

**1. State Persistence**
```bash
# Coordinator writes state to Redis hash on each iteration
redis-cli hset "swarm:${TASK_ID}:coordinator:state" \
  iteration "2" \
  spawned_agents "coder-1,reviewer-1,tester-1" \
  consensus_history "[0.85,0.88]" \
  mode "standard" \
  max_iterations "10" \
  last_checkpoint "$(date -u +%s)"
```

**2. Resume Command**
```bash
# Orchestrator detects existing state and resumes
./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \
  --task-id "$EXISTING_TASK_ID" \
  --resume

# Orchestrator:
# - Reads coordinator state from Redis
# - Checks which agents completed (swarm:$TASK_ID:*:done)
# - Skips completed agents
# - Wakes waiting agents with correct iteration number
# - Continues from last checkpoint
```

**3. State Recovery**
```bash
# Manual inspection (current workaround)
redis-cli keys "swarm:${TASK_ID}:*:done"          # Completed agents
redis-cli lrange "swarm:${TASK_ID}:confidence:iteration:1" 0 -1  # Scores
redis-cli keys "swarm:${TASK_ID}:*:wake-signal"   # Waiting agents
redis-cli hgetall "swarm:${TASK_ID}:coordinator:state"  # Coordinator checkpoint
```

### Implementation Details

**Coordinator State Schema:**
```json
{
  "task_id": "unique-task-id",
  "iteration": 2,
  "mode": "standard",
  "max_iterations": 10,
  "spawned_agents": ["coder-1", "reviewer-1", "tester-1", "security-1"],
  "completed_agents": ["coder-1", "reviewer-1"],
  "waiting_agents": ["tester-1", "security-1"],
  "consensus_history": [0.85, 0.88],
  "gate_status": "passed",
  "last_checkpoint": 1729353600
}
```

**Resume Logic:**
1. Check if `swarm:${TASK_ID}:coordinator:state` exists
2. Read iteration, spawned_agents, completed_agents
3. Skip spawning completed agents
4. Wake waiting agents with `--iteration N+1`
5. Continue consensus collection from last checkpoint

**Safety Measures:**
- Idempotent agent spawning (check `:done` before spawn)
- Deduplication of confidence scores
- TTL on coordinator state (7 days)
- Resume validation (mode, max_iterations must match)

### Benefits

✅ **Crash resilience** - Coordinator can restart without losing progress
✅ **Cost savings** - No duplicate agent work after crash
✅ **Zero-token recovery** - State in Redis, not API calls
✅ **Audit trail** - Consensus history preserved
✅ **Operational simplicity** - Single `--resume` flag

### Workarounds (Current)

**Manual Recovery:**
```bash
# 1. Inspect Redis state
redis-cli keys "swarm:abc123:*"

# 2. Identify waiting agents
redis-cli keys "swarm:abc123:*:wake-signal"

# 3. Wake manually or restart orchestrator
# WARNING: May duplicate work or skip steps
```

**Prevention:**
- Use monitoring to detect coordinator crashes
- Run coordinators in supervised environment (systemd, Docker)
- Keep orchestration scripts idempotent where possible

### Related Patterns

- **STRAT-006**: Always spawn coordinator + agents together
- **Redis Coordination**: `.claude/skills/redis-coordination/SKILL.md`
- **Waiting Mode**: Zero-token blocking with BLPOP

### References

- Redis Hash Commands: `HSET`, `HGETALL`, `EXPIRE`
- Orchestrator Script: `.claude/skills/redis-coordination/orchestrate-cfn-loop.sh`
- CFN Loop Dependency Enforcement: `CLAUDE.md` Section 4

---

## Agent Cleanup for CLI-Spawned CFN Loops

**Date:** 2025-10-19
**Status:** Proposed
**Priority:** High
**Category:** Reliability & Resource Management

### Problem

CLI-spawned agents (`npx cfn-spawn agent <type>`) lack reliable cleanup mechanisms, leading to resource leaks:

1. **Orphaned processes** - Agents continue running if orchestrator crashes
2. **No PID tracking** - Orchestrator doesn't store child process IDs
3. **Signal propagation failure** - SIGTERM to orchestrator doesn't reach agents
4. **Cross-session interference risk** - Non-unique task IDs could affect concurrent loops
5. **PID reuse vulnerabilities** - Cleanup might target wrong processes

### Current Behavior

```bash
# Orchestrator spawns agents via CLI
npx cfn-spawn agent coder --task-id abc123 &
npx cfn-spawn agent reviewer --task-id abc123 &

# Orchestrator crash:
# - No PID tracking = can't kill agents
# - Process group kill would terminate Main Chat
# - Redis pattern matching could affect other sessions
```

### Proposed Solution

**Safe Multi-Layer Cleanup Architecture**

**1. Session-Scoped Task IDs**
```bash
# Globally unique task ID per CFN loop invocation
TASK_ID="cfn-$(date +%s%N)-$(uuidgen | head -c 8)"
# Example: cfn-1729354821234567890-a3f9c2d1

# Benefits:
# - No collisions between concurrent loops
# - Redis keys are session-specific
# - Cleanup affects only this loop's resources
```

**2. PID Validation with Start Time**
```bash
# Store PID + start time for validation
store_agent_pid() {
  local agent_type="$1"
  local pid="$2"
  local task_id="$3"

  # Get process start time (prevents PID reuse)
  local start_time=$(ps -p "$pid" -o lstart= 2>/dev/null || echo "")

  # Store in Redis with metadata
  redis-cli hset "swarm:${task_id}:pids:${agent_type}" \
    "pid" "$pid" \
    "start_time" "$start_time" \
    "spawned_by" "$$"
}

# Validate before killing
validate_and_kill() {
  local current_start=$(ps -p "$pid" -o lstart= 2>/dev/null || echo "")

  if [ "$stored_start" != "$current_start" ]; then
    echo "⚠️ PID $pid reused, skipping"
    return 0
  fi

  kill -TERM "$pid"
}
```

**3. Scoped Cleanup (Never Touch Parent)**
```bash
cleanup_agents_only() {
  local task_id="$1"

  # Get agent types from Redis
  local agent_keys=$(redis-cli keys "swarm:${task_id}:pids:*")

  # Graceful shutdown (SIGTERM, 5s wait)
  for agent_type in "${agent_types[@]}"; do
    validate_and_kill "$agent_type" "$task_id" "TERM"
  done

  # Force kill remaining (SIGKILL)
  # Redis cleanup (task-specific only)
  # Marker file cleanup
}

# ❌ NEVER use process group kills
# ❌ NEVER use global Redis patterns
# ✅ Only kill processes we spawned
# ✅ Only delete task-specific Redis keys
```

**4. Safety Checks**
- ✅ PID exists in Redis for this task ID
- ✅ Process still running (`kill -0`)
- ✅ Start time matches stored value
- ✅ Process spawned by this orchestrator
- ❌ Never use `pkill -g` (kills Main Chat)
- ❌ Never use global patterns

**5. External Monitor (Optional)**
```bash
# Background monitor for orphaned agents
while true; do
  # Find all active CFN task IDs
  TASK_IDS=$(redis-cli keys "swarm:cfn-*:pids:*")

  for task_id in $TASK_IDS; do
    ORCHESTRATOR_PID=$(redis-cli hget "swarm:${task_id}:pids:orchestrator" "pid")

    if ! kill -0 "$ORCHESTRATOR_PID" 2>/dev/null; then
      echo "❌ Orphaned task: $task_id"
      cleanup_agents_only "$task_id"
    fi
  done

  sleep 10
done
```

### Implementation Details

**Changes to `orchestrate-cfn-loop.sh`:**
```bash
# Add unique task ID generation
TASK_ID="cfn-$(date +%s%N)-$(uuidgen | head -c 8)"

# Add PID tracking functions
store_agent_pid() { ... }
validate_and_kill() { ... }

# Replace cleanup_and_exit() with safe version
cleanup_and_exit() {
  cleanup_agents_only "$TASK_ID"  # Safe, scoped cleanup
  # No process group operations
}

# Track PIDs during agent spawning
spawn_loop3_agents() {
  npx cfn-spawn agent "$agent" --task-id "$task_id" &
  AGENT_PID=$!
  store_agent_pid "$agent" "$AGENT_PID" "$task_id"
}
```

### Safety Guarantees

| Scenario | Risk | Mitigation |
|----------|------|------------|
| Main Chat killed | ❌ High | ✅ No process group kills |
| Concurrent loops interfere | ❌ High | ✅ Unique task IDs with UUID |
| PID reuse | ⚠️ Medium | ✅ Start time validation |
| Orphaned agents | ⚠️ Medium | ✅ External monitor |
| Redis key collisions | ❌ High | ✅ Task-specific prefixes |

### Benefits

✅ **95% leak prevention** - PID tracking catches orphans
✅ **Session isolation** - No cross-session interference
✅ **Graceful degradation** - 5s grace period before force kill
✅ **External recovery** - Monitor handles orchestrator crashes
✅ **Zero new dependencies** - Uses Redis, bash, ps primitives

### Testing Strategy

**Test 1: Single Loop Cleanup**
```bash
# Start CFN loop, send Ctrl+C
# Expected: Only this loop's agents killed, Main Chat alive
```

**Test 2: Concurrent Loops**
```bash
# Start Loop A and Loop B in separate terminals
# Kill Loop A with Ctrl+C
# Expected: Only Loop A agents killed, Loop B continues
```

**Test 3: PID Reuse**
```bash
# Start loop, kill agent manually
# New process reuses PID
# Trigger cleanup
# Expected: Skips killing (start time mismatch)
```

**Test 4: Orphaned Orchestrator**
```bash
# Start loop, kill orchestrator with kill -9
# Expected: External monitor cleans up agents
```

### Migration Plan

1. **Phase 1:** Add unique task ID generation to orchestrator
2. **Phase 2:** Implement PID tracking with validation
3. **Phase 3:** Replace cleanup_and_exit() with safe version
4. **Phase 4:** Test with concurrent loops
5. **Phase 5:** Deploy external monitor (optional)

### References

- Safe Solution Document: `/docs/agent-cleanup-safe-solution.md`
- Orchestrator Script: `.claude/skills/redis-coordination/orchestrate-cfn-loop.sh`
- Redis Hash Commands: `HSET`, `HGETALL`, `DEL`
