# TypeScript Redis E2E Test - Pre-Flight Checklist

**Test:** `tests/typescript-redis-e2e-5-iterations.sh`
**Duration:** ~15-20 seconds
**Purpose:** Validate TypeScript Redis coordination migration

---

## Pre-Flight Checklist

### 1. Redis Infrastructure

```bash
# Check Redis container is running
docker ps | grep redis

# Expected output:
# CONTAINER ID   IMAGE          STATUS         PORTS
# abc123...      redis:7        Up 5 minutes   0.0.0.0:6379->6379/tcp
```

**Status:** [ ] Redis container running

```bash
# Test Redis connectivity
redis-cli PING

# Expected output: PONG
```

**Status:** [ ] Redis responds to PING

```bash
# Verify Redis port (if using worktree offsets)
echo $CFN_REDIS_PORT

# Expected: 6379 (default) or custom port (e.g., 6421)
```

**Status:** [ ] Redis port configured correctly

---

### 2. TypeScript Build

```bash
# Check if dist/ directory exists
ls -la .claude/skills/cfn-redis-coordination/dist/

# Expected: completion-reporter.js, result-collector.js, context-manager.js, ...
```

**Status:** [ ] TypeScript dist/ directory exists

```bash
# Build TypeScript modules (if needed)
cd .claude/skills/cfn-redis-coordination
npm run build

# Expected output:
# > @cfn/redis-coordination@3.0.1 build
# > tsc
# (no errors)

cd -
```

**Status:** [ ] TypeScript build successful

```bash
# Verify critical modules exist
for module in completion-reporter result-collector context-manager redis-client types; do
  test -f .claude/skills/cfn-redis-coordination/dist/${module}.js && echo "✅ $module.js" || echo "❌ $module.js MISSING"
done

# Expected: All ✅
```

**Status:** [ ] All TypeScript modules present

---

### 3. Bash Wrapper Scripts

```bash
# Verify bash wrapper scripts exist
for script in report-completion collect-results collect-confidence-scores store-context; do
  test -f .claude/skills/cfn-redis-coordination/${script}.sh && echo "✅ $script.sh" || echo "❌ $script.sh MISSING"
done

# Expected: All ✅
```

**Status:** [ ] All bash wrappers present

```bash
# Check scripts are executable
for script in report-completion collect-results collect-confidence-scores store-context; do
  test -x .claude/skills/cfn-redis-coordination/${script}.sh && echo "✅ $script.sh executable" || echo "❌ $script.sh NOT executable"
done

# Expected: All ✅
```

**Status:** [ ] All bash wrappers executable

---

### 4. Test Script Readiness

```bash
# Verify test script exists
test -f tests/typescript-redis-e2e-5-iterations.sh && echo "✅ Test script exists" || echo "❌ Test script MISSING"
```

**Status:** [ ] Test script exists

```bash
# Make test script executable (if needed)
chmod +x tests/typescript-redis-e2e-5-iterations.sh
ls -la tests/typescript-redis-e2e-5-iterations.sh

# Expected: -rwxr-xr-x (executable flag set)
```

**Status:** [ ] Test script executable

```bash
# Verify test utilities are available
test -f tests/test-utils.sh && echo "✅ Test utilities available" || echo "❌ test-utils.sh MISSING"
```

**Status:** [ ] Test utilities available

---

### 5. Environment Configuration

```bash
# Check environment variables (optional)
echo "CFN_REDIS_HOST=${CFN_REDIS_HOST:-localhost}"
echo "CFN_REDIS_PORT=${CFN_REDIS_PORT:-6379}"
echo "REDIS_PASSWORD=${REDIS_PASSWORD:-(none)}"

# Verify Docker network exists (if using containers)
docker network ls | grep mcp-network || echo "⚠️ mcp-network not found (may be created automatically)"
```

**Status:** [ ] Environment variables configured

---

## Execution Checklist

### Run the Test

```bash
# Execute test
./tests/typescript-redis-e2e-5-iterations.sh
```

**Status:** [ ] Test executed

---

### Expected Output (Success)

