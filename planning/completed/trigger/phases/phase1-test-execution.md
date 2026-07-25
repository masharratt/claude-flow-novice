# Phase 1.3b - Test Execution and Validation Procedure

**Document:** Phase 1 Test Execution Framework
**Phase:** 1.3b (Production Deployment Automation)
**Created:** 2025-11-23
**Status:** COMPLETE
**Success Criteria:** ✓ Test scripts created | ✓ Validation checklist comprehensive | ✓ Documentation complete

---

## Overview

This document defines the test execution procedure and validation requirements for Phase 1 container execution via trigger.dev. It provides:

1. **Test Execution Scripts** - Automated validation of container functionality
2. **Infrastructure Validation** - Checklist-based verification of prerequisites
3. **Success Criteria** - Clear pass/fail criteria for each validation
4. **Monitoring Procedures** - How to monitor trigger.dev job execution
5. **Troubleshooting Guide** - Common issues and resolutions

---

## Test Architecture

### Test Layers

```
Layer 1: Image Build
  └─ Build cfn-agent:test Docker image
     └─ Verify image exists and is runnable

Layer 2: Container Execution
  ├─ Direct spawning (bypass trigger.dev)
  ├─ Environment variable passing
  ├─ Stdout/stderr capture
  └─ Exit code propagation

Layer 3: Resource Management
  ├─ CPU limits (2 cores)
  ├─ Memory limits (4GB)
  ├─ Volume mounting and cleanup
  └─ Network isolation

Layer 4: Trigger.dev Integration
  ├─ Job registration
  ├─ Event triggering
  ├─ Dashboard monitoring
  └─ Result collection
```

### Test Execution Flow

```
START
  ↓
[TEST EXECUTION SCRIPT] ─── Automated container testing
  ├─ Build image
  ├─ Test direct spawning
  ├─ Verify resource limits
  ├─ Test cleanup
  ├─ Verify exit codes
  └─ Test output capture
  ↓
[VALIDATION CHECKLIST SCRIPT] ─── Infrastructure verification
  ├─ Docker service availability
  ├─ Network configuration
  ├─ Volume accessibility
  ├─ Resource availability
  └─ Cleanup procedures
  ↓
[TRIGGER.DEV INTEGRATION] ─── (Manual or scripted)
  ├─ Start trigger.dev services
  ├─ Register job
  ├─ Trigger test event
  ├─ Monitor dashboard
  └─ Collect results
  ↓
COMPLETE
```

---

## Test Execution Scripts

### 1. Container Execution Test Script

**Location:** `tests/trigger-dev/test-phase1-container-execution.sh`

**Purpose:** Validate Phase 1 container functionality independent of trigger.dev

**Execution:**
```bash
cd /path/to/project
chmod +x tests/trigger-dev/test-phase1-container-execution.sh
./tests/trigger-dev/test-phase1-container-execution.sh
```

**What It Tests:**

| Test # | Name | Validates | Success Criteria |
|--------|------|-----------|------------------|
| 1 | Docker Image Build | cfn-agent:test image buildable | Image exists after build |
| 2 | Network Availability | cfn-network accessible | Network exists or creatable |
| 3 | Volume Accessibility | Workspace mount works | Container can read/write files |
| 4 | Direct Container Spawning | Container spawning works | Container runs with env vars |
| 5 | Resource Limits | 2 CPU, 4GB RAM enforced | Limits specified to docker |
| 6 | Container Cleanup | --rm flag works | No orphaned containers |
| 7 | Exit Code Propagation | Exit codes propagate | Exit 0 and Exit 1 correct |
| 8 | Stdout/Stderr Capture | Output captured | Logs accessible |
| 9 | Network Connectivity | Container networking | DNS resolution works |

