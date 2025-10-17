# Phase 0: Validation Tests (MANDATORY BEFORE PHASE 1)

**Status:** 🔴 Required - 5 CRITICAL assumptions must be validated
**Duration:** 2-3 days
**Agents:** 8-10 for testing
**Blockers Identified:** 5 critical, 3 high priority

---

## Purpose

Validate that core Redis coordination mechanics actually work in practice before investing 3-4 weeks in system-wide implementation.

**Critical Questions:**
1. Can coordinators actively monitor multiple agents via Redis?
2. Will agents reliably use Bash tool for Redis commands?
3. Can agents do real work + Redis coordination simultaneously?
4. Does coordinator broadcast actually work?
5. Does CFN Loop integration work?

---

## Test 1: Coordinator Monitoring (CRITICAL BLOCKER)

### Objective
Verify coordinator can actively monitor multiple worker channels and aggregate results.

### Test Setup
```javascript
// Spawn coordinator + 3 workers
Task("coordinator-hybrid", `
  Monitor 3 workers via Redis, aggregate confidence scores.

  Use Bash tool to run monitoring loop:

  #!/bin/bash
  echo "Coordinator: Starting monitoring of 3 workers"

  workers=("worker1" "worker2" "worker3")
  results=()
  completed=0

  while [ $completed -lt 3 ]; do
    for worker in "\${workers[@]}"; do
      # Check if worker completed
      status=$(redis-cli get "swarm:test1:$worker:status")

      if [ "$status" == "done" ] && [ "${results[$worker]}" != "done" ]; then
        result=$(redis-cli --raw get "swarm:test1:$worker:result")
        echo "✅ Coordinator: $worker completed - $result"
        results[$worker]="done"
        completed=$((completed + 1))
      fi
    done

    sleep 2  # Check every 2 seconds
  done

  # Aggregate
  echo "🎯 Coordinator: All 3 workers complete. Aggregating..."
  avg=0.83  # Simulate average
  echo "📊 Final Report: Average confidence 0.83"
`, "coordinator")

Task("coder", `
  Worker 1: Complete task immediately.

  Use Bash tool:
  sleep 5
  redis-cli set "swarm:test1:worker1:status" "done"
  redis-cli set "swarm:test1:worker1:result" '{"confidence":0.85}'
  echo "Worker 1: Done"
`, "coder")

Task("coder", `
  Worker 2: Complete task after 15 seconds.

  Use Bash tool:
  sleep 15
  redis-cli set "swarm:test1:worker2:status" "done"
  redis-cli set "swarm:test1:worker2:result" '{"confidence":0.80}'
  echo "Worker 2: Done"
`, "coder")

Task("coder", `
  Worker 3: Complete task after 30 seconds.

  Use Bash tool:
  sleep 30
  redis-cli set "swarm:test1:worker3:status" "done"
  redis-cli set "swarm:test1:worker3:result" '{"confidence":0.84}'
  echo "Worker 3: Done"
`, "coder")
```

### Expected Output
```
Worker 1: Done (5s)
✅ Coordinator: worker1 completed - {"confidence":0.85}
Worker 2: Done (15s)
✅ Coordinator: worker2 completed - {"confidence":0.80}
Worker 3: Done (30s)
✅ Coordinator: worker3 completed - {"confidence":0.84}
🎯 Coordinator: All 3 workers complete. Aggregating...
📊 Final Report: Average confidence 0.83
```

### Success Criteria
- [ ] Coordinator actually runs bash monitoring loop
- [ ] Coordinator detects all 3 completions in real-time
- [ ] Coordinator reports final aggregated result
- [ ] No manual intervention required

### If Test FAILS
**BLOCK entire implementation.** Coordinators can't monitor = coordination system doesn't work.

---

## Test 2: Real Task + Redis Coordination (CRITICAL BLOCKER)

### Objective
Verify agent can do real work (file edit, post-edit hook) AND Redis coordination.

### Test Setup
```javascript
Task("coder", `
  Do BOTH tasks:
  1. Edit test file
  2. Run post-edit hook
  3. Push completion to Redis

  Use Bash tool for ALL steps:

  # Step 1: Edit file
  cat > /tmp/test-file.js << 'EOF'
function test() {
  return "coordination works";
}
EOF

  echo "✅ File edited"

  # Step 2: Post-edit hook
  node config/hooks/post-edit-pipeline.js "/tmp/test-file.js" --memory-key "test"

  echo "✅ Post-edit hook complete"

  # Step 3: Redis completion
  redis-cli lpush "swarm:test2:coder:done" '{
    "agent": "coder",
    "confidence": 0.85,
    "file": "/tmp/test-file.js"
  }'

  echo "✅ Redis signal sent"
