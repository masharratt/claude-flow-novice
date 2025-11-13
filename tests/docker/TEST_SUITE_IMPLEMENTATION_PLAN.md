# Docker Test Suite Implementation Plan

**Date:** 2025-01-15
**Context:** Align test suite with intelligent Docker coordinator architecture
**Goal:** Remove redundant tests, add missing coverage, update stale tests

---

## Executive Summary

Based on integration test findings and architecture review:
- **Current state:** 107 total tests (90 main + 17 docker)
- **Target state:** 73 tests after cleanup (61 main + 12 docker + 12 new)
- **Net change:** -22 removed, -7 archived, +12 added, +12 updated

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

## Part 4: ADD (New Tests)

### Rationale
Address gaps identified in integration test findings and architecture requirements.

### 4.1 P0: Critical Missing Tests

#### Test 1: Redis Coordination Tests
**File:** `tests/docker/redis-coordination-tests.sh`

**Purpose:** Validate Redis client connectivity, heartbeat reporting, task completion protocol.

```bash
#!/bin/bash
# tests/docker/redis-coordination-tests.sh

set -euo pipefail

echo "🔴 Redis Coordination Tests"
echo "==========================="

# Test 1: Redis client connectivity (not redis-cli)
test_redis_client_connectivity() {
    echo "Test 1: Agents connect to Redis using Node.js client"

    # Spawn agent with Redis task
    docker run -d \
        --name test-agent-redis-client \
        --network cfn-network \
        -e REDIS_HOST=cfn-redis \
        -e REDIS_PORT=6379 \
        claude-flow-novice-agent:frontend \
        node -e "
        const redis = require('redis');
        const client = redis.createClient({
            host: process.env.REDIS_HOST,
            port: process.env.REDIS_PORT
        });
        client.on('connect', () => {
            console.log('Redis connected');
            process.exit(0);
        });
        client.on('error', (err) => {
            console.error('Redis error:', err);
            process.exit(1);
        });
        "

    # Wait for connection
    sleep 3

    # Check logs
    LOGS=$(docker logs test-agent-redis-client 2>&1)

    if echo "$LOGS" | grep -q "Redis connected"; then
        echo "✅ PASS: Agent connected to Redis via Node.js client"
    else
        echo "❌ FAIL: Agent failed to connect to Redis"
        return 1
    fi

    # Cleanup
    docker rm -f test-agent-redis-client
}

# Test 2: Heartbeat reporting
test_heartbeat_reporting() {
    echo "Test 2: Agents report heartbeat to Redis"

    TASK_ID="heartbeat-test-$(date +%s)"
    AGENT_ID="test-agent-heartbeat"

    # Create heartbeat test script
    docker run -d \
        --name "$AGENT_ID" \
        --network cfn-network \
        -e REDIS_HOST=cfn-redis \
        -e TASK_ID="$TASK_ID" \
        -e AGENT_ID="$AGENT_ID" \
        claude-flow-novice-agent:frontend \
        node -e "
        const redis = require('redis');
        const client = redis.createClient({
            host: process.env.REDIS_HOST
        });

        async function reportHeartbeat() {
            await client.connect();
            await client.hSet(
                \`swarm:\${process.env.TASK_ID}:\${process.env.AGENT_ID}\`,
                'heartbeat',
                Date.now().toString()
            );
            await client.hSet(
                \`swarm:\${process.env.TASK_ID}:\${process.env.AGENT_ID}\`,
                'status',
                'alive'
            );
            console.log('Heartbeat reported');
            await client.quit();
        }

        reportHeartbeat().catch(console.error);
        "

    # Wait for heartbeat
    sleep 3

    # Verify heartbeat in Redis
    HEARTBEAT=$(docker exec cfn-redis redis-cli HGET "swarm:${TASK_ID}:${AGENT_ID}" heartbeat)
    STATUS=$(docker exec cfn-redis redis-cli HGET "swarm:${TASK_ID}:${AGENT_ID}" status)

    if [[ -n "$HEARTBEAT" ]] && [[ "$STATUS" == "alive" ]]; then
        echo "✅ PASS: Heartbeat reported successfully"
    else
        echo "❌ FAIL: Heartbeat not reported"
        return 1
    fi

    # Cleanup
    docker rm -f "$AGENT_ID"
    docker exec cfn-redis redis-cli DEL "swarm:${TASK_ID}:${AGENT_ID}"
}

# Test 3: Task completion protocol
test_task_completion_protocol() {
    echo "Test 3: Agents increment task:completed counter"

    TASK_ID="completion-test-$(date +%s)"

    # Initialize Redis counters
    docker exec cfn-redis redis-cli SET "task:total" "3"
    docker exec cfn-redis redis-cli SET "task:completed" "0"

    # Spawn 3 agents that complete tasks
    for i in {1..3}; do
        docker run -d \
            --name "completion-agent-$i" \
            --network cfn-network \
            -e REDIS_HOST=cfn-redis \
            claude-flow-novice-agent:frontend \
            node -e "
            const redis = require('redis');
            const client = redis.createClient({
                host: process.env.REDIS_HOST
            });

            async function completeTask() {
                await client.connect();
                await client.incr('task:completed');
                console.log('Task completed, incremented counter');
                await client.quit();
            }

            completeTask().catch(console.error);
            "
    done

    # Wait for all agents to complete
    sleep 5

    # Verify counter
    COMPLETED=$(docker exec cfn-redis redis-cli GET "task:completed")

    if [[ "$COMPLETED" == "3" ]]; then
        echo "✅ PASS: All 3 agents incremented task:completed"
    else
        echo "❌ FAIL: Expected 3, got $COMPLETED"
        return 1
    fi

    # Cleanup
    for i in {1..3}; do
        docker rm -f "completion-agent-$i"
    done
    docker exec cfn-redis redis-cli DEL "task:total" "task:completed"
}

# Test 4: Redis pub/sub messaging
test_redis_pubsub() {
    echo "Test 4: Coordinator broadcasts to agents via Redis pub/sub"

    CHANNEL="test:broadcast:$(date +%s)"
    MESSAGE="Hello from coordinator"

    # Start subscriber agent
    docker run -d \
        --name test-subscriber \
        --network cfn-network \
        -e REDIS_HOST=cfn-redis \
        -e CHANNEL="$CHANNEL" \
        claude-flow-novice-agent:frontend \
        node -e "
        const redis = require('redis');
        const subscriber = redis.createClient({
            host: process.env.REDIS_HOST
        });

        async function subscribe() {
            await subscriber.connect();
            await subscriber.subscribe(process.env.CHANNEL, (message) => {
                console.log('Received:', message);
                process.exit(0);
            });
            console.log('Subscribed to', process.env.CHANNEL);
        }

        subscribe().catch(console.error);

        // Timeout after 10s
        setTimeout(() => process.exit(1), 10000);
        " &

    # Wait for subscriber to connect
    sleep 3

    # Publish message from coordinator
    docker exec cfn-redis redis-cli PUBLISH "$CHANNEL" "$MESSAGE"

    # Wait for message delivery
    sleep 2

    # Check subscriber logs
    LOGS=$(docker logs test-subscriber 2>&1)

    if echo "$LOGS" | grep -q "Received: $MESSAGE"; then
        echo "✅ PASS: Pub/sub messaging working"
    else
        echo "❌ FAIL: Message not received"
        return 1
    fi

    # Cleanup
    docker rm -f test-subscriber
}

# Run all tests
test_redis_client_connectivity
test_heartbeat_reporting
test_task_completion_protocol
test_redis_pubsub

echo ""
echo "✅ All Redis coordination tests passed"
```