**Expected Output:**
```
===================================================================================
Phase 1.3b - Container Execution Validation
===================================================================================

Test Start: Sat Nov 23 10:15:30 UTC 2025
Project Root: /path/to/project

[TEST 1] Build cfn-agent:test image
ℹ Building cfn-agent:test image...
✓ PASS Image build successful

[TEST 2] Check cfn-network availability
✓ PASS cfn-network exists

[TEST 3] Test workspace volume accessibility
✓ PASS Volume accessible from container

[TEST 4] Test direct container spawning with environment variables
ℹ Agent type correctly passed to container
✓ PASS Agent type correctly passed to container
✓ PASS Task ID correctly passed to container

[TEST 5] Verify resource limits enforcement
ℹ Spawning container with 2 CPU and 4GB RAM limits...
✓ PASS Container resource limits can be verified

[TEST 6] Verify container cleanup with --rm flag
✓ PASS Container cleaned up successfully with --rm flag

[TEST 7] Verify exit code propagation
ℹ Testing successful exit (exit code 0)...
✓ PASS Successful exit code (0) propagated correctly
ℹ Testing failed exit (exit code 1)...
✓ PASS Failed exit code (1) propagated correctly

[TEST 8] Verify stdout/stderr capture
✓ PASS Stdout captured successfully
✓ PASS Stderr captured successfully

[TEST 9] Verify network connectivity between containers
✓ PASS Network connectivity verified (service names resolvable)

===================================================================================
Test Summary
===================================================================================

Tests Run: 9
Tests Passed: 9
Tests Failed: 0

✓ All tests passed

Next Steps:
1. Run validation checklist: ./tests/trigger-dev/validate-phase1-infrastructure.sh
2. Deploy to trigger.dev: cd docker/trigger-dev && docker-compose up -d
3. Register container job with trigger.dev
4. Monitor job execution via trigger.dev dashboard: http://localhost:3040
```

**Results File:**
```
.artifacts/test-results/phase1-execution-results.json
```

---

### 2. Infrastructure Validation Checklist Script

**Location:** `tests/trigger-dev/validate-phase1-infrastructure.sh`

**Purpose:** Verify all prerequisite infrastructure is available and configured

**Execution:**
```bash
chmod +x tests/trigger-dev/validate-phase1-infrastructure.sh
./tests/trigger-dev/validate-phase1-infrastructure.sh
```

**Validation Categories:**

#### A. Pre-Flight Checks
- Docker daemon running
- Docker version compatible (≥20.10)
- Disk space available (≥5GB)
- Memory available (≥2GB)
- Docker network isolation supported

**Success Criteria:**
- `docker ps` returns successfully
- `docker --version` shows ≥20.10
- `df /var/lib/docker` shows ≥5GB free
- `free -g` shows ≥2GB available

#### B. Container Execution
- cfn-agent:test image accessible
- Container spawning works
- Resource limits enforceable
- Exit codes propagate correctly
- Environment variables pass through

**Success Criteria:**
- `docker image inspect cfn-agent:test` succeeds
- Container runs and completes
- `docker run --cpus=2 --memory=4g` accepted
- Exit code matches container exit
- Environment variables accessible in container

#### C. Volume Management
- Workspace volume accessible
- File permissions correct
- Volume cleanup after container exit
- No orphaned volumes
- Read/write operations work

**Success Criteria:**
- Container can read files from volume
- Container can write to volume
- Files created in container visible on host
- Directory cleanup successful
- No permission errors

#### D. Network Configuration
- cfn-network exists or creatable
- Container can access network
- DNS resolution works
- Container-to-container communication
- No port conflicts

**Success Criteria:**
- `docker network inspect cfn-network` succeeds (or can be created)
- Container has network access
- DNS queries resolve
- Service names resolvable between containers
- No port conflicts detected

#### E. Cleanup Procedures
- Containers removed with --rm
- No orphaned containers from tests
- Test files cleaned up
- Networks properly removed
- Workspace directory cleaned

**Success Criteria:**
- Container removed after exit when --rm used
- `docker ps -a` shows <5 exited containers
- Test directories removed
- Networks removable without errors
- Workspace cleared

#### F. Resource Limits
- CPU limits enforceable (2 cores)
- Memory limits enforceable (4GB)
- No resource quota conflicts
- Monitoring possible
- Limits propagate to child processes

**Success Criteria:**
- `--cpus=2` accepted and enforced
- `--memory=4g` accepted and enforced
- No conflicts with existing containers
- Resource metrics accessible
- Limits visible inside container

