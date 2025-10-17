# CLI Redis Instruction Injection - Integration Tests

**Purpose:** Validate that spawn-workers.js correctly injects Redis coordination instructions into agent system prompts.

**Phase:** 2 - CLI Integration
**Status:** 🟡 Ready to Test
**Date:** 2025-10-17

---

## Prerequisites

1. ✅ Redis server running (`redis-cli ping` returns PONG)
2. ✅ Z.ai API key configured (`Z_AI_API_KEY` in environment)
3. ✅ spawn-workers.js has topology/dependencies flags implemented
4. ✅ generateTopologyInstructions() method implemented

---

## Test 1: Bidirectional Feedback Loop (2 agents)

### Objective
Validate that coder and reviewer agents execute actual redis-cli commands in an iterative feedback loop.

### Command
```bash
node src/cli/hybrid-routing/spawn-workers.js "Implement authenticate() function" \
  --agents=coder,reviewer \
  --topology=bidirectional \
  --max-agents=2
```

### Expected Behavior
1. **Iteration 1:**
   - Coder creates initial implementation (low quality, confidence ~0.65)
   - Coder executes: `redis-cli lpush "swarm:bidirectional:coder:done" '{"content":"...","confidence":0.65,"iteration":1}'`
   - Reviewer receives work via: `redis-cli --csv blpop "swarm:bidirectional:reviewer:done" 0`
   - Reviewer analyzes and rejects (status: "needs_fixes")
   - Reviewer sends feedback: `redis-cli lpush "swarm:bidirectional:coder:feedback" '{"status":"needs_fixes","issues":"..."}'`

2. **Iteration 2:**
   - Coder receives feedback via: `redis-cli --csv blpop "swarm:bidirectional:coder:feedback" 0`
   - Coder improves implementation (higher quality, confidence ~0.85)
   - Coder executes: `redis-cli lpush "swarm:bidirectional:coder:done" '{"content":"...","confidence":0.85,"iteration":2}'`
   - Reviewer receives work, analyzes, approves (status: "approved")
   - Reviewer sends approval: `redis-cli lpush "swarm:bidirectional:coder:feedback" '{"status":"approved"}'`

3. **Exit:**
   - Coder receives approval, writes final state:
     - `redis-cli set "swarm:bidirectional:coder:final_confidence" "0.85"`
     - `redis-cli set "swarm:bidirectional:status" "complete"`
   - Both agents exit successfully

### Verification (after test completes)
```bash
# Check final state
redis-cli get "swarm:bidirectional:coder:final_confidence"
# Expected: "0.85" or higher

redis-cli get "swarm:bidirectional:status"
# Expected: "complete"

# Verify queues are empty (messages consumed)
redis-cli llen "swarm:bidirectional:coder:done"
# Expected: 0

redis-cli llen "swarm:bidirectional:coder:feedback"
# Expected: 0

redis-cli llen "swarm:bidirectional:reviewer:done"
# Expected: 0
```

### Success Criteria
- ✅ Coder executes real bash commands (not simulated)
- ✅ Reviewer executes real bash commands (not simulated)
- ✅ At least 2 iterations occur
- ✅ Final confidence ≥ 0.85
- ✅ Status = "complete"
- ✅ All queues empty (messages consumed)

---

## Test 2: Collaborative Waiting (3 agents)

### Objective
Validate that architect completes work, then enters Q&A mode to answer questions from coder and tester.

### Command
```bash
node src/cli/hybrid-routing/spawn-workers.js "Design authentication system" \
  --agents=architect,coder,tester \
  --topology=collaborative \
  --max-agents=3
```

### Expected Behavior

#### Phase 1: Primary Work Completion
1. All agents complete their primary work
2. **Architect signals completion:**
   ```bash
   redis-cli set "swarm:collab:architect:status" "work_complete"
   redis-cli incr "swarm:collab:agents_done"
   ```
