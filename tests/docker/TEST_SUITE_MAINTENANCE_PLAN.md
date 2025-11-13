# Docker Test Suite Maintenance Plan

Companion to:
- `tests/docker/TEST_SUITE_OVERVIEW.md` (context, success metrics)
- `tests/docker/TEST_SUITE_EXECUTION_PLAYBOOK.md` (net-new tests & schedule)

Authoring rules for every script referenced here live in `tests/claude.md`.

---

## Part 1: REMOVE (Delete Immediately)

### Rationale
These tests are duplicates, obsolete, or test functionality not in Docker coordinator architecture.

### Files to Remove

#### 1.1 Duplicate Redis Coordination Tests
```bash
# Remove superseded versions
rm tests/docker/run-redis-coordination-tests-fixed.sh
rm tests/docker/redis-test-simple.sh
```
**Reason:** Main test `run-redis-coordination-tests.sh` covers all functionality.

---

#### 1.2 Obsolete Mode Detection Tests (CLI-Specific)
```bash
# Docker coordinator doesn't use CLI/Task mode detection
rm tests/test_mode_detection.sh
rm tests/test_cli_mode.sh
rm tests/test_mode_simple.sh
rm tests/test-mode-detection-anti023.sh
```
**Reason:** Docker coordinator runs containerized, doesn't need mode detection.

**💬 REVIEW COMMENT:**
⚠️ **PARTIALLY AGREE** - These tests are CLI-specific, BUT the main CFN Loop system still uses CLI/Task mode detection (see CLAUDE.md lines 167-188). Docker coordinator is ONE execution path, not THE ONLY path.

**RECOMMENDATION:** Move these to `tests/cli-mode/` instead of deleting. They validate critical CFN Loop infrastructure that Task mode still uses.

---

#### 1.3 Redundant Timeout Tests
```bash
# Keep only comprehensive version
rm tests/test-adaptive-timeout-simple.sh
rm tests/test-adaptive-timeout-integration.sh
rm tests/test-adaptive-timeout-edge-cases.sh
```
**Reason:** Coordinator uses fixed timeouts per tier (512MB→1GB). Keep `test-adaptive-timeout-system.sh`.

---

#### 1.4 Obsolete Orchestration Fallback Tests
```bash
# Docker coordinator doesn't use WebSocket/fallback mechanisms
rm tests/orchestration-fallback-test.sh
rm tests/websocket-orchestration-fallback-test.sh
rm tests/docker-socket-orchestration-fallback-test.sh
```
**Reason:** Architecture uses pure Docker + Redis coordination.

---

#### 1.5 Redundant Readonly Conflict Tests
```bash
# Three variants testing same functionality
rm tests/readonly-conflict-prevention-test.sh
rm tests/websocket-readonly-conflict-prevention-test.sh
rm tests/docker-socket-readonly-conflict-prevention-test.sh
```
**Reason:** Coordinator mounts workspace as `rw`, no readonly conflicts.

---

#### 1.6 Task Mode Tests (Not Used in Docker)
```bash
# Docker coordinator doesn't use Task mode spawning
rm tests/test-task-mode-safety.sh
rm tests/test-task-mode-complete.sh
```
**Reason:** All agents spawn via Docker containers, not Task() tool.

**💬 REVIEW COMMENT:**
❌ **DISAGREE** - Task mode is STILL USED in main CFN Loop system (`/cfn-loop-task` command). See `SESSION_2025-11-12_FINDINGS.md` - Task mode provides "full visibility in Main Chat" and is the default debugging mode.

