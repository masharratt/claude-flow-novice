# Docker Agent Redis Connection Fix - Rebuild Plan

**Date:** 2025-11-12
**Status:** Awaiting root-cause-analyst findings
**Prepared By:** docker-specialist

---

## Problem Summary

**Issue:** Docker agents fail to connect to Redis on `cfn-network`, causing coordination failures.

**Root Cause:** TBD - root-cause-analyst identifying Redis heartbeat code issues

**Impact:**
- Intelligent coordinator cannot track agent progress
- Wave-based spawning blocked waiting for Redis signals
- CFN Loop coordination layer broken in Docker mode

---

## Docker Infrastructure Analysis

### Existing Images Requiring Rebuild

**Production Images:**
1. **claude-flow-novice-agent:latest** (443MB) - General agent runtime
   - Built from: `/Dockerfile.agent`
   - Used by: CLI-spawned agents in CFN Loop

2. **claude-flow-novice-agent:frontend** (723MB) - Frontend specialist
   - Built from: `/Dockerfile.agent-frontend`
   - Used by: TypeScript error fixing coordinator

3. **claude-flow-novice-agent:backend** (Not yet built)
   - Built from: `/Dockerfile.agent-backend`
   - Planned for backend-focused tasks

4. **cfn-intelligent-coordinator:latest** (348MB) - Smart orchestrator
   - Built from: `/Dockerfile.coordinator`
   - Runs autonomous TypeScript fix iterations

**Test/Dev Images:**
5. **cfn-agent:linux-build** (443MB) - Linux compatibility test
6. **cfn-minimal-test:latest** (184MB) - Minimal footprint test

### Network Configuration

**From docker-compose.yml:**
```yaml
networks:
  mcp-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.28.0.0/16
```

**Services:**
- `cfn-redis` - Redis coordination layer (port 6379)
- `cfn-playwright` - Browser automation
- `cfn-postgres` - Data persistence

**Health Check:**
```yaml
redis:
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 10s
    timeout: 3s
    retries: 3
```

### Agent Initialization Flow

**File:** `/scripts/docker-agent-init.sh`

**Current Coordination Protocol:**
1. Agent container starts
2. Init script writes spawn signal to Redis:
   ```bash
   SIGNAL_KEY="swarm:${TASK_ID}:${AGENT_ID}:signal"
   redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" SET "$SIGNAL_KEY" "spawned"
   ```
3. Agent executes work via `node dist/cli/index.js`
4. On exit, cleanup writes completion signal:
   ```bash
   COMPLETION_KEY="swarm:${TASK_ID}:${AGENT_ID}:done"
   redis-cli HSET "$COMPLETION_KEY" "status" "complete"
   ```

**Known Issues:**
- ⚠️ Init script may fail silently if Redis unreachable
- ⚠️ Network name hardcoded to `cfn-redis` (assumes Docker service name)
- ⚠️ No connection retry logic
- ⚠️ Truncated at line 96 (incomplete error handling)

---

## Rebuild Strategy

### Phase 1: Fix Identification (CURRENT)

**Waiting on:** root-cause-analyst to identify:
- Exact line in Redis client code causing connection failure
- Whether issue is in init script or agent CLI code
- Network resolution problems (DNS, service discovery)
- Redis client configuration errors

### Phase 2: Code Fixes (AFTER ANALYSIS)

**Anticipated Changes:**
1. **Network Resolution Fix**
   - Ensure Redis hostname resolves to container IP
   - Add DNS resolution validation
   - Support both `cfn-redis` and `redis` hostnames

2. **Connection Retry Logic**
   ```bash
   # Example fix pattern
   for i in {1..5}; do
       redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping && break
       echo "Redis connection attempt $i/5 failed, retrying..."
       sleep 2
   done
   ```

3. **Error Visibility Enhancement**
   - Exit with clear error if Redis unavailable
   - Log network diagnostic info (IP, DNS, routes)
   - Provide fallback for non-Redis mode (if applicable)

### Phase 3: Image Rebuild