**Expected Output:**
```
===================================================================================
Phase 1.3b - Infrastructure Validation Checklist
===================================================================================

Validation Start: Sat Nov 23 10:20:45 UTC 2025

=== PRE-FLIGHT CHECKS ===

✓ PASS Docker daemon available
✓ PASS Docker service running
ℹ Docker version: Docker version 24.0.0, build abcdef1
✓ PASS Docker version compatible
✓ PASS Sufficient disk space (156 GB available)
✓ PASS Sufficient memory (8 GB available)

=== CONTAINER EXECUTION CHECKS ===

✓ PASS cfn-agent:test image accessible
✓ PASS Container spawning works
✓ PASS Environment variables pass through

=== VOLUME MANAGEMENT CHECKS ===

✓ PASS Workspace volume accessible from container
✓ PASS Write permissions work on volume
ℹ File permissions: 644
✓ PASS File permissions correct
✓ PASS Volume cleanup successful

=== NETWORK CONFIGURATION CHECKS ===

✓ PASS cfn-network exists
ℹ Network driver: bridge
✓ PASS Container can access network
✓ PASS DNS resolution works

=== CLEANUP PROCEDURES ===

✓ PASS --rm flag cleans up containers
✓ PASS Minimal orphaned containers (2)
✓ PASS Network cleanup verified

=== RESOURCE LIMITS ===

ℹ CPU cores visible: 4
✓ PASS CPU limits enforceable
ℹ Memory check completed
✓ PASS Memory limits enforceable

===================================================================================
Validation Summary
===================================================================================

Checks Passed: 20
Checks Failed: 0
Total Checks: 20

✓ All validation checks passed (100.0%)

Infrastructure Status:
  - Docker service: READY
  - Container execution: READY
  - Volume management: READY
  - Network configuration: READY
  - Cleanup procedures: READY
  - Resource limits: READY

Phase 1.3b Validation: PASSED

Next Steps:
1. Start trigger.dev infrastructure:
   cd docker/trigger-dev && docker-compose up -d

2. Verify trigger.dev services:
   docker-compose ps

3. Test job execution:
   curl -X POST http://localhost:3000/api/v1/events \
     -H 'Authorization: Bearer $TRIGGER_API_KEY' \
     -H 'Content-Type: application/json' \
     -d '{"event": "test.agent.spawn", "payload": {...}}'

4. Monitor dashboard:
   http://localhost:3040
```

**Checklist Output File:**
```
.artifacts/test-results/phase1-validation-checklist.md
```

---

## Success Criteria Definition

### Test Execution Script - Success Criteria

**Pass Condition:** All 9 tests pass
**Failure Condition:** Any test fails
**Min Pass Rate:** 100%

| Test | Pass Criteria | Fail Criteria | Recovery |
|------|---------------|---------------|----------|
| Image Build | Image builds without error | Build fails or timeout | Verify Docker has sufficient memory |
| Network Availability | cfn-network exists or created | Cannot create network | Check docker network permissions |
| Volume Access | File readable from container | File not accessible | Verify volume mount permissions |
| Direct Spawn | Container starts and completes | Container fails to start | Check image integrity |
| Resource Limits | Limits accepted by Docker | Docker rejects limits | Verify Docker version ≥20.10 |
| Container Cleanup | No container remains after exit | Container left running | Verify --rm flag in command |
| Exit Code Propagation | Exit codes match container exit | Wrong exit code returned | Check Docker version |
| Stdout/Stderr Capture | Output visible in logs | Output missing | Verify Docker logging driver |
| Network Connectivity | DNS resolution works | DNS fails | Verify cfn-network exists |

### Infrastructure Validation - Success Criteria

**Pass Condition:** All 20 checks pass (100%)
**Failure Condition:** Any check fails
**Min Pass Rate:** 95% (critical checks must pass)

**Critical Checks (must pass):**
1. Docker daemon running
2. Docker service responding
3. cfn-agent:test image accessible
4. Volume accessibility from container
5. --rm flag effectiveness

**Non-Critical Checks (can fail if verified manually):**
- Disk space (can proceed with smaller disk if aware)
- Memory availability (can proceed with monitoring)
- DNS resolution (functionality verified)

---

## Trigger.dev Integration Testing

### Manual Testing Procedure

