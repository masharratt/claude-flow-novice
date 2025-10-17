# Phase 3: Advanced Coordination Patterns - Implementation Plan

**Epic:** Redis Agent Coordination
**Phase:** 3 of 6
**Status:** 🟢 READY TO START
**Duration:** 3-5 days
**Dependencies:** ✅ Phase 2 Complete (CLI Integration with coordinator pattern)

---

## Objective

Enhance spawn-workers.js with production-ready features based on Phase 2 learnings: timeout configuration, background mode, error recovery, and monitoring.

---

## Phase 2 Learnings Applied

From Phase 2 completion and coordinator testing:

1. **Timeout Configuration Needed** - 2-minute default insufficient for complex tasks
2. **Background Mode Required** - Long-running coordination needs background execution
3. **Monitoring Essential** - Real-time Redis key visualization for debugging
4. **Error Recovery Missing** - No handling for worker failures
5. **Performance Opportunity** - Replace polling with BRPOP/BLPOP

---

## Deliverables

### Deliverable 1: Topology-Specific Timeouts

**File:** `src/cli/hybrid-routing/spawn-workers.js`

**Changes:**
```javascript
// Add topology-specific timeout configuration
const TOPOLOGY_TIMEOUTS = {
  'sequential': 120000,      // 2 minutes (simple, parallel)
  'bidirectional': 300000,   // 5 minutes (iterative feedback)
  'collaborative': 360000,   // 6 minutes (Q&A + coordination)
  'release-gate': 360000     // 6 minutes (barrier wait + release)
};

// In HybridWorkerSpawner constructor
this.timeout = TOPOLOGY_TIMEOUTS[this.topology] || 120000;

// Add --timeout flag override
const timeoutOverride = parseArg(args, 'timeout');
if (timeoutOverride) {
  this.timeout = parseInt(timeoutOverride);
}
```

**Acceptance Criteria:**
- ✅ Each topology has appropriate default timeout
- ✅ --timeout flag allows manual override
- ✅ Timeout displayed in console on spawn
- ✅ Help text documents timeout values

**Estimated:** 1-2 hours

---

### Deliverable 2: Background Execution Mode

**File:** `src/cli/hybrid-routing/spawn-workers.js`

**Changes:**
```javascript
// Add --background flag
const background = args.includes('--background') || args.includes('--bg');

// In spawnAll(), handle background mode
if (background) {
  console.log('🌙 Background mode enabled - agents will run independently');
  console.log('📊 Monitor progress: redis-cli monitor | grep "swarm:"');
  console.log('📋 Check status: redis-cli keys "swarm:*"');

  // Spawn coordinator and workers without waiting
  const coordinatorPromise = this.spawnCoordinator(subtasks);
  const workerPromises = subtasks.map((st, i) => this.spawnWorkerWithRetry(i + 1, st));

  // Return immediately, don't wait for completion
  console.log('✅ Agents spawned in background');
  return { background: true, spawned: subtasks.length + 1 };
}
```

**Redis Monitoring Helper:**
```bash
# Add to help text
--background, --bg     Run agents in background, return immediately
                       Monitor: redis-cli monitor | grep "swarm:"
                       Status: redis-cli keys "swarm:*"
```

**Acceptance Criteria:**
- ✅ --background flag spawns agents without waiting
- ✅ Console shows monitoring commands
- ✅ User can track progress via Redis
- ✅ No CLI timeout in background mode

**Estimated:** 2-3 hours

---

### Deliverable 3: Error Recovery & Worker Failure Handling

**File:** `src/cli/hybrid-routing/spawn-workers.js`

**Changes:**
```javascript
// Add coordinator error detection
generateCoordinatorInstructions(topology, agentTypes, subtasks) {
  // ... existing code ...

  // Add to all coordinator patterns:
  return `...

## Error Detection