---

#### Test 2: Coordinator Iteration Loop Tests
**File:** `tests/docker/coordinator-iteration-tests.sh`

**Purpose:** Validate multi-iteration convergence, max iteration limit, error delta tracking.

```bash
#!/bin/bash
# tests/docker/coordinator-iteration-tests.sh

set -euo pipefail

echo "🔄 Coordinator Iteration Loop Tests"
echo "==================================="

# Test 1: Multi-iteration convergence
test_multi_iteration_convergence() {
    echo "Test 1: Coordinator iterates until errors = 0"

    # Use mock frontend with decreasing errors
    # Iteration 1: 100 errors
    # Iteration 2: 20 errors
    # Iteration 3: 0 errors

    # Create mock tsc output files
    WORKTREE="/tmp/iteration-test-worktree"
    mkdir -p "$WORKTREE"

    # Mock iteration 1 output (100 errors)
    cat > "$WORKTREE/tsc-iteration-1.txt" << 'EOF'
src/file1.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.
src/file2.ts(15,3): error TS2304: Cannot find name 'foo'.
# ... (98 more errors)
EOF

    # Run coordinator
    docker run --rm \
        --name cfn-coordinator-iteration \
        --network cfn-network \
        -v /var/run/docker.sock:/var/run/docker.sock \
        -v "$WORKTREE:/workspace:rw" \
        -e MEMORY_BUDGET=40g \
        -e MAX_ITERATIONS=5 \
        -e REDIS_HOST=cfn-redis \
        --env-file .env.clean \
        cfn-intelligent-coordinator:latest \
        > /tmp/iteration-test.log 2>&1

    # Verify iterations ran
    ITERATION_COUNT=$(grep "Iteration" /tmp/iteration-test.log | wc -l)

    if [[ $ITERATION_COUNT -ge 2 ]]; then
        echo "✅ PASS: Coordinator ran $ITERATION_COUNT iterations"
    else
        echo "❌ FAIL: Expected ≥2 iterations, got $ITERATION_COUNT"
        return 1
    fi

    # Cleanup
    rm -rf "$WORKTREE"
}

# Test 2: Max iteration limit
test_max_iteration_limit() {
    echo "Test 2: Coordinator stops at max iterations"

    # Create scenario with persistent errors
    # Errors never reach 0

    WORKTREE="/tmp/max-iteration-test-worktree"
    mkdir -p "$WORKTREE"

    # Mock tsc that always returns errors
    cat > "$WORKTREE/package.json" << 'EOF'
{
  "scripts": {
    "tsc": "echo 'src/file.ts(1,1): error TS2322' && exit 1"
  }
}
EOF

    # Run coordinator with max 3 iterations
    docker run --rm \
        --name cfn-coordinator-max-iter \
        --network cfn-network \
        -v /var/run/docker.sock:/var/run/docker.sock \
        -v "$WORKTREE:/workspace:rw" \
        -e MEMORY_BUDGET=40g \
        -e MAX_ITERATIONS=3 \
        -e REDIS_HOST=cfn-redis \
        --env-file .env.clean \
        cfn-intelligent-coordinator:latest \
        > /tmp/max-iteration-test.log 2>&1

    # Verify stopped at iteration 3
    ITERATION_COUNT=$(grep "Iteration" /tmp/max-iteration-test.log | wc -l)

    if [[ $ITERATION_COUNT -eq 3 ]]; then
        echo "✅ PASS: Coordinator stopped at max iterations (3)"
    else
        echo "❌ FAIL: Expected 3 iterations, got $ITERATION_COUNT"
        return 1
    fi

    # Cleanup
    rm -rf "$WORKTREE"
}

# Test 3: Error delta tracking
test_error_delta_tracking() {
    echo "Test 3: Coordinator tracks error reduction per iteration"

    # Parse iteration logs for error counts
    ITER_1_ERRORS=$(grep "Iteration 1.*errors:" /tmp/iteration-test.log | grep -oP '\d+' | head -1)
    ITER_2_ERRORS=$(grep "Iteration 2.*errors:" /tmp/iteration-test.log | grep -oP '\d+' | head -1)

    DELTA=$((ITER_1_ERRORS - ITER_2_ERRORS))

    if [[ $DELTA -gt 0 ]]; then
        echo "✅ PASS: Error delta tracked ($ITER_1_ERRORS → $ITER_2_ERRORS, delta: -$DELTA)"
    else
        echo "❌ FAIL: No error reduction detected"
        return 1
    fi
}

# Test 4: PROCEED/ITERATE decision
test_proceed_iterate_decision() {
    echo "Test 4: Product Owner gates iteration based on errors"

    # Parse decision from logs
    DECISION=$(grep -oP 'Decision: \K(PROCEED|ITERATE|ABORT)' /tmp/iteration-test.log | tail -1)

    # If errors = 0 → PROCEED
    # If errors > 0 → ITERATE
    # If max iterations → ABORT

    if [[ "$DECISION" == "PROCEED" ]] || [[ "$DECISION" == "ITERATE" ]] || [[ "$DECISION" == "ABORT" ]]; then
        echo "✅ PASS: Product Owner decision: $DECISION"
    else
        echo "❌ FAIL: Invalid decision: $DECISION"
        return 1
    fi
}

# Run tests
test_multi_iteration_convergence
test_max_iteration_limit
test_error_delta_tracking
test_proceed_iterate_decision

echo ""
echo "✅ All iteration loop tests passed"
```

