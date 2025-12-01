# CFN Architecture Fix Plan - Redis Coordination

**Date**: 2025-11-23
**Priority**: CRITICAL
**Estimated Time**: 2 hours
**Confidence**: 0.95

---

## Problem Statement

CLI agents spawned from the trigger-worker cannot connect to Redis for coordination because:

1. **Network mismatch**: Agents use `cfn-network`, services use `trigger-cfn-network`
2. **Missing environment variables**: Agents don't receive `CFN_REDIS_HOST` and `CFN_REDIS_PORT`
3. **Service discovery breaks**: DNS resolution fails across network boundaries

---

## Root Cause Analysis

### Issue 1: Network Name Mismatch

**Current State**:
```typescript
// src/jobs/test-single-agent.ts (Line 127)
const dockerArgs = [
  '--network', 'cfn-network',  // ❌ WRONG - Network doesn't exist
  ...
];
```

**Services Configuration**:
```yaml
# docker-compose.yml (Line 354)
networks:
  trigger-cfn-network:  # ✅ This is the actual network
    driver: bridge
```

**Impact**:
- Spawned agents create new isolated network: `cfn-network`
- Agents cannot resolve `redis`, `postgres`, `socket-proxy`
- Redis coordination fails silently
- Agent execution works but coordination doesn't

### Issue 2: Missing Environment Variables

**Current State**:
```typescript
// src/jobs/test-single-agent.ts (Lines 133-134)
'-e', `TASK_ID=${ctx.run.id}`,
'-e', `AGENT_TYPE=${agentType}`,
// Missing: CFN_REDIS_HOST, CFN_REDIS_PORT
```

**Required Variables**:
```typescript
'-e', `CFN_REDIS_HOST=redis`,      // Service name for DNS resolution
'-e', `CFN_REDIS_PORT=6379`,       // Internal port (not 6380)
'-e', `TASK_ID=${ctx.run.id}`,
'-e', `AGENT_TYPE=${agentType}`,
```

---

## Fix Implementation

### Fix 1: Correct Network Name

**File**: `src/jobs/test-single-agent.ts`

**Change**:
```typescript
// Line 127 - Current
'--network', 'cfn-network',

// Line 127 - Fixed
'--network', 'trigger-cfn-network',
```

**Verification**:
```bash
# After fix, agent should resolve services
docker run --rm \
  --network trigger-cfn-network \
  alpine:latest \
  nslookup redis
# Expected: IP address of trigger-dev-redis container
```

### Fix 2: Add Redis Environment Variables

**File**: `src/jobs/test-single-agent.ts`

**Change**:
```typescript
// Lines 133-134 - Current
'-e', `TASK_ID=${ctx.run.id}`,
'-e', `AGENT_TYPE=${agentType}`,

// Lines 133-136 - Fixed
'-e', `CFN_REDIS_HOST=redis`,
'-e', `CFN_REDIS_PORT=6379`,
'-e', `TASK_ID=${ctx.run.id}`,
'-e', `AGENT_TYPE=${agentType}`,
```

**Verification**:
```bash
# After fix, agent should connect to Redis
docker run --rm \
  --network trigger-cfn-network \
  -e CFN_REDIS_HOST=redis \
  -e CFN_REDIS_PORT=6379 \
  redis:7-alpine \
  redis-cli -h redis -p 6379 ping
# Expected: PONG
```

### Fix 3: Update Entrypoint Script Whitelist

**File**: `entrypoint.sh`

**Current Whitelist**:
```bash
ENV_WHITELIST=(
  "AGENT_TYPE"
  "CFN_CUSTOM_ROUTING"
  ...
  "CFN_REDIS_PORT"    # Already included
  "CFN_POSTGRES_PORT"
  ...
)
```

**Status**: ✅ Already includes `CFN_REDIS_PORT`
**Note**: `CFN_REDIS_HOST` should be added if not present

**Verification**:
```bash
grep "CFN_REDIS_HOST" docker/trigger-dev/entrypoint.sh
# Should return: "CFN_REDIS_HOST" in ENV_WHITELIST
```

---

## Implementation Steps

### Step 1: Update Agent Spawning Code

**File**: `src/jobs/test-single-agent.ts`

**Lines to Change**: 127, 133-134

**Full Docker Args (Corrected)**:
```typescript
const dockerArgs = [
  'run',
  '--rm',
  '--name', containerName,
  '--network', 'trigger-cfn-network',  // FIX 1: Correct network name
  '--cpus=2',
  '--memory=4g',
  '-e', `CFN_REDIS_HOST=redis`,        // FIX 2: Add Redis host
  '-e', `CFN_REDIS_PORT=6379`,         // FIX 2: Add Redis port
  '-e', `TASK_ID=${ctx.run.id}`,
  '-e', `AGENT_TYPE=${agentType}`,
  '-v', '/workspace:/workspace',
  'cfn-agent:test',
  agentType,
  '--task', taskDescription,
];
```

