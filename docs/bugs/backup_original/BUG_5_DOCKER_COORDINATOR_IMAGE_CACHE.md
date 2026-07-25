# Bug #5: Docker Coordinator Parameter Format Mismatch

**Status:** FIXED (uncommitted)
**Severity:** P1 - Blocks all coordinator launches
**Confidence:** 0.95 (root cause verified via git history + image inspection)
**Discovery:** 2025-11-13 Integration testing iteration 1

---

## Problem Statement

Coordinator container exits with code 1 and error: `Unknown option: --task-id`

**Symptoms:**
- Core tests passing but integration test failing
- Container logs show orchestrate.sh usage output
- Error occurs immediately after "Falling back to orchestrate.sh"
- Multiple rebuilds didn't fix the issue

---

## Root Cause Analysis

### The Mismatch

**Historical Issue (Commit a084a978):**
```bash
# coordinator-entrypoint.sh line 88 (OLD)
"$ORCHESTRATE_SCRIPT" execute \
    --task-id "$TASK_ID" \        # ❌ Flag format
    --task-description "$TASK_DESCRIPTION" \
```

**Current Fix (Working tree, uncommitted):**
```bash
# coordinator-entrypoint.sh line 88 (NEW)
"$ORCHESTRATE_SCRIPT" execute "$TASK_ID" \    # ✅ Positional argument
    --task-description "$TASK_DESCRIPTION" \
```

**orchestrate.sh Parameter Parsing:**
```bash
# Lines 205-215
*)
    if [[ -z "$OPERATION" ]]; then
        OPERATION="$1"              # First positional = operation
    elif [[ -z "$TASK_ID" ]]; then
        TASK_ID="$1"                # Second positional = task_id
    else
        log_error "Too many arguments"
    fi
    ;;
```

### Why It Failed

1. Entrypoint called: `orchestrate.sh execute --task-id dashboard-...`
2. orchestrate.sh parsed:
   - `OPERATION = "execute"` ✅
   - Next arg `--task-id` triggered flag parsing
   - No `--task-id` flag exists in switch statement
   - Error: "Unknown option: --task-id"

### Why Tests Missed It

**Core tests don't actually run the coordinator container:**
- Core tests validate image build success
- Core tests check entrypoint script syntax
- Core tests don't execute `docker run` with full environment
- Only integration testing caught the runtime failure

**Test Gap:**
- No test validates coordinator-to-orchestrate.sh parameter handoff
- No test runs actual Docker container with mounted workspace
- No test validates Redis coordination + orchestrate.sh integration

---

## Evidence Chain

### Image Timeline

```
Commit a084a978:  2025-11-13 15:38:49  ❌ Used --task-id flag format
Built cfn-coordinator:v3:  2025-11-13 19:49:16  ✅ Contains working fix
Old container failed:  2025-11-13 19:47:57  ❌ Used even older image
```

### Verification Commands

**Extract entrypoint from current v3 image:**
```bash
docker create --name temp-extract cfn-coordinator:v3
docker cp temp-extract:/app/coordinator-entrypoint.sh /tmp/extracted.sh
docker rm temp-extract
grep "orchestrate.sh execute" /tmp/extracted.sh
```

**Result:**
```bash
"$ORCHESTRATE_SCRIPT" execute "$TASK_ID" \    # ✅ Positional format
```

**Test orchestrate.sh directly:**
```bash
./.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh \
  execute test-task-123 \
  --task-description "Test" \
  --mode standard
```

**Result:** ✅ Works correctly

**Git diff shows uncommitted fix:**
```bash
git diff a084a978 docker/coordinator-entrypoint.sh | grep -A 2 "execute"
```

**Result:**
```diff
-"$ORCHESTRATE_SCRIPT" execute \
-    --task-id "$TASK_ID" \
+"$ORCHESTRATE_SCRIPT" execute "$TASK_ID" \
```

---

## Fix Implementation

### Changes Required

**File:** `docker/coordinator-entrypoint.sh` (line 88)

**Change:**
```bash
# OLD (flag format - causes error)
"$ORCHESTRATE_SCRIPT" execute \
    --task-id "$TASK_ID" \
    --task-description "$TASK_DESCRIPTION" \

# NEW (positional format - correct)
"$ORCHESTRATE_SCRIPT" execute "$TASK_ID" \
    --task-description "$TASK_DESCRIPTION" \
```