`, "coder")

Task("analyst", `
  Wait for coder completion, then analyze file.

  Use Bash tool:

  echo "⏳ Analyst: Waiting for coder..."
  result=$(timeout 120 redis-cli --csv blpop "swarm:test2:coder:done" 0)

  echo "✅ Analyst: Coder complete - $result"

  # Analyze file
  if [ -f /tmp/test-file.js ]; then
    echo "✅ Analyst: File exists, analyzing..."
    cat /tmp/test-file.js
  else
    echo "❌ Analyst: File not found!"
    exit 1
  fi
`, "analyst")
```

### Expected Output
```
✅ File edited
✅ Post-edit hook complete
✅ Redis signal sent
⏳ Analyst: Waiting for coder...
✅ Analyst: Coder complete - {"agent":"coder","confidence":0.85,...}
✅ Analyst: File exists, analyzing...
function test() {
  return "coordination works";
}
```

### Success Criteria
- [ ] Coder completes ALL 3 steps (edit, hook, Redis)
- [ ] File actually created and readable
- [ ] Post-edit hook actually runs
- [ ] Redis signal actually sent
- [ ] Analyst receives signal and proceeds
- [ ] No forgotten steps

### If Test FAILS
**BLOCK Phase 1.** Real tasks + Redis don't work together = system won't work in production.

---

## Test 3: Coordinator Broadcast (CRITICAL BLOCKER)

### Objective
Verify coordinator actually runs broadcast bash commands to multiple dependents.

### Test Setup
```javascript
Task("researcher", `
  Research, signal completion.

  Use Bash tool:
  sleep 3
  redis-cli lpush "swarm:test3:researcher:done" '{
    "findings": "TypeScript benefits: type safety, IDE support"
  }'
  echo "✅ Researcher: Done"
`, "researcher")

Task("coordinator-hybrid", `
  Receive researcher result, broadcast to 2 dependents.

  Use Bash tool:

  echo "⏳ Coordinator: Waiting for researcher..."
  data=$(timeout 60 redis-cli --csv blpop "swarm:test3:researcher:done" 0)

  echo "✅ Coordinator: Received - $data"

  # CRITICAL: Actually broadcast
  echo "📡 Coordinator: Broadcasting to analyzer + architect..."
  redis-cli lpush "swarm:test3:analyzer:inbox" "$data"
  redis-cli lpush "swarm:test3:architect:inbox" "$data"

  echo "✅ Coordinator: Broadcast complete"
`, "coordinator")

Task("analyst", `
  Wait for coordinator broadcast.

  Use Bash tool:
  echo "⏳ Analyzer: Waiting for broadcast..."
  data=$(timeout 60 redis-cli --csv blpop "swarm:test3:analyzer:inbox" 0)
  echo "✅ Analyzer: Received - $data"
`, "analyst")

Task("architect", `
  Wait for coordinator broadcast.

  Use Bash tool:
  echo "⏳ Architect: Waiting for broadcast..."
  data=$(timeout 60 redis-cli --csv blpop "swarm:test3:architect:inbox" 0)
  echo "✅ Architect: Received - $data"
`, "architect")
```

### Expected Output
```
✅ Researcher: Done
⏳ Coordinator: Waiting for researcher...
✅ Coordinator: Received - ...
📡 Coordinator: Broadcasting to analyzer + architect...
✅ Coordinator: Broadcast complete
⏳ Analyzer: Waiting for broadcast...
✅ Analyzer: Received - ...
⏳ Architect: Waiting for broadcast...
✅ Architect: Received - ...
```

### Success Criteria
- [ ] Coordinator actually runs broadcast commands
- [ ] Both analyzer and architect receive data
- [ ] No BLPOP destructive issue (both get messages)
- [ ] Execution logs prove broadcast happened

### Verification
```bash
# Check Redis state after test
redis-cli llen "swarm:test3:researcher:done"  # Should be 0 (consumed by coordinator)
redis-cli llen "swarm:test3:analyzer:inbox"   # Should be 0 (consumed by analyzer)
redis-cli llen "swarm:test3:architect:inbox"  # Should be 0 (consumed by architect)
```

### If Test FAILS
**BLOCK Phase 1.** Hierarchical pattern doesn't work = 1:many coordination fails.

---

## Test 4: Error Recovery & Timeout (HIGH PRIORITY)

### Objective
Verify timeout handling and error recovery.

### Test Setup
```javascript
Task("coder", `
  Worker that never completes (simulate failure).

  Use Bash tool:
  echo "Worker: Starting... (will never finish)"
  sleep 9999  # Simulate hanging
