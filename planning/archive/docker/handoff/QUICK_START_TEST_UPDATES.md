# Quick Start: Docker Test Suite Updates
## Alpine → Debian Slim Migration - 10-Minute Quick Reference

**For busy implementers who want to get started immediately.**

---

## The Problem (30 seconds)

Tests fail because:
- Images changed from Alpine to Debian Slim
- Image names changed: `claude-flow-novice:agent` → `cfn-agent:latest`
- Package manager changed: `apk` → `apt-get`
- Environment variables need CFN_ prefix: `TASK_ID` → `CFN_TASK_ID`
- Entry point behavior changed (tests hang)

**Current Status:** 6/26 tests passing (23%) ❌

---

## The Solution (4 steps)

### Step 1: Use Helper Function (New!)
Create this in `tests/docker/helpers/architecture-test-helpers.sh`:

```bash
run_agent_container() {
  local agent_id="$1"
  local task_cmd="$2"

  docker run --rm \
    --entrypoint /bin/bash \
    --network mcp-network \
    -e CFN_AGENT_ID="$agent_id" \
    -e CFN_TASK_ID="task-$(date +%s)" \
    cfn-agent:latest \
    -c "$task_cmd"
}

# Usage:
run_agent_container "my-agent" "echo hello"
```

**Why?** Fixes entry point hanging automatically. Use this in ALL tests.

### Step 2: Fix Image Names
Search and replace in all test files:

```bash
# In: tests/docker/core/*.sh

# OLD (broken)
claude-flow-novice:agent
coordinator-old
orchestrator-old

# NEW (fixed)
cfn-agent:latest
cfn-coordinator:latest
cfn-orchestrator:latest
```

### Step 3: Fix Environment Variables
Add CFN_ prefix everywhere:

```bash
# OLD (broken)
docker run -e TASK_ID=123 -e AGENT_ID=agent -e REDIS_HOST=localhost

# NEW (fixed)
docker run \
  -e CFN_TASK_ID=123 \
  -e CFN_AGENT_ID=agent \
  -e CFN_REDIS_HOST=localhost
```

### Step 4: Fix Package Manager Commands
Replace Alpine with Debian:

```bash
# OLD (broken - Alpine)
apk add curl jq
apk update
apk del package

# NEW (fixed - Debian)
apt-get update && apt-get install -y curl jq
apt-get remove -y package
```

---

## Priority Order (Which to Fix First)

1. **CRITICAL** (fixes 1 test, unblocks others):
   - docker-hello-world-parity-tests.sh

2. **HIGH** (foundation for others):
   - agent-lifecycle-tests.sh
   - coordinator-planning-tests.sh

3. **MEDIUM** (can be parallelized):
   - test-bugfix-container-validation.sh
   - test-bugfix-quick-verification.sh
   - test-bugfix-redis-checkpoint.sh
   - test-bugfix-security-sanitization.sh
   - test-bugfix-validation-summary.sh

4. **LOW** (can wait):
   - All test-coordinator-*.sh and test-wave-*.sh tests
   - redis-coordination-tests.sh

---

## Copy-Paste Reference

### Don't Hang - Add Entry Point

```bash
# ❌ WRONG - will hang
docker run cfn-agent:latest sh -c "echo test"

# ✅ RIGHT - explicit entry point
docker run --entrypoint /bin/bash cfn-agent:latest -c "echo test"
```

### Spawn Agent Container Properly

```bash
# Use this pattern everywhere
docker run --rm \
  --entrypoint /bin/bash \
  --network mcp-network \
  -e CFN_TASK_ID="test-123" \
  -e CFN_AGENT_ID="agent-1" \
  cfn-agent:latest \
  -c "your-command-here"
```

### Check Infrastructure

```bash
# Verify images exist
docker images | grep cfn-

# Verify network exists
docker network ls | grep mcp-network

# Verify Redis is healthy
docker exec cfn-redis redis-cli ping
# Should output: PONG
```

### Common Test Pattern (Before & After)

**BEFORE (Broken):**
```bash
#!/bin/bash
set -euo pipefail

docker run -d \
  -e TASK_ID=test-123 \
  -e AGENT_ID=agent-1 \
  -e REDIS_HOST=localhost \
  claude-flow-novice:agent \
  sh -c "npm run task"

docker exec cfn-agent-container apk add curl
```

**AFTER (Fixed):**
```bash
#!/bin/bash
set -euo pipefail

docker run -d \
  --entrypoint /bin/bash \
  --network mcp-network \
  -e CFN_TASK_ID=test-123 \
  -e CFN_AGENT_ID=agent-1 \
  -e CFN_REDIS_HOST=localhost \
  cfn-agent:latest \
  -c "npm run task"

docker exec cfn-agent-container apt-get update && apt-get install -y curl
```

---

## Running Tests After Fixes

### Test One File
```bash
bash tests/docker/core/docker-hello-world-parity-tests.sh
```

### Test All Files
```bash
for test in tests/docker/core/*.sh; do
  echo "Testing: $(basename $test)"
  timeout 120 bash "$test" && echo "✅ PASS" || echo "❌ FAIL"
done
```

### Count Results
```bash
passed=0
failed=0
for test in tests/docker/core/*.sh; do
  timeout 120 bash "$test" >/dev/null 2>&1 && ((passed++)) || ((failed++))
done
echo "Results: $passed passed, $failed failed"
```

---