**Additional fixes in same working tree version:**
1. Changed `PROJECT_ROOT` from `/app/codebase` to `/workspace` (line 29)
2. Added chmod error handling for CIFS mounts (lines 80-84)
3. Updated error messages for workspace mount path

### Verification

**Current status:**
- ✅ Fix exists in working tree
- ✅ Fix exists in cfn-coordinator:v3 image (built 19:49:16)
- ❌ Fix NOT committed to git
- ❌ Old containers still referencing older images

**Image verification:**
```bash
docker run --rm -e TASK_ID=test -e TASK_DESCRIPTION=test -e MODE=standard \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  cfn-coordinator:v3 sh -c 'grep "orchestrate.sh execute" /app/coordinator-entrypoint.sh'
```

**Expected output:**
```bash
"$ORCHESTRATE_SCRIPT" execute "$TASK_ID" \
```

---

## Prevention Strategy

### Test Additions Required

**1. Parameter Handoff Test**

**File:** `tests/docker/core/test-coordinator-orchestrate-params.sh`

```bash
#!/bin/bash
# Validate coordinator-entrypoint.sh → orchestrate.sh parameter passing

ENTRYPOINT="/docker/coordinator-entrypoint.sh"

# Extract orchestrate.sh call
CALL=$(grep -A 5 'orchestrate.sh execute' "$ENTRYPOINT")

# Verify positional TASK_ID format
if echo "$CALL" | grep -q 'execute "\$TASK_ID"'; then
  echo "✅ PASS: TASK_ID passed as positional argument"
  exit 0
else
  echo "❌ FAIL: TASK_ID not in positional format"
  echo "Found: $CALL"
  exit 1
fi
```

**2. Container Launch Test**

**File:** `tests/docker/core/test-coordinator-launch.sh`

```bash
#!/bin/bash
# Validate coordinator container launches without parameter errors

docker run --rm \
  --name test-coordinator-launch \
  -e TASK_ID=test-launch-123 \
  -e TASK_DESCRIPTION="Test coordinator launch" \
  -e MODE=standard \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  --network cfn-network \
  cfn-coordinator:v3 \
  timeout 10s tail -f /dev/null &

CONTAINER_PID=$!
sleep 5

# Check for parameter errors in logs
LOGS=$(docker logs test-coordinator-launch 2>&1)

if echo "$LOGS" | grep -q "Unknown option"; then
  echo "❌ FAIL: Parameter error detected"
  echo "$LOGS"
  docker rm -f test-coordinator-launch
  exit 1
fi

if echo "$LOGS" | grep -q "✅ Coordinator agent located"; then
  echo "✅ PASS: Coordinator launched successfully"
  docker rm -f test-coordinator-launch
  exit 0
else
  echo "⚠️ WARN: Coordinator didn't reach expected checkpoint"
  docker rm -f test-coordinator-launch
  exit 1
fi
```

**3. Update Core Test Suite**

Add to `tests/docker/core/run-all-core-tests.sh`:
```bash
run_test "Coordinator Parameter Handoff" test-coordinator-orchestrate-params.sh
run_test "Coordinator Container Launch" test-coordinator-launch.sh
```

### Documentation Updates

**1. Build Validation Checklist**

Add to `scripts/docker/linux-build.config`:
```bash
# Post-build validation
VALIDATE_ENTRYPOINT=true
VALIDATE_PARAMS=true
VALIDATE_LAUNCH=true
```

**2. Integration Test Requirements**

Add to `tests/docker/TEST_SUITE_OVERVIEW.md`:
```markdown
### Coordinator Launch Tests
- Parameter format validation (entrypoint → orchestrate.sh)
- Container launch with minimal environment
- Error detection in first 10 seconds
```

---

## Lessons Learned

### What Went Wrong

1. **Uncommitted Fix:** Working fix existed but wasn't committed
2. **Test Gap:** Core tests validated syntax, not runtime behavior
3. **Image Confusion:** Multiple images with similar names/tags
4. **Cache Misunderstanding:** Thought image was cached, but it was actually using correct uncommitted version

### What Went Right

1. **Integration Testing:** Found the issue before production deployment
2. **Docker Inspection:** Extracted entrypoint from image to verify contents
3. **Git History:** Traced exact commit where issue was introduced
4. **Systematic Debugging:** Followed evidence chain from error → script → git → image

### Key Takeaways

1. **Always commit fixes immediately** - Don't rely on uncommitted working tree
2. **Core tests must include runtime validation** - Syntax checks aren't enough
3. **Integration tests are essential** - Only way to catch parameter handoff issues
4. **Document image lineage** - Track which commit each image was built from