`, "coder")

Task("analyst", `
  Wait for worker with timeout.

  Use Bash tool:
  echo "⏳ Analyst: Waiting for worker (30s timeout)..."
  result=$(timeout 30 redis-cli --csv blpop "swarm:test4:worker:done" 0)

  if [ $? -eq 124 ]; then
    echo "❌ Analyst: TIMEOUT - Worker did not complete within 30s"
    echo "🔄 Analyst: Continuing with fallback logic..."
    exit 1
  else
    echo "✅ Analyst: Worker complete - $result"
  fi
`, "analyst")

Task("coordinator-hybrid", `
  Monitor and detect timeout.

  Use Bash tool:
  echo "Coordinator: Monitoring worker + analyst..."

  sleep 35  # Wait for timeout to occur

  # Check if analyst failed
  status=$(redis-cli get "swarm:test4:analyst:status")
  if [ "$status" == "failed" ]; then
    echo "⚠️ Coordinator: Analyst timed out"
    echo "📊 Coordinator: Reporting error to main chat"
  fi
`, "coordinator")
```

### Expected Output
```
Worker: Starting... (will never finish)
⏳ Analyst: Waiting for worker (30s timeout)...
❌ Analyst: TIMEOUT - Worker did not complete within 30s
🔄 Analyst: Continuing with fallback logic...
Coordinator: Monitoring worker + analyst...
⚠️ Coordinator: Analyst timed out
📊 Coordinator: Reporting error to main chat
```

### Success Criteria
- [ ] Timeout triggers after 30s
- [ ] Analyst handles timeout gracefully (doesn't crash)
- [ ] Coordinator detects failure
- [ ] Error reported to main chat

### If Test FAILS
Document limitations, add to Phase 4 (validation hooks).

---

## Test 5: CFN Loop Simulation (CRITICAL BLOCKER)

### Objective
Verify Loop 3→2→4 inter-loop signaling works.

### Test Setup
```javascript
// Loop 3: 3 workers
Task("coder", "Worker 1", "coder")
Task("coder", "Worker 2", "coder")
Task("coder", "Worker 3", "coder")

Task("coordinator-hybrid", `
  Loop 3 Coordinator: Monitor 3 workers, check gate, signal Loop 2.

  Use Bash tool:

  # Monitor workers (simplified)
  echo "Loop 3 Coordinator: Monitoring 3 workers..."

  # Simulate aggregation
  avg_confidence=0.82
  gate_threshold=0.75

  if (( $(echo "$avg_confidence >= $gate_threshold" | bc -l) )); then
    echo "✅ Loop 3: GATE PASS (avg $avg_confidence >= $gate_threshold)"

    # Signal Loop 2
    redis-cli lpush "swarm:cfn:loop3:complete" '{
      "loop": 3,
      "avg_confidence": 0.82,
      "gate": "pass"
    }'

    echo "📡 Loop 3: Signaled Loop 2"
  else
    echo "❌ Loop 3: GATE FAIL"
  fi
`, "coordinator")

// Loop 2: 2 validators
Task("validator", `
  Validator 1: Wait for Loop 3, validate.

  Use Bash tool:
  echo "⏳ Loop 2 Validator 1: Waiting for Loop 3..."
  result=$(timeout 120 redis-cli --csv blpop "swarm:cfn:loop3:complete" 0)

  echo "✅ Loop 2 Validator 1: Loop 3 complete - $result"
  echo "🔍 Validating..."

  # Simulate validation
  redis-cli set "swarm:cfn:loop2:validator1:result" '{"confidence":0.90}'
  echo "✅ Validator 1: Done (0.90)"
`, "validator")

Task("validator", `
  Validator 2: Wait for Loop 3, validate.

  Use Bash tool:
  echo "⏳ Loop 2 Validator 2: Waiting for Loop 3..."
  result=$(timeout 120 redis-cli --csv blpop "swarm:cfn:loop3:complete" 0)

  echo "✅ Loop 2 Validator 2: Loop 3 complete - $result"
  echo "🔍 Validating..."

  # Simulate validation
  redis-cli set "swarm:cfn:loop2:validator2:result" '{"confidence":0.88}'
  echo "✅ Validator 2: Done (0.88)"
`, "validator")

Task("coordinator-hybrid", `
  Loop 2 Coordinator: Aggregate consensus, signal Loop 4.

  Use Bash tool:
  echo "Loop 2 Coordinator: Monitoring validators..."

  # Wait for both validators
  sleep 10

  # Aggregate
  consensus=0.89
  threshold=0.90

  echo "📊 Loop 2: Consensus $consensus (threshold $threshold)"

  # Signal Loop 4
  redis-cli lpush "swarm:cfn:loop2:complete" '{
    "loop": 2,
    "consensus": 0.89,
    "threshold": 0.90,
    "result": "below_threshold"
  }'

  echo "📡 Loop 2: Signaled Loop 4"