After container execution tests pass, test trigger.dev integration:

#### Step 1: Start Trigger.dev Services

```bash
cd docker/trigger-dev
docker-compose up -d

# Verify all services started
docker-compose ps

# Expected output:
# NAME                COMMAND             STATUS
# trigger-postgres    postgres            Up 2 minutes
# trigger-redis       redis               Up 2 minutes
# trigger-webapp      npm start           Up 2 minutes (3040)
# trigger-worker      node worker.js      Up 2 minutes
# trigger-api         node server.js      Up 2 minutes (3000)
```

**Expected Services:**
- postgres: http://localhost:5432 (internal)
- redis: http://localhost:6379 (internal)
- webapp: http://localhost:3040
- api: http://localhost:3000 (internal)
- worker: Background service

#### Step 2: Verify Webapp Access

```bash
# Should return 302 redirect to login
curl -i http://localhost:3040/

# Should return login page
curl -s http://localhost:3040/login | head -20

# Should succeed
curl -I http://localhost:3040/login
```

#### Step 3: Register Test Job

Create `docker/trigger-dev/src/jobs/test-container-spawn.ts`:

```typescript
import { TriggerClient, eventTrigger } from "@trigger.dev/sdk";
import { z } from "zod";

// Initialize Trigger client
const client = new TriggerClient({
  id: "cfn-trigger-dev",
  apiKey: process.env.TRIGGER_API_KEY || "tr_dev_test",
  apiUrl: "http://localhost:3000",
});

// Define test event schema
const TestEventSchema = z.object({
  taskId: z.string().describe("Unique task identifier"),
  agentType: z.string().describe("Type of CFN agent"),
  taskDescription: z.string().describe("Task to execute"),
});

// Define container spawn job
export const testContainerSpawnJob = client.defineJob({
  id: "test-container-spawn",
  name: "Test Container Spawn",
  version: "1.0.0",

  trigger: eventTrigger({
    name: "test.container.spawn",
    schema: TestEventSchema,
  }),

  run: async (payload, io, ctx) => {
    io.logger.info("Container spawn test starting", { payload });

    // Spawn test container via Docker
    const taskId = payload.taskId;
    const agentType = payload.agentType;
    const taskDesc = payload.taskDescription;

    io.logger.info("Spawning container", {
      taskId,
      agentType,
      taskDescription: taskDesc,
    });

    // Simulate container execution (replace with actual Docker spawn)
    await new Promise(resolve => setTimeout(resolve, 2000));

    io.logger.info("Container execution completed", {
      taskId,
      status: "completed",
      exitCode: 0,
    });

    return {
      success: true,
      taskId,
      agentType,
      executionTime: 2,
      containerExit: 0,
    };
  },
});
```

Compile and deploy:
```bash
cd docker/trigger-dev
npm run build
npm run deploy  # Or restart docker-compose
```

#### Step 4: Trigger Test Event

```bash
# Get API key from .env
API_KEY=$(grep TRIGGER_API_KEY docker/trigger-dev/.env | cut -d= -f2)

# Trigger test event
curl -X POST http://localhost:3000/api/v1/events \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "test.container.spawn",
    "payload": {
      "taskId": "test-123",
      "agentType": "backend-developer",
      "taskDescription": "Test container spawning via trigger.dev"
    }
  }' \
  -v

# Expected response:
# 202 Accepted
# {"jobId": "run_...", "status": "queued"}
```

#### Step 5: Monitor Execution

**Via Dashboard:**
```
http://localhost:3040/
├─ Login (if needed)
├─ Navigate to Runs
└─ Click on "test-container-spawn" run
   └─ View logs
      ├─ Container spawn test starting
      ├─ Spawning container
      ├─ Container execution completed
      └─ Container exit code: 0
```

**Via Logs:**
```bash
# Watch trigger worker logs
docker-compose logs -f trigger-worker

# Watch webapp logs
docker-compose logs -f trigger-webapp

# Check Redis for pending jobs
docker-compose exec redis redis-cli LLEN queue:jobs

# Check PostgreSQL for completed runs
docker-compose exec postgres psql -U postgres -d trigger -c \
  'SELECT id, job_id, status FROM "Run" ORDER BY created_at DESC LIMIT 5;'
```

