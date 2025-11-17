# Docker Environment Review and Testing Todo List

**Generated:** November 17, 2025
**Analysis Period:** November 10-17, 2025
**Scope:** PR #16 and related Docker integration commits
**Focus:** Security, orchestration, testing, and configuration validation

---

## Executive Summary

Since November 10, 2025, the Docker environment has undergone massive standardization including:
- **Security hardening** with comprehensive access control policies
- **Multi-worktree support** for parallel development teams
- **Test-driven gates** integration with success criteria loading
- **Redis coordination** enhancements with availability checks
- **Integration testing infrastructure** with 40+ test scripts
- **Multi-language agent images** (TypeScript, Python, Rust)

This todo list prioritizes testing across these areas to ensure production readiness.

---

## CRITICAL (Security + Data Integrity)

### 1. Docker Socket Access Control Validation
**Category:** Security
**Priority:** CRITICAL
**File(s):** `/mnt/c/Users/masha/Documents/claude-flow-novice/docker/DOCKER_ACCESS_CONTROL.md`

**Requirements to Test:**
- [ ] Verify cfn-coordinator is the ONLY service with docker.sock access
- [ ] Validate capability restrictions (ALL dropped, NET_BIND_SERVICE only)
- [ ] Test seccomp profile blocks prohibited syscalls (SYS_ADMIN, SYS_PTRACE, DAC_OVERRIDE, CHOWN)
- [ ] Confirm agent containers deny docker.sock mounts
- [ ] Validate READ-ONLY telemetry access (remove in production)
- [ ] Test host filesystem isolation (verify /var/run/docker.sock not exposed to agents)

**Test Scenario 1: Coordinator Docker Access**
```bash
# Test that coordinator can spawn containers
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  cfn-coordinator:latest \
  docker ps  # Should succeed
```

**Test Scenario 2: Agent Docker Denial**
```bash
# Test that agents cannot access docker.sock
docker run --rm cfn-agent:frontend \
  docker ps  # Should fail with "Cannot connect to Docker daemon"
```

**Test Scenario 3: Seccomp Enforcement**
```bash
# Test seccomp blocks SYS_ADMIN
docker run --rm --security-opt seccomp=docker/seccomp/agent-lifecycle.json \
  alpine:latest \
  unshare -U  # Should fail with "Operation not permitted"
```

**Verification Steps:**
- [ ] Run all 3 test scenarios
- [ ] Check coordinator logs for successful docker operations
- [ ] Verify agents fail gracefully when attempting docker access
- [ ] Validate seccomp/agent-lifecycle.json exists and is applied
- [ ] Confirm zero privilege escalation vulnerabilities
- [ ] Document any access denials in security audit log

**Expected Outcomes:**
- Coordinator: ✅ Full docker.sock access with restrictions
- Agents: ✅ Cannot execute Docker commands
- Seccomp: ✅ Blocks all prohibited syscalls
- Telemetry: ✅ Read-only container metrics access

---

### 2. Redis Authentication and Connection Security
**Category:** Security
**Priority:** CRITICAL
**Files:** 
- `.claude/agents/cfn-dev-team/coordinators/cfn-v3-coordinator.md`
- `docker/docker-compose.yml`
- `docker/SUCCESS_CRITERIA_INTEGRATION.md`

**Requirements to Test:**
- [ ] Verify Redis password required in production
- [ ] Test password validation before task execution
- [ ] Validate Redis availability check (1 retry, graceful fallback)
- [ ] Confirm NOAUTH handling for development mode
- [ ] Test JSON validation prevents injection attacks
- [ ] Verify DoS protection (10MB file size limit)

**Test Scenario 1: Redis Password Enforcement**
```bash
# Test Redis requires password
docker exec cfn-redis redis-cli AUTH wrong-password  # Should fail
docker exec cfn-redis redis-cli -a $REDIS_PASSWORD PING  # Should succeed
```

**Test Scenario 2: Coordinator Redis Availability Check**
```bash
# Kill Redis, verify coordinator handles gracefully
docker stop cfn-redis
sleep 2
docker exec cfn-coordinator bash -c 'source cfn-v3-coordinator.md && check_redis_available'
# Should log: "⚠️  Redis unavailable, using Task mode fallback"
docker start cfn-redis
```