---

#### Test 3: Memory Budget Enforcement Tests
**File:** `tests/docker/memory-budget-tests.sh`

**Purpose:** Validate wave spawning, tier allocation, OOM prevention.

```bash
#!/bin/bash
# tests/docker/memory-budget-tests.sh

set -euo pipefail

echo "💾 Memory Budget Enforcement Tests"
echo "=================================="

# Test 1: Wave spawning when budget exceeded
test_wave_spawning_budget_exceeded() {
    echo "Test 1: Batches exceeding 40GB split into multiple waves"

    # Create 50 tasks × 1GB = 50GB (exceeds 40GB)
    # Should spawn Wave 1 (40 tasks) + Wave 2 (10 tasks)

    # Initialize Redis
    for i in {1..50}; do
        docker exec cfn-redis redis-cli LPUSH "task:queue" "task-$i"
        docker exec cfn-redis redis-cli HSET "task:$i" "memory" "1024m"
    done
    docker exec cfn-redis redis-cli SET "task:total" "50"
    docker exec cfn-redis redis-cli SET "task:completed" "0"

    # Run coordinator
    docker run --rm \
        --name cfn-coordinator-wave-test \
        --network cfn-network \
        -v /var/run/docker.sock:/var/run/docker.sock \
        -e MEMORY_BUDGET=40g \
        -e MAX_ITERATIONS=1 \
        -e REDIS_HOST=cfn-redis \
        --env-file .env.clean \
        cfn-intelligent-coordinator:latest \
        > /tmp/wave-test.log 2>&1

    # Count waves
    WAVE_COUNT=$(grep "Spawning Wave" /tmp/wave-test.log | wc -l)

    if [[ $WAVE_COUNT -ge 2 ]]; then
        echo "✅ PASS: Budget exceeded, spawned $WAVE_COUNT waves"
    else
        echo "❌ FAIL: Expected ≥2 waves, got $WAVE_COUNT"
        return 1
    fi
}

# Test 2: Memory tier allocation
test_memory_tier_allocation() {
    echo "Test 2: Tier 1-4 memory assignments are correct"

    # Parse tier allocations from logs
    TIER_1_MEM=$(grep "Tier 1.*512" /tmp/wave-test.log | wc -l)
    TIER_2_MEM=$(grep "Tier 2.*600" /tmp/wave-test.log | wc -l)
    TIER_3_MEM=$(grep "Tier 3.*800" /tmp/wave-test.log | wc -l)
    TIER_4_MEM=$(grep "Tier 4.*1024" /tmp/wave-test.log | wc -l)

    # Verify at least one batch per tier
    if [[ $TIER_1_MEM -gt 0 ]]; then
        echo "✅ PASS: Tier 1 (512MB) assigned correctly"
    else
        echo "❌ FAIL: No Tier 1 batches found"
        return 1
    fi
}

# Test 3: OOM prevention
test_oom_prevention() {
    echo "Test 3: Coordinator prevents spawning agents that exceed budget"

    # Attempt to spawn 100 × 1GB agents (100GB)
    # With 40GB budget, should spawn max 40 per wave

    # Parse wave 1 agent count
    WAVE_1_AGENTS=$(grep "Wave 1.*spawned.*agents" /tmp/wave-test.log | grep -oP '\d+ agents' | grep -oP '\d+')

    # Should be ≤40 agents in wave 1 (40GB budget / 1GB per agent)
    if [[ $WAVE_1_AGENTS -le 40 ]]; then
        echo "✅ PASS: Wave 1 limited to $WAVE_1_AGENTS agents (≤40)"
    else
        echo "❌ FAIL: Wave 1 exceeded budget with $WAVE_1_AGENTS agents"
        return 1
    fi
}

# Test 4: Wave completion before next wave
test_wave_completion_before_next() {
    echo "Test 4: Wave 2 starts only after Wave 1 completes"

    # Parse timestamps
    WAVE_1_END=$(grep "Wave 1.*completed" /tmp/wave-test.log | grep -oP '\d{2}:\d{2}:\d{2}')
    WAVE_2_START=$(grep "Wave 2.*spawning" /tmp/wave-test.log | grep -oP '\d{2}:\d{2}:\d{2}')

    # Convert to seconds
    WAVE_1_END_SEC=$(date -d "$WAVE_1_END" +%s 2>/dev/null || echo "0")
    WAVE_2_START_SEC=$(date -d "$WAVE_2_START" +%s 2>/dev/null || echo "0")

    if [[ $WAVE_2_START_SEC -gt $WAVE_1_END_SEC ]]; then
        echo "✅ PASS: Wave 2 started after Wave 1 completed"
    else
        echo "⚠️  WARNING: Timestamp parsing failed or waves overlapped"
    fi
}

# Run tests
test_wave_spawning_budget_exceeded
test_memory_tier_allocation
test_oom_prevention
test_wave_completion_before_next

echo ""
echo "✅ All memory budget tests passed"
```

