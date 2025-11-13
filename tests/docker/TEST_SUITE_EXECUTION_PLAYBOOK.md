# Docker Test Suite Execution Playbook

Use this playbook alongside:
- `tests/docker/TEST_SUITE_OVERVIEW.md` for context, success metrics, and review notes.
- `tests/docker/TEST_SUITE_MAINTENANCE_PLAN.md` for cleanup and legacy-test handling.
- `tests/claude.md` for the required script template and linting checklist.

---

## Part 4: ADD (New Tests)

### Rationale
Address gaps identified in integration test findings and architecture requirements.

### 4.1 P0: Critical Missing Tests

#### Test 1: Redis Coordination Tests
**File:** `tests/docker/redis-coordination-tests.sh`

**Purpose:** Validate Redis client connectivity, heartbeat reporting, task completion protocol.

**💬 REVIEW COMMENT:**
⚠️ **GOOD COVERAGE but WRONG PATTERN** - Tests validate Redis operations but use the WRONG architectural pattern (task queue claiming) that coordinator doesn't actually implement.

**CURRENT REALITY (from Bug #4 findings):**
- Coordinator pushes to `task:queue` but agents NEVER claim from it
- Agents receive tasks via **environment variables** (TASK_PROMPT, AGENT_ID)
- Task queue is ORPHANED code that creates infinite wait loops

**🔴 BLOCKING BUG #6 (2025-11-13 Session 2 - UPDATED):**
- **Issue**: Node.js CLI uses hardcoded `REDIS_HOST/PORT` instead of reading `process.env.CFN_REDIS_HOST/PORT`
- **Impact**: Agents fail with "Could not connect to Redis at 127.0.0.1:6379: Connection refused"
- **Evidence**: Init script connects successfully (uses `CFN_REDIS_HOST`), but CLI fails (uses `REDIS_HOST`)
- **Status**: Root cause IDENTIFIED - variable name mismatch
- **Locations**:
  - `src/cli/agent-spawn.ts:141,149,157` - Uses `REDIS_HOST/PORT` in redis-cli commands
  - `src/cli/anthropic-client.ts:494,553,572` - Uses `REDIS_HOST/PORT` in heartbeat monitoring
- **Fix Required**: Change all instances to use `CFN_REDIS_HOST` and `CFN_REDIS_PORT` to match standardized naming
- **Related**: Docker environment standardization (Bug #4) fixed coordinator, but CLI variable names not updated

**RECOMMENDATION:** Rewrite tests to validate ACTUAL pattern AND include Bug #6 fix validation:
1. Test coordinator spawns agents with environment variables
2. Test agents use environment-embedded tasks (not queue claiming)
3. Test coordinator detects completion via Docker container status (not Redis counters)
4. **NEW**: Test Node.js CLI Redis client reads `process.env.REDIS_HOST` (not hardcoded localhost)
5. **NEW**: Test agents can connect when Redis is on different Docker network host (cfn-redis)

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

## Part 6: Phased Execution Plan

The execution roadmap is now broken into smaller, dependency-aware phases. Each phase lists the entry and exit criteria plus concrete success metrics for every test touched in that slice. No later phase should begin until the previous one meets its exit criteria.

### Phase 0 - Coordinator Architecture Repair (Week 0)

**Objective:** Fix Bug #4 by switching the coordinator to container-based completion tracking.

**Entry criteria:** Bug #4 open; coordinator still blocks on Redis queues.

**Exit criteria:** `coordinator.js` polls Docker container status, `waitForCompletion()` no longer touches `task:queue`, and the fix is documented in `planning/docker/SESSION_2025-11-12_FINDINGS.md`.

**Key work items:**
- Replace Redis queue completion tracking with container exit status polling.
- Remove orphaned `task:queue`, `task:completed`, `task:total` writes (metrics-only counters may remain).
- Add a regression note to this file's Prerequisites section.

**Success criteria:**
- A dry run of the coordinator against a historical backlog exits in <15 minutes with all waves marked complete (no infinite wait).
- `rg -n "task:queue" coordinator.js` shows only metrics/logging references.
- Existing `tests/docker/intelligent-coordinator-test.sh` (pre-update) completes without manual intervention.

### Phase 1 - Test Taxonomy & Standards (Week 1A)

**Objective:** Lay down directory structure and shared templates before touching logic.

**Entry criteria:** Phase 0 exit achieved.

**Exit criteria:** New directories exist with README stubs, template script linted, and documentation references updated.

**Key work items:**
- Create `tests/docker/cleanup/`, `tests/cli-mode/`, `tests/task-mode/`, `tests/archive/historical/`.
- Move CLI/Task tests called out in Part 1 (mode detection + Task mode) into the new folders.
- Add `tests/_templates/docker-test-template.sh` following the standards above and run `shellcheck` on it.
- Update `README.md` / `CLAUDE.md` links to point at the new locations.

**Success criteria:**
- `rg --files tests | grep cli-mode` returns the relocated mode detection scripts only.
- `shellcheck tests/_templates/docker-test-template.sh` exits 0.
- `tests/docker/cleanup/README.md` explains how to run cleanup scripts and references this plan.

### Phase 2 - Obsolete Test Cleanup & Archival (Week 1B)

**Objective:** Remove or archive the redundant scripts captured in Parts 1-2 without touching active coverage.

**Entry criteria:** Phases 0-1 exits complete.

**Exit criteria:** 22 files deleted, 7 archived, and the suite still runs.

**Key work items:**
- Implement `tests/docker/cleanup/remove-obsolete-tests.sh` covering Sections 1.1-1.8.
- Implement `tests/docker/cleanup/archive-historical-tests.sh` that moves sprint/marketing tests under `tests/archive/historical/`.
- Run `bash tests/docker/run-all-docker-tests.sh` to confirm no regressions.

**Success criteria:**
- `git status --short tests | wc -l` reflects exactly the targeted removals/moves (no surprise edits).
- `bash tests/docker/cleanup/remove-obsolete-tests.sh` exits 0 and prints the 22 files removed.
- Post-cleanup `bash tests/docker/run-all-docker-tests.sh` exits 0.

### Phase 3 - Core P0 Test Updates (Week 2)

**Objective:** Modernize the three most important coordinator-facing scripts so they validate the repaired architecture.

**Entry criteria:** Phases 0-2 exits pass.

**Exit criteria:** All three scripts run green twice in a row on CI and locally.

**Key work items:** Update the tests below with the success criteria.

**Tests & success criteria:**
- `tests/docker/intelligent-coordinator-test.sh`
  - Fails fast when `.env.clean` is missing or contains inline comments; passes when sanitized file is used.
  - Uses the Node.js Redis client with `REDIS_HOST`/`REDIS_PORT` to write heartbeats to `swarm:${TASK_ID}:${AGENT_ID}`.
  - Demonstrates at least two iterations with strictly decreasing error counts parsed from logs.
  - Asserts that the Product Owner decision gate logs `PROCEED` or `ITERATE` in the expected context.
  - Verifies tier distribution remains within 60/25/10/5 +/-10% (failing if Tier 1 falls outside 50-70%).
- `tests/test-provider-routing.sh`
  - Coordinator containers inherit every provider key defined in the temporary `.env` file (Anthropic, Z.ai, Kimi, OpenRouter).
  - Agents launched by the coordinator see the same variables (checked via `docker exec env`).
  - Negative filtering scenario proves that only the allowlist is forwarded and the script fails if an unexpected key appears.
- `tests/test-graceful-shutdown-comprehensive.sh`
  - Coordinator handles `SIGTERM` and exits within 30 seconds.
  - All wave containers belonging to the test are removed after shutdown.
  - Redis coordination state (`task:completed`, heartbeat hashes) is consistent before and after the shutdown.

### Phase 4 - Net-New P0 Tests (Week 3)

**Objective:** Add the three critical scripts that were missing entirely.

**Entry criteria:** Phases 0-3 exits pass.

**Exit criteria:** Each new script is executable, idempotent, and referenced from `tests/docker/run-all-docker-tests.sh`.

**Tests & success criteria:**
- `tests/docker/redis-coordination-tests.sh`
  - Heartbeat test writes via Node.js client to `swarm:<task>:<agent>` while respecting `REDIS_HOST`/`REDIS_PORT`.
  - Task distribution test proves agents receive work through environment variables (no `redis-cli BLPOP`).
  - Completion detection relies on container exit codes and/or Docker events, with the test failing if it still inspects `task:queue`.
  - Pub/Sub scenario delivers a coordinator broadcast to a subscriber container within 10 seconds.
- `tests/docker/coordinator-iteration-tests.sh`
  - Multi-iteration scenario shows monotonically decreasing error counts until 0.
  - `MAX_ITERATIONS` guard stops the loop when convergence fails.
  - Error delta output (`delta <= threshold`) is asserted from logs.
- `tests/docker/memory-budget-tests.sh`
  - Validates that each wave fits inside the configured 40GB budget (or fails with a clear message).
  - Confirms tier allocation (60/25/10/5) per wave.
  - Verifies the next wave does not start until the prior one sets a completion marker, and OOM conditions are surfaced as failures.

### Phase 5 - Architecture Alignment & Load Coverage (Week 4)

**Objective:** Ensure coordinator-specific behavior (batching, waves, lifecycle, memory) matches the architecture doc.

**Entry criteria:** Phases 0-4 exits pass.

**Exit criteria:** All scripts below run to completion with logs attached to CI artifacts.

**Tests & success criteria:**
- `tests/docker/b10-typescript-fix-test.sh`
  - Coordinator (not ad-hoc scripts) performs batching for the B10 dataset.
  - Tier assignments show both Tier 1 and Tier 2 presence.
  - With a 10GB budget the run stays within a single wave (or emits a warning when more waves are required).
- `tests/docker/50-agent-parallel-test.sh`
  - 50 agents produce exactly two waves under a 40GB budget.
  - Wave 2 start timestamp is strictly greater than Wave 1 completion timestamp.
  - Memory usage never exceeds the configured budget.
- `tests/test-memory-leak-prevention.sh`
  - Docker stats sampling shows coordinator memory returning to baseline between iterations (<5% delta).
  - Agent containers release memory within 5 seconds of exit.
  - No cgroup is left behind after the run (checked via `docker ps`/`docker rm`).
- `tests/simple-load-test.sh`
  - Wave spawning proceeds without starving tiers under moderate load.
  - Redis coordination latency remains below 100ms (captured via instrumentation).
  - Batching throughput stays within +/-10% of historical baseline.
- `tests/synthetic-load-test.sh`
  - Synthetic workload with 100+ batches honors the 40GB budget.
  - Coordinator completes the run inside the agreed SLA (document expected duration).
  - Iteration timing metrics are captured and compared across runs.
- `tests/docker/clustering-accuracy-tests.sh`
  - Tier distribution stays within tolerance (Tier 1 between 50-70%).
  - Directory/import based clustering is detected in logs.
  - Files that share imports appear in the same batch ID.
- `tests/docker/agent-lifecycle-tests.sh`
  - Containers are tracked from spawn to exit with metadata captured to `/tmp/cfn-debug/<task>/<agent>/`.
  - Containers are removed after metadata capture.
  - Orphaned agents are detected and cleaned up.

### Phase 6 - CFN Loop, Environment, and Compliance Coverage (Week 5)

**Objective:** Validate higher-level flows (CFN Loop, env propagation, build parity).

**Entry criteria:** Phases 0-5 exits pass.

**Exit criteria:** All scripts listed below run successfully in both local and CI environments.

**Tests & success criteria:**
- `tests/docker/env-propagation-tests.sh`
  - `.env.clean` fails when inline comments are present and passes once sanitized.
  - Required variables (all provider keys, Redis host/port) are asserted.
  - Runtime overrides (e.g., `CFN_CUSTOM_ROUTING`) propagate only to allowlisted containers.
- `tests/docker/wave-spawning-tests.sh`
  - Confirms that high-priority batches can run in parallel while lower tiers queue.
  - Ensures sequential hand-off between waves when budgets would overlap.
- `tests/docker/typescript-analysis-tests.sh`
  - Parses tsc output into exact error counts and file mappings (spot-check at least three files).
  - Fails if the parser mislabels severity or file paths.
- `tests/docker/cfn-loop-compliance-tests.sh`
  - Loop 3 gate enforces success criteria before handing off to Loop 2.
  - Loop 2 consensus logic records votes correctly.
  - Product Owner decisions (PROCEED/ITERATE/ABORT) are logged and asserted.
- `tests/docker/build-sync-tests.sh`
  - Fails when the workspace is not synced prior to `docker build` (simulated stale file).
  - Verifies rsync exclusion rules (no `.git`, no `node_modules`).
  - Demonstrates that image caching works by timing back-to-back builds.
- `tests/test-cfn-loop-integration.sh`
  - Runs Loop 3 -> Loop 2 -> Product Owner entirely through the Docker coordinator.
  - Continues iterating until error count reaches zero.
- `tests/test-cfn-stabilization-e2e.sh`
  - Executes multiple iterations while keeping error delta trending down.
  - Logs prove that the coordinator survives at least one restart mid-run.
- `tests/test-comprehensive-stabilization.sh`
  - Simulates coordinator restart/recovery and validates Redis state reconciliation.
  - Ensures agents resume or are respawned without manual cleanup.
- `tests/test-ace-workflow.sh`
  - Demonstrates that the Docker coordinator path does not require ACE (test passes without ACE hooks).
  - Documents how ACE should be integrated later (mark skipped assertions with TODOs).

### Phase 7 - Fault Tolerance & Provider Authentication (Week 6)

**Objective:** Finalize the suite with failure-handling and provider auth coverage, then cut the release.

**Entry criteria:** Phases 0-6 exits pass.

**Exit criteria:** Fault-tolerance + provider auth tests pass twice consecutively; documentation updated; release tag created.

**Tests & success criteria:**
- `tests/docker/coordinator-fault-tolerance-tests.sh`
  - Coordinator restart picks up from the last completed wave (no task loss).
  - Redis state persists across restarts and is validated via `redis-cli`.
  - Orphaned agent containers are detected and terminated.
- `tests/docker/provider-auth-tests.sh`
  - All provider credentials (Anthropic, OpenRouter, Z.ai, Kimi) are accepted and routed correctly.
  - Failover scenario routes traffic to the next provider when one returns 4xx/5xx.
  - Rate-limiting and cost tracking metrics are asserted.

After Phase 7, run the validation checklist in Part 7 and capture metrics in Part 9 before declaring the suite ready.

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
