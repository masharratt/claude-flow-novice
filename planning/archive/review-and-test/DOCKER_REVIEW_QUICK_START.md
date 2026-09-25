# Docker Review Testing - Quick Start Guide

**Start here if you want to begin testing immediately.**

---

## 5-Minute Overview

The Docker environment has 15 validation areas across 4 categories:
- **3 Critical** (Security) - Must all pass
- **4 High** (Orchestration) - 5+ should pass
- **5 Medium** (Testing) - 9+ should pass
- **3 Low** (Documentation) - All should be current

---

## Most Important First (Do These Today)

### 1. Docker Socket Access Test (Critical #1)
```bash
# Test 1: Coordinator can access docker.sock
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  cfn-coordinator:latest docker ps
# Should SUCCEED

# Test 2: Agents cannot access docker.sock
docker run --rm cfn-agent:frontend docker ps
# Should FAIL with "Cannot connect to Docker daemon"
```

**Time:** 5 minutes
**Result:** ✅ Pass or ❌ Fail
**Document:** Commit to git if pass

---

### 2. Redis Authentication Test (Critical #2)
```bash
# Test wrong password
docker exec cfn-redis redis-cli AUTH wrong-password
# Should fail

# Test correct password
docker exec cfn-redis redis-cli -a $REDIS_PASSWORD PING
# Should succeed
```

**Time:** 5 minutes
**Result:** ✅ Pass or ❌ Fail

---

### 3. Success Criteria Loading Test (Critical #3)
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
# Check logs for: "Loaded success criteria"
```

**Time:** 5 minutes
**Result:** ✅ Pass or ❌ Fail

---

## Second Priority (This Week)

### 4. Multi-Worktree Test (High #4)
```bash
git checkout -b feature/test-branch
./scripts/docker/run-in-worktree.sh --dry-run up -d 2>&1 | grep CFN_
# Should show different ports than main branch
```

**Time:** 10 minutes

### 5. Task Queue Test (High #5)
```bash
docker exec cfn-redis redis-cli LPUSH task:queue task:1 task:2 task:3
docker exec cfn-redis redis-cli LLEN task:queue
# Should output: 3
```

**Time:** 5 minutes

---

## File Locations

| File | Purpose |
|------|---------|
| `DOCKER_REVIEW_TODO_LIST.md` | **Comprehensive** - 15 items with detailed scenarios |
| `DOCKER_REVIEW_SUMMARY.md` | **Executive** - Overview and success criteria |
| `DOCKER_REVIEW_QUICK_START.md` | **THIS FILE** - Quick test commands |
| `docker/DOCKER_ACCESS_CONTROL.md` | Security policy documentation |
| `docker/SUCCESS_CRITERIA_INTEGRATION.md` | Test-driven gates guide |
| `docker/CLAUDE.md` | Complete orchestration guide |
| `docs/DOCKER_MULTI_WORKTREE.md` | Multi-worktree setup |

---

## Test Execution Checklist

```
DAY 1: SECURITY (Critical)
- [ ] Docker socket access (5 min)
- [ ] Redis authentication (5 min)
- [ ] Success criteria loading (5 min)
TOTAL: 15 minutes

DAY 2: ORCHESTRATION (High)
- [ ] Multi-worktree support (10 min)
- [ ] Task queue operations (5 min)
- [ ] Container lifecycle (10 min)
- [ ] Multi-language agents (10 min)
TOTAL: 35 minutes

DAY 3: TESTING (Medium)
- [ ] Test-driven gates (15 min)
- [ ] Wave spawning (15 min)
- [ ] Integration tests (20 min)
- [ ] Redis stress test (20 min)
TOTAL: 70 minutes

DAY 4: DOCUMENTATION (Low)
- [ ] Compose validation (10 min)
- [ ] Build performance (10 min)
- [ ] Monitoring setup (10 min)
TOTAL: 30 minutes