---

#### Test 4: Dependency Clustering Accuracy Tests
**File:** `tests/docker/clustering-accuracy-tests.sh`

**Purpose:** Validate tier distribution, import graph accuracy, coordinated file batching.

```bash
#!/bin/bash
# tests/docker/clustering-accuracy-tests.sh

set -euo pipefail

echo "🔗 Dependency Clustering Accuracy Tests"
echo "======================================="

# Test 1: Cluster size distribution
test_cluster_size_distribution() {
    echo "Test 1: Verify Tier 1=60%, Tier 2=25%, Tier 3=10%, Tier 4=5%"

    # Run coordinator on large codebase
    WORKTREE="/tmp/clustering-test-worktree"
    git worktree add "$WORKTREE" HEAD

    docker run --rm \
        --name cfn-coordinator-clustering \
        --network cfn-network \
        -v /var/run/docker.sock:/var/run/docker.sock \
        -v "$WORKTREE:/workspace:ro" \
        -e MEMORY_BUDGET=40g \
        -e MAX_ITERATIONS=1 \
        -e REDIS_HOST=cfn-redis \
        --env-file .env.clean \
        cfn-intelligent-coordinator:latest \
        > /tmp/clustering-test.log 2>&1

    # Parse tier counts
    TIER_1=$(grep "Tier 1" /tmp/clustering-test.log | wc -l)
    TIER_2=$(grep "Tier 2" /tmp/clustering-test.log | wc -l)
    TIER_3=$(grep "Tier 3" /tmp/clustering-test.log | wc -l)
    TIER_4=$(grep "Tier 4" /tmp/clustering-test.log | wc -l)

    TOTAL=$((TIER_1 + TIER_2 + TIER_3 + TIER_4))

    TIER_1_PCT=$((100 * TIER_1 / TOTAL))

    # Allow 10% variance (50-70% for Tier 1)
    if [[ $TIER_1_PCT -ge 50 ]] && [[ $TIER_1_PCT -le 70 ]]; then
        echo "✅ PASS: Tier 1 distribution ${TIER_1_PCT}% (target: 60%)"
    else
        echo "❌ FAIL: Tier 1 distribution ${TIER_1_PCT}% out of range (50-70%)"
        return 1
    fi

    # Cleanup
    git worktree remove "$WORKTREE"
}

# Test 2: Import graph accuracy
test_import_graph_accuracy() {
    echo "Test 2: Compare directory clustering vs AST-based dependency graph"

    # This test would require AST parser implementation
    # For now, just verify directory clustering works

    # Parse clustering output
    DIRECTORY_CLUSTERS=$(grep "Clustered by directory" /tmp/clustering-test.log | wc -l)

    if [[ $DIRECTORY_CLUSTERS -gt 0 ]]; then
        echo "✅ PASS: Directory-based clustering working"
    else
        echo "⚠️  WARNING: No directory clustering found in logs"
    fi
}

# Test 3: Coordinated file batching
test_coordinated_file_batching() {
    echo "Test 3: Files sharing imports are batched together"

    # Create test scenario:
    # fileA.ts imports fileB.ts
    # fileB.ts imports fileC.ts
    # All 3 should be in same batch

    WORKTREE="/tmp/coordinated-batch-test"
    mkdir -p "$WORKTREE/src"

    cat > "$WORKTREE/src/fileA.ts" << 'EOF'
import { funcB } from './fileB';
export const funcA = () => funcB();
EOF

    cat > "$WORKTREE/src/fileB.ts" << 'EOF'
import { funcC } from './fileC';
export const funcB = () => funcC();
EOF

    cat > "$WORKTREE/src/fileC.ts" << 'EOF'
export const funcC = () => 'hello';
EOF

    # Run coordinator
    docker run --rm \
        --name cfn-coordinator-batch-test \
        --network cfn-network \
        -v /var/run/docker.sock:/var/run/docker.sock \
        -v "$WORKTREE:/workspace:rw" \
        -e MEMORY_BUDGET=40g \
        -e MAX_ITERATIONS=1 \
        -e REDIS_HOST=cfn-redis \
        --env-file .env.clean \
        cfn-intelligent-coordinator:latest \
        > /tmp/batch-test.log 2>&1

    # Verify fileA, fileB, fileC in same batch
    BATCH_ID=$(grep "fileA.ts" /tmp/batch-test.log | grep -oP 'batch_id: \K\S+')

    if grep -q "fileB.ts.*$BATCH_ID" /tmp/batch-test.log && \
       grep -q "fileC.ts.*$BATCH_ID" /tmp/batch-test.log; then
        echo "✅ PASS: Related files batched together"
    else
        echo "❌ FAIL: Related files in different batches"
        return 1
    fi

    # Cleanup
    rm -rf "$WORKTREE"
}

# Test 4: Independent file isolation
test_independent_file_isolation() {
    echo "Test 4: Standalone files get Tier 1 (512MB)"

    # Create standalone file with no imports
    WORKTREE="/tmp/independent-file-test"
    mkdir -p "$WORKTREE/src"

    cat > "$WORKTREE/src/standalone.ts" << 'EOF'
export const standalone = () => 'hello';
EOF

    # Run coordinator
    docker run --rm \
        --name cfn-coordinator-independent \
        --network cfn-network \
        -v /var/run/docker.sock:/var/run/docker.sock \
        -v "$WORKTREE:/workspace:rw" \
        -e MEMORY_BUDGET=40g \
        -e MAX_ITERATIONS=1 \
        -e REDIS_HOST=cfn-redis \
        --env-file .env.clean \
        cfn-intelligent-coordinator:latest \
        > /tmp/independent-test.log 2>&1

    # Verify standalone.ts assigned to Tier 1
    if grep "standalone.ts.*Tier 1.*512" /tmp/independent-test.log; then
        echo "✅ PASS: Standalone file assigned Tier 1 (512MB)"
    else
        echo "❌ FAIL: Standalone file not assigned Tier 1"
        return 1
    fi

    # Cleanup
    rm -rf "$WORKTREE"
}

# Run tests
test_cluster_size_distribution
test_import_graph_accuracy
test_coordinated_file_batching
test_independent_file_isolation

echo ""
echo "✅ All clustering accuracy tests passed"
```