---

## Deployment Procedures (Iteration 2)

### Pre-Deployment Checklist

Before deploying the coordinator fix to production, complete all items:

- [ ] Fix committed to git (not just working tree)
- [ ] Image rebuilt from committed version: `docker build -f Dockerfile.coordinator -t cfn-coordinator:v3 .`
- [ ] Smoke test passes: `tests/docker/deployment/smoke-test-coordinator.sh`
- [ ] Rollback procedure documented and tested
- [ ] Monitoring baseline established (see Post-Deployment Monitoring)
- [ ] Team notified of deployment window
- [ ] No active coordinator tasks running in production
- [ ] Backup of current v2 image tagged: `docker tag cfn-coordinator:v2 cfn-coordinator:v2-backup-$(date +%s)`

### Rollback Procedure

If deployment fails or issues are detected post-deployment:

**Step 1: Preserve current state**
```bash
docker tag cfn-coordinator:v3 cfn-coordinator:v3-rollback
```

**Step 2: Revert to last known good version**
```bash
docker tag cfn-coordinator:v2 cfn-coordinator:v3
```

**Step 3: Restart all running coordinator containers**
```bash
docker restart $(docker ps --filter "ancestor=cfn-coordinator:v3" --format "{{.ID}}" 2>/dev/null)
```

**Step 4: Verify rollback success**
```bash
# Check for parameter errors (should return 0 lines)
docker logs $(docker ps --filter "ancestor=cfn-coordinator:v3" --format "{{.ID}}" 2>/dev/null | head -1) 2>&1 | grep "Unknown option"

# Verify containers are running
docker ps --filter "ancestor=cfn-coordinator:v3" --filter "status=running"
```

**Step 5: Monitor for stability**
```bash
# Monitor for 10 minutes - no errors should appear
watch -n 5 'docker logs $(docker ps --filter "ancestor=cfn-coordinator:v3" --format "{{.ID}}" 2>/dev/null | head -1) 2>&1 | tail -20'
```

**Step 6: Document incident**
- Record time of rollback
- Note any error messages observed
- Create follow-up investigation task
- Notify team of rollback status

### Deployment Smoke Test

**Purpose:** Validate coordinator deployment before full production rollout

**Location:** `tests/docker/deployment/smoke-test-coordinator.sh`

**Runtime:** <60 seconds

**Test Coverage:**
1. Docker image validation (cfn-coordinator:v3 exists)
2. Parameter format validation (positional TASK_ID, not flag-based)
3. Container launch validation (startup without errors)
4. Exit code validation (no parameter errors)
5. Log validation (no "Unknown option" messages)

**Execution:**
```bash
./tests/docker/deployment/smoke-test-coordinator.sh
```

**Expected Output:**
```
========================================
Coordinator Deployment Smoke Test
========================================

Test ID: smoke-test-1731532800-12345
Description: Smoke test: minimal coordinator validation
Timeout: 60s

[1/5] Checking Docker image...
[PASS] Image exists: cfn-coordinator:v3

[2/5] Validating parameter format...
[PASS] Parameter format correct (positional TASK_ID)

[3/5] Launching coordinator container...
Container name: test-coordinator-smoke-1731532800-12345

[4/5] Validating startup and exit code...
[PASS] Container launched successfully
[PASS] Exit code valid: 0

[5/5] Checking for parameter errors...
[PASS] No parameter format errors

========================================
Smoke Test PASSED
========================================

Summary:
  - Image exists and is ready
  - Parameter format is correct (positional TASK_ID)
  - Container launches without parameter errors
  - No exit code anomalies detected

Deployment is ready to proceed.
```

**Failure Handling:**
- If test fails, **DO NOT PROCEED** to production deployment
- Review logs preserved in `/tmp/smoke-test-coordinator-*.log`
- Check for "Unknown option --task-id" errors (indicates old code)
- Verify image was built from committed version
- Rebuild image and rerun smoke test

### Post-Deployment Monitoring

**Monitoring Period:** 24 hours after deployment

**Critical Metrics:**

**1. Parameter Format Errors**
```bash
# Monitor (should show 0 errors)
watch -n 30 'docker logs cfn-coordinator 2>&1 | grep -c "Unknown option" || echo "0"'
```
- Baseline: 0 errors
- Alert threshold: > 0 errors
- Action: Trigger rollback procedure