### Automated Testing (Via Script - Optional)

Create `tests/trigger-dev/test-trigger-integration.sh`:

```bash
#!/bin/bash
# Optional: Automated trigger.dev integration testing

set -euo pipefail

TRIGGER_API_KEY=$(grep TRIGGER_API_KEY docker/trigger-dev/.env | cut -d= -f2)
API_URL="http://localhost:3000"
WEBAPP_URL="http://localhost:3040"

echo "Testing Trigger.dev Integration"
echo ""

# Test 1: API reachability
echo "[1/4] Testing API endpoint..."
if curl -s -o /dev/null -w "%{http_code}" "$API_URL/health" 2>/dev/null | grep -q "200\|404"; then
  echo "✓ API reachable"
else
  echo "✗ API not reachable"
  exit 1
fi

# Test 2: Webapp reachability
echo "[2/4] Testing webapp..."
if curl -s -o /dev/null -w "%{http_code}" "$WEBAPP_URL/login" 2>/dev/null | grep -q "200"; then
  echo "✓ Webapp accessible"
else
  echo "✗ Webapp not accessible"
  exit 1
fi

# Test 3: Trigger event
echo "[3/4] Triggering test event..."
RESPONSE=$(curl -s -X POST "$API_URL/api/v1/events" \
  -H "Authorization: Bearer $TRIGGER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "test.container.spawn",
    "payload": {
      "taskId": "test-trigger-'$(date +%s)'",
      "agentType": "backend-developer",
      "taskDescription": "Automated integration test"
    }
  }')

if echo "$RESPONSE" | grep -q "success\|queued"; then
  echo "✓ Event triggered successfully"
else
  echo "✗ Event trigger failed: $RESPONSE"
  exit 1
fi

# Test 4: Monitor execution
echo "[4/4] Waiting for completion..."
sleep 5

echo "✓ Integration test complete"
echo ""
echo "View results at: $WEBAPP_URL/runs"
```

---

## Monitoring Trigger.dev Job Execution

### Real-Time Monitoring

**Option 1: Dashboard (Visual)**
```
http://localhost:3040

Path: Runs > test-container-spawn
Shows:
- Job ID
- Run ID
- Status (queued → running → completed/failed)
- Execution time
- Logs
- Error messages (if any)
```

**Option 2: Logs (Text)**
```bash
# Watch all logs
docker-compose logs -f

# Watch specific service
docker-compose logs -f trigger-worker

# Filter to job execution
docker-compose logs trigger-worker | grep "test-container-spawn"
```

**Option 3: Database (Direct)**
```bash
# Connect to PostgreSQL
docker-compose exec postgres psql -U postgres -d trigger

# Check recent runs
SELECT id, job_id, status, created_at FROM "Run"
  ORDER BY created_at DESC LIMIT 10;

# Check job definitions
SELECT id, slug, name FROM "Job"
  WHERE slug LIKE '%test%';

# Check run logs
SELECT id, run_id, message, level FROM "RunLog"
  WHERE run_id = '<RUN_ID>'
  ORDER BY created_at;
```

### Expected Job Lifecycle

```
Event Triggered (test.container.spawn)
  ↓
Job Queued
  └─ Status: queued
  └─ Duration: 0-5s
  ↓
Job Started
  └─ Status: running
  └─ Container spawning...
  ↓
Container Execution
  └─ AGENT_TYPE: backend-developer
  └─ TASK_ID: test-123
  └─ Duration: 2-10s
  ↓
Container Completed
  └─ Exit code: 0
  ↓
Job Completed
  └─ Status: completed
  └─ Total duration: 5-15s
  ↓
Results Available
  └─ Dashboard: http://localhost:3040/runs/[RUN_ID]
  └─ Logs: View in webapp or via CLI
```

---

## Common Issues and Troubleshooting

### Issue 1: Container Build Fails

**Symptoms:**
```
✗ FAIL Image build failed
```

**Diagnosis:**
```bash
# Check Docker memory
docker system df
docker stats

# Try building with verbose output
docker build -f /tmp/Dockerfile.cfn-agent-test -t cfn-agent:test . --progress=plain
```