**Test Scenario 3: JSON Injection Prevention**
```bash
# Test sanitized task description prevents JSON injection
export CFN_TASK_DESCRIPTION='{"malicious":"payload"}'
docker exec cfn-coordinator /docker/coordinator-entrypoint.sh
# Should parse without injection
```

**Test Scenario 4: DoS Protection (10MB Limit)**
```bash
# Create oversized JSON (11MB)
dd if=/dev/zero bs=1M count=11 | base64 > /tmp/large.json
export CFN_SUCCESS_CRITERIA=/tmp/large.json
docker exec cfn-coordinator /docker/coordinator-entrypoint.sh
# Should fail with: "Success criteria file exceeds 10MB limit"
```

**Verification Steps:**
- [ ] Run all 4 test scenarios
- [ ] Check Redis logs for auth attempts
- [ ] Verify coordinator uses graceful fallback when Redis unavailable
- [ ] Confirm JSON sanitization in logs
- [ ] Validate oversized payloads are rejected
- [ ] Test recovery after Redis restarts

**Expected Outcomes:**
- Redis Auth: ✅ Password enforced in production
- Availability: ✅ Graceful fallback to Task mode
- JSON Security: ✅ Injection attempts sanitized
- DoS Protection: ✅ Oversized payloads rejected

---

### 3. Success Criteria Loading and Validation
**Category:** Testing Infrastructure
**Priority:** CRITICAL
**Files:**
- `docker/SUCCESS_CRITERIA_INTEGRATION.md`
- `docker/coordinator-entrypoint.sh`
- `docker/docker-compose.yml`
- `docker/runtime/cfn-runtime.contract.yml`

**Requirements to Test:**
- [ ] Verify inline JSON success criteria loading
- [ ] Test file-based criteria loading
- [ ] Validate criteria schema enforcement
- [ ] Confirm auto-generation fallback
- [ ] Test environment variable resolution
- [ ] Validate test command execution

**Test Scenario 1: Inline JSON Loading**
```bash
export CFN_SUCCESS_CRITERIA='{
  "test_suites": [{
    "name": "Unit Tests",
    "command": "npm test",
    "required": true,
    "pass_threshold": 0.95
  }],
  "deliverables": ["src/app.ts"]
}'

docker exec cfn-coordinator /docker/coordinator-entrypoint.sh
# Should log: "✅ Loaded success criteria from CFN_SUCCESS_CRITERIA env var"
```

**Test Scenario 2: File-Based Loading**
```bash
cat > /tmp/criteria.json << 'CRITERIA'
{
  "test_suites": [{
    "name": "Integration Tests",
    "command": "bash tests/integration.sh",
    "required": true,
    "pass_threshold": 1.0
  }],
  "deliverables": ["docker/coordinator-entrypoint.sh"]
}
CRITERIA

export CFN_SUCCESS_CRITERIA=/tmp/criteria.json
docker exec cfn-coordinator /docker/coordinator-entrypoint.sh
# Should log: "✅ Loaded success criteria from /tmp/criteria.json"
```

**Test Scenario 3: Auto-Generation Fallback**
```bash
unset CFN_SUCCESS_CRITERIA
docker exec cfn-coordinator /docker/coordinator-entrypoint.sh
# Should log: "⚠️  No success criteria provided - auto-generating defaults"
```

**Test Scenario 4: Schema Validation**
```bash
# Invalid schema (missing required field)
export CFN_SUCCESS_CRITERIA='{"test_suites": []}'
docker exec cfn-coordinator /docker/coordinator-entrypoint.sh
# Should fail with: "Invalid success criteria schema"
```

**Test Scenario 5: Test Execution**
```bash
export CFN_SUCCESS_CRITERIA='{
  "test_suites": [{
    "name": "Dummy Test",
    "command": "bash -c \"echo ok && exit 0\"",
    "required": true,
    "pass_threshold": 1.0
  }],
  "deliverables": []
}'

docker exec cfn-coordinator /docker/coordinator-entrypoint.sh
# Should execute test command and report pass/fail
```

**Verification Steps:**
- [ ] Run all 5 test scenarios
- [ ] Validate JSON structure in all cases
- [ ] Confirm entrypoint exits with correct status codes
- [ ] Check test execution returns accurate pass rates
- [ ] Verify deliverables are checked for existence
- [ ] Test environment variable precedence (CFN_* overrides defaults)