## Automated Fix Script (Use With Caution)

For the brave who want to auto-patch all tests:

```bash
#!/bin/bash
# Automated test patching

cd tests/docker/core

# Fix image names
sed -i 's/claude-flow-novice:agent/cfn-agent:latest/g' *.sh
sed -i 's/coordinator-old/cfn-coordinator:latest/g' *.sh
sed -i 's/orchestrator-old/cfn-orchestrator:latest/g' *.sh

# Fix environment variables (careful: uses word boundary)
sed -i 's/\bTASK_ID=/CFN_TASK_ID=/g' *.sh
sed -i 's/\bAGENT_ID=/CFN_AGENT_ID=/g' *.sh
sed -i 's/\bREDIS_HOST=/CFN_REDIS_HOST=/g' *.sh
sed -i 's/\bREDIS_PORT=/CFN_REDIS_PORT=/g' *.sh
sed -i 's/\bMEMORY_BUDGET=/CFN_MEMORY_BUDGET=/g' *.sh

# Fix package managers
sed -i 's/apk add/apt-get install -y/g' *.sh
sed -i 's/apk update/apt-get update/g' *.sh
sed -i 's/apk del/apt-get remove -y/g' *.sh

echo "✅ Patching complete - review changes before committing"
```

**Before running this:**
1. Backup: `git stash`
2. Review: `git diff` after running
3. Test: Run a few tests to verify

---

## When Tests Still Fail (Debugging)

### Test Hangs
**Solution:** Add `--entrypoint /bin/bash` to docker run

### "Image not found" Error
**Solution:** Fix image name - must be one of:
- cfn-agent:latest
- cfn-orchestrator:latest
- cfn-coordinator:latest

Verify: `docker images | grep cfn-`

### "apk: command not found"
**Solution:** Replace with apt-get:
```bash
# OLD
apk add curl

# NEW
apt-get update && apt-get install -y curl
```

### "connection refused" or Redis errors
**Solution:** Verify network and Redis:
```bash
docker network inspect mcp-network
docker exec cfn-redis redis-cli ping
# Should show: PONG
```

### Environment variables not passed
**Solution:** Use CFN_ prefix:
```bash
-e CFN_TASK_ID=123    # NOT -e TASK_ID=123
-e CFN_AGENT_ID=agent # NOT -e AGENT_ID=agent
-e CFN_REDIS_HOST=cfn-redis # NOT -e REDIS_HOST
```

---

## Timeline (Realistic Estimates)

| Phase | Tasks | Est. Time | Critical? |
|-------|-------|-----------|-----------|
| 1 | Fix docker-hello-world test | 30 min | YES |
| 2 | Fix agent-lifecycle & planning tests | 1-1.5 hrs | YES |
| 3 | Fix all bug-fix tests (5) | 1.5-2 hrs | MEDIUM |
| 4 | Fix coordinator advanced tests (7) | 2-3 hrs | MEDIUM |
| 5 | Run full suite & document | 1 hr | YES |
| **Total** | **All 26 tests fixed** | **6-8 hours** | |

**Goal:** Get docker-hello-world test passing in first 30 minutes. Everything else unblocks after.

---

## Deliverables Checklist

After completing fixes, verify:

- [ ] 26/26 core tests listed in tests/docker/core/ exist
- [ ] 20+ tests now passing (up from 6)
- [ ] docker-hello-world-parity-tests.sh passes (critical path)
- [ ] agent-lifecycle-tests.sh passes
- [ ] coordinator-planning-tests.sh passes
- [ ] No tests hang or timeout
- [ ] All Alpine commands replaced with Debian equivalents
- [ ] All image names use cfn-* tags
- [ ] All environment variables use CFN_ prefix
- [ ] Helper function added to architecture-test-helpers.sh
- [ ] Test execution report generated
- [ ] Known issues documented (if any remain)

---

## Key Files to Modify

**Main test files to update:**
```
tests/docker/core/
├── docker-hello-world-parity-tests.sh          [CRITICAL]
├── agent-lifecycle-tests.sh                     [HIGH]
├── coordinator-planning-tests.sh                [HIGH]
├── test-bugfix-*.sh (5 files)                   [MEDIUM]
├── test-coordinator-*.sh (5 files)              [MEDIUM]
├── test-wave-*.sh (3 files)                     [MEDIUM]
└── (and 7 others)                              [LOWER PRIORITY]
```

**Helper file to enhance:**
```
tests/docker/helpers/architecture-test-helpers.sh
  - Add run_agent_container() function
```

---

## Success Looks Like

```bash
$ for test in tests/docker/core/*.sh; do
    timeout 120 bash "$test" && echo "✅ $(basename $test)" || echo "❌ $(basename $test)"
  done

✅ docker-hello-world-parity-tests.sh
✅ agent-lifecycle-tests.sh
✅ coordinator-planning-tests.sh
✅ test-bugfix-container-validation.sh
✅ test-bugfix-quick-verification.sh
... (20 more passing tests)

Results: 26 PASSED, 0 FAILED
Success rate: 100%
```

---

## Questions? See Full Documentation

For detailed information, see:
- `/planning/docker/handoff/HANDOFF_DOCKER_TEST_SUITE_UPDATE.md` (1095 lines)

For quick reference while working:
- Keep this file open in a split screen
- Use the copy-paste examples above
- Follow the priority order

---

**Last Updated:** 2025-11-14
**Quick Reference Version:** 1.0