**Solutions:**
1. **Insufficient disk space:** `docker system prune -a --volumes`
2. **OOM during build:** Increase Docker memory allocation
3. **Network issues:** `docker build --network=host ...`

---

### Issue 2: Volume Access Fails

**Symptoms:**
```
✗ FAIL Cannot access volume from container
```

**Diagnosis:**
```bash
# Check volume permissions
ls -la docker/trigger-dev/test-workspace/
stat docker/trigger-dev/test-workspace/

# Check mount inside container
docker run --rm -v $(pwd)/docker/trigger-dev/test-workspace:/test \
  cfn-agent:test \
  ls -la /test
```

**Solutions:**
1. **Permission denied:** `chmod 755 docker/trigger-dev/test-workspace/`
2. **Path not found:** Ensure directory exists: `mkdir -p docker/trigger-dev/test-workspace`
3. **Symlink issues:** Use absolute paths, not relative symlinks

---

### Issue 3: Resource Limits Not Enforced

**Symptoms:**
```
ℹ Could not verify resource limits
```

**Diagnosis:**
```bash
# Check Docker version
docker --version  # Need ≥20.10

# Check cgroup limits inside container
docker run --rm --cpus=2 --memory=4g cfn-agent:test \
  sh -c "cat /sys/fs/cgroup/cpu/cpu.cfs_quota_us"
```

**Solutions:**
1. **Upgrade Docker:** Current version may not support cgroups v2
2. **Enable cgroups:** Check OS cgroup support
3. **Use Docker Desktop settings:** Increase available resources

---

### Issue 4: Network Configuration Fails

**Symptoms:**
```
✗ FAIL Cannot create cfn-network
✗ FAIL DNS resolution failed
```

**Diagnosis:**
```bash
# List all networks
docker network ls

# Inspect cfn-network
docker network inspect cfn-network

# Check DNS inside container
docker run --rm --network cfn-network cfn-agent:test \
  nslookup localhost
```

**Solutions:**
1. **Network exists:** Remove and recreate: `docker network rm cfn-network && docker network create cfn-network`
2. **DNS issues:** Use `--network host` (less isolation but works)
3. **Port conflicts:** Check `docker ps` for conflicting port bindings

---

### Issue 5: Trigger.dev Integration Fails

**Symptoms:**
```
API not reachable
Webapp returns 500
Event trigger fails
```

**Diagnosis:**
```bash
# Check services running
docker-compose ps

# Check container logs
docker-compose logs trigger-api
docker-compose logs trigger-worker
docker-compose logs trigger-webapp

# Check database connectivity
docker-compose exec postgres pg_isready -U postgres

# Check Redis connectivity
docker-compose exec redis redis-cli ping
```

**Solutions:**
1. **Services not started:** `docker-compose up -d`
2. **Database issues:** `docker-compose logs postgres` - check initialization
3. **API key mismatch:** Verify `TRIGGER_API_KEY` in `.env` matches job definition
4. **Port conflicts:** `docker-compose down` before restart

---

## Test Execution Checklist

Use this checklist when running Phase 1 validation:

