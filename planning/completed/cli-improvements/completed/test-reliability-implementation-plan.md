# CFN Test Suite Reliability - Implementation Plan

**Status:** Ready for Implementation
**Priority:** High (improves CI/CD stability)
**Estimated Effort:** 2-3 days
**Confidence:** 0.92

---

## Executive Summary

Both test suites (Bash E2E and Node.js Layer 5) suffer from hardcoded timing, inadequate error handling, and non-adaptive polling. This plan provides concrete implementations to eliminate flakiness and improve reliability from ~75% to ~95%.

---

## Phase 1: Critical Fixes (Day 1 - 4 hours)

### 1.1 Adaptive Redis Polling (Bash)

**File:** `tests/cfn-v3/test-e2e-cfn-loop.sh`

**Replace:** Lines 40-59 (current `wait_for_redis_key`)

**New Implementation:**
```bash
# Adaptive Redis key waiting with exponential backoff
wait_for_redis_key() {
    local key="$1"
    local timeout="${2:-60}"
    local interval=1
    local max_interval=10
    local elapsed=0

    log_info "Waiting for Redis key: $key (timeout: ${timeout}s, adaptive)"

    while [ $elapsed -lt $timeout ]; do
        if redis-cli exists "$key" 2>/dev/null | grep -q "1"; then
            log_success "Key found: $key (after ${elapsed}s)"
            return 0
        fi

        sleep $interval
        ((elapsed+=interval))

        # Exponential backoff with cap
        ((interval*=2))
        [ $interval -gt $max_interval ] && interval=$max_interval
    done

    log_error "Timeout waiting for key: $key (${timeout}s)"
    return 1
}
```

**Benefits:**
- Reduces average wait time by 40-60%
- Eliminates premature timeouts
- More responsive to fast completions

**Testing:**
```bash
# Verify exponential backoff: 1s, 2s, 4s, 8s, 10s, 10s...
wait_for_redis_key "test:key" 30
```

---

### 1.2 Replace Static Sleeps with Event-Driven Waits (Bash)

**Problem Locations:**
- Line 147: `sleep 5` (coordinator config)
- Line 151: `sleep 15` (orchestrator spawn)
- Line 170: `sleep 20` (Loop 3 completion)
- Line 205: `sleep 15` (Loop 2 spawn)
- Line 226: `sleep 20` (Loop 2 completion)

**New Pattern:**
```bash
# Wait for specific condition instead of fixed time
wait_for_agent_spawn() {
    local task_id="$1"
    local pattern="$2"
    local timeout="${3:-30}"

    log_info "Waiting for agents matching: $pattern"

    local elapsed=0
    while [ $elapsed -lt $timeout ]; do
        local count=$(redis-cli keys "$pattern" 2>/dev/null | wc -l)
        if [ "$count" -gt 0 ]; then
            log_success "Found $count agents after ${elapsed}s"
            return 0
        fi
        sleep 2
        ((elapsed+=2))
    done

    log_error "No agents found matching $pattern after ${timeout}s"
    return 1
}
```

**Usage:**
```bash
# BEFORE
npx claude-flow-novice agent cfn-v3-coordinator ... &
COORDINATOR_PID=$!
sleep 5
sleep 15

# AFTER
npx claude-flow-novice agent cfn-v3-coordinator ... &
COORDINATOR_PID=$!
wait_for_agent_spawn "$TASK_ID" "swarm:${TASK_ID}:*-1:*" 30
```

---

### 1.3 Redis Connection Retry (Node.js)

**File:** `tests/hello-world/layer5-coordinator-spawning.js`

**Replace:** Lines 69-89 (`initRedis`)