**Expected Outcomes:**
- Inline JSON: ✅ Loads and validates correctly
- File Loading: ✅ Reads and parses criteria files
- Auto-Generation: ✅ Provides sensible defaults
- Schema Validation: ✅ Rejects invalid structures
- Test Execution: ✅ Runs tests and reports pass rates

---

## HIGH (Orchestration + Coordination)

### 4. Multi-Worktree Docker Support
**Category:** Orchestration
**Priority:** HIGH
**Files:**
- `docker-compose.yml`
- `docker-compose.production.yml`
- `scripts/docker/run-in-worktree.sh`
- `docs/DOCKER_MULTI_WORKTREE.md`
- `.env.example`

**Requirements to Test:**
- [ ] Verify port offset calculation (MD5 hash of branch name)
- [ ] Test service isolation per worktree
- [ ] Confirm volume isolation
- [ ] Validate network separation
- [ ] Test backward compatibility with single worktree
- [ ] Verify all 14 services parametrized correctly

**Test Scenario 1: Port Allocation Strategy**
```bash
# Ensure main/master branch uses offset 0
git checkout main
./scripts/docker/run-in-worktree.sh --dry-run up -d 2>&1 | grep "CFN_.*_PORT"
# Should show default ports (no offset)

# Feature branch should get unique offset
git checkout -b feature/test-branch
./scripts/docker/run-in-worktree.sh --dry-run up -d 2>&1 | grep "CFN_.*_PORT"
# Should show offset ports (e.g., 8100, 8101, 8102, etc.)
```

**Test Scenario 2: Service Isolation (Two Worktrees)**
```bash
# Terminal 1 - Main branch
git checkout main
docker-compose up -d

# Terminal 2 - Feature branch
git worktree add ../feature-branch feature/test-branch
cd ../feature-branch
./scripts/docker/run-in-worktree.sh up -d

# Verify separate containers
docker ps --format "{{.Names}}" | grep "cfn-"
# Should see: cfn_redis_1, cfn_coordinator_1 (main)
# And: cfn-feature-test-branch_redis_1, cfn-feature-test-branch_coordinator_1
```

**Test Scenario 3: Port Conflict Detection**
```bash
# Ensure no port conflicts with two worktrees running
docker ps -a --format "table {{.Names}}\t{{.Ports}}"
# Port numbers should be unique across worktrees
```

**Test Scenario 4: Volume Isolation**
```bash
# Verify data isolation between worktrees
docker volume ls | grep cfn
# Should see separate volumes per worktree
```

**Test Scenario 5: Service Discovery**
```bash
# Verify services can communicate within worktree
docker exec cfn-coordinator ping cfn-redis
# Should succeed within same worktree

# Verify isolation between worktrees
docker exec cfn-feature-test-branch_coordinator ping cfn-redis
# Should fail (different network)
```

**Verification Steps:**
- [ ] Run all 5 test scenarios
- [ ] Verify port offsets are deterministic and consistent
- [ ] Check no port conflicts between worktrees
- [ ] Confirm volume names include branch name
- [ ] Validate network names are unique
- [ ] Test cleanup when worktree is deleted
- [ ] Verify backward compatibility (no env vars = defaults)

**Expected Outcomes:**
- Port Allocation: ✅ Deterministic, hash-based, 99.9% collision-free
- Service Isolation: ✅ Separate containers, volumes, networks per worktree
- Backward Compatibility: ✅ Single worktree uses default ports
- Service Discovery: ✅ Docker DNS works within worktree networks
- Cleanup: ✅ Gracefully removes worktree resources

---

### 5. Redis Coordination Task Queue
**Category:** Orchestration
**Priority:** HIGH
**Files:**
- `docker/CLAUDE.md` (Redis Coordination section)
- `tests/docker/core/redis-coordination-tests.sh`
- `tests/docker/redis/validate-redis-connection.sh`

**Requirements to Test:**
- [ ] Verify task queue atomic operations
- [ ] Test task metadata HASH storage
- [ ] Validate completion counter increments
- [ ] Confirm FIFO queue behavior (LPUSH/RPOP)
- [ ] Test task claim atomicity
- [ ] Verify result storage structure

**Test Scenario 1: Task Queue Initialization**
```bash
docker exec cfn-redis redis-cli FLUSHALL

# Simulate coordinator creating tasks
docker exec cfn-redis redis-cli <<EOF
SET task:total 5
SET task:completed 0
LPUSH task:queue task:1 task:2 task:3 task:4 task:5
