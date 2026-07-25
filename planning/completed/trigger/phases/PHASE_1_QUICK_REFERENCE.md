# Phase 1.3b Quick Reference - Test Execution

**Quick Guide to Phase 1 Container Validation**

---

## One-Command Test Execution

Run both test suites in sequence:

```bash
cd /path/to/project

# Test 1: Container Execution (9 automated tests)
./tests/trigger-dev/test-phase1-container-execution.sh

# Test 2: Infrastructure Validation (20 checklist items)
./tests/trigger-dev/validate-phase1-infrastructure.sh
```

**Expected Result:** All tests pass with 100% success rate

---

## What Gets Tested

### Container Execution Tests (9 tests)

| # | Test | What | Pass Criteria |
|---|------|------|---------------|
| 1 | Image Build | cfn-agent:test builds | Image exists |
| 2 | Network Check | cfn-network available | Network exists/creatable |
| 3 | Volume Access | Workspace mount works | File readable from container |
| 4 | Container Spawn | Direct spawning works | Container runs with env vars |
| 5 | Resource Limits | 2 CPU, 4GB RAM enforced | Docker accepts limits |
| 6 | Cleanup | --rm flag works | No orphaned containers |
| 7 | Exit Codes | Exit codes propagate | Exit 0 and Exit 1 work |
| 8 | Output Capture | Stdout/stderr work | Logs accessible |
| 9 | Network Connect | Container networking | DNS resolution works |

### Infrastructure Validation (20 checks)

| Category | # Checks | Critical | Verifies |
|----------|----------|----------|----------|
| Pre-Flight | 5 | Yes | Docker service, resources |
| Execution | 3 | Yes | Image, spawning, environment |
| Volumes | 4 | Yes | Accessibility, cleanup |
| Network | 3 | Yes | cfn-network, DNS |
| Cleanup | 3 | Yes | --rm flag, no orphans |
| Resources | 2 | No | CPU/memory limits |

---

## Test Output Files

After running tests, check these files for results:

```bash
# Container execution test results (JSON)
cat .artifacts/test-results/phase1-execution-results.json

# Infrastructure validation checklist (Markdown)
cat .artifacts/test-results/phase1-validation-checklist.md
```

---

## Quick Diagnostics

If tests fail, use these commands to diagnose:

```bash
# Check Docker status
docker ps                           # Running containers
docker images | grep cfn-agent      # cfn-agent image
docker network ls | grep cfn        # cfn-network

# Check resources
docker system df                    # Disk usage
docker stats                        # Memory usage

# Check container logs
docker logs <container-id>

# Clean up test artifacts
docker ps -a --filter "name=cfn-agent-test" -q | xargs docker rm -f
docker network rm cfn-test-network 2>/dev/null || true
rm -rf docker/trigger-dev/test-workspace
```

---

## Success Criteria

### Container Execution Test
- **PASS:** All 9 tests pass (100%)
- **FAIL:** Any test fails

### Infrastructure Validation
- **PASS:** All 20 checks pass (100%)
- **FAIL:** Any critical check fails

### Overall
- **PASS:** Both test suites pass
- **PROCEED:** Ready for trigger.dev integration
- **FAIL:** Fix issues and rerun

---

## Next Steps

After both tests pass:

```bash
# 1. Deploy trigger.dev (if not already running)
cd docker/trigger-dev
docker-compose up -d

# 2. Verify trigger.dev services
docker-compose ps

# 3. Monitor dashboard
# Open browser: http://localhost:3040

# 4. Test integration (optional)
./tests/trigger-dev/test-trigger-integration.sh
```

---

## Common Issues Quick Fixes

| Issue | Command |
|-------|---------|
| Image not found | `docker build -f Dockerfile.cfn-agent -t cfn-agent:test .` |
| Network error | `docker network create cfn-network` |
| Volume permission | `chmod 755 docker/trigger-dev/test-workspace` |
| Orphaned containers | `docker ps -a --filter "status=exited" -q \| xargs docker rm` |
| OOM during build | `docker system prune -a --volumes` |
| Port conflicts | `docker-compose down && docker-compose up -d` |

---

## Files

**Test Scripts:**
- `tests/trigger-dev/test-phase1-container-execution.sh` - Automated container tests
- `tests/trigger-dev/validate-phase1-infrastructure.sh` - Infrastructure validation

**Documentation:**
- `planning/trigger/phase1-test-execution.md` - Complete test guide
- `planning/trigger/TRIGGER_DEV_PER_AGENT_CONTAINER_PLAN.md` - Phase 1 plan
- `docker/trigger-dev/CLAUDE.md` - Trigger.dev setup guide

**Results:**
- `.artifacts/test-results/phase1-execution-results.json` - Test results
- `.artifacts/test-results/phase1-validation-checklist.md` - Validation results

---

## Key Metrics

**Expected Results:**

| Metric | Value |
|--------|-------|
| Container execution tests | 9/9 (100%) |
| Infrastructure checks | 20/20 (100%) |
| Test execution time | ~2-3 minutes |
| Image build time | ~1-2 minutes |
| Overhead per container | <1s |
| Memory per container | ~100-150MB |
| CPU usage (2-core limit) | Enforced by Docker |

---

**Status:** Ready to execute Phase 1.3b validation
**Confidence:** 0.95 (tests are comprehensive and automated)
**Execution Time:** ~5 minutes total