3. **Coder signals completion:**
   ```bash
   redis-cli set "swarm:collab:coder:status" "work_complete"
   redis-cli incr "swarm:collab:agents_done"
   ```
4. **Tester signals completion:**
   ```bash
   redis-cli set "swarm:collab:tester:status" "work_complete"
   redis-cli incr "swarm:collab:agents_done"
   ```

#### Phase 2: Q&A Loop (Architect waiting)
1. **Architect enters waiting loop:**
   ```bash
   # Check if all done (loop with 5s timeout)
   all_done=$(redis-cli get "swarm:collab:all_done")
   if [ "$all_done" = "true" ]; then exit 0; fi

   # Wait for question
   question=$(timeout 5 redis-cli --csv blpop "swarm:collab:architect:questions" 0)
   ```

2. **Coder asks question:**
   ```bash
   redis-cli lpush "swarm:collab:architect:questions" '{"from":"coder","question":"How to handle session expiration?"}'
   ```

3. **Architect answers:**
   ```bash
   redis-cli lpush "swarm:collab:coder:answers" '{"answer":"Use Redis TTL with 30-minute expiration"}'
   ```

4. **Tester asks question:**
   ```bash
   redis-cli lpush "swarm:collab:architect:questions" '{"from":"tester","question":"What edge cases to test?"}'
   ```

5. **Architect answers:**
   ```bash
   redis-cli lpush "swarm:collab:tester:answers" '{"answer":"Test expired tokens, invalid signatures, missing claims"}'
   ```

#### Phase 3: Graceful Exit
1. **Coordinator (or last agent) sets all_done flag:**
   ```bash
   redis-cli set "swarm:collab:all_done" "true"
   ```

2. **All agents detect flag and exit:**
   ```bash
   redis-cli set "swarm:collab:architect:status" "complete"
   redis-cli set "swarm:collab:coder:status" "complete"
   redis-cli set "swarm:collab:tester:status" "complete"
   ```

### Verification (after test completes)
```bash
# Check completion status
redis-cli get "swarm:collab:architect:status"
# Expected: "complete"

redis-cli get "swarm:collab:coder:status"
# Expected: "complete"

redis-cli get "swarm:collab:tester:status"
# Expected: "complete"

# Check all_done flag
redis-cli get "swarm:collab:all_done"
# Expected: "true"

# Check agents_done counter
redis-cli get "swarm:collab:agents_done"
# Expected: "3" or higher

# Verify queues are empty
redis-cli llen "swarm:collab:architect:questions"
# Expected: 0

redis-cli llen "swarm:collab:coder:answers"
# Expected: 0

redis-cli llen "swarm:collab:tester:answers"
# Expected: 0
```

### Success Criteria
- ✅ All agents execute real bash commands (not simulated)
- ✅ At least 2 Q&A exchanges occur
- ✅ All agents reach "complete" status
- ✅ all_done flag set to "true"
- ✅ All queues empty (messages consumed)

---

## Test 3: Release Gate (3 agents)

### Objective
Validate that all agents complete work, wait at barrier, then exit together after coordinator releases.

### Command
```bash
node src/cli/hybrid-routing/spawn-workers.js "Prepare for deployment" \
  --agents=backend,frontend,database \
  --topology=release-gate \
  --max-agents=3
```

### Expected Behavior

#### Phase 1: Complete Work at Different Speeds
1. **Backend completes first (e.g., 30s):**
   ```bash
   redis-cli set "swarm:gate:backend:status" "work_complete"
   redis-cli incr "swarm:gate:agents_waiting"
   redis-cli set "swarm:gate:backend:status" "waiting"
   ```

2. **Frontend completes second (e.g., 45s):**
   ```bash
   redis-cli set "swarm:gate:frontend:status" "work_complete"
   redis-cli incr "swarm:gate:agents_waiting"
   redis-cli set "swarm:gate:frontend:status" "waiting"
   ```