`, "coordinator")

Task("product-owner", `
  Loop 4 PO: Wait for Loop 2, make decision.

  Use Bash tool:
  echo "⏳ Loop 4 PO: Waiting for Loop 2..."
  result=$(timeout 120 redis-cli --csv blpop "swarm:cfn:loop2:complete" 0)

  echo "✅ Loop 4 PO: Loop 2 complete - $result"
  echo "🤔 Making decision..."

  # Simulate decision
  echo "✅ Loop 4 PO: PROCEED (consensus close to threshold, override approved)"
`, "product-owner")
```

### Expected Output
```
Loop 3 Coordinator: Monitoring 3 workers...
✅ Loop 3: GATE PASS (avg 0.82 >= 0.75)
📡 Loop 3: Signaled Loop 2
⏳ Loop 2 Validator 1: Waiting for Loop 3...
⏳ Loop 2 Validator 2: Waiting for Loop 3...
✅ Loop 2 Validator 1: Loop 3 complete - ...
✅ Loop 2 Validator 2: Loop 3 complete - ...
🔍 Validating...
✅ Validator 1: Done (0.90)
✅ Validator 2: Done (0.88)
Loop 2 Coordinator: Monitoring validators...
📊 Loop 2: Consensus 0.89 (threshold 0.90)
📡 Loop 2: Signaled Loop 4
⏳ Loop 4 PO: Waiting for Loop 2...
✅ Loop 4 PO: Loop 2 complete - ...
🤔 Making decision...
✅ Loop 4 PO: PROCEED
```

### Success Criteria
- [ ] Loop 3 → Loop 2 signal works
- [ ] Both validators receive Loop 3 signal (broadcast)
- [ ] Loop 2 → Loop 4 signal works
- [ ] PO receives and makes decision
- [ ] All inter-loop coordination successful

### If Test FAILS
**BLOCK Phase 3.** CFN Loop integration won't work = epic implementation blocked.

---

## Test 6: CLI Injection (CRITICAL BLOCKER)

### Objective
Verify spawn-workers.js injection works with real CLI spawning.

### Test Setup
```bash
# Use actual CLI spawning
node src/cli/hybrid-routing/spawn-workers.js \
  "Test Redis coordination" \
  --agents=researcher,analyst \
  --topology=simple \
  --dependencies='{"analyst":["researcher"]}' \
  --provider zai
```

### Success Criteria
- [ ] CLI successfully spawns 2 agents
- [ ] Redis coordination injected into prompts
- [ ] Researcher completes and signals via Redis
- [ ] Analyst waits for researcher via BLPOP
- [ ] Both agents use Redis coordination

### Verification
```bash
# Check Redis after CLI spawn completes
redis-cli keys "swarm:*"  # Should show coordination keys
redis-cli get "swarm:cli-test:researcher:result"
redis-cli get "swarm:cli-test:analyst:result"
```

### If Test FAILS
**BLOCK Phase 2.** CLI integration won't work = hybrid routing broken.

---

## Summary: Phase 0 Gate

**All 6 tests must PASS before Phase 1 begins.**

| Test | Priority | Blocker | Status |
|------|----------|---------|--------|
| 1. Coordinator Monitoring | 🔴 CRITICAL | YES | ⏳ Pending |
| 2. Real Task + Redis | 🔴 CRITICAL | YES | ⏳ Pending |
| 3. Coordinator Broadcast | 🔴 CRITICAL | YES | ⏳ Pending |
| 4. Error Recovery | 🟠 HIGH | NO | ⏳ Pending |
| 5. CFN Loop Simulation | 🔴 CRITICAL | YES | ⏳ Pending |
| 6. CLI Injection | 🔴 CRITICAL | YES | ⏳ Pending |

**Gate Criteria:**
- ALL 5 critical tests pass (Tests 1, 2, 3, 5, 6)
- Test 4 (error recovery) documented if fails

**If ANY critical test fails:**
- Identify root cause
- Fix or redesign pattern
- Re-test until pass
- DO NOT proceed to Phase 1

---

## Next Steps

1. ⏳ Execute Phase 0 tests (2-3 days)
2. ⏳ Document results
3. ⏳ Fix any failures
4. ✅ Gate review: ALL critical tests pass
5. → Proceed to Phase 1

---

**Status:** Phase 0 validation required
**Estimated Duration:** 2-3 days
**Blockers:** 5 critical tests must pass