**Check for Worker Failures:**
\`\`\`bash
# After timeout, check which workers didn't signal
for agent in ${agentTypes.join(' ')}; do
  status=$(redis-cli get "${channelPrefix}:$agent:status")
  if [ -z "$status" ]; then
    echo "⚠️  $agent failed to signal (no status key)"
    redis-cli set "${channelPrefix}:$agent:status" "failed"
  fi
done
\`\`\`

**Set Failure State:**
\`\`\`javascript
bash_execute({ command: "redis-cli set \\"${channelPrefix}:status\\" \\"partial_failure\\"" })
bash_execute({ command: "redis-cli set \\"${channelPrefix}:failed_count\\" \\"$failed\\"" })
\`\`\`
`;
}
```

**Worker Timeout Detection:**
```javascript
// In coordinator polling loops, add timeout handling
for i in {1..45}; do
  agents_waiting=$(redis-cli get "${channelPrefix}:agents_waiting")

  if [ "$agents_waiting" = "${agentTypes.length}" ]; then
    break
  fi

  # Check for stale workers (no status update in 120s)
  if [ $i -eq 30 ]; then  # After 60 seconds
    echo "⚠️  Some workers haven't signaled - continuing with partial results"
    redis-cli set "${channelPrefix}:status" "partial"
  fi

  sleep 2
done
```

**Acceptance Criteria:**
- ✅ Coordinator detects worker failures
- ✅ Failed workers marked in Redis
- ✅ Partial completion supported (some workers succeed)
- ✅ Status keys reflect failure state

**Estimated:** 3-4 hours

---

### Deliverable 4: Real-Time Monitoring Dashboard

**File:** `scripts/monitor-swarm-coordination.sh` (new)

**Implementation:**
```bash
#!/bin/bash
# Real-time Redis coordination monitoring

TOPOLOGY=${1:-"*"}
CHANNEL_PREFIX="swarm:${TOPOLOGY}"

echo "📊 Swarm Coordination Monitor"
echo "🔍 Watching: ${CHANNEL_PREFIX}"
echo "───────────────────────────────────────"

# Watch Redis keys with auto-refresh
watch -n 1 "
echo '🔑 Active Keys:'
redis-cli keys '${CHANNEL_PREFIX}:*' | sort

echo ''
echo '📈 Status Summary:'
for key in \$(redis-cli keys '${CHANNEL_PREFIX}:*:status'); do
  agent=\$(echo \$key | cut -d: -f3)
  status=\$(redis-cli get \$key)
  echo \"  \$agent: \$status\"
done

echo ''
echo '🚦 Coordination State:'
redis-cli get '${CHANNEL_PREFIX}:status' || echo 'Not set'

echo ''
echo '⏱️  Timestamp: \$(date +%H:%M:%S)'
"
```

**Usage:**
```bash
# Monitor specific topology
./scripts/monitor-swarm-coordination.sh bidirectional

# Monitor all swarms
./scripts/monitor-swarm-coordination.sh
```

**Acceptance Criteria:**
- ✅ Real-time key monitoring
- ✅ Auto-refresh every second
- ✅ Color-coded status display
- ✅ Works for all topologies

**Estimated:** 2 hours

---

### Deliverable 5: Performance Optimization (Blocking Commands)

**File:** `src/cli/hybrid-routing/spawn-workers.js`

**Changes:**
```javascript
// Replace GET polling with BRPOPLPUSH where possible
generateCoordinatorInstructions(topology, agentTypes, subtasks) {
  switch(topology) {
    case 'collaborative':
      return `...

1. **Wait for All Workers (optimized with blocking):**
\`\`\`bash
# Use BRPOPLPUSH for efficient blocking wait
for agent in ${agentTypes.join(' ')}; do
  # Block until worker signals (60 second timeout)
  result=$(redis-cli brpoplpush "${channelPrefix}:$agent:done" "${channelPrefix}:$agent:processed" 60)

  if [ -z "$result" ]; then
    echo "⏱️  $agent timeout"
  else
    echo "✅ $agent complete: $result"
  fi
done
\`\`\`
`;

    case 'release-gate':
      return `...

1. **Wait for Barrier (optimized):**
\`\`\`bash
# Use BLPOP with timeout for efficient blocking
while true; do
  # Block waiting for any worker arrival notification
  result=$(redis-cli blpop "${channelPrefix}:arrivals" 5)

  agents_waiting=$(redis-cli get "${channelPrefix}:agents_waiting")

  if [ "$agents_waiting" = "${agentTypes.length}" ]; then
    echo "All agents at barrier"
    break
  fi
done
\`\`\`
`;
  }
}
```

**Performance Impact:**
- Reduces CPU usage (no busy polling)
- Faster response time (immediate wake on event)
- Lower Redis load (fewer GET commands)

**Acceptance Criteria:**
- ✅ BRPOPLPUSH used for status waits
- ✅ BLPOP used for event notifications
- ✅ Maintains backward compatibility
- ✅ Performance improvement measurable

**Estimated:** 3-4 hours

---

### Deliverable 6: Comprehensive Testing

**File:** `tests/manual/test-phase-3-enhancements.md` (new)

**Test Scenarios:**

**Test 1: Timeout Configuration**
```bash
# Test default timeout
node spawn-workers.js "Complex task" --agents=architect,coder,tester --topology=collaborative
# Expected: 6-minute timeout