3. **Database completes last (e.g., 60s):**
   ```bash
   redis-cli set "swarm:gate:database:status" "work_complete"
   redis-cli incr "swarm:gate:agents_waiting"
   redis-cli set "swarm:gate:database:status" "waiting"
   ```

#### Phase 2: Barrier Waiting (All agents wait)
All agents poll for release signal:
```bash
# Loop until release (max 60 seconds)
for i in {1..60}; do
  release=$(redis-cli get "swarm:gate:release")
  if [ "$release" = "true" ]; then
    break
  fi
  sleep 1
done
```

**CRITICAL:** No agent exits until ALL agents reach barrier.

#### Phase 3: Coordinated Release
1. **Coordinator (or last agent) detects all waiting:**
   ```bash
   agents_waiting=$(redis-cli get "swarm:gate:agents_waiting")
   # If agents_waiting == 3 (total agents):
   redis-cli set "swarm:gate:release" "true"
   ```

2. **All agents detect release and exit:**
   ```bash
   redis-cli set "swarm:gate:backend:status" "released"
   redis-cli set "swarm:gate:frontend:status" "released"
   redis-cli set "swarm:gate:database:status" "released"
   ```

### Verification (after test completes)
```bash
# Check release flag
redis-cli get "swarm:gate:release"
# Expected: "true"

# Check final statuses (all should be "released")
redis-cli get "swarm:gate:backend:status"
# Expected: "released"

redis-cli get "swarm:gate:frontend:status"
# Expected: "released"

redis-cli get "swarm:gate:database:status"
# Expected: "released"

# Check agents_waiting counter
redis-cli get "swarm:gate:agents_waiting"
# Expected: "3"

# Verify all agents reached barrier
redis-cli keys "swarm:gate:*:status"
# Expected: 3 keys, all with "released" value
```

### Success Criteria
- ✅ All agents execute real bash commands (not simulated)
- ✅ All agents reach "waiting" status before release
- ✅ agents_waiting counter = 3
- ✅ Release flag set to "true"
- ✅ All agents exit with "released" status
- ✅ No agent exits before barrier release

---

## Common Verification Commands

### View All Redis Keys
```bash
redis-cli keys "swarm:*"
```

### Clear All Test Data (before each test)
```bash
redis-cli flushdb
```

### Monitor Redis Commands in Real-Time
```bash
redis-cli monitor | grep "swarm:"
```

### Check Agent Output Logs
```bash
# Logs are printed to stdout during spawning
# Look for bash_execute tool usage in agent output
```

---

## Test Execution Log Template

### Test 1: Bidirectional
- **Date:** _________
- **Status:** ⏳ Not Run / ✅ Pass / ❌ Fail
- **Issues:** _________
- **Final Confidence:** _________
- **Iterations:** _________

### Test 2: Collaborative
- **Date:** _________
- **Status:** ⏳ Not Run / ✅ Pass / ❌ Fail
- **Issues:** _________
- **Q&A Exchanges:** _________

### Test 3: Release Gate
- **Date:** _________
- **Status:** ⏳ Not Run / ✅ Pass / ❌ Fail
- **Issues:** _________
- **Barrier Wait Time:** _________

---

## Phase 2 Acceptance Criteria

✅ **Test 1 (Bidirectional):**
- Agents execute real redis-cli commands (not simulated)
- At least 2 iterations with feedback loop
- Final confidence ≥ 0.85
- All queues empty after completion

✅ **Test 2 (Collaborative):**
- Agents execute real redis-cli commands (not simulated)
- At least 2 Q&A exchanges
- All agents reach "complete" status
- Graceful shutdown with all_done flag

✅ **Test 3 (Release Gate):**
- Agents execute real redis-cli commands (not simulated)
- All agents wait at barrier (no premature exits)
- Coordinated release after all reach barrier
- All agents exit with "released" status

**Overall Success:** All 3 tests pass ✅

---

**Phase 2 Status:** 🟡 Implementation Complete - Testing Pending
**Next Step:** Run integration tests and verify Redis coordination