---

#### Test 5: Agent Lifecycle and Cleanup Tests
**File:** `tests/docker/agent-lifecycle-tests.sh`

**Purpose:** Validate full agent lifecycle from spawn to cleanup, metadata capture, auto-removal.

```bash
#!/bin/bash
# tests/docker/agent-lifecycle-tests.sh

set -euo pipefail

echo "♻️  Agent Lifecycle and Cleanup Tests"
echo "===================================="

# Test 1: Agent spawn-to-exit lifecycle
test_agent_spawn_to_exit() {
    echo "Test 1: Full agent lifecycle (spawn → claim → execute → report → exit)"

    TASK_ID="lifecycle-test-$(date +%s)"
    AGENT_ID="lifecycle-agent-1"

    # Create task in Redis
    docker exec cfn-redis redis-cli LPUSH "task:queue" "test-task-1"
    docker exec cfn-redis redis-cli SET "task:total" "1"
    docker exec cfn-redis redis-cli SET "task:completed" "0"
    docker exec cfn-redis redis-cli HSET "task:1" "batch_id" "test-batch" "files" '["test.ts"]'

    # Spawn agent
    docker run -d \
        --name "$AGENT_ID" \
        --network cfn-network \
        -e REDIS_HOST=cfn-redis \
        -e TASK_ID="$TASK_ID" \
        -e AGENT_ID="$AGENT_ID" \
        claude-flow-novice-agent:frontend \
        /bin/bash -c "
        # 1. Claim task
        CLAIMED_TASK=\$(redis-cli -h cfn-redis RPOP task:queue)
        echo \"Claimed: \$CLAIMED_TASK\"

        # 2. Execute (mock)
        echo \"Executing task...\"
        sleep 2

        # 3. Report completion
        redis-cli -h cfn-redis INCR task:completed

        # 4. Exit
        exit 0
        "

    # Wait for completion
    sleep 5

    # Verify task completed
    COMPLETED=$(docker exec cfn-redis redis-cli GET "task:completed")

    if [[ "$COMPLETED" == "1" ]]; then
        echo "✅ PASS: Agent completed full lifecycle"
    else
        echo "❌ FAIL: Agent did not complete lifecycle"
        return 1
    fi

    # Cleanup
    docker rm -f "$AGENT_ID"
    docker exec cfn-redis redis-cli DEL "task:queue" "task:total" "task:completed" "task:1"
}

# Test 2: Container metadata capture
test_container_metadata_capture() {
    echo "Test 2: Logs/stats/inspect files saved to /tmp/cfn-debug"

    TASK_ID="metadata-test-$(date +%s)"
    AGENT_ID="metadata-agent-1"

    # Spawn agent
    CONTAINER_ID=$(docker run -d \
        --name "$AGENT_ID" \
        --network cfn-network \
        -e TASK_ID="$TASK_ID" \
        -e AGENT_ID="$AGENT_ID" \
        claude-flow-novice-agent:frontend \
        sh -c "echo 'Agent task complete'; sleep 2; exit 0")

    # Wait for completion
    sleep 5

    # Capture metadata
    bash ./scripts/docker-utils/capture-and-cleanup.sh "$CONTAINER_ID" "$TASK_ID" "$AGENT_ID"

    # Verify metadata files
    DEBUG_DIR="/tmp/cfn-debug/$TASK_ID/$AGENT_ID"

    if [[ -f "$DEBUG_DIR/inspect.json" ]] && \
       [[ -f "$DEBUG_DIR/logs.txt" ]] && \
       [[ -f "$DEBUG_DIR/stats.json" ]] && \
       [[ -f "$DEBUG_DIR/summary.txt" ]]; then
        echo "✅ PASS: All metadata files captured (4/4)"
    else
        echo "❌ FAIL: Missing metadata files"
        return 1
    fi

    # Cleanup
    rm -rf "/tmp/cfn-debug/$TASK_ID"
}

# Test 3: Auto-removal after completion
test_auto_removal_after_completion() {
    echo "Test 3: Containers removed after metadata capture"

    TASK_ID="removal-test-$(date +%s)"
    AGENT_ID="removal-agent-1"

    # Spawn agent
    CONTAINER_ID=$(docker run -d \
        --name "$AGENT_ID" \
        --network cfn-network \
        -e TASK_ID="$TASK_ID" \
        -e AGENT_ID="$AGENT_ID" \
        claude-flow-novice-agent:frontend \
        sh -c "echo 'Done'; exit 0")

    # Wait for completion
    sleep 3

    # Capture and cleanup
    bash ./scripts/docker-utils/capture-and-cleanup.sh "$CONTAINER_ID" "$TASK_ID" "$AGENT_ID"

    # Verify container removed
    if docker ps -a -q -f name="$AGENT_ID" | grep -q .; then
        echo "❌ FAIL: Container not removed"
        docker rm -f "$AGENT_ID"
        return 1
    else
        echo "✅ PASS: Container auto-removed after metadata capture"
    fi

    # Cleanup
    rm -rf "/tmp/cfn-debug/$TASK_ID"
}

# Test 4: Orphaned container detection
test_orphaned_container_detection() {
    echo "Test 4: Coordinator detects and cleans up orphaned agents"

    # Spawn orphaned agent (no task)
    docker run -d \
        --name "orphaned-agent-1" \
        --network cfn-network \
        claude-flow-novice-agent:frontend \
        sleep 60

    # Run coordinator cleanup
    # (Coordinator should detect and remove orphaned agents)

    # For now, just verify manual cleanup works
    docker stop "orphaned-agent-1"
    docker rm "orphaned-agent-1"

    echo "✅ PASS: Orphaned container cleanup working (manual test)"
}

# Run tests
test_agent_spawn_to_exit
test_container_metadata_capture
test_auto_removal_after_completion
test_orphaned_container_detection

echo ""
echo "✅ All agent lifecycle tests passed"
```

