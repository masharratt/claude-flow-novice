# Quick Start: TypeScript Redis E2E Test

**Goal:** Validate TypeScript Redis coordination migration works in production.

## 1-Minute Quick Start

```bash
# Prerequisites (one-time setup)
docker-compose up -d redis
cd .claude/skills/cfn-redis-coordination && npm run build && cd -

# Run the test
./tests/typescript-redis-e2e-5-iterations.sh
```

**Expected:** All tests pass in ~15-20 seconds.

## What Gets Tested

**5 complete CFN Loop iterations** validating:
- TypeScript modules load without errors ✅
- Redis operations succeed (not mocked) ✅
- Agent completion reporting works ✅
- Gate threshold checking works (pass rate ≥0.95) ✅
- Consensus collection works (consensus ≥0.90) ✅
- Product Owner decision logic works ✅
- No memory leaks after 5 iterations ✅

## Interpreting Results

### ✅ Success (All Tests Pass)

```
Total:  25
Passed: 25
Failed: 0

✅ All tests passed!
```

**Meaning:** TypeScript migration is working correctly. Safe to proceed with production deployment.

### ❌ Failure Examples

#### "TypeScript build failed"

**Cause:** TypeScript compilation errors.

**Fix:**
```bash
cd .claude/skills/cfn-redis-coordination
npm run build
# Check errors, fix TypeScript code
```

#### "Redis not available"

**Cause:** Redis container not running.

**Fix:**
```bash
docker-compose up -d redis
docker ps | grep redis  # Verify running
```

#### "Context storage failed"

**Cause:** TypeScript `context-manager.js` not working.

**Fix:**
```bash
# Check TypeScript module exists
ls -la .claude/skills/cfn-redis-coordination/dist/context-manager.js

# Test manually
node .claude/skills/cfn-redis-coordination/dist/context-manager.js
```

#### "Gate threshold not working"

**Cause:** Result collection or threshold calculation broken.

**Fix:**
```bash
# Check Redis data manually
redis-cli
> KEYS test-swarm:*
> HGETALL test-swarm:test-ts-e2e-XXXXXX:backend-dev-1:result

# Enable debug logging
export CFN_DEBUG=true
./tests/typescript-redis-e2e-5-iterations.sh
```

## Test Output Explained

```
========================================
ITERATION 1 / 5
========================================

▶ Iteration 1: Loop 3 (Implementers + Test Execution)
```
**→ Loop 3 agents spawn and report test results**

```
ℹ Average pass rate: 0.88 (threshold: 0.95)
⚠ ❌ Gate FAILED: 0.88 < 0.95 (will iterate)
```
**→ Gate check: Pass rate too low, skip Loop 2, iterate Loop 3**

```
========================================
ITERATION 4 / 5
========================================

▶ Iteration 4: Gate Check (Test Pass Rate Threshold)
ℹ Average pass rate: 0.97 (threshold: 0.95)
✅ ✅ Gate PASSED: 0.97 >= 0.95
```
**→ Gate check: Pass rate exceeds threshold, proceed to Loop 2**

```
▶ Iteration 4: Loop 2 (Validators)
[... validators complete ...]

▶ Iteration 4: Product Owner Decision
✅ Product Owner: PROCEED (consensus threshold met)
✅ 🎉 CFN Loop COMPLETED successfully at iteration 4
```
**→ Consensus ≥0.90, Product Owner says PROCEED, task complete!**

```
▶ Memory Leak Check: Verify Redis key count is reasonable
ℹ Redis keys for this task: 42
✅ ✅ Redis key count (42) is reasonable - no obvious memory leak
```
**→ Redis key count is healthy, no memory leaks detected**

## Advanced Usage

### Run with custom Redis port (worktree isolation)

```bash
CFN_REDIS_PORT=6421 ./tests/typescript-redis-e2e-5-iterations.sh
```

### Run with debug logging

```bash
export CFN_DEBUG=true
./tests/typescript-redis-e2e-5-iterations.sh 2>&1 | tee test-debug.log
```

### Run in CI/CD

```yaml
# .github/workflows/typescript-e2e.yml
jobs:
  test:
    steps:
      - run: docker-compose up -d redis
      - run: cd .claude/skills/cfn-redis-coordination && npm ci && npm run build
      - run: ./tests/typescript-redis-e2e-5-iterations.sh
```

## Next Steps After Success

1. **Deploy to production** - TypeScript modules validated
2. **Remove old bash scripts** - Migrate remaining `invoke-waiting-mode.sh`, etc.
3. **Add stress testing** - 100 iterations, 50 agents
4. **Monitor production** - Track Redis performance metrics

## Next Steps After Failure

1. **Check test logs** - `/tmp/typescript-redis-e2e-*.log`
2. **Verify Redis** - `docker ps | grep redis` and `redis-cli PING`
3. **Rebuild TypeScript** - `cd .claude/skills/cfn-redis-coordination && npm run build`
4. **Check module exists** - `ls -la .claude/skills/cfn-redis-coordination/dist/*.js`
5. **Test manually** - Run individual bash wrappers to isolate failure

## Key Metrics

| Metric | Expected |
|--------|----------|
| Total Duration | < 30s |
| Redis Operations | ~150 |
| Redis Keys Created | ~42 |
| Memory Usage | < 100MB |
| Test Pass Rate | 100% (25/25) |

## Documentation

- **Full Test Documentation:** `tests/TYPESCRIPT_REDIS_E2E_TEST.md`
- **Test Utilities:** `tests/test-utils.sh`
- **TypeScript Migration Plan:** `.claude/skills/cfn-redis-coordination/MIGRATION_PLAN.md`