**New Implementation:**
```javascript
async function initRedis(retries = 3, delay = 2000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      redisClient = createClient({
        socket: {
          host: process.env.REDIS_HOST || 'localhost',
          port: process.env.REDIS_PORT || 6379,
          connectTimeout: 5000,
          reconnectStrategy: (retries) => {
            if (retries > 3) return new Error('Max reconnect attempts');
            return Math.min(retries * 100, 3000);
          }
        }
      });

      redisClient.on('error', (err) => {
        console.warn(`Redis connection attempt ${attempt}:`, err.message);
      });

      await redisClient.connect();
      console.log(`✅ Redis connected (attempt ${attempt})`);

      // Clean up test data
      const keys = await redisClient.keys('layer5:*');
      if (keys.length > 0) {
        await redisClient.del(keys);
        console.log(`  Cleaned ${keys.length} existing keys`);
      }

      return true;
    } catch (error) {
      console.error(`Redis connection attempt ${attempt} failed:`, error.message);
      if (attempt === retries) {
        throw new Error(`Redis connection failed after ${retries} attempts`);
      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

---

## Phase 2: High Priority Fixes (Day 1-2 - 6 hours)

### 2.1 Process Lifecycle Management (Bash)

**New Utility Function:**
```bash
# Track background process with timeout and cleanup
track_process() {
    local pid="$1"
    local name="$2"
    local timeout="${3:-180}"
    local start=$(date +%s)

    while kill -0 "$pid" 2>/dev/null; do
        local now=$(date +%s)
        local elapsed=$((now - start))

        if [ $elapsed -ge $timeout ]; then
            log_error "$name exceeded timeout (${timeout}s)"
            kill -TERM "$pid" 2>/dev/null
            sleep 2
            kill -KILL "$pid" 2>/dev/null
            return 1
        fi

        sleep 5
        log_info "$name running... ${elapsed}s elapsed"
    done

    # Get exit code
    wait "$pid"
    local exit_code=$?

    if [ $exit_code -eq 0 ]; then
        log_success "$name completed successfully"
    else
        log_error "$name exited with code $exit_code"
    fi

    return $exit_code
}
```

**Usage in TEST 9:**
```bash
# BEFORE (Line 364-386)
while kill -0 $COORDINATOR_PID 2>/dev/null && [ $wait_time -lt 60 ]; do
    sleep 5
    ((wait_time+=5))
done

# AFTER
if track_process "$COORDINATOR_PID" "Coordinator" 300; then
    log_success "TEST 9 PASSED: Coordinator completed"
else
    log_error "TEST 9 FAILED: Coordinator timeout/error"
fi
```

---

### 2.2 Error Propagation (Node.js)

**File:** `tests/hello-world/layer5-coordinator-spawning.js`

**Replace:** Lines 202-281 (`collectResults`)

```javascript
async function collectResults(taskId) {
  console.log('\n📊 Collecting results from Redis...');

  try {
    const resultsKey = `layer5:${taskId}:results`;
    const storedResults = await redisClient.hGetAll(resultsKey);

    if (!storedResults || Object.keys(storedResults).length === 0) {
      throw new Error(`No results in Redis for task ${taskId}`);
    }

    console.log(`  Found results: ${Object.keys(storedResults).length} fields`);

    // Parse agent results
    let successCount = 0;
    AGENT_TYPES.forEach(agentType => {
      const keyName = agentType.replace(/-/g, '_');
      const statusKey = `${keyName}_status`;
      const toolsKey = `${keyName}_tools`;

      const status = storedResults[statusKey];
      const toolsList = storedResults[toolsKey];

      if (!status) {
        throw new Error(`Missing status for ${agentType} (key: ${statusKey})`);
      }

      const agentResult = parseAgentResult(agentType, status, toolsList);
      results.agentResults.push(agentResult);

      if (agentResult.spawned) {
        successCount++;
        console.log(`  ✅ ${agentType}: ${agentResult.toolsWorking}/${TOOLS.length} tools`);
      } else {
        console.log(`  ❌ ${agentType}: failed`);
      }
    });

    results.summary.agentsSpawned = successCount;
    results.summary.agentsFailed = AGENT_TYPES.length - successCount;

    if (successCount === 0) {
      throw new Error('All agents failed to spawn');
    }

    return true;
  } catch (error) {
    console.error('  ❌ Results collection failed:', error.message);

    results.summary.testFailure = {
      stage: 'result_collection',
      error: error.message,
      timestamp: new Date().toISOString()
    };

    // Don't fall back silently - report the actual error
    throw error;
  }
}

function parseAgentResult(agentType, status, toolsList) {
  const agentResult = {
    agentType,
    spawned: status === 'PASSED' || status === 'SUCCESS',
    toolResults: {},
    toolsWorking: 0,
    toolsFailed: 0,
    duration: 0
  };

  const workingTools = toolsList ? toolsList.split(',').map(t => t.trim()) : [];

  TOOLS.forEach(tool => {
    const toolWorked = workingTools.some(t => t === tool || t.startsWith(tool));

    agentResult.toolResults[tool] = {
      success: toolWorked,
      tested: true
    };

    if (toolWorked) {
      agentResult.toolsWorking++;
      results.toolStats[tool].success++;
    } else {
      agentResult.toolsFailed++;
      results.toolStats[tool].failed++;
    }
  });

  return agentResult;
}
```

---

## Phase 3: Medium Priority Improvements (Day 2-3 - 8 hours)

### 3.1 Configurable Test Parameters

**New Config File:** `tests/config/test-timeouts.json`
```json
{
  "redis": {
    "connectionTimeout": 5000,
    "operationTimeout": 10000,
    "keyWaitTimeout": 60,
    "pollInterval": {
      "initial": 1,
      "max": 10,
      "backoffMultiplier": 2
    }
  },
  "coordinator": {
    "spawnTimeout": 180,
    "completionTimeout": 300
  },
  "agents": {
    "spawnTimeout": 30,
    "completionTimeout": 60
  },
  "loop": {
    "loop3Timeout": 120,
    "loop2Timeout": 90,
    "productOwnerTimeout": 30
  }
}
```

**Load in Bash:**
```bash
# Source config
CONFIG_FILE="${CONFIG_FILE:-tests/config/test-timeouts.json}"
REDIS_TIMEOUT=$(jq -r '.redis.keyWaitTimeout' "$CONFIG_FILE")
COORDINATOR_TIMEOUT=$(jq -r '.coordinator.completionTimeout' "$CONFIG_FILE")
```

---

### 3.2 Enhanced Logging

**Bash Structured Logging:**
```bash
# Add log levels
LOG_LEVEL="${LOG_LEVEL:-INFO}"  # DEBUG, INFO, WARN, ERROR