GRAND TOTAL: ~2.5 hours for full validation
```

---

## If You Only Have 30 Minutes

Do these three critical tests:

1. **Docker Socket Access**
   ```bash
   docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
     cfn-coordinator:latest docker ps
   ```

2. **Redis Auth**
   ```bash
   docker exec cfn-redis redis-cli -a $REDIS_PASSWORD PING
   ```

3. **Success Criteria**
   ```bash
   export CFN_SUCCESS_CRITERIA='{"test_suites": [], "deliverables": []}'
   docker exec cfn-coordinator /docker/coordinator-entrypoint.sh
   ```

**If all 3 pass:** Your environment is at baseline readiness (0.65 confidence)

---

## Recording Results

For each test, note:
- Test name
- Command executed
- Expected result
- Actual result
- ✅ Pass / ❌ Fail
- Timestamp

Example:
```
TEST: Docker Socket Access (Critical #1)
COMMAND: docker run --rm -v /var/run/docker.sock:... cfn-coordinator:latest docker ps
EXPECTED: List running containers
ACTUAL: [output of docker ps]
RESULT: ✅ PASS
TIME: 2025-11-17 10:30:15 UTC
```

---

## Failure Handling

**If a test fails:**

1. **Note the failure**
   ```
   Commit: DOCKER_TEST_RESULTS.md
   Status: FAIL - [test name]
   Error: [error message]
   ```

2. **Check logs**
   ```bash
   docker logs [container-name]
   docker exec [container] cat /var/log/[service].log
   ```

3. **Review documentation**
   - Related section in DOCKER_REVIEW_TODO_LIST.md
   - Documentation file (e.g., DOCKER_ACCESS_CONTROL.md)

4. **Attempt fix** (if simple)
   - Restart service: `docker-compose restart [service]`
   - Rebuild image: `./.claude/skills/docker-build/build.sh`
   - Check configuration: `docker-compose config`

5. **Document and escalate**
   ```bash
   git add DOCKER_TEST_RESULTS.md
   git commit -m "docs: Docker test failure - [test name]"
   ```

---

## Success Criteria

### PASS (All Critical Items)
- ✅ Docker socket access controlled
- ✅ Redis authentication working
- ✅ Success criteria loading functional

### STRONG (5+ High Items Pass)
- ✅ Multi-worktree support working
- ✅ Task queue operations correct
- ✅ Container lifecycle verified
- ✅ Multi-language agents functional
- ✅ [One more]

### GOOD (9+ Medium Items Pass)
- ✅ Test-driven gates working
- ✅ Wave algorithm correct
- ✅ Integration tests passing
- ✅ Redis stress tested
- ✅ [Five more]

### COMPLETE (All Low Items Current)
- ✅ Documentation up-to-date
- ✅ Build performance verified
- ✅ Monitoring operational

---

## Common Issues & Fixes

### Issue: "Cannot connect to Docker daemon"
**Fix:** Ensure docker.sock is mounted and Docker daemon is running
```bash
docker ps  # Should work
docker-compose up -d  # Should work
```

### Issue: "Redis connection refused"
**Fix:** Start Redis container
```bash
docker-compose up -d cfn-redis
docker exec cfn-redis redis-cli PING  # Should return PONG
```

### Issue: "JSON validation failed"
**Fix:** Check JSON syntax
```bash
echo '{"test": "value"}' | jq .  # Should pretty-print
```

### Issue: Port conflicts
**Fix:** Use multi-worktree support
```bash
git checkout -b new-feature
./scripts/docker/run-in-worktree.sh up -d
```

### Issue: Out of memory
**Fix:** Use docker-build skill (96% faster)
```bash
./.claude/skills/docker-build/build.sh
```

---

## Next Steps After Testing

1. **Compile results** → DOCKER_TEST_RESULTS.md
2. **Calculate confidence** → (Passing / Total) × 100%
3. **If ≥90% passing** → Environment is production-ready
4. **If <90% passing** → File issues, schedule fixes
5. **Document** → Commit test results to git

---

## Related Documents

For detailed information, see:
- **Full Plan:** `DOCKER_REVIEW_TODO_LIST.md`
- **Summary:** `DOCKER_REVIEW_SUMMARY.md`
- **Quick Start:** THIS FILE

---

## Questions?

1. Check DOCKER_REVIEW_TODO_LIST.md for test details
2. Review docker/DOCKER_ACCESS_CONTROL.md for security info
3. Check docker/SUCCESS_CRITERIA_INTEGRATION.md for test criteria
4. Read docker/CLAUDE.md for orchestration guide

---

**Ready?** Start with test #1 (Docker Socket Access) above!