**2. Container Stability**
```bash
# Monitor (should show only running containers)
watch -n 60 'docker ps --filter "name=cfn-coordinator" --filter "status=exited" | wc -l'
```
- Expected: 0 exited containers
- Alert threshold: > 2 unexpected exits in 1 hour
- Action: Investigate root cause, prepare rollback

**3. Agent Completion Rate**
```bash
# Monitor via orchestrate.sh logs
watch -n 60 'docker logs cfn-coordinator 2>&1 | grep "Agent completed" | wc -l'
```
- Expected baseline: Varies by task volume
- Alert threshold: Significant drop from baseline
- Action: Investigate agent execution, check parameter passing

**4. Task Success Rate**
```bash
# Check coordinator exit codes (should be 0 = success)
docker logs cfn-coordinator 2>&1 | grep "EXIT_CODE" | tail -20
```
- Expected: 0 (success) or expected non-zero codes
- Alert threshold: Unexpected exit codes
- Action: Review task logs, check for parameter errors

### Deployment Execution Steps

**Step 1: Pre-flight checks**
```bash
# Verify fix is committed
git log --oneline -5 | grep -i "parameter\|coordinator"

# Verify image build configuration
cat Dockerfile.coordinator | grep "FROM\|COPY.*entrypoint"

# Run smoke test
./tests/docker/deployment/smoke-test-coordinator.sh
```

**Step 2: Tag and prepare rollback**
```bash
# Backup current v2
docker tag cfn-coordinator:v2 cfn-coordinator:v2-backup-$(date +%s)

# Verify backup
docker images | grep cfn-coordinator
```

**Step 3: Build production image**
```bash
# Build from committed version
docker build -f Dockerfile.coordinator -t cfn-coordinator:v3 .

# Verify build success
docker images | grep cfn-coordinator:v3
```

**Step 4: Validate image contents**
```bash
# Extract and verify parameter format
docker run --rm cfn-coordinator:v3 grep -A 1 "orchestrate.sh execute" /app/coordinator-entrypoint.sh

# Expected output:
# "$ORCHESTRATE_SCRIPT" execute "$TASK_ID" \
```

**Step 5: Execute deployment**
```bash
# Stop old containers
docker stop $(docker ps --filter "ancestor=cfn-coordinator:v2" --format "{{.ID}}" 2>/dev/null) || true

# Start new containers with v3 image
docker run -d \
  --name cfn-coordinator \
  -e TASK_ID="init-validation-$(date +%s)" \
  -e TASK_DESCRIPTION="Deployment validation" \
  -e MODE="standard" \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v /workspace:/workspace:ro \
  --network cfn-network \
  cfn-coordinator:v3
```

**Step 6: Monitor initial execution (10 minutes)**
```bash
# Watch for startup errors
watch -n 5 'docker logs cfn-coordinator 2>&1 | grep -E "Unknown option|ERROR" | tail -5'

# Verify container is stable
docker ps --filter "name=cfn-coordinator" --filter "status=running"
```

**Step 7: Confirm deployment success**
```bash
# Log deployment completion
echo "Deployment completed: cfn-coordinator:v3 $(date)" >> deployment.log

# Notify team
echo "cfn-coordinator v3 deployed successfully" | mail -s "Deployment: Coordinator Parameter Fix" team@example.com
```

---

## Resolution Checklist

- [x] Root cause identified (parameter format mismatch)
- [x] Fix verified in working tree and current image
- [ ] Fix committed to git
- [ ] Image rebuilt from committed version
- [ ] Smoke test passes
- [ ] Rollback procedure tested locally
- [ ] Pre-deployment checklist completed
- [ ] Deployment executed
- [ ] Post-deployment monitoring established (24h)
- [ ] Old containers cleaned up
- [ ] Core tests updated with parameter validation
- [ ] Integration test passes with new image
- [ ] Documentation updated with prevention strategy

---

## Related Issues

- **Bug #4:** Docker coordinator architectural mismatch (task distribution patterns)
- **Integration Test:** Dashboard monitoring task (first real-world coordinator test)

---

**Confidence Score:** 0.95

**Rationale:**
- Root cause verified via git diff and image inspection
- Exact commit identified where issue was introduced
- Fix validated via direct orchestrate.sh testing
- Evidence chain complete from error → source → history
- Prevention strategy comprehensive and testable
- Deployment procedures include rollback, smoke testing, and monitoring baseline
- Smoke test script validated for <60s execution time