### Step 2: Add CFN_REDIS_HOST to Entrypoint Whitelist

**File**: `entrypoint.sh`

**Add to ENV_WHITELIST** (if not already present):
```bash
ENV_WHITELIST=(
  "AGENT_TYPE"
  "CFN_CUSTOM_ROUTING"
  "ANTHROPIC_API_KEY"
  "ZAI_API_KEY"
  "KIMI_API_KEY"
  "GEMINI_API_KEY"
  "XAI_API_KEY"
  "OPENROUTER_API_KEY"
  "ZAI_BASE_URL"
  "CFN_REDIS_HOST"      # Add this line
  "CFN_REDIS_PORT"
  "CFN_POSTGRES_PORT"
  ...
)
```

### Step 3: Rebuild Worker Image

**Command**:
```bash
cd docker/trigger-dev
docker-compose build trigger-worker
```

**Verification**:
```bash
docker images | grep trigger-dev-worker-cfn
# Expected: trigger-dev-worker-cfn:latest with recent timestamp
```

### Step 4: Restart Services

**Command**:
```bash
docker-compose down
docker-compose up -d
```

**Verification**:
```bash
docker-compose ps
# All services should be healthy
```

---

## Testing Plan

### Test 1: Network Connectivity

**Objective**: Verify agents can resolve service names

**Command**:
```bash
docker run --rm \
  --network trigger-cfn-network \
  alpine:latest \
  nslookup redis
```

**Expected Output**:
```
Server:    127.0.0.11
Address:   127.0.0.11:53

Non-authoritative answer:
Name:   redis
Address: 172.18.0.3
```

**Success Criteria**: IP address returned (not "can't find redis")

### Test 2: Redis Connectivity

**Objective**: Verify agents can connect to Redis

**Command**:
```bash
docker run --rm \
  --network trigger-cfn-network \
  -e CFN_REDIS_HOST=redis \
  -e CFN_REDIS_PORT=6379 \
  redis:7-alpine \
  redis-cli -h redis -p 6379 ping
```

**Expected Output**:
```
PONG
```

**Success Criteria**: PONG response (not connection refused)

### Test 3: Full Agent Spawn

**Objective**: Verify complete agent spawning workflow

**Command**:
```bash
# Trigger test job via trigger.dev CLI or API
curl -X POST http://localhost:3040/api/v1/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TRIGGER_API_KEY}" \
  -d '{
    "event": "test.agent.spawn",
    "payload": {
      "agentType": "backend-developer",
      "taskDescription": "Test Redis connectivity"
    }
  }'
```

**Expected Behavior**:
1. Agent container spawns on `trigger-cfn-network`
2. Agent resolves `redis` service name
3. Agent connects to Redis on port 6379
4. Agent completes task successfully
5. Container exits and auto-removes

**Success Criteria**: Job completes with exit code 0

### Test 4: Environment Variable Injection

**Objective**: Verify Redis variables are passed to agents

**Command**:
```bash
# Inspect spawned container environment
docker inspect <container-name> | jq '.[0].Config.Env'
```

**Expected Output**:
```json
[
  "CFN_REDIS_HOST=redis",
  "CFN_REDIS_PORT=6379",
  "TASK_ID=run_xxxxx",
  "AGENT_TYPE=backend-developer",
  ...
]
```

**Success Criteria**: Both `CFN_REDIS_HOST` and `CFN_REDIS_PORT` present

---

## Rollback Plan

### If Fix Causes Issues

**Step 1: Revert Code Changes**
```bash
cd docker/trigger-dev
git checkout src/jobs/test-single-agent.ts
git checkout entrypoint.sh
```

**Step 2: Rebuild Worker Image**
```bash
docker-compose build trigger-worker
```

**Step 3: Restart Services**
```bash
docker-compose down
docker-compose up -d
```

### If Network Issues Persist

**Fallback Option**: Create `cfn-network` manually
```bash
docker network create cfn-network
```

**Modify docker-compose.yml**:
```yaml
networks:
  trigger-cfn-network:
    driver: bridge
  cfn-network:
    external: true  # Use manually created network
```

---

## Configuration Validation

### Pre-Fix Checklist

- [ ] Verify `trigger-cfn-network` exists: `docker network ls | grep trigger-cfn`
- [ ] Verify Redis container is running: `docker ps | grep trigger-dev-redis`
- [ ] Verify Redis is on correct network: `docker inspect trigger-dev-redis | jq '.[0].NetworkSettings.Networks'`
- [ ] Verify current agent spawning fails: Check logs for "connection refused"

