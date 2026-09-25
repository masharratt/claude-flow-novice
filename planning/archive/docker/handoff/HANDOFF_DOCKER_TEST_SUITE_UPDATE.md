# Docker Test Suite Migration Handoff
## Alpine → Debian Slim Migration (v2.0)

**Status:** Ready for Implementation
**Created:** 2025-11-14
**Target Completion:** 2025-11-16
**Owner:** Implementation Team

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State Analysis](#current-state-analysis)
3. [Image Architecture Differences](#image-architecture-differences)
4. [Test Failures Breakdown](#test-failures-breakdown)
5. [Update Strategy](#update-strategy)
6. [Success Criteria](#success-criteria)
7. [Testing Checklist](#testing-checklist)
8. [Reference Information](#reference-information)

---

## Executive Summary

### Quick Status

| Metric | Value |
|--------|-------|
| **Total Tests** | 26 core tests |
| **Currently Passing** | 6 (23%) |
| **Currently Failing** | 20 (77%) |
| **Root Cause** | Image migration (Alpine → Debian Slim) |
| **Scope** | Update 20 tests to work with new Debian-based images |
| **Time Estimate** | 8-12 hours |
| **Complexity** | Moderate (pattern-based updates across multiple test categories) |

### Key Changes in New Infrastructure

**Images Built Successfully:**
- cfn-agent:latest (1.28GB, Node 20 Slim, @swc/core compiled)
- cfn-orchestrator:latest (1.78GB, Node 20 Slim)
- cfn-coordinator:latest (1.78GB, Node 20 Slim)

**Infrastructure Ready:**
- Docker network (mcp-network) operational
- Redis 7 (redis:7-alpine) healthy and connected
- Debian package management (apt-get) available
- Node 20 runtime with npm/npx

**Breaking Changes:**
1. Image tags changed (alpine-specific images removed)
2. Package managers differ (apk → apt-get)
3. Entry point behavior changed
4. Environment variable references inconsistent
5. Container execution patterns updated

### What Needs to Happen

Update test suite to:
- Reference correct Debian-based image tags (cfn-agent:latest)
- Replace Alpine-specific commands with Debian equivalents
- Fix container entry points and command overrides
- Validate environment variable propagation
- Ensure memory/CPU constraints work with Debian images
- Add pre-test infrastructure validation

---

## Current State Analysis

### What's Working (6 tests passing)

✅ **Basic CFN Loop Tests (3)**
- cfn-loop-compliance-tests.sh
- coordinator-fault-tolerance-tests.sh
- end-to-end-coordinator-launch-test.sh

These tests use high-level patterns that survived the migration.

✅ **Memory and Environment Tests (3)**
- env-propagation-tests.sh
- memory-budget-tests.sh
- test-contract-alignment.sh

These tests use abstract validation patterns less dependent on image specifics.

### What's Failing (20 tests failing)

**Category 1: Agent Lifecycle Tests (4 failures)**
- agent-lifecycle-tests.sh
- coordinator-atomic-task-tests.sh
- coordinator-docker-in-docker-tests.sh
- coordinator-iteration-tests.sh

**Root Cause:** Tests expect old image behavior; entry point conflicts

**Category 2: Coordinator Planning/Validation Tests (2 failures)**
- coordinator-planning-tests.sh
- coordinator-validation-tests.sh

**Root Cause:** Image references and environment variable names

**Category 3: Basic Execution Tests (1 failure - CRITICAL)**
- docker-hello-world-parity-tests.sh

**Root Cause:** Tests hang - likely entry point issue causing infinite wait

**Category 4: Redis Coordination Tests (1 failure)**
- redis-coordination-tests.sh

**Root Cause:** Redis connectivity validation mismatched to new images

**Category 5: Bug Fix Validation Tests (5 failures)**
- test-bugfix-container-validation.sh
- test-bugfix-quick-verification.sh
- test-bugfix-redis-checkpoint.sh
- test-bugfix-security-sanitization.sh
- test-bugfix-validation-summary.sh

**Root Cause:** Tests reference deprecated Alpine patterns

**Category 6: Advanced Coordinator Tests (7 failures)**
- test-coordinator-orchestrate-params.sh
- test-coordinator-params-simple.sh
- test-dashboard-build-errors.sh
- test-dashboard-build-fix-validation.sh
- test-wave-orchestration.sh
- test-wave-orchestration-recovery.sh
- test-wave-security-edgecases.sh

**Root Cause:** Parameter passing and image invocation patterns

### Why Tests Are Failing

#### Issue 1: Image Entry Point Mismatch
**Symptom:** Tests hang when spawning containers
**Root Cause:** cfn-agent:latest CMD is `["node", "dist/cli/spawn.js", "--help"]` (shows help and exits)
**Impact:** Tests that expect container to run and wait for commands fail immediately

**Current Image Dockerfile:**
```dockerfile
CMD ["node", "dist/cli/spawn.js", "--help"]
```

**Problem:** When tests override CMD with shell commands, the entry point may still interfere

#### Issue 2: Alpine vs Debian Package Commands
**Symptom:** Tests reference `apk add` commands (Alpine package manager)
**Root Cause:** New images use Debian, which uses `apt-get`
**Impact:** Package installation fails with "apk: command not found"

**Alpine Pattern (OLD - BROKEN):**
```bash
docker run --rm alpine:latest apk add curl
```

**Debian Pattern (NEW - REQUIRED):**
```bash
docker run --rm debian:12-slim apt-get update && apt-get install -y curl
```

#### Issue 3: Image Name References
**Symptom:** Tests search for images named `claude-flow-novice:agent`
**Root Cause:** Old images tagged with different naming scheme
**Impact:** Container spawn fails with "image not found"

**Old Pattern (BROKEN):**
```bash
docker run claude-flow-novice:agent ...
```

**New Pattern (REQUIRED):**
```bash
docker run cfn-agent:latest ...
```

#### Issue 4: Environment Variable Naming Inconsistency
**Symptom:** Tests mix old and new environment variable names
**Root Cause:** Migration added CFN_ prefix but tests still use old names
**Impact:** Coordinator/agent cannot find configuration

**Old Pattern (MIXED - BROKEN):**
```bash
docker run -e REDIS_HOST=localhost -e TASK_ID=123 ...
```

**New Pattern (REQUIRED):**
```bash
docker run -e CFN_REDIS_HOST=localhost -e CFN_TASK_ID=123 ...
```

**Supported (with fallback):**
```bash
# Old names still work but trigger warnings
-e REDIS_HOST=localhost -e TASK_ID=123
```

#### Issue 5: Entry Point and Shell Mismatch
**Symptom:** Tests use `sh -c "command"` pattern that doesn't work
**Root Cause:** Image may have ENTRYPOINT set; shell override may fail
**Impact:** Commands silently fail or hang

**Current Image (Dockerfile.agent:101):**
```dockerfile
CMD ["node", "dist/cli/spawn.js", "--help"]
```

**The Problem:**
- When tests do `docker run image bash -c "..."`, the CMD is replaced
- But if ENTRYPOINT is set, things get complicated
- Best practice: Override with explicit `--entrypoint /bin/bash` or `--entrypoint sh`

---

## Image Architecture Differences

### Alpine vs Debian Slim Comparison

| Aspect | Alpine | Debian Slim | Impact on Tests |
|--------|--------|-------------|-----------------|
| **Base Image** | alpine:3.x | debian:12-slim | Package names differ |
| **Init System** | None | systemd (minimal) | Process management |
| **Package Manager** | apk | apt-get | Installation commands |
| **Libc** | musl | glibc | Binary compatibility |
| **Size** | ~5MB | ~80MB | No practical impact |
| **Node Versions** | node:alpine | node:20-slim | Same Node version |
| **Shell** | ash | bash | Different shell syntax |
| **Common Tools** | apk add curl jq git | apt-get install curl jq git | Installation patterns |
| **Build Tools** | apk add build-base | apt-get install build-essential | Compilation support |

### New Image Specifications

#### cfn-agent:latest
```
FROM: node:20-slim
Size: 1.28GB
Packages: bash, curl, jq, git, typescript, ts-node
Entry Point: CMD ["node", "dist/cli/spawn.js", "--help"]
User: cfnagent (UID 1001, non-root)
Workspace: /app/workspace (rw)
Build Tool: @swc/core (TypeScript compilation)
```

#### cfn-orchestrator:latest
```
FROM: node:20-slim
Size: 1.78GB
Packages: bash, curl, jq, git, docker, orchestration tools
Entry Point: CMD ["node", "dist/cli/orchestrate.js"]
Mounts: /var/run/docker.sock (for container spawning)
Network: mcp-network
```

#### cfn-coordinator:latest
```
FROM: node:20-slim
Size: 1.78GB
Packages: bash, curl, jq, git, coordination runtime
Entry Point: CMD ["node", "dist/cli/coordinate.js"]
Network: mcp-network
```

### Command Equivalency Table

| Task | Alpine | Debian Slim |
|------|--------|------------|
| Update package list | `apk update` | `apt-get update` |
| Install packages | `apk add curl jq` | `apt-get install -y curl jq` |
| Install build tools | `apk add build-base gcc` | `apt-get install -y build-essential gcc` |
| Check if command exists | `which curl` | `which curl` (same) |
| Install Node deps | `apk add python3 make g++` | `apt-get install -y python3 make g++` |
| Clean up | `rm -rf /var/cache/apk/*` | `rm -rf /var/lib/apt/lists/*` |

---

## Test Failures Breakdown

### Critical Path Tests (Must Fix First)

#### Test: docker-hello-world-parity-tests.sh
**Status:** ❌ HANGS
**File:** `tests/docker/core/docker-hello-world-parity-tests.sh`
**Line:** ~80-120 (container spawn logic)

**What It Tests:**
- Basic container spawn from cfn-agent image
- Command execution inside container
- Output capture and validation

**Why It Fails:**
1. Tests hang indefinitely when spawning cfn-agent container
2. Likely cause: Entry point conflicts with command override
3. Secondary: May reference old image name

**Required Fixes:**
```bash
# BEFORE (Broken)
docker run --rm \
  --network mcp-network \
  -e TASK_ID=test \
  claude-flow-novice:agent \
  sh -c "echo 'hello world'"

# AFTER (Fixed)
docker run --rm \
  --network mcp-network \
  --entrypoint /bin/bash \
  -e TASK_ID=test \
  cfn-agent:latest \
  -c "echo 'hello world'"
```

**Validation Command:**
```bash
timeout 10 docker run --rm cfn-agent:latest /bin/bash -c "echo 'test'"
```

**Pass Criteria:** Container exits immediately with output "test"

---

#### Test: agent-lifecycle-tests.sh
**Status:** ❌ FAILS
**File:** `tests/docker/core/agent-lifecycle-tests.sh`
**Lines:** 28-120

**What It Tests:**
- Agent spawn-to-exit cycle
- Metadata capture (TASK_ID, AGENT_ID)
- Container auto-removal
- Orphan process detection

**Why It Fails:**
1. References old image name `claude-flow-novice:agent`
2. Uses environment variables with old names (TASK_ID instead of CFN_TASK_ID)
3. Entry point assumptions don't match Debian image behavior
4. Expects specific Alpine-based behavior

**Required Fixes:**

**File Changes Needed:**
```diff
- AGENT_IMAGE="claude-flow-novice:agent"
+ AGENT_IMAGE="cfn-agent:latest"

- docker run -d \
-   -e TASK_ID="$TEST_TASK_ID" \
-   -e AGENT_ID="$AGENT_ID" \
+ docker run -d \
+   --entrypoint /bin/bash \
+   -e CFN_TASK_ID="$TEST_TASK_ID" \
+   -e CFN_AGENT_ID="$AGENT_ID" \
    cfn-agent:latest
```

**Validation Command:**
```bash
AGENT_ID="test-$(date +%s)"
docker run -d \
  --name "$AGENT_ID" \
  --entrypoint /bin/bash \
  -e CFN_AGENT_ID="$AGENT_ID" \
  cfn-agent:latest \
  -c "exit 0" && \
sleep 1 && \
docker inspect "$AGENT_ID" --format='{{.State.ExitCode}}'
```

**Pass Criteria:** Agent starts, runs command, exits with code 0

---

#### Test: coordinator-planning-tests.sh
**Status:** ❌ FAILS
**File:** `tests/docker/core/coordinator-planning-tests.sh`
**Lines:** ~40-80

**What It Tests:**
- Coordinator task planning logic
- Error analysis and batching
- Redis queue population

**Why It Fails:**
1. References cfn-coordinator image with old assumptions
2. Environment variable naming (missing CFN_ prefix)
3. May expect Alpine-specific output formats

**Required Fixes:**
- Update image references to cfn-coordinator:latest
- Prefix all env vars with CFN_ in tests
- Update validation patterns for Debian output

---

### Supporting Tests (Can Fix in Parallel)

#### Test Category: Bug Fix Validation (5 tests)
**Status:** ❌ FAILING
**Files:**
- test-bugfix-container-validation.sh
- test-bugfix-quick-verification.sh
- test-bugfix-redis-checkpoint.sh
- test-bugfix-security-sanitization.sh
- test-bugfix-validation-summary.sh

**Common Issues:**
1. All reference old image names
2. All use Alpine-specific patterns
3. All expect old environment variable names

**Pattern Fix (applies to all 5):**
```bash
# OLD (in test)
docker run --rm alpine:latest apk add curl
docker exec cfn-agent-container apk get-deps curl

# NEW (in test)
docker run --rm cfn-agent:latest apt-get update && apt-get install -y curl
docker exec cfn-agent-container bash -c "apt-cache show curl"
```

---

#### Test Category: Coordinator Advanced (7 tests)
**Status:** ❌ FAILING
**Files:**
- test-coordinator-orchestrate-params.sh
- test-coordinator-params-simple.sh
- test-dashboard-build-errors.sh
- test-dashboard-build-fix-validation.sh
- test-wave-orchestration.sh
- test-wave-orchestration-recovery.sh
- test-wave-security-edgecases.sh

**Common Issues:**
1. Parameter passing assumes old image behavior
2. Environment variable names inconsistent
3. Docker networking assumptions specific to Alpine

**Pattern Fix:**
```bash
# Ensure all environment variables use new names
-e TASK_ID → -e CFN_TASK_ID
-e MEMORY_BUDGET → -e CFN_MEMORY_BUDGET
-e REDIS_HOST → -e CFN_REDIS_HOST

# Update image references
cfn-coordinator:latest instead of coordinator-old
```

---

### Low-Priority Tests (Can Defer or Simplify)

#### Test: redis-coordination-tests.sh
**Status:** ❌ FAILS (Low Priority)
**Why:** Tests Redis pub/sub patterns; can be validated at coordinator level
**Option:** Simplify to basic connectivity check or skip for now

#### Test: coordinator-docker-in-docker-tests.sh
**Status:** ❌ FAILS (Complex)
**Why:** Tests nested Docker scenarios; complex to validate
**Option:** Can be deferred if basic agent execution works

---

## Update Strategy

### Phase 1: Foundation (Hours 1-2)
**Goal:** Get basic image execution working, unblock docker-hello-world test

**Tasks:**
1. Add helper function for container execution with entry point override
   - Location: `tests/docker/helpers/architecture-test-helpers.sh`
   - Function: `run_agent_container()` that handles entry point automatically

2. Create image availability validation
   - Verify cfn-agent, cfn-orchestrator, cfn-coordinator exist
   - Verify mcp-network exists
   - Verify Redis is healthy

3. Fix docker-hello-world-parity-tests.sh
   - Replace image references
   - Add explicit --entrypoint flags
   - Test container spawn → execute command → exit

**Success Criteria:**
- docker-hello-world-parity-tests.sh passes
- Container spawning works consistently
- No hanging containers left over

### Phase 2: Core Lifecycle Tests (Hours 3-4)
**Goal:** Get agent lifecycle tests passing

**Tasks:**
1. Update agent-lifecycle-tests.sh
   - Fix image names
   - Update environment variable names (TASK_ID → CFN_TASK_ID, etc.)
   - Ensure entry point handling

2. Update coordinator-planning-tests.sh
   - Fix image names (cfn-coordinator:latest)
   - Update environment variables
   - Validate task creation logic

3. Create standardized test patterns
   - Use helper functions for common patterns
   - Document environment variable usage
   - Add validation helpers

**Success Criteria:**
- Both tests execute without hanging
- Agent lifecycle properly validated
- Coordinator planning logic works

### Phase 3: Bug Fix Tests (Hours 5-7)
**Goal:** Update all 5 bug fix validation tests

**Tasks:**
1. Audit all 5 bug fix test files
2. Create pattern documentation:
   - Alpine commands → Debian equivalents
   - Image references → New tags
   - Environment variables → New names

3. Apply systematic updates using sed/automated patching:
   ```bash
   for test in test-bugfix-*.sh; do
     sed -i 's/alpine:latest/debian:12-slim/g' "$test"
     sed -i 's/apk add/apt-get install -y/g' "$test"
     sed -i 's/claude-flow-novice:agent/cfn-agent:latest/g' "$test"
     sed -i 's/TASK_ID=/CFN_TASK_ID=/g' "$test"
   done
   ```

4. Manual validation of each after patching

**Success Criteria:**
- All 5 tests execute
- Alpine-specific commands removed
- Proper image references used

### Phase 4: Coordinator Advanced Tests (Hours 8-10)
**Goal:** Update 7 advanced coordinator tests

**Tasks:**
1. Update parameter passing in all 7 tests
2. Ensure environment variable consistency
3. Validate orchestration patterns work

**Success Criteria:**
- All 7 tests pass parameter validation
- Orchestration patterns verified

### Phase 5: Integration & Cleanup (Hours 11-12)
**Goal:** Run full test suite, document results, create summary

**Tasks:**
1. Run all 26 core tests
2. Document passing/failing status
3. Create test execution report
4. Identify remaining issues (if any)
5. Document known limitations

**Success Criteria:**
- 20/20 fixed tests pass
- Updated test suite documented
- Handoff ready for QA

---

## Success Criteria

### Test Execution Thresholds

| Metric | Threshold | Current | Target |
|--------|-----------|---------|--------|
| **Core Tests Passing** | 100% | 23% (6/26) | 100% (26/26) |
| **Agent Lifecycle** | 100% | 0% (0/4) | 100% (4/4) |
| **Coordinator Tests** | 100% | 40% (2/5) | 100% (5/5) |
| **Bug Fix Tests** | 100% | 0% (0/5) | 100% (5/5) |
| **Advanced Tests** | 100% | 0% (0/7) | 100% (7/7) |
| **No Hanging Tests** | 0 hanging | 3+ hanging | 0 hanging |

### Execution Quality

Each passing test must:
- ✅ Exit with code 0
- ✅ Not hang or timeout
- ✅ Clean up all Docker resources
- ✅ Leave no orphaned containers
- ✅ Validate at least 2 assertions
- ✅ Use standard logging helpers
- ✅ Document what it's testing

### Test Coverage Validation

After fixes, verify:
1. **Container Execution:** docker-hello-world-parity-tests.sh
2. **Agent Lifecycle:** agent-lifecycle-tests.sh
3. **Coordinator Logic:** coordinator-planning-tests.sh
4. **Bug Validation:** test-bugfix-container-validation.sh
5. **Advanced Patterns:** test-coordinator-orchestrate-params.sh

### Known Limitations to Document

- Some Alpine-specific tests may need complete rewrite
- Docker-in-Docker tests require special setup (defer if needed)
- WSL2 performance may affect test timing (adjust timeouts if needed)

---

## Testing Checklist

### Pre-Update Validation

- [ ] All 3 Docker images (cfn-agent, cfn-orchestrator, cfn-coordinator) exist and are recent
- [ ] Docker network `mcp-network` exists
- [ ] Redis container `cfn-redis` is running and healthy
- [ ] Test utilities sourcing works: `source tests/test-utils.sh`
- [ ] Architecture helpers available: `tests/docker/helpers/architecture-test-helpers.sh`

### Phase 1: Foundation (docker-hello-world)

- [ ] Create or update container execution helper in architecture-test-helpers.sh
- [ ] Test helper: `run_agent_container() { docker run --entrypoint /bin/bash ... }`
- [ ] Update docker-hello-world-parity-tests.sh to use new image name
- [ ] Add explicit `--entrypoint /bin/bash` to all container spawns
- [ ] Test passes without hanging
- [ ] Container properly cleans up

### Phase 2: Agent Lifecycle

- [ ] Update image references in agent-lifecycle-tests.sh
  - [ ] Search/replace `claude-flow-novice:agent` → `cfn-agent:latest`
  - [ ] Search/replace `TASK_ID=` → `CFN_TASK_ID=`
  - [ ] Search/replace `AGENT_ID=` → `CFN_AGENT_ID=`
- [ ] Test passes without hanging
- [ ] Agent spawn-to-exit cycle validated
- [ ] Metadata properly captured

- [ ] Update coordinator-planning-tests.sh
  - [ ] Image: cfn-coordinator:latest
  - [ ] Env vars: CFN_* prefix
  - [ ] Entry point handling
- [ ] Test validates task planning
- [ ] Redis queue properly populated

### Phase 3: Bug Fix Tests (All 5)

For each test file:
- [ ] `test-bugfix-container-validation.sh`
  - [ ] Alpine commands → Debian (apk → apt-get)
  - [ ] Image references updated
  - [ ] Environment variables prefixed with CFN_
  - [ ] Test passes

- [ ] `test-bugfix-quick-verification.sh`
  - [ ] Same pattern updates
  - [ ] Test passes

- [ ] `test-bugfix-redis-checkpoint.sh`
  - [ ] Same pattern updates
  - [ ] Redis connectivity validated
  - [ ] Test passes

- [ ] `test-bugfix-security-sanitization.sh`
  - [ ] Same pattern updates
  - [ ] Security patterns verified
  - [ ] Test passes

- [ ] `test-bugfix-validation-summary.sh`
  - [ ] Same pattern updates
  - [ ] Validation logic works
  - [ ] Test passes

### Phase 4: Coordinator Advanced (7 tests)

For each test:
- [ ] Environment variables use CFN_ prefix
- [ ] Image references updated to latest Debian versions
- [ ] Docker networking validated (mcp-network)
- [ ] Parameter passing works correctly
- [ ] Test passes without errors

Specific tests:
- [ ] test-coordinator-orchestrate-params.sh - Parameters pass correctly
- [ ] test-coordinator-params-simple.sh - Simple params work
- [ ] test-dashboard-build-errors.sh - Error handling works
- [ ] test-dashboard-build-fix-validation.sh - Validation patterns work
- [ ] test-wave-orchestration.sh - Wave spawning works
- [ ] test-wave-orchestration-recovery.sh - Recovery logic works
- [ ] test-wave-security-edgecases.sh - Edge cases handled

### Phase 5: Integration Testing

- [ ] Run all 26 core tests sequentially
- [ ] Capture output to `test-run-report-$(date +%s).log`
- [ ] Count passes/failures
- [ ] Identify any remaining failures
- [ ] Check for no hanging containers: `docker ps | grep -E "agent|coordinator" | wc -l`
- [ ] Cleanup: `docker rm -f $(docker ps -a --filter "name=cfn" -q)`

### Final Validation

- [ ] Test Suite Report Created
  - [ ] Date/time of run
  - [ ] Image versions used
  - [ ] Pass/fail counts
  - [ ] Runtime duration
  - [ ] Any errors or warnings

- [ ] Known Issues Documented
  - [ ] List any tests that can't be fixed (with reasons)
  - [ ] List any deferred tests (with reasons)
  - [ ] List any workarounds required

- [ ] Next Steps Documented
  - [ ] Any follow-up work needed
  - [ ] Any infrastructure improvements
  - [ ] Any test coverage gaps

---

## Reference Information

### Image Specifications

#### cfn-agent:latest

**Build Command:**
```bash
DOCKERFILE="Dockerfile.agent" IMAGE_NAME="cfn-agent" \
  ./scripts/docker/build-from-linux.sh
```

**Also tagged as:**
- claude-flow-novice:agent (for backward compatibility)

**Key Details:**
```
FROM node:20-slim
Size: ~1.28GB
Compiled: @swc/core (TypeScript to JavaScript)
Packages: bash, curl, jq, git, typescript, ts-node
User: cfnagent (UID 1001, non-root)
Entry: CMD ["node", "dist/cli/spawn.js", "--help"]
```

**Test Usage:**
```bash
docker run --rm \
  --entrypoint /bin/bash \
  --network mcp-network \
  -e CFN_TASK_ID="test-123" \
  -e CFN_AGENT_ID="agent-test" \
  cfn-agent:latest \
  -c "your command here"
```

#### cfn-orchestrator:latest

**Build Command:**
```bash
DOCKERFILE="Dockerfile.orchestrator" IMAGE_NAME="cfn-orchestrator" \
  ./scripts/docker/build-from-linux.sh
```

**Key Details:**
```
FROM node:20-slim
Size: ~1.78GB
Mounts: Docker socket for agent spawning
Entry: CMD ["node", "dist/cli/orchestrate.js"]
Network: mcp-network
```

#### cfn-coordinator:latest

**Build Command:**
```bash
DOCKERFILE="Dockerfile.coordinator" IMAGE_NAME="cfn-coordinator" \
  ./scripts/docker/build-from-linux.sh
```

**Key Details:**
```
FROM node:20-slim
Size: ~1.78GB
Network: mcp-network
Entry: CMD ["node", "dist/cli/coordinate.js"]
```

### Docker Network

**Name:** mcp-network
**Type:** bridge
**Status:** Created by docker-compose.yml

**Verify:**
```bash
docker network ls | grep mcp-network
docker network inspect mcp-network
```

### Redis Container

**Name:** cfn-redis
**Image:** redis:7-alpine
**Port:** 6379
**Status:** Healthy
**Network:** mcp-network

**Verify:**
```bash
docker exec cfn-redis redis-cli ping
# Should output: PONG

docker exec cfn-redis redis-cli INFO server
# Should show Redis running
```

### File Locations

**Test Files:**
```
tests/docker/core/                          # 26 core test files
tests/test-utils.sh                         # Shared test helpers
tests/docker/helpers/                       # Docker-specific helpers
tests/docker/helpers/architecture-test-helpers.sh
```

**Docker Configuration:**
```
docker/Dockerfile.agent                     # Agent image
docker/Dockerfile.orchestrator              # Orchestrator image
docker/Dockerfile.coordinator               # Coordinator image
docker/docker-compose.yml                   # Network/Redis setup
docker/CLAUDE.md                            # Docker architecture documentation
```

**Scripts:**
```
.claude/skills/docker-build/build.sh        # Build helper (96% faster builds)
scripts/docker/build-from-linux.sh          # Linux native build
scripts/docker-utils/cleanup-agents.sh      # Container cleanup
scripts/docker-utils/monitor-memory.sh      # Memory monitoring
```

### Common Commands for Testing

**Build an image:**
```bash
# Using docker-build skill (recommended, 96% faster)
./.claude/skills/docker-build/build.sh --dockerfile docker/Dockerfile.agent

# Using build-from-linux.sh directly
DOCKERFILE="Dockerfile.agent" IMAGE_NAME="cfn-agent" \
  ./scripts/docker/build-from-linux.sh
```

**Start infrastructure:**
```bash
docker-compose -f docker/docker-compose.yml up -d
docker network create mcp-network 2>/dev/null || true
```

**Spawn a test agent:**
```bash
docker run --rm \
  --entrypoint /bin/bash \
  --network mcp-network \
  -e CFN_TASK_ID="test-$(date +%s)" \
  -e CFN_AGENT_ID="agent-test" \
  cfn-agent:latest \
  -c "echo 'Test successful'"
```

**Check test status:**
```bash
# Run a specific test with output
bash tests/docker/core/docker-hello-world-parity-tests.sh

# Run all core tests
for test in tests/docker/core/*.sh; do
  echo "=== Running $(basename $test) ==="
  timeout 60 bash "$test" && echo "PASS" || echo "FAIL"
done
```

**Cleanup:**
```bash
# Remove all CFN containers
docker rm -f $(docker ps -a --filter "name=cfn" -q) 2>/dev/null || true

# Remove all test containers
docker rm -f $(docker ps -a --filter "name=test" -q) 2>/dev/null || true

# Clean Redis
docker exec cfn-redis redis-cli FLUSHALL 2>/dev/null || true
```

### Test Utilities

**Standard logging (from test-utils.sh):**
```bash
log_step "Message"      # Log a step in the process
log_info "Message"      # Log informational message
assert_success "cmd"    # Assert command succeeds
assert_file_exists "f"  # Assert file exists
```

**Docker helpers (from architecture-test-helpers.sh):**
```bash
# Use these to validate architecture patterns
# See tests/docker/helpers/architecture-test-helpers.sh for available functions
```

### Known Workarounds

#### Hanging Containers

**Problem:** Test hangs when spawning container
**Solution:** Always add `--entrypoint /bin/bash` when overriding entry point

```bash
# WRONG - may hang
docker run cfn-agent:latest sh -c "command"

# RIGHT - explicit entry point
docker run --entrypoint /bin/bash cfn-agent:latest -c "command"
```

#### Environment Variable Names

**Problem:** Tests use old variable names (TASK_ID, AGENT_ID)
**Solution:** Use new CFN_ prefixed names (CFN_TASK_ID, CFN_AGENT_ID)

Fallback behavior (optional - tests may have auto-detection):
- Tests can check both old and new names
- Log warning if old names used
- Prefer new names in updated tests

#### Package Installation

**Problem:** Tests run apk commands on Debian image
**Solution:** Use apt-get instead

```bash
# In test that needs to install packages
if grep -q "Debian" /etc/os-release 2>/dev/null; then
  apt-get update && apt-get install -y curl
else
  apk add curl  # Old Alpine path
fi
```

Or just use Debian since all new images are Debian-based:
```bash
apt-get update && apt-get install -y curl jq git
```

---

## Phase Completion Checklist

### Phase 1 Complete When:
- [ ] docker-hello-world-parity-tests.sh passes
- [ ] No containers hang
- [ ] Container cleanup works reliably
- [ ] Helper functions added to architecture-test-helpers.sh

### Phase 2 Complete When:
- [ ] agent-lifecycle-tests.sh passes
- [ ] coordinator-planning-tests.sh passes
- [ ] Both pass without environment variable warnings
- [ ] Both properly validate expected behavior

### Phase 3 Complete When:
- [ ] All 5 bug fix tests pass
- [ ] No Alpine-specific commands remain
- [ ] All use standard Debian packages
- [ ] Image references are consistent

### Phase 4 Complete When:
- [ ] All 7 advanced coordinator tests pass
- [ ] Parameter passing validated
- [ ] Orchestration patterns work
- [ ] No hanging or timeout issues

### Phase 5 Complete When:
- [ ] All 26 core tests executed
- [ ] Report generated
- [ ] Known issues documented
- [ ] Recommendations made for remaining work

---

## Appendix A: Quick Reference for Pattern Updates

### Search/Replace Patterns

**Image Names:**
```bash
# Find and replace in all test files
sed -i 's/claude-flow-novice:agent/cfn-agent:latest/g' tests/docker/core/*.sh
sed -i 's/coordinator-old/cfn-coordinator:latest/g' tests/docker/core/*.sh
sed -i 's/orchestrator-old/cfn-orchestrator:latest/g' tests/docker/core/*.sh
```

**Environment Variables:**
```bash
# Add CFN_ prefix to common variables
sed -i 's/\bTASK_ID=/CFN_TASK_ID=/g' tests/docker/core/*.sh
sed -i 's/\bAGENT_ID=/CFN_AGENT_ID=/g' tests/docker/core/*.sh
sed -i 's/\bREDIS_HOST=/CFN_REDIS_HOST=/g' tests/docker/core/*.sh
sed -i 's/\bREDIS_PORT=/CFN_REDIS_PORT=/g' tests/docker/core/*.sh
sed -i 's/\bMEMORY_BUDGET=/CFN_MEMORY_BUDGET=/g' tests/docker/core/*.sh
```

**Package Managers:**
```bash
# Replace Alpine apk with Debian apt-get
sed -i 's/apk update/apt-get update/g' tests/docker/core/*.sh
sed -i 's/apk add/apt-get install -y/g' tests/docker/core/*.sh
sed -i 's/apk del/apt-get remove -y/g' tests/docker/core/*.sh
```

**Entry Point Handling:**
```bash
# Add explicit entry point to all docker run commands that override CMD
# This requires manual review - not a simple sed replacement
# Pattern: Find 'docker run ... image_name' followed by shell commands
# Add '--entrypoint /bin/bash' before image name
```

---

## Appendix B: Test Execution Template

```bash
#!/bin/bash
# Test execution script template for Phase 5

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
TESTS_DIR="$PROJECT_ROOT/tests/docker/core"
REPORT_FILE="$PROJECT_ROOT/test-run-report-$(date +%Y%m%d-%H%M%S).log"

PASS_COUNT=0
FAIL_COUNT=0

echo "Docker Test Suite Execution Report" > "$REPORT_FILE"
echo "Started: $(date)" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

for test in "$TESTS_DIR"/*.sh; do
  TEST_NAME=$(basename "$test")
  echo -n "Running $TEST_NAME ... "

  if timeout 120 bash "$test" >> "$REPORT_FILE" 2>&1; then
    echo "PASS"
    ((PASS_COUNT++))
  else
    echo "FAIL"
    ((FAIL_COUNT++))
  fi
done

TOTAL=$((PASS_COUNT + FAIL_COUNT))
PERCENT=$((PASS_COUNT * 100 / TOTAL))

echo "" >> "$REPORT_FILE"
echo "Results: $PASS_COUNT/$TOTAL passed ($PERCENT%)" >> "$REPORT_FILE"
echo "Completed: $(date)" >> "$REPORT_FILE"

echo ""
echo "Test Results:"
echo "  Passed:  $PASS_COUNT/$TOTAL"
echo "  Failed:  $FAIL_COUNT/$TOTAL"
echo "  Percent: $PERCENT%"
echo ""
echo "Report saved to: $REPORT_FILE"

exit $([[ $FAIL_COUNT -eq 0 ]] && echo 0 || echo 1)
```

---

**Document Version:** 1.0
**Last Updated:** 2025-11-14
**Owner:** Implementation Team
**Status:** Ready for Phase 1 Implementation