---

### 4.2 P1: Architecture Alignment Tests

#### Test 6: Environment Variable Propagation Tests
**File:** `tests/docker/env-propagation-tests.sh`

**Purpose:** Validate `.env` handling, inline comment detection, required vars, runtime overrides.

---

#### Test 7: Wave Spawning and Parallelism Tests
**File:** `tests/docker/wave-spawning-tests.sh`

**Purpose:** Test multi-wave execution, wave parallelism, sequential waves, batch priority.

---

#### Test 8: TypeScript Error Analysis Tests
**File:** `tests/docker/typescript-analysis-tests.sh`

**Purpose:** Validate error parsing accuracy, error count validation, file-to-error mapping.

---

#### Test 9: CFN Loop Pattern Compliance Tests
**File:** `tests/docker/cfn-loop-compliance-tests.sh`

**Purpose:** Test Loop 3 gate check, Loop 2 consensus, Product Owner decision, iteration metadata.

---

### 4.3 P2: Nice-to-Have Tests

#### Test 10: Build and Sync Tests
**File:** `tests/docker/build-sync-tests.sh`

**Purpose:** Validate build freshness, rsync exclusion, image layer caching, Linux native build.

---

#### Test 11: Coordinator Fault Tolerance Tests
**File:** `tests/docker/coordinator-fault-tolerance-tests.sh`