### Post-Fix Checklist

- [ ] Agent containers spawn on `trigger-cfn-network`
- [ ] Agents can resolve `redis` service name
- [ ] Agents can connect to Redis on port 6379
- [ ] Environment variables `CFN_REDIS_HOST` and `CFN_REDIS_PORT` are set
- [ ] Test job completes successfully with exit code 0
- [ ] Container auto-removes after completion

---

## Expected Outcomes

### Before Fix

**Agent Behavior**:
```
[ERROR] Cannot connect to Redis at cfn-redis:6379
[ERROR] Connection refused
[EXIT] 1
```

**Network Inspection**:
```bash
docker inspect <agent-container> | jq '.[0].NetworkSettings.Networks'
{
  "cfn-network": {
    "IPAddress": "172.19.0.2",
    ...
  }
}
# ❌ Wrong network - isolated from services
```

### After Fix

**Agent Behavior**:
```
[INFO] Connected to Redis at redis:6379
[INFO] Task claimed: task-12345
[INFO] Executing task...
[INFO] Task completed successfully
[EXIT] 0
```

**Network Inspection**:
```bash
docker inspect <agent-container> | jq '.[0].NetworkSettings.Networks'
{
  "trigger-cfn-network": {
    "IPAddress": "172.18.0.10",
    ...
  }
}
# ✅ Correct network - can reach all services
```

---

## Additional Recommendations

### 1. Add Health Check to Agent Spawning

**Enhancement**: Verify Redis connectivity before starting task

```typescript
// src/jobs/test-single-agent.ts (add before task execution)
const healthCheck = [
  'run',
  '--rm',
  '--network', 'trigger-cfn-network',
  '-e', 'CFN_REDIS_HOST=redis',
  '-e', 'CFN_REDIS_PORT=6379',
  'redis:7-alpine',
  'redis-cli', '-h', 'redis', '-p', '6379', 'ping'
];

const { exitCode } = await execDockerCommand(healthCheck);
if (exitCode !== 0) {
  throw new Error('Redis health check failed');
}
```

### 2. Add Logging for Network Configuration

**Enhancement**: Log network details for debugging

```typescript
io.logger.debug("Agent network configuration", {
  network: 'trigger-cfn-network',
  redisHost: 'redis',
  redisPort: 6379,
  containerName,
});
```

### 3. Add Environment Variable Validation

**Enhancement**: Validate required variables before spawning

```typescript
const requiredEnvVars = [
  'CFN_REDIS_HOST',
  'CFN_REDIS_PORT',
  'TASK_ID',
  'AGENT_TYPE'
];

for (const envVar of requiredEnvVars) {
  if (!dockerArgs.some(arg => arg.includes(envVar))) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}
```

---

## Timeline

**Total Estimated Time**: 2 hours

| Task | Duration | Owner |
|------|----------|-------|
| Code changes (test-single-agent.ts) | 15 min | Developer |
| Entrypoint whitelist update | 5 min | Developer |
| Rebuild worker image | 10 min | Docker |
| Restart services | 5 min | Docker |
| Network connectivity test | 10 min | QA |
| Redis connectivity test | 10 min | QA |
| Full agent spawn test | 20 min | QA |
| Environment variable validation | 10 min | QA |
| Documentation update | 15 min | Developer |
| Review and sign-off | 20 min | Team |

---

## Success Criteria

**Fix is successful if**:
1. ✅ Agents spawn on `trigger-cfn-network`
2. ✅ Agents resolve `redis` service name
3. ✅ Agents connect to Redis on port 6379
4. ✅ Environment variables `CFN_REDIS_HOST` and `CFN_REDIS_PORT` are set
5. ✅ Test job completes with exit code 0
6. ✅ Container auto-removes after completion
7. ✅ No connection refused errors in logs

**Acceptance Threshold**: 7/7 criteria met

---

## References

**Files to Modify**:
- `src/jobs/test-single-agent.ts` (Lines 127, 133-134)
- `entrypoint.sh` (ENV_WHITELIST array)

**Testing Commands**:
- `docker network ls` - List networks
- `docker network inspect trigger-cfn-network` - Network details
- `nslookup redis` - DNS resolution test
- `redis-cli -h redis ping` - Redis connectivity test

**Documentation**:
- `CFN_ARCHITECTURE_ANALYSIS.md` - Architecture overview
- `docker/CLAUDE.md` - Docker-based CFN orchestration
- `CLAUDE.md` (root) - Multi-worktree Docker coordination

---

**Fix Plan Created**: 2025-11-23
**Priority**: CRITICAL
**Confidence**: 0.95
**Status**: Ready for implementation