```
========================================
Test Suite: typescript-redis-e2e-5-iterations
========================================

▶ Phase 1: Validate Prerequisites
✅ PASS: Redis is healthy
✅ PASS: TypeScript build successful
[...]

▶ Phase 2: Execute 5 Complete CFN Loop Iterations

========================================
ITERATION 1 / 5
========================================
[... iterations execute ...]

========================================
ITERATION 4 / 5
========================================
[... convergence at iteration 4 ...]

✅ 🎉 CFN Loop COMPLETED successfully at iteration 4

▶ Phase 3: TypeScript Module Validation Summary
[... summary of tested modules ...]

========================================
Test Summary
========================================
Total:  25
Passed: 25
Failed: 0

✅ All tests passed!
```

**Status:** [ ] All 25 tests passed

---

## Post-Flight Verification

### 1. Check Test Logs

```bash
# View test log (if test failed)
ls -lt /tmp/typescript-redis-e2e-*.log | head -1

# Review errors
tail -100 /tmp/typescript-redis-e2e-*.log
```

**Status:** [ ] Logs reviewed (if applicable)

---

### 2. Verify Redis Cleanup

```bash
# Check for orphaned Redis keys
redis-cli KEYS "test-swarm:*"

# Expected: (empty list) or minimal keys (should auto-cleanup on test exit)
```

**Status:** [ ] Redis keys cleaned up

---

### 3. Performance Check

Expected metrics:
- **Duration:** <30 seconds
- **Redis Operations:** ~150
- **Redis Keys Created:** ~42
- **Memory Usage:** <100MB

**Status:** [ ] Performance within expected range

---

## Troubleshooting Checklist

### Problem: "TypeScript build failed"

- [ ] Check Node.js version: `node --version` (should be ≥18)
- [ ] Install dependencies: `cd .claude/skills/cfn-redis-coordination && npm ci`
- [ ] Check TypeScript errors: `npm run type-check`
- [ ] Review build output for errors

---

### Problem: "Redis not available"

- [ ] Start Redis: `docker-compose up -d redis`
- [ ] Check container: `docker ps | grep redis`
- [ ] Test connectivity: `redis-cli PING`
- [ ] Check port: `netstat -an | grep 6379`
- [ ] Review Redis logs: `docker logs claude-flow-novice-redis-1`

---

### Problem: "Context storage failed"

- [ ] Check TypeScript module: `ls -la .claude/skills/cfn-redis-coordination/dist/context-manager.js`
- [ ] Test module manually: `node .claude/skills/cfn-redis-coordination/dist/context-manager.js`
- [ ] Check bash wrapper: `bash .claude/skills/cfn-redis-coordination/store-context.sh --help`
- [ ] Enable debug logging: `export CFN_DEBUG=true`
- [ ] Check Redis data: `redis-cli KEYS "test-swarm:*:context"`

---

### Problem: "Gate threshold not working"

- [ ] Check result-collector module: `ls -la .claude/skills/cfn-redis-coordination/dist/result-collector.js`
- [ ] Verify test-results keys: `redis-cli KEYS "test-swarm:*:test-results"`
- [ ] Check pass rate data: `redis-cli HGETALL "test-swarm:...:test-results"`
- [ ] Review threshold calculation in test script
- [ ] Enable debug output: `bash -x tests/typescript-redis-e2e-5-iterations.sh 2>&1 | grep -A5 "Gate Check"`

---

## Sign-Off

**Executed By:** _______________
**Date:** _______________
**Result:** [ ] PASS  [ ] FAIL

**Notes:**
_________________________________________________________________
_________________________________________________________________
_________________________________________________________________

**Next Actions (if FAILED):**
_________________________________________________________________
_________________________________________________________________
_________________________________________________________________

**Approval (if PASSED):**
- [ ] TypeScript modules ready for production deployment
- [ ] Bash scripts can be deprecated (after migration complete)
- [ ] No regressions detected from bash → TypeScript migration
- [ ] Test added to CI/CD pipeline

---

**Checklist Version:** 1.0.0
**Last Updated:** 2025-01-19