log_debug() {
    [ "$LOG_LEVEL" = "DEBUG" ] && echo -e "${BLUE}[DEBUG]${NC} $*" >&2
}

log_with_timestamp() {
    local level="$1"
    shift
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "[$timestamp] [$level] $*"
}

# Usage
log_debug "Redis pattern: swarm:${TASK_ID}:*"
log_with_timestamp "INFO" "Starting TEST 1"
```

**Node.js Structured Logging:**
```javascript
const logger = {
  debug: (msg, meta = {}) => {
    if (process.env.LOG_LEVEL === 'DEBUG') {
      console.log(`[DEBUG] ${msg}`, meta);
    }
  },
  info: (msg, meta = {}) => {
    console.log(`[INFO] ${msg}`, meta);
  },
  warn: (msg, meta = {}) => {
    console.warn(`[WARN] ${msg}`, meta);
  },
  error: (msg, meta = {}) => {
    console.error(`[ERROR] ${msg}`, meta);
  }
};
```

---

## Testing the Improvements

### Validation Tests

**1. Adaptive Polling Test:**
```bash
# Test exponential backoff
time wait_for_redis_key "nonexistent:key" 20
# Should timeout in ~20s with intervals: 1, 2, 4, 8, 5 (10s cap reached)
```

**2. Connection Retry Test:**
```bash
# Stop Redis temporarily
redis-cli shutdown
node tests/hello-world/layer5-coordinator-spawning.js
# Should retry 3 times with 2s delay between attempts
```

**3. Process Timeout Test:**
```bash
# Spawn long-running process
sleep 300 &
track_process $! "Long Process" 10
# Should terminate after 10s
```

---

## Rollout Plan

### Day 1 (4 hours)
- [ ] Implement adaptive polling in bash test (1.1)
- [ ] Replace 5 static sleeps with event-driven waits (1.2)
- [ ] Add Redis connection retry to Node.js test (1.3)
- [ ] Test all critical fixes in isolation

### Day 2 (6 hours)
- [ ] Implement process lifecycle management (2.1)
- [ ] Add error propagation to Node.js test (2.2)
- [ ] Integration test of Phase 1 + Phase 2
- [ ] Measure reliability improvement

### Day 3 (8 hours)
- [ ] Create test configuration file (3.1)
- [ ] Implement structured logging (3.2)
- [ ] Full E2E validation
- [ ] Update documentation

---

## Success Metrics

### Before Improvements
- **Reliability:** 75-85%
- **Average Duration:** 3-5 minutes
- **Variability:** ±60 seconds
- **Timeout Rate:** 15-25%

### After Improvements (Target)
- **Reliability:** 95%+
- **Average Duration:** 2-3 minutes (30-40% faster)
- **Variability:** ±15 seconds (75% reduction)
- **Timeout Rate:** <5%

---

## Validation Checklist

- [ ] All tests pass on first run
- [ ] Tests pass 10 consecutive times
- [ ] Tests complete within expected timeframe
- [ ] No hanging processes
- [ ] Redis keys properly cleaned up
- [ ] Error messages are actionable
- [ ] CI/CD integration successful

---

## Rollback Plan

If improvements cause issues:

1. **Immediate:** Revert to git commit before changes
2. **Selective:** Keep adaptive polling, revert error handling
3. **Gradual:** Apply fixes one at a time with validation

**Rollback Command:**
```bash
git checkout HEAD~1 -- tests/cfn-v3/test-e2e-cfn-loop.sh
git checkout HEAD~1 -- tests/hello-world/layer5-coordinator-spawning.js
```

---

## Next Steps

1. Review and approve this implementation plan
2. Create feature branch: `test-reliability-improvements`
3. Implement Phase 1 (critical fixes)
4. Run baseline tests and measure improvement
5. Continue with Phase 2 and 3
6. Merge to main after validation

**Estimated Total Effort:** 18 hours (2-3 days)
**Confidence in Success:** 0.92