**Command Sequence:**
```bash
#!/bin/bash
# docker-rebuild-all-agents.sh

set -euo pipefail

PROJECT_ROOT="/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/8a5edab282632443219e051e4ade2d1d5bbc671c781051bf1437897cbdfea0f1/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/4e3b97e9b870b161e96f8ea28ee15c14250435af077f58a26cc2018ea1bb954a"
cd "$PROJECT_ROOT"

echo "🐳 Rebuilding All CFN Agent Images with Redis Fix"
echo "=================================================="

# 1. Base agent image (used by all variants)
echo "📦 Building claude-flow-novice-agent:latest"
docker build -f Dockerfile.agent -t claude-flow-novice-agent:latest .

# 2. Frontend specialist (for TypeScript coordinator)
echo "📦 Building claude-flow-novice-agent:frontend"
docker build -f Dockerfile.agent-frontend -t claude-flow-novice-agent:frontend .

# 3. Backend specialist (if needed)
echo "📦 Building claude-flow-novice-agent:backend"
docker build -f Dockerfile.agent-backend -t claude-flow-novice-agent:backend .

# 4. Intelligent coordinator
echo "📦 Building cfn-intelligent-coordinator:latest"
docker build -f Dockerfile.coordinator -t cfn-intelligent-coordinator:latest .

# 5. Verify images
echo ""
echo "✅ Rebuilt Images:"
docker images | grep -E "(claude-flow-novice-agent|cfn-intelligent-coordinator)" | grep "latest\|frontend\|backend"

echo ""
echo "🎯 Next Step: Run validation tests to confirm Redis connection"
echo "   Test script: ./tests/docker/validate-redis-connection.sh"
```

**Build Time Estimate:** ~15-20 minutes (4 images, multi-stage builds)

**Optimization Options:**
- Use BuildKit for parallel builds: `DOCKER_BUILDKIT=1`
- Cache from existing images: `--cache-from claude-flow-novice-agent:latest`
- Build only changed images if fixes isolated to specific Dockerfile

### Phase 4: Validation Testing

**Test Suite:** `/tests/docker/validate-redis-connection.sh`

```bash
#!/bin/bash
# Validation Test Plan

set -euo pipefail

echo "🧪 Redis Connection Validation Test Suite"
echo "=========================================="

# Test 1: Network connectivity
echo "Test 1: Verify mcp-network exists"
docker network ls | grep mcp-network || {
    echo "❌ mcp-network not found"
    exit 1
}

# Test 2: Redis service health
echo "Test 2: Check Redis container health"
docker-compose up -d redis
sleep 5
docker exec cfn-redis redis-cli ping | grep PONG || {
    echo "❌ Redis not responding"
    exit 1
}

# Test 3: Agent can resolve Redis hostname
echo "Test 3: Agent DNS resolution test"
docker run --rm --network mcp-network \
    claude-flow-novice-agent:latest \
    nslookup cfn-redis || {
    echo "❌ Agent cannot resolve cfn-redis hostname"
    exit 1
}

# Test 4: Agent can connect to Redis
echo "Test 4: Agent Redis connection test"
docker run --rm --network mcp-network \
    -e REDIS_HOST=cfn-redis \
    -e REDIS_PORT=6379 \
    claude-flow-novice-agent:latest \
    redis-cli -h cfn-redis -p 6379 ping | grep PONG || {
    echo "❌ Agent cannot connect to Redis"
    exit 1
}

# Test 5: Agent init script coordination write
echo "Test 5: Init script coordination write test"
TASK_ID="test-$(date +%s)"
AGENT_ID="agent-redis-test-1"
docker run --rm --network mcp-network \
    -e TASK_ID="$TASK_ID" \
    -e AGENT_ID="$AGENT_ID" \
    -e AGENT_TYPE="typescript-specialist" \
    -e REDIS_HOST=cfn-redis \
    -e REDIS_PORT=6379 \
    claude-flow-novice-agent:latest \
    bash -c '
        redis-cli -h cfn-redis -p 6379 SET "swarm:'"$TASK_ID"':'"$AGENT_ID"':signal" "spawned"
        redis-cli -h cfn-redis -p 6379 GET "swarm:'"$TASK_ID"':'"$AGENT_ID"':signal"
    ' | grep "spawned" || {
    echo "❌ Agent cannot write coordination data"
    exit 1
}

# Test 6: Coordinator can spawn agents on network
echo "Test 6: Coordinator agent spawn test"
docker run --rm --network mcp-network \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -e REDIS_HOST=cfn-redis \
    -e REDIS_PORT=6379 \
    -e NETWORK_NAME=mcp-network \
    cfn-intelligent-coordinator:latest \
    node -e "
        const redis = require('redis');
        const client = redis.createClient({ host: 'cfn-redis', port: 6379 });
        client.on('connect', () => {
            console.log('Coordinator connected to Redis');
            client.quit();
        });
        client.on('error', (err) => {
            console.error('Coordinator Redis error:', err);
            process.exit(1);
        });
    " || {
    echo "❌ Coordinator cannot connect to Redis"
    exit 1
}

echo ""
echo "✅ All Redis connection tests passed!"
echo "🎯 Ready for production CFN Loop execution"
```