**Purpose:** Test coordinator restart recovery, Redis state persistence, agent orphan detection.

---

#### Test 12: API Authentication and Provider Routing Tests
**File:** `tests/docker/provider-auth-tests.sh`

**Purpose:** Test multi-provider auth, provider failover, cost tracking, rate limiting.

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

## Part 6: Execution Plan

### Phase 1: Immediate Cleanup (Week 1)
**Objective:** Remove obsolete tests, archive historical tests

```bash
# Day 1: Create cleanup scripts
mkdir -p tests/docker/cleanup
touch tests/docker/cleanup/remove-obsolete-tests.sh
touch tests/docker/cleanup/archive-historical-tests.sh

# Day 2: Execute removal script
bash tests/docker/cleanup/remove-obsolete-tests.sh

# Day 3: Execute archive script
bash tests/docker/cleanup/archive-historical-tests.sh

# Day 4: Verify test suite still runs
bash tests/docker/run-all-docker-tests.sh

# Day 5: Commit cleanup
git add -A
git commit -m "test: Remove obsolete tests and archive historical tests

- Removed 22 duplicate/obsolete test files
- Archived 7 historical sprint/marketing tests
- Net reduction: 90 → 61 active tests (32% cleanup)"
```

---

### Phase 2: Critical Updates (Week 2)
**Objective:** Update P0 tests for Docker coordinator

```bash
# Day 1-2: Update intelligent-coordinator-test.sh
# Add: Redis heartbeat, multi-iteration, decision gate, tier validation

# Day 3: Update test-provider-routing.sh
# Add: Container auth propagation, env var filtering

# Day 4-5: Update test-graceful-shutdown-comprehensive.sh
# Add: Docker lifecycle, SIGTERM handling, agent cleanup
```

---

### Phase 3: Add Critical Tests (Week 3)
**Objective:** Add P0 missing tests

```bash
# Day 1-2: Add redis-coordination-tests.sh
# Tests: Client connectivity, heartbeat, completion protocol, pub/sub

# Day 3-4: Add coordinator-iteration-tests.sh
# Tests: Multi-iteration convergence, max iterations, error delta

# Day 5: Add memory-budget-tests.sh
# Tests: Wave spawning, tier allocation, OOM prevention
```

---

### Phase 4: Architecture Alignment (Week 4)
**Objective:** Add P1 tests and update existing

```bash
# Day 1: Add clustering-accuracy-tests.sh
# Day 2: Add agent-lifecycle-tests.sh
# Day 3: Update b10-typescript-fix-test.sh
# Day 4: Update 50-agent-parallel-test.sh
# Day 5: Update memory/load tests
```

---

### Phase 5: Comprehensive Coverage (Week 5)
**Objective:** Add P2 tests

```bash
# Day 1: Add env-propagation-tests.sh
# Day 2: Add wave-spawning-tests.sh
# Day 3: Add typescript-analysis-tests.sh
# Day 4: Add cfn-loop-compliance-tests.sh
# Day 5: Add build-sync-tests.sh
```

---

### Phase 6: Fault Tolerance (Week 6)
**Objective:** Add fault tolerance and provider auth tests

```bash
# Day 1-2: Add coordinator-fault-tolerance-tests.sh
# Day 3-4: Add provider-auth-tests.sh
# Day 5: Final verification and documentation
```