# Test custom timeout
node spawn-workers.js "Complex task" --agents=architect,coder,tester --topology=collaborative --timeout=600000
# Expected: 10-minute timeout
```

**Test 2: Background Mode**
```bash
# Start in background
node spawn-workers.js "Build feature" --agents=coder,reviewer --topology=bidirectional --background

# Monitor in separate terminal
redis-cli monitor | grep "swarm:"
redis-cli keys "swarm:*"
```

**Test 3: Error Recovery**
```bash
# Simulate worker failure (kill agent mid-execution)
node spawn-workers.js "Task" --agents=agent1,agent2,agent3 --topology=release-gate
# Kill one worker manually
# Expected: Coordinator detects failure, continues with partial results
```

**Test 4: Monitoring Dashboard**
```bash
# Terminal 1: Start coordination
node spawn-workers.js "Deploy" --agents=backend,frontend,database --topology=release-gate

# Terminal 2: Monitor real-time
./scripts/monitor-swarm-coordination.sh release-gate
# Expected: Live updates of agent status
```

**Acceptance Criteria:**
- ✅ All 4 tests pass
- ✅ Timeouts work as configured
- ✅ Background mode returns immediately
- ✅ Error recovery handles failures
- ✅ Monitoring shows live updates

**Estimated:** 4 hours

---

## Success Criteria

### Code Quality
- ✅ All new code passes syntax check
- ✅ No breaking changes to existing functionality
- ✅ Backward compatible (existing CLI commands still work)

### Functionality
- ✅ Topology-specific timeouts working
- ✅ Background mode spawns without blocking
- ✅ Error recovery detects and handles failures
- ✅ Monitoring dashboard provides real-time visibility
- ✅ Performance improved with blocking commands

### Testing
- ✅ 4 test scenarios pass
- ✅ All 3 topologies tested with new features
- ✅ Documentation updated with examples

### Documentation
- ✅ Help text updated with new flags
- ✅ README includes monitoring examples
- ✅ Test documentation created

---

## Implementation Order

**Day 1:**
1. Deliverable 1: Topology-specific timeouts (2 hours)
2. Deliverable 2: Background mode (3 hours)

**Day 2:**
3. Deliverable 3: Error recovery (4 hours)
4. Deliverable 4: Monitoring dashboard (2 hours)

**Day 3:**
5. Deliverable 5: Performance optimization (4 hours)

**Day 4:**
6. Deliverable 6: Testing and validation (4 hours)

**Day 5:**
7. Documentation and polish (4 hours)

**Total:** 3-5 days (23 hours of implementation)

---

## Risk Mitigation

### Risk 1: Breaking Existing Functionality
**Mitigation:** All new features are opt-in (flags required)

### Risk 2: Background Mode Debugging Difficulty
**Mitigation:** Monitoring dashboard provides visibility

### Risk 3: Blocking Commands Complexity
**Mitigation:** Keep polling fallback, make blocking optional

---

## Phase 3 vs CFN Loop Integration

**Original Roadmap:** Phase 3 was CFN Loop Integration (5-7 days)

**Revised Approach:** Phase 3 focuses on production readiness
- **Why:** Phase 2 revealed gaps in timeout handling, monitoring, error recovery
- **Impact:** CFN Loop integration deferred to Phase 4 (after stability improvements)
- **Benefit:** More stable foundation before complex CFN Loop patterns

**CFN Loop Integration:** Move to Phase 4 after production features complete

---

## Next Steps After Phase 3

**Phase 4 Options:**

**Option A: CFN Loop Integration** (original Phase 3)
- Integrate Redis coordination into CFN Loop (Loops 3→2→4)
- Mode-specific patterns (MVP, Standard, Enterprise)
- Inter-loop signaling

**Option B: Additional Production Features**
- Retry logic for failed workers
- Coordinator crash recovery
- Redis connection loss handling
- Swarm state persistence

**Recommendation:** Complete Phase 3 enhancements first, then decide based on needs.

---

**Status:** 🟢 Ready to Start
**Estimated Duration:** 3-5 days
**Confidence:** 0.90 (based on Phase 2 learnings)