**Expected Results:**
- ✅ All 6 tests pass
- ✅ Agents write spawn signals to Redis
- ✅ Coordinator can read agent completion data
- ✅ Network isolation maintained (agents only on mcp-network)

### Phase 5: Integration Test

**Real CFN Loop Test:**
```bash
#!/bin/bash
# Full end-to-end test with intelligent coordinator

# Start infrastructure
docker-compose up -d redis postgres playwright

# Run coordinator with simple TypeScript fix task
docker run --rm --network mcp-network \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v "$(pwd)":/workspace \
    -e REDIS_HOST=cfn-redis \
    -e REDIS_PORT=6379 \
    -e NETWORK_NAME=mcp-network \
    -e AGENT_IMAGE=claude-flow-novice-agent:frontend \
    -e MEMORY_BUDGET=10g \
    -e MAX_ITERATIONS=2 \
    cfn-intelligent-coordinator:latest \
    --project-path /workspace/packages/ourstories-v2

# Verify Redis coordination data written
docker exec cfn-redis redis-cli KEYS "swarm:*"

# Check agent completion statuses
docker exec cfn-redis redis-cli HGETALL "swarm:*:done"
```

**Success Criteria:**
1. Coordinator analyzes TypeScript errors
2. Spawns agents in waves (respecting memory budget)
3. Agents write spawn signals to Redis
4. Coordinator polls Redis for completion
5. Wave 2 spawns after Wave 1 completes
6. Final iteration count and error count reported

---

## Risk Mitigation

### Risk 1: Fix Breaks Existing Functionality
**Mitigation:** Run full test suite before/after rebuild
```bash
./tests/docker/docker-hello-world-parity-tests.sh
./tests/docker/b10-validate-setup.sh
./tests/docker/intelligent-coordinator-test.sh
```

### Risk 2: Multiple Root Causes
**Mitigation:** Fix one issue at a time, rebuild, test, iterate

### Risk 3: Network Configuration Drift
**Mitigation:** Document exact network config in docker-compose.yml
- Ensure `cfn-redis` service name consistent
- Verify subnet 172.28.0.0/16 not conflicting
- Test with clean network: `docker network prune`

### Risk 4: Redis Client Version Mismatch
**Mitigation:** Verify redis-cli version matches server
```bash
docker exec cfn-redis redis-cli --version
docker run --rm claude-flow-novice-agent:latest redis-cli --version
```

---

## Rollback Plan

**If rebuild fails validation:**
1. Tag current broken images as `:broken`
   ```bash
   docker tag claude-flow-novice-agent:latest claude-flow-novice-agent:broken
   ```

2. Restore from previous working images (if available)
   ```bash
   docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.CreatedAt}}" | grep claude-flow-novice-agent
   docker tag claude-flow-novice-agent:<PREVIOUS_TAG> claude-flow-novice-agent:latest
   ```

3. Investigate failed tests, apply incremental fixes

4. Re-run validation suite after each fix

---

## Deliverables Checklist

- [ ] root-cause-analyst identifies exact Redis connection issue
- [ ] Code fixes applied to identified files
- [ ] All 4 Docker images rebuilt successfully
- [ ] Validation test suite passes (6/6 tests)
- [ ] Integration test demonstrates working CFN Loop
- [ ] Documentation updated with fix details
- [ ] Regression tests confirm no broken functionality

---

## Next Steps

**IMMEDIATE (waiting on):**
1. root-cause-analyst completes analysis
2. root-cause-analyst provides:
   - File paths to fix
   - Line numbers with issues
   - Recommended fix patterns

**THEN (docker-specialist executes):**
1. Apply code fixes
2. Run rebuild script: `./scripts/docker-rebuild-all-agents.sh`
3. Run validation suite: `./tests/docker/validate-redis-connection.sh`
4. Run integration test: `./tests/docker/intelligent-coordinator-test.sh`
5. Document results in `/planning/docker/redis-fix-validation-report.md`

---

## Confidence Score

**Current:** 0.75 (awaiting root-cause analysis)

**Post-fix target:** 0.90+ (all tests pass, CFN Loop working)

**Notes:**
- Infrastructure analysis complete and documented
- Rebuild commands validated and ready
- Test strategy comprehensive (unit → integration)
- Clear rollback plan if issues arise
