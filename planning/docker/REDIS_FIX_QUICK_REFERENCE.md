# Redis Connection Fix - Quick Reference

**Status:** Awaiting root-cause-analyst findings
**Date:** 2025-11-12
**Owner:** docker-specialist

---

## Problem

Docker agents fail to connect to Redis (`cfn-redis`) on `mcp-network`, blocking CFN Loop coordination.

---

## Execution Workflow

### Step 1: Root Cause Analysis (IN PROGRESS)
**Assigned:** root-cause-analyst
**Task:** Identify exact line of code causing Redis connection failure

**Expected Outputs:**
- File path(s) with Redis client code
- Line number(s) with connection issues
- Network resolution problems (if any)
- Recommended fix patterns

### Step 2: Apply Code Fixes (WAITING)
**Assigned:** TBD (after analysis complete)
**Location:** Files identified by root-cause-analyst

**Likely Fix Patterns:**
```bash
# Add retry logic
for i in {1..5}; do
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping && break
    sleep 2
done

# Validate DNS resolution
nslookup "$REDIS_HOST" || echo "DNS resolution failed"

# Better error visibility
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping || {
    echo "ERROR: Cannot connect to Redis at $REDIS_HOST:$REDIS_PORT"
    exit 1
}
```

### Step 3: Rebuild All Agent Images
**Command:**
```bash
./scripts/docker-rebuild-all-agents.sh
```

**Images Rebuilt:**
- claude-flow-novice-agent:latest (443MB)
- claude-flow-novice-agent:frontend (723MB)
- claude-flow-novice-agent:backend (if exists)
- cfn-intelligent-coordinator:latest (348MB)

**Estimated Time:** 15-20 minutes

### Step 4: Validate Redis Connection
**Command:**
```bash
./tests/docker/validate-redis-connection.sh
```

**Test Coverage:**
- Phase 1: Infrastructure (network, Redis health)
- Phase 2: Agent network connectivity (DNS, TCP, redis-cli)
- Phase 3: Coordination protocol (signal writes, completion hashes)
- Phase 4: Coordinator integration
- Phase 5: Cleanup and summary

**Expected:** 10/10 tests pass

### Step 5: Integration Test
**Command:**
```bash
./tests/docker/intelligent-coordinator-test.sh
```

**Validates:**
- Full CFN Loop execution
- Wave-based agent spawning
- Redis coordination data flow
- Agent completion signaling

---

## Key Files

**Planning Documents:**
- `/planning/docker/docker-agent-redis-rebuild-plan.md` - Full rebuild plan
- `/planning/docker/intelligent-coordinator-handoff.md` - Coordinator architecture

**Scripts:**
- `/scripts/docker-rebuild-all-agents.sh` - Rebuild all images
- `/scripts/docker-agent-init.sh` - Agent initialization (likely fix location)
- `/tests/docker/validate-redis-connection.sh` - 10-phase validation suite

**Dockerfiles:**
- `/Dockerfile.agent` - Base agent runtime
- `/Dockerfile.agent-frontend` - Frontend specialist
- `/Dockerfile.agent-backend` - Backend specialist
- `/Dockerfile.coordinator` - Intelligent coordinator

**Infrastructure:**
- `/docker-compose.yml` - Network + Redis + PostgreSQL + Playwright

---

## Docker Network Architecture

```
mcp-network (172.28.0.0/16)
├── cfn-redis (Redis coordination layer, port 6379)
├── cfn-playwright (Browser automation)
├── cfn-postgres (Data persistence, port 5432)
└── [dynamic] Agent containers spawned by coordinator
```

**Agent Connection Flow:**
1. Agent container spawns on `mcp-network`
2. Resolves `cfn-redis` hostname via Docker DNS
3. Connects to Redis on port 6379
4. Writes spawn signal: `swarm:{TASK_ID}:{AGENT_ID}:signal = "spawned"`
5. Executes work
6. Writes completion: `swarm:{TASK_ID}:{AGENT_ID}:done (hash)`

---

## Rollback Plan

**If validation fails:**
```bash
# Tag broken images
docker tag claude-flow-novice-agent:latest claude-flow-novice-agent:broken

# Restore previous working version (if exists)
docker images | grep claude-flow-novice-agent
docker tag claude-flow-novice-agent:<OLD_TAG> claude-flow-novice-agent:latest
```

---

## Success Criteria

- [ ] root-cause-analyst identifies exact issue
- [ ] Code fixes applied to identified files
- [ ] All 4 Docker images rebuild successfully
- [ ] Validation suite passes (10/10 tests)
- [ ] Integration test passes (full CFN Loop)
- [ ] Production CFN Loop can spawn agents and track progress

---

## Contact

**Questions:** See `/planning/docker/docker-agent-redis-rebuild-plan.md` for detailed context