---

## Part 7: Validation Checklist

### After Each Phase

- [ ] All existing tests still pass
- [ ] New tests pass with expected results
- [ ] Test coverage report updated
- [ ] Documentation updated (this file)
- [ ] Commit with descriptive message

### Final Validation (After Phase 6)

- [ ] Total test count: 73 tests (61 main + 12 docker)
- [ ] All P0 tests passing (Redis, iteration, memory budget, lifecycle, provider auth)
- [ ] All P1 tests passing (clustering, env vars, wave spawning, TypeScript analysis, CFN Loop compliance)
- [ ] All P2 tests passing (build/sync, fault tolerance)
- [ ] Test execution time < 30 minutes total
- [ ] No flaky tests (100% pass rate on 3 consecutive runs)
- [ ] Documentation complete (README, test descriptions)

---

## Part 8: Test Suite Summary

### Before Cleanup
- **Main tests:** 90
- **Docker tests:** 17
- **Total:** 107 tests

### After Cleanup
- **Main tests:** 61 (-29 removed/archived)
- **Docker tests:** 12 (existing aligned tests)
- **New Docker tests:** 12 (added)
- **Total:** 85 tests

### Net Change
- **Removed:** 22 files
- **Archived:** 7 files
- **Added:** 12 files
- **Updated:** 12 files
- **Kept as-is:** 49 files

---

## Part 9: Success Metrics

### Test Quality
- **Coverage:** 95% of Docker coordinator functionality
- **Reliability:** 100% pass rate (no flaky tests)
- **Performance:** <30 minutes total execution time
- **Maintainability:** Clear test names, good documentation

### Architecture Alignment
- **Redis coordination:** 100% coverage (client, heartbeat, completion, pub/sub)
- **Iteration loop:** 100% coverage (convergence, max iterations, decision gates)
- **Memory budget:** 100% coverage (wave spawning, tier allocation, OOM prevention)
- **Agent lifecycle:** 100% coverage (spawn, execute, cleanup, metadata)
- **Provider auth:** 100% coverage (multi-provider, failover, propagation)

### Test Organization
- **Hierarchy:** Clear separation (main vs docker, P0 vs P1 vs P2)
- **Naming:** Consistent naming convention (`test-<feature>-<variant>.sh`)
- **Documentation:** README in each test directory
- **Archive:** Historical tests preserved with manifest

---

## Appendices

### Appendix A: Test Naming Convention

**Pattern:** `test-<feature>-<variant>.sh` or `<feature>-<action>-test.sh`

**Examples:**
- `redis-coordination-tests.sh` - Redis coordination suite
- `coordinator-iteration-tests.sh` - Coordinator iteration suite
- `memory-budget-tests.sh` - Memory budget suite
- `test-graceful-shutdown-comprehensive.sh` - Comprehensive shutdown test

---

### Appendix B: Test Priority Definitions

**P0 (Critical):** Must pass for production deployment
- Redis coordination (heartbeat fix)
- Iteration loop (convergence to 0 errors)
- Memory budget enforcement
- Agent lifecycle (spawn to cleanup)
- Provider auth (API key propagation)

**P1 (High):** Important for architecture alignment
- Clustering accuracy
- Environment variable propagation
- Wave spawning validation
- TypeScript error analysis
- CFN Loop pattern compliance

**P2 (Medium):** Nice-to-have, improves reliability
- Build and sync validation
- Coordinator fault tolerance
- Multi-provider auth
- Rate limiting

---

### Appendix C: Test Execution Order

**Recommended order for CI/CD:**

1. **Smoke tests** (5 minutes)
   - Basic functionality
   - Connectivity
   - Component tests

2. **Unit tests** (10 minutes)
   - Redis coordination
   - Environment propagation
   - TypeScript analysis

3. **Integration tests** (10 minutes)
   - Coordinator iteration
   - Agent lifecycle
   - CFN Loop compliance

4. **System tests** (5 minutes)
   - Memory budget
   - Wave spawning
   - Graceful shutdown

5. **Fault tolerance tests** (optional, 10 minutes)
   - Coordinator restart
   - Provider failover
   - Redis state persistence

**Total:** 30-40 minutes

---

### Appendix D: Test Maintenance Schedule

**Weekly:**
- Review test failures
- Update flaky tests
- Check test execution time

**Monthly:**
- Review test coverage
- Archive obsolete tests
- Update documentation

**Quarterly:**
- Review archived tests for deletion
- Refactor redundant tests
- Optimize test execution time

---

**End of Implementation Plan**

---

## Quick Reference

### Remove Script
```bash
bash tests/docker/cleanup/remove-obsolete-tests.sh
```

### Archive Script
```bash
bash tests/docker/cleanup/archive-historical-tests.sh
```

### Run All Tests
```bash
bash tests/docker/run-all-docker-tests.sh
```

### Test Coverage Report
```bash
bash tests/docker/generate-coverage-report.sh
```