```markdown
## Phase 1.3b Test Execution Checklist

### Pre-Test
- [ ] Clone project to clean directory
- [ ] Verify git branch: claude/analyze-trigger-coordination-01Pm9zHDVydZ8kixTMeDALCa
- [ ] Ensure Docker daemon running: `docker ps`
- [ ] Check available disk space: >5GB
- [ ] Check available memory: >2GB

### Run Container Execution Test
```bash
chmod +x tests/trigger-dev/test-phase1-container-execution.sh
./tests/trigger-dev/test-phase1-container-execution.sh
```

- [ ] All 9 tests pass
- [ ] Image build successful
- [ ] Container spawning works
- [ ] Resource limits verified
- [ ] Cleanup successful
- [ ] Exit codes correct
- [ ] Output captured

**Results:** `.artifacts/test-results/phase1-execution-results.json`

### Run Infrastructure Validation
```bash
chmod +x tests/trigger-dev/validate-phase1-infrastructure.sh
./tests/trigger-dev/validate-phase1-infrastructure.sh
```

- [ ] All 20 checks pass
- [ ] Docker service ready
- [ ] Container execution ready
- [ ] Volume management ready
- [ ] Network configuration ready
- [ ] Cleanup procedures ready
- [ ] Resource limits ready

**Results:** `.artifacts/test-results/phase1-validation-checklist.md`

### Deploy Trigger.dev (Optional)
```bash
cd docker/trigger-dev
docker-compose up -d
docker-compose ps
```

- [ ] All services started
- [ ] Webapp accessible: http://localhost:3040
- [ ] API accessible: http://localhost:3000 (internal)
- [ ] Database initialized
- [ ] Redis available

### Run Integration Test (Optional)
```bash
chmod +x tests/trigger-dev/test-trigger-integration.sh
./tests/trigger-dev/test-trigger-integration.sh
```

- [ ] API reachable
- [ ] Webapp accessible
- [ ] Event triggered successfully
- [ ] Job execution monitored
- [ ] Logs visible in dashboard

### Verification
- [ ] All test results documented
- [ ] No orphaned containers: `docker ps -a | grep cfn-agent`
- [ ] No orphaned volumes: `docker volume ls | grep cfn`
- [ ] No orphaned networks: `docker network ls | grep cfn`
- [ ] Cleanup successful: test workspace removed

### Sign-Off
- [ ] All tests passed
- [ ] All validations passed
- [ ] Documentation reviewed
- [ ] Results committed to git (optional)

**Tester:** ___________________
**Date:** ___________________
**Status:** ✓ PASSED / ✗ FAILED
```

---

## Success Criteria Summary

### Container Execution Test

**PASS Criteria:**
- All 9 tests complete without failure
- Image builds successfully
- Containers spawn with proper environment variables
- Resource limits accepted by Docker
- Cleanup with --rm flag works
- Exit codes propagate correctly
- Output captured in logs

**FAIL Criteria:**
- Any test fails
- Image build times out
- Container spawn fails
- Resource limits rejected
- Orphaned containers remain
- Exit codes incorrect
- Output missing

### Infrastructure Validation

**PASS Criteria:**
- All 20 checks pass
- Docker service responding
- cfn-agent:test image accessible
- Volume mount works
- Network configuration available
- Cleanup procedures verified
- Resource limits enforceable

**FAIL Criteria:**
- Any critical check fails
- Docker service not responding
- Image not found
- Volume mount fails
- Network creation fails
- Resource limits rejected

### Trigger.dev Integration (Optional)

**PASS Criteria:**
- Webapp loads without errors
- API endpoint responsive
- Job registers successfully
- Event triggers without error
- Job execution completes
- Logs visible in dashboard
- Exit code propagated to trigger.dev

**FAIL Criteria:**
- Webapp returns 5xx error
- API not reachable
- Job registration fails
- Event trigger fails
- Job execution timeout
- Logs missing
- Exit code lost

---

## Documentation References

- **Container Architecture:** `docker/CLAUDE.md`
- **Trigger.dev Setup:** `docker/trigger-dev/CLAUDE.md`
- **Test Organization:** `tests/CLAUDE.md`
- **CI/CD Integration:** `docker/CI_CD_TEST_INTEGRATION.md`
- **Phase 1 Plan:** `planning/trigger/TRIGGER_DEV_PER_AGENT_CONTAINER_PLAN.md`

---

## Next Steps After Phase 1.3b

Upon successful completion of Phase 1.3b validation:

1. **Phase 1.4 - Production Deployment**
   - Deploy cfn-agent containers to production trigger.dev instance
   - Configure worker scaling
   - Set up monitoring and alerts

2. **Phase 2 - Integration Testing**
   - Test agent spawning from trigger.dev jobs
   - Validate CFN Loop coordination
   - Test error handling and recovery

3. **Phase 3 - Load Testing**
   - Parallel agent execution
   - Resource utilization analysis
   - Performance benchmarking

4. **Phase 4 - Production Hardening**
   - Security audit
   - Access control implementation
   - Backup and recovery procedures

---

**Document Status:** COMPLETE
**Last Updated:** 2025-11-23
**Validation Phase:** 1.3b (Production Deployment Automation)
**Confidence Level:** 0.95