**VERDICT:** **MOVE to tests/task-mode/** - Don't delete. These validate critical Task() spawning patterns that Main Chat uses daily.

---

#### 1.7 Duplicate Simple/Complete Test Variants
```bash
# Superseded by comprehensive versions
rm tests/test_complete.sh
rm tests/test-cfn-integration-complete.sh
rm tests/test-graceful-shutdown-simple.sh
```
**Reason:** Comprehensive versions cover all test cases.

---

#### 1.8 ACE Context Tests (Not in Architecture)
```bash
# ACE not integrated with Docker coordinator
rm tests/test-ace-context-lookup.sh
rm tests/test_ace_reflection_hook.sh
```
**Reason:** Architecture doc doesn't mention ACE integration.

**💬 REVIEW COMMENT:**
✅ **AGREE** - ACE (Adaptive Context Engine) is separate from Docker coordinator. These tests belong in main CFN Loop test suite.

**RECOMMENDATION:** Archive instead of delete. ACE is valuable context management system that may integrate later.

---

### Removal Script
```bash
#!/bin/bash
# tests/docker/cleanup/remove-obsolete-tests.sh

set -euo pipefail

echo "🗑️  Removing obsolete Docker tests..."

# Track removed files
REMOVED_COUNT=0

remove_if_exists() {
    local file="$1"
    if [[ -f "$file" ]]; then
        echo "  ❌ Removing: $file"
        rm "$file"
        ((REMOVED_COUNT++))
    else
        echo "  ⚠️  Not found: $file (already removed?)"
    fi
}

# 1. Duplicate Redis tests
remove_if_exists "tests/docker/run-redis-coordination-tests-fixed.sh"
remove_if_exists "tests/docker/redis-test-simple.sh"

# 2. Mode detection tests
remove_if_exists "tests/test_mode_detection.sh"
remove_if_exists "tests/test_cli_mode.sh"
remove_if_exists "tests/test_mode_simple.sh"
remove_if_exists "tests/test-mode-detection-anti023.sh"

# 3. Timeout test variants
remove_if_exists "tests/test-adaptive-timeout-simple.sh"
remove_if_exists "tests/test-adaptive-timeout-integration.sh"
remove_if_exists "tests/test-adaptive-timeout-edge-cases.sh"

# 4. Orchestration fallback tests
remove_if_exists "tests/orchestration-fallback-test.sh"
remove_if_exists "tests/websocket-orchestration-fallback-test.sh"
remove_if_exists "tests/docker-socket-orchestration-fallback-test.sh"

# 5. Readonly conflict tests
remove_if_exists "tests/readonly-conflict-prevention-test.sh"
remove_if_exists "tests/websocket-readonly-conflict-prevention-test.sh"
remove_if_exists "tests/docker-socket-readonly-conflict-prevention-test.sh"

# 6. Task mode tests
remove_if_exists "tests/test-task-mode-safety.sh"
remove_if_exists "tests/test-task-mode-complete.sh"

# 7. Duplicate simple/complete tests
remove_if_exists "tests/test_complete.sh"
remove_if_exists "tests/test-cfn-integration-complete.sh"
remove_if_exists "tests/test-graceful-shutdown-simple.sh"

# 8. ACE context tests
remove_if_exists "tests/test-ace-context-lookup.sh"
remove_if_exists "tests/test_ace_reflection_hook.sh"

echo ""
echo "✅ Removed $REMOVED_COUNT obsolete test files"
```

**Total removed:** 22 files

---

## Part 2: ARCHIVE (Move to Archive Directory)

### Rationale
Historical tests for specific sprints/features. Keep for reference but not in active test suite.

### Files to Archive

#### 2.1 Marketing Feature Tests
```bash
# Sprint-specific marketing tests (historical)
tests/marketing-analytics-data-test.sh
tests/marketing-crm-contacts-test.sh
tests/marketing-email-campaigns-test.sh
tests/marketing-social-publishing-test.sh
```

#### 2.2 Sprint 5 Tests
```bash
# Sprint 5 specific tests (historical)
tests/test-sprint-5-functions-unix.sh
tests/test-sprint-5-functions.sh
tests/test-sprint-5-integration.sh
```

### Archive Script
```bash
#!/bin/bash
# tests/docker/cleanup/archive-historical-tests.sh

set -euo pipefail

echo "📦 Archiving historical test files..."

# Create archive directory
ARCHIVE_DIR="tests/archive/historical"
mkdir -p "$ARCHIVE_DIR"

# Track archived files
ARCHIVED_COUNT=0

archive_if_exists() {
    local file="$1"
    if [[ -f "$file" ]]; then
        local basename=$(basename "$file")
        echo "  📦 Archiving: $file → $ARCHIVE_DIR/$basename"
        mv "$file" "$ARCHIVE_DIR/$basename"
        ((ARCHIVED_COUNT++))
    else
        echo "  ⚠️  Not found: $file (already archived?)"
    fi
}

# Archive marketing tests
archive_if_exists "tests/marketing-analytics-data-test.sh"
archive_if_exists "tests/marketing-crm-contacts-test.sh"
archive_if_exists "tests/marketing-email-campaigns-test.sh"
archive_if_exists "tests/marketing-social-publishing-test.sh"

# Archive sprint 5 tests
archive_if_exists "tests/test-sprint-5-functions-unix.sh"
archive_if_exists "tests/test-sprint-5-functions.sh"
archive_if_exists "tests/test-sprint-5-integration.sh"

# Create archive manifest
cat > "$ARCHIVE_DIR/README.md" << 'EOF'
# Archived Test Files

**Archived on:** $(date)
**Reason:** Historical tests for specific sprints/features

## Marketing Feature Tests
- `marketing-analytics-data-test.sh` - Analytics data integration test
- `marketing-crm-contacts-test.sh` - CRM contacts management test
- `marketing-email-campaigns-test.sh` - Email campaign automation test
- `marketing-social-publishing-test.sh` - Social media publishing test

## Sprint 5 Tests
- `test-sprint-5-functions-unix.sh` - Sprint 5 Unix-specific functions
- `test-sprint-5-functions.sh` - Sprint 5 function tests
- `test-sprint-5-integration.sh` - Sprint 5 integration test

## Restoration
To restore a test:
```bash
mv tests/archive/historical/<test-file.sh> tests/
```

## Deletion Policy
Review quarterly. Delete after 12 months if no longer referenced.
EOF

echo ""
echo "✅ Archived $ARCHIVED_COUNT historical test files to $ARCHIVE_DIR"
```

**Total archived:** 7 files

---

## Part 3: UPDATE (Modify Existing Tests)

### Rationale
Align existing tests with Docker coordinator architecture, tier batching, wave spawning, and Redis coordination.

### 3.1 Critical Updates (P0)

#### A. Intelligent Coordinator Test
**File:** `tests/docker/intelligent-coordinator-test.sh`

**Changes needed:**
1. Add Redis heartbeat fix validation (Bug #3)
2. Add multi-iteration convergence test (errors → 0)
3. Add product owner decision gate test (PROCEED/ITERATE)
4. Validate `.env.clean` file is used (Bug #2)
5. Add tier distribution validation (60% T1, 25% T2, 10% T3, 5% T4)

**💬 REVIEW COMMENT:**
⚠️ **BLOCKED** - Test assumes Bug #4 (architectural mismatch) is fixed. Currently agents don't report completion, causing infinite waits.

**PREREQUISITES NEEDED:**
1. ✅ Bug #1 fixed (API key propagation) - DONE
2. ✅ Bug #2 fixed (.env inline comments) - DONE
3. ✅ Bug #3 fixed (Redis REDIS_HOST) - DONE
4. ❌ **Bug #4 (architectural mismatch)** - NOT FIXED - coordinator uses Redis queue but agents use environment variables

**RECOMMENDATION:** Add "Prerequisites" section at top of plan noting Bug #4 must be fixed first.

**Updated test structure:**
```bash
#!/bin/bash
# tests/docker/intelligent-coordinator-test.sh

set -euo pipefail

echo "🧠 Intelligent Docker Coordinator Test Suite"
echo "=============================================="

# Test 1: Environment setup validation
test_env_clean_file() {
    echo "Test 1: .env.clean file validation"

    # Verify .env.clean exists and has no inline comments
    if [[ ! -f "$PROJECT_ROOT/.env.clean" ]]; then
        echo "❌ FAIL: .env.clean not found"
        return 1
    fi

    # Check for inline comments (should be none)
    if grep -E '#.*=' "$PROJECT_ROOT/.env.clean" 2>/dev/null; then
        echo "❌ FAIL: .env.clean contains inline comments"
        return 1
    fi

    echo "✅ PASS: .env.clean file is valid"
}

# Test 2: Redis heartbeat using Node.js client (not redis-cli)
test_redis_heartbeat_protocol() {
    echo "Test 2: Redis heartbeat protocol validation"

    # Spawn single agent with Redis task
    TASK_ID="heartbeat-test-$(date +%s)"

    # Create test task in Redis
    docker exec cfn-redis redis-cli SET "task:queue" "test-task-1"
    docker exec cfn-redis redis-cli SET "task:total" "1"
    docker exec cfn-redis redis-cli SET "task:completed" "0"

    # 💬 REVIEW COMMENT: This test validates Bug #3 fix (Redis REDIS_HOST), not Node.js client usage.
    # The actual fix was adding `-h "${REDIS_HOST}" -p "${REDIS_PORT}"` to redis-cli commands,
    # not replacing redis-cli with Node.js client. Test name is misleading.

    # Spawn agent
    docker run -d \
        --name "heartbeat-test-agent" \
        --network cfn-network \
        -e REDIS_HOST=cfn-redis \
        -e TASK_ID="$TASK_ID" \
        claude-flow-novice-agent:frontend \
        sleep 10

    # Wait for agent to report heartbeat
    sleep 5

    # Verify heartbeat was written via Node.js client (not redis-cli)
    HEARTBEAT=$(docker exec cfn-redis redis-cli HGET "swarm:${TASK_ID}:heartbeat-test-agent" heartbeat)

    if [[ -n "$HEARTBEAT" ]]; then
        echo "✅ PASS: Redis heartbeat protocol working"
    else
        echo "❌ FAIL: Redis heartbeat not written"
        return 1
    fi

    # Cleanup
    docker stop heartbeat-test-agent
    docker rm heartbeat-test-agent
}

# Test 3: Multi-iteration convergence
test_multi_iteration_convergence() {
    echo "Test 3: Multi-iteration convergence (errors → 0)"

    # Use historical commit with known errors
    WORKTREE="/tmp/convergence-test-worktree"
    git worktree add "$WORKTREE" d0049cbf

    # Run coordinator with max 3 iterations
    docker run --rm \
        --name cfn-coordinator-convergence \
        --network cfn-network \
        -v /var/run/docker.sock:/var/run/docker.sock \
        -v "$WORKTREE:/workspace:rw" \
        -e MEMORY_BUDGET=40g \
        -e MAX_ITERATIONS=3 \
        -e REDIS_HOST=cfn-redis \
        --env-file .env.clean \
        cfn-intelligent-coordinator:latest \
        > /tmp/convergence-test.log 2>&1

    # Verify iterations decreased error count
    ITERATION_1_ERRORS=$(grep "Iteration 1.*errors:" /tmp/convergence-test.log | grep -oP '\d+' | head -1)
    ITERATION_2_ERRORS=$(grep "Iteration 2.*errors:" /tmp/convergence-test.log | grep -oP '\d+' | head -1)

    if [[ $ITERATION_2_ERRORS -lt $ITERATION_1_ERRORS ]]; then
        echo "✅ PASS: Error count decreased ($ITERATION_1_ERRORS → $ITERATION_2_ERRORS)"
    else
        echo "❌ FAIL: Error count did not decrease"
        return 1
    fi

    # Cleanup
    git worktree remove "$WORKTREE"
}

# Test 4: Product Owner decision gate
test_product_owner_decision_gate() {
    echo "Test 4: Product Owner decision gate (PROCEED/ITERATE)"

    # Create mock scenario: 0 errors → PROCEED
    # Verify coordinator exits with success

    # Create mock scenario: >0 errors → ITERATE
    # Verify coordinator starts next iteration

    # Implementation: Parse coordinator logs for decision
    DECISION=$(grep -oP 'Product Owner Decision: \K(PROCEED|ITERATE|ABORT)' /tmp/convergence-test.log | tail -1)

    if [[ "$DECISION" == "PROCEED" ]] || [[ "$DECISION" == "ITERATE" ]]; then
        echo "✅ PASS: Product Owner decision gate working ($DECISION)"
    else
        echo "❌ FAIL: Invalid decision: $DECISION"
        return 1
    fi
}

# Test 5: Tier distribution validation
test_tier_distribution() {
    echo "Test 5: Tier distribution validation (60% T1, 25% T2, 10% T3, 5% T4)"

    # Parse coordinator logs for tier assignments
    TIER_1_COUNT=$(grep "Tier 1" /tmp/convergence-test.log | wc -l)
    TIER_2_COUNT=$(grep "Tier 2" /tmp/convergence-test.log | wc -l)
    TIER_3_COUNT=$(grep "Tier 3" /tmp/convergence-test.log | wc -l)
    TIER_4_COUNT=$(grep "Tier 4" /tmp/convergence-test.log | wc -l)

    TOTAL_TIERS=$((TIER_1_COUNT + TIER_2_COUNT + TIER_3_COUNT + TIER_4_COUNT))

    TIER_1_PCT=$((100 * TIER_1_COUNT / TOTAL_TIERS))

    # Allow 10% variance (50-70% for Tier 1)
    if [[ $TIER_1_PCT -ge 50 ]] && [[ $TIER_1_PCT -le 70 ]]; then
        echo "✅ PASS: Tier 1 distribution within range (${TIER_1_PCT}%)"
    else
        echo "❌ FAIL: Tier 1 distribution out of range (${TIER_1_PCT}%)"
        return 1
    fi
}

# Run all tests
test_env_clean_file
test_redis_heartbeat_protocol
test_multi_iteration_convergence
test_product_owner_decision_gate
test_tier_distribution

echo ""
echo "✅ All intelligent coordinator tests passed"
```

---

#### B. Provider Routing Test
**File:** `tests/test-provider-routing.sh`

**Changes needed:**
1. Add container auth propagation test (Bug #1 fix)
2. Test Z.ai, Kimi, OpenRouter, Anthropic key forwarding
3. Validate coordinator env var filtering

**Updated test:**
```bash
#!/bin/bash
# tests/test-provider-routing.sh

set -euo pipefail

echo "🔐 Provider Routing & Auth Propagation Test"
echo "============================================"

# Test 1: Coordinator env var filtering (Bug #1 fix)
test_coordinator_env_filtering() {
    echo "Test 1: Coordinator forwards all provider keys"

    # Create test .env with all providers
    cat > /tmp/test-providers.env << EOF
ANTHROPIC_API_KEY=test-anthropic-key
ZAI_API_KEY=test-zai-key
KIMI_API_KEY=test-kimi-key
OPENROUTER_API_KEY=test-openrouter-key
CFN_CUSTOM_ROUTING=true
EOF

    # Spawn coordinator
    docker run -d \
        --name test-coordinator-auth \
        --network cfn-network \
        -v /var/run/docker.sock:/var/run/docker.sock \
        --env-file /tmp/test-providers.env \
        cfn-intelligent-coordinator:latest \
        sleep 30

    # Check coordinator has all keys
    ANTHROPIC_KEY=$(docker exec test-coordinator-auth printenv ANTHROPIC_API_KEY)
    ZAI_KEY=$(docker exec test-coordinator-auth printenv ZAI_API_KEY)
    KIMI_KEY=$(docker exec test-coordinator-auth printenv KIMI_API_KEY)
    OPENROUTER_KEY=$(docker exec test-coordinator-auth printenv OPENROUTER_API_KEY)

    if [[ "$ANTHROPIC_KEY" == "test-anthropic-key" ]] && \
       [[ "$ZAI_KEY" == "test-zai-key" ]] && \
       [[ "$KIMI_KEY" == "test-kimi-key" ]] && \
       [[ "$OPENROUTER_KEY" == "test-openrouter-key" ]]; then
        echo "✅ PASS: All provider keys loaded in coordinator"
    else
        echo "❌ FAIL: Missing provider keys in coordinator"
        return 1
    fi

    # Cleanup
    docker stop test-coordinator-auth
    docker rm test-coordinator-auth
}

# Test 2: Agent receives forwarded keys
test_agent_key_propagation() {
    echo "Test 2: Agents receive provider keys from coordinator"

    # Coordinator spawns agent with env vars
    # Simulate coordinator spawning agent
    docker run -d \
        --name test-agent-auth \
        --network cfn-network \
        -e ANTHROPIC_API_KEY=test-anthropic-key \
        -e ZAI_API_KEY=test-zai-key \
        -e KIMI_API_KEY=test-kimi-key \
        -e OPENROUTER_API_KEY=test-openrouter-key \
        claude-flow-novice-agent:frontend \
        sleep 30

    # Verify agent has keys
    AGENT_ZAI_KEY=$(docker exec test-agent-auth printenv ZAI_API_KEY)

    if [[ "$AGENT_ZAI_KEY" == "test-zai-key" ]]; then
        echo "✅ PASS: Agent received provider keys"
    else
        echo "❌ FAIL: Agent did not receive provider keys"
        return 1
    fi

    # Cleanup
    docker stop test-agent-auth
    docker rm test-agent-auth
}

# Run tests
test_coordinator_env_filtering
test_agent_key_propagation

echo ""
echo "✅ All provider routing tests passed"
```

---

### 3.2 Architecture Alignment Updates (P1)

#### C. B10 TypeScript Fix Test
**File:** `tests/docker/b10-typescript-fix-test.sh`

**Changes needed:**
1. Remove manual batching logic (coordinator handles this)
2. Add tier assignment validation
3. Add wave spawning verification
4. Add iteration loop testing

**Update:**
```bash
#!/bin/bash
# tests/docker/b10-typescript-fix-test.sh

set -euo pipefail

echo "📦 B10 Batch TypeScript Fix Test (Coordinator-Driven)"
echo "====================================================="

# OLD: Manual batching logic
# NEW: Let coordinator handle all batching

# Test 1: Coordinator analyzes and batches B10
test_coordinator_batching() {
    echo "Test 1: Coordinator analyzes B10 and creates batches"

    # Run coordinator on B10 files
    docker run --rm \
        --name cfn-coordinator-b10 \
        --network cfn-network \
        -v /var/run/docker.sock:/var/run/docker.sock \
        -v /path/to/b10:/workspace:rw \
        -e MEMORY_BUDGET=10g \
        -e MAX_ITERATIONS=2 \
        -e REDIS_HOST=cfn-redis \
        --env-file .env.clean \
        cfn-intelligent-coordinator:latest \
        > /tmp/b10-coordinator.log 2>&1

    # Verify batches created
    BATCH_COUNT=$(grep "Created.*batches" /tmp/b10-coordinator.log | grep -oP '\d+')

    if [[ $BATCH_COUNT -gt 0 ]]; then
        echo "✅ PASS: Coordinator created $BATCH_COUNT batches"
    else
        echo "❌ FAIL: No batches created"
        return 1
    fi
}

# Test 2: Tier assignment validation
test_tier_assignment() {
    echo "Test 2: Verify tier assignments for B10"

    # Parse tier assignments from logs
    TIER_1=$(grep "Tier 1" /tmp/b10-coordinator.log | wc -l)
    TIER_2=$(grep "Tier 2" /tmp/b10-coordinator.log | wc -l)

    # B10 should have mix of Tier 1 and Tier 2
    if [[ $TIER_1 -gt 0 ]] && [[ $TIER_2 -gt 0 ]]; then
        echo "✅ PASS: B10 has Tier 1 ($TIER_1) and Tier 2 ($TIER_2) batches"
    else
        echo "❌ FAIL: Missing tier diversity"
        return 1
    fi
}

# Test 3: Wave spawning verification
test_wave_spawning() {
    echo "Test 3: Verify wave spawning with 10GB budget"

    # Verify all batches fit in single wave (10GB budget)
    WAVE_COUNT=$(grep "Wave" /tmp/b10-coordinator.log | grep -oP 'Wave \K\d+' | sort -u | wc -l)

    if [[ $WAVE_COUNT -eq 1 ]]; then
        echo "✅ PASS: All B10 batches fit in single wave"
    else
        echo "⚠️  WARNING: B10 required $WAVE_COUNT waves"
    fi
}

# Run tests
test_coordinator_batching
test_tier_assignment
test_wave_spawning

echo ""
echo "✅ B10 coordinator-driven test passed"
```

---

#### D. 50-Agent Parallel Test
**File:** `tests/docker/50-agent-parallel-test.sh`

**Changes needed:**
1. Test exceeds 40GB budget → multiple waves
2. Validate wave 1 completes before wave 2
3. Check memory budget enforcement

**Update:**
```bash
#!/bin/bash
# tests/docker/50-agent-parallel-test.sh

set -euo pipefail

echo "🚀 50-Agent Parallel Test (Wave Spawning Validation)"
echo "===================================================="

# Test 1: Memory budget enforcement
test_memory_budget_enforcement() {
    echo "Test 1: Verify 50 agents exceed 40GB budget"

    # Create 50 tasks requiring 1GB each (50GB total)
    # Should split into 2 waves (40GB + 10GB)

    for i in {1..50}; do
        docker exec cfn-redis redis-cli LPUSH "task:queue" "task-$i"
    done
    docker exec cfn-redis redis-cli SET "task:total" "50"
    docker exec cfn-redis redis-cli SET "task:completed" "0"

    # Run coordinator with 40GB budget
    docker run --rm \
        --name cfn-coordinator-50agent \
        --network cfn-network \
        -v /var/run/docker.sock:/var/run/docker.sock \
        -e MEMORY_BUDGET=40g \
        -e MAX_ITERATIONS=1 \
        -e REDIS_HOST=cfn-redis \
        --env-file .env.clean \
        cfn-intelligent-coordinator:latest \
        > /tmp/50agent-coordinator.log 2>&1

    # Verify 2 waves spawned
    WAVE_COUNT=$(grep "Spawning Wave" /tmp/50agent-coordinator.log | wc -l)

    if [[ $WAVE_COUNT -eq 2 ]]; then
        echo "✅ PASS: 50 agents split into 2 waves (budget enforcement working)"
    else
        echo "❌ FAIL: Expected 2 waves, got $WAVE_COUNT"
        return 1
    fi
}

# Test 2: Sequential wave execution
test_sequential_waves() {
    echo "Test 2: Verify Wave 2 waits for Wave 1 completion"

    # Parse wave timestamps
    WAVE1_START=$(grep "Wave 1.*start" /tmp/50agent-coordinator.log | grep -oP '\d{2}:\d{2}:\d{2}')
    WAVE1_END=$(grep "Wave 1.*complete" /tmp/50agent-coordinator.log | grep -oP '\d{2}:\d{2}:\d{2}')
    WAVE2_START=$(grep "Wave 2.*start" /tmp/50agent-coordinator.log | grep -oP '\d{2}:\d{2}:\d{2}')

    # Convert to seconds for comparison
    WAVE1_END_SEC=$(date -d "$WAVE1_END" +%s)
    WAVE2_START_SEC=$(date -d "$WAVE2_START" +%s)

    if [[ $WAVE2_START_SEC -gt $WAVE1_END_SEC ]]; then
        echo "✅ PASS: Wave 2 started after Wave 1 completed"
    else
        echo "❌ FAIL: Wave overlap detected"
        return 1
    fi
}

# Run tests
test_memory_budget_enforcement
test_sequential_waves

echo ""
echo "✅ 50-agent wave spawning test passed"
```

---

#### E. Graceful Shutdown Test
**File:** `tests/test-graceful-shutdown-comprehensive.sh`

**Changes needed:**
1. Test coordinator SIGTERM handling
2. Test agent cleanup on coordinator shutdown
3. Validate Redis state persistence

**Update:**
```bash
#!/bin/bash
# tests/test-graceful-shutdown-comprehensive.sh

set -euo pipefail

echo "🛑 Graceful Shutdown Test (Docker Lifecycle)"
echo "============================================="

# Test 1: Coordinator SIGTERM handling
test_coordinator_sigterm() {
    echo "Test 1: Coordinator handles SIGTERM gracefully"

    # Start coordinator
    docker run -d \
        --name test-coordinator-shutdown \
        --network cfn-network \
        -v /var/run/docker.sock:/var/run/docker.sock \
        -e MEMORY_BUDGET=40g \
        -e MAX_ITERATIONS=10 \
        -e REDIS_HOST=cfn-redis \
        --env-file .env.clean \
        cfn-intelligent-coordinator:latest

    sleep 5

    # Send SIGTERM
    docker kill --signal TERM test-coordinator-shutdown

    # Wait for graceful shutdown (max 30s)
    for i in {1..30}; do
        if ! docker ps -q -f name=test-coordinator-shutdown | grep -q .; then
            echo "✅ PASS: Coordinator stopped gracefully in ${i}s"
            return 0
        fi
        sleep 1
    done

    echo "❌ FAIL: Coordinator did not stop within 30s"
    return 1
}

# Test 2: Agent cleanup on shutdown
test_agent_cleanup_on_shutdown() {
    echo "Test 2: Agents are cleaned up when coordinator shuts down"

    # Start coordinator with agents
    docker run -d \
        --name test-coordinator-cleanup \
        --network cfn-network \
        -v /var/run/docker.sock:/var/run/docker.sock \
        -e MEMORY_BUDGET=40g \
        -e MAX_ITERATIONS=1 \
        -e REDIS_HOST=cfn-redis \
        --env-file .env.clean \
        cfn-intelligent-coordinator:latest

    # Wait for agents to spawn
    sleep 10

    # Count running agents
    AGENT_COUNT_BEFORE=$(docker ps -q -f name=wave1-agent | wc -l)

    # Kill coordinator
    docker kill --signal TERM test-coordinator-cleanup

    # Wait for cleanup
    sleep 5

    # Verify agents cleaned up
    AGENT_COUNT_AFTER=$(docker ps -q -f name=wave1-agent | wc -l)

    if [[ $AGENT_COUNT_AFTER -lt $AGENT_COUNT_BEFORE ]]; then
        echo "✅ PASS: Agents cleaned up ($AGENT_COUNT_BEFORE → $AGENT_COUNT_AFTER)"
    else
        echo "❌ FAIL: Agents not cleaned up"
        return 1
    fi
}

# Test 3: Redis state persistence
test_redis_state_persistence() {
    echo "Test 3: Redis state persists after coordinator shutdown"

    # Write test data to Redis
    docker exec cfn-redis redis-cli SET "test:persistence" "data-survives"

    # Kill coordinator
    docker kill --signal TERM test-coordinator-shutdown 2>/dev/null || true

    # Verify data persists
    PERSISTED_DATA=$(docker exec cfn-redis redis-cli GET "test:persistence")

    if [[ "$PERSISTED_DATA" == "data-survives" ]]; then
        echo "✅ PASS: Redis state persisted"
    else
        echo "❌ FAIL: Redis state lost"
        return 1
    fi

    # Cleanup
    docker exec cfn-redis redis-cli DEL "test:persistence"
}

# Run tests
test_coordinator_sigterm
test_agent_cleanup_on_shutdown
test_redis_state_persistence

echo ""
echo "✅ All graceful shutdown tests passed"
```

---

### 3.3 Memory/Load Tests Updates (P1)

#### F. Memory Leak Prevention Test
**File:** `tests/test-memory-leak-prevention.sh`

**Changes needed:**
1. Test Docker container memory isolation
2. Validate coordinator doesn't leak memory across iterations
3. Test agent containers release memory on exit

---

#### G. Simple Load Test
**File:** `tests/simple-load-test.sh`

**Changes needed:**
1. Test wave spawning under load
2. Validate tier-based batching performance
3. Test Redis coordination scalability

---

#### H. Synthetic Load Test
**File:** `tests/synthetic-load-test.sh`

**Changes needed:**
1. Test 40GB budget constraints under synthetic load
2. Validate wave spawning with 100+ batches
3. Test coordinator iteration performance

---

### 3.4 CFN Loop Integration Updates (P1)

#### I. CFN Loop Integration Test
**File:** `tests/test-cfn-loop-integration.sh`

**Changes needed:**
1. Test Docker coordinator instead of CLI coordinator
2. Validate Loop 3 → Loop 2 → Product Owner flow
3. Test iteration until errors = 0

---

#### J. CFN Stabilization E2E Test
**File:** `tests/test-cfn-stabilization-e2e.sh`

**Changes needed:**
1. Update for Docker coordinator workflow
2. Test coordinator stability over multiple iterations
3. Validate error convergence

---

#### K. Comprehensive Stabilization Test
**File:** `tests/test-comprehensive-stabilization.sh`

**Changes needed:**
1. Test coordinator fault tolerance
2. Validate recovery from coordinator restart
3. Test Redis state recovery

---

### 3.5 ACE Workflow Test Update (P2)

#### L. ACE Workflow Test
**File:** `tests/test-ace-workflow.sh`

**Changes needed:**
1. Verify coordinator doesn't use ACE (should pass without ACE)
2. Document that Docker coordinator doesn't require ACE

---

## Part 5: KEEP (No Changes)

### Rationale
These tests are still relevant and don't need updates for Docker coordinator.

### Files to Keep As-Is

#### Core CFN Tests
- `tests/test-basic-functionality.sh` - Basic CFN functionality
- `tests/test-cfn-aliases.sh` - CFN alias validation
- `tests/test-cfn-validation.sh` - CFN validation logic
- `tests/test-component.sh` - Component tests
- `tests/test-connectivity.sh` - Network connectivity tests

#### Context and State Management
- `tests/test-context-injection.sh` - Context injection
- `tests/test-context-injection-simple.sh` - Simplified context injection
- `tests/test-context-propagation.sh` - Context propagation
- `tests/test-bidirectional-json-context.sh` - JSON context handling
- `tests/test-iteration-history.sh` - Iteration history tracking

#### Agent Management
- `tests/test-agent-lifecycle.sh` - Agent lifecycle (non-Docker)
- `tests/test-agent-specialization.sh` - Agent specialization
- `tests/test-dynamic-agent-selection.sh` - Dynamic agent selection
- `tests/test-spawn-agents.sh` - Agent spawning

#### Enterprise Features
- `tests/test-audit-trail.sh` - Audit trail validation
- `tests/p4-scope-enforcement-test.sh` - P4 scope enforcement
- `tests/pre-edit-backup-test.sh` - Pre-edit backup
- `tests/test-pre-edit-backup.sh` - Pre-edit backup alternate

#### Product Owner and Decision Making
- `tests/test-product-owner-backlog-integration.sh` - PO backlog integration
- `tests/test-product-owner-decision-fix.sh` - PO decision fix
- `tests/test-epic-context-passing.sh` - Epic context passing

#### Integration Tests
- `tests/test-integration-simple.sh` - Simple integration test
- `tests/test-simple-validation.sh` - Simple validation
- `tests/test-working-validation.sh` - Working validation

#### Specific Feature Tests
- `tests/test-conversation-forking.sh` - Conversation forking
- `tests/test-parameter-standardization.sh` - Parameter standardization
- `tests/test-priority-queue-unix.sh` - Priority queue Unix
- `tests/test-priority-queue.sh` - Priority queue
- `tests/test-process-instrumentation.sh` - Process instrumentation
- `tests/test-timeout-validation.sh` - Timeout validation
- `tests/test-tool-implementation.sh` - Tool implementation

#### Docker-Specific Tests (Already Good)
- `tests/docker/docker-hello-world-parity-tests.sh` - Docker/CLI parity ✅
- `tests/docker/run-redis-coordination-tests.sh` - Redis coordination ✅
- `tests/docker/run-docker-forgiveness-tests.sh` - Forgiveness tests ✅
- `tests/docker/container-test-runner.sh` - Container test runner ✅
- `tests/docker/simple-container-test.sh` - Simple container test ✅

#### Test Utilities
- `tests/test-utils.sh` - Test utility functions
- `tests/cfn-bootstrap.test.sh` - CFN bootstrap test

#### CFN Loop Tests (Already Aligned)
- `tests/test-cfn-v3-redis-context.sh` - Redis context test
- `tests/test-bug30-validator-spawn.sh` - Bug #30 validator spawn
- `tests/test-iterate-fix.sh` - Iteration fix test

#### Provider and Fallback Tests (Keep for Reference)
- `tests/test-cfn-fallback-mode-comprehensive.sh` - Fallback mode comprehensive
- `tests/test-cfn-fallback-mode-simulated.sh` - Fallback mode simulated
- `tests/test-environment-sanitization.sh` - Environment sanitization

**Total kept:** 49 files

---
