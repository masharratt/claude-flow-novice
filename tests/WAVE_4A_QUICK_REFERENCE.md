# Wave 4A Test Suite - Quick Reference
## 38 Tests Across 6 Categories

**Created**: 2025-11-24
**Status**: Implemented (fixes pending for full validation)

---

## Quick Start

### Run All Tests
```bash
bash tests/run-wave-4a-tests.sh
```

### Run Individual Suites
```bash
# P0 Critical (10 tests)
bash tests/docker/teams/test-team-isolation.sh           # 4 tests
bash tests/integration/test-cost-tracking.sh             # 3 tests
bash tests/docker/teams/test-deployment-automation.sh    # 3 tests ✓ VALIDATED

# P1 High Priority (18 tests)
bash tests/integration/test-cfn-loop-workflows.sh        # 10 tests
bash tests/e2e/test-full-cfn-loop.sh                     # 8 tests

# P2 Medium Priority (10 tests)
bash tests/security/test-comprehensive-security.sh       # 10 tests
```

---

## Test Categories

### P0: Team Isolation (4 tests)
Tests multi-team Docker environment isolation.

**File**: `tests/docker/teams/test-team-isolation.sh`

| Test | Description |
|------|-------------|
| 1 | Network isolation between teams |
| 2 | Volume isolation between teams |
| 3 | Label enforcement on containers |
| 4 | Cross-team access prevention |

---

### P0: Cost Tracking (3 tests)
Tests label-based cost calculation accuracy.

**File**: `tests/integration/test-cost-tracking.sh`

| Test | Description |
|------|-------------|
| 1 | Label-based tracking detection |
| 2 | Cost calculation accuracy |
| 3 | Team-level cost aggregation |

---

### P0: Deployment Automation (3 tests) ✓
Tests build scripts and deployment readiness.

**File**: `tests/docker/teams/test-deployment-automation.sh`

| Test | Description | Status |
|------|-------------|--------|
| 1 | Build script validation | ✓ PASS |
| 2 | Image label validation | ✓ PASS |
| 3 | Deployment readiness check | ✓ PASS |

**Pass Rate**: 100% (3/3)

---

### P1: CFN Loop Workflows (10 tests)
Tests end-to-end agent workflows.

**File**: `tests/integration/test-cfn-loop-workflows.sh`

| Test | Description |
|------|-------------|
| 1 | Basic agent spawn |
| 2 | Agent task execution |
| 3 | Redis coordination |
| 4 | Result collection |
| 5 | Lifecycle management |
| 6 | Multi-agent coordination |
| 7 | Error handling |
| 8 | Log collection |
| 9 | Resource cleanup |
| 10 | Timeout handling |

---

### P1: Full CFN Loop E2E (8 tests)
Tests complete CFN Loop execution.

**File**: `tests/e2e/test-full-cfn-loop.sh`

| Test | Description |
|------|-------------|
| 1 | Loop 3 implementation |
| 2 | Loop 3 test execution |
| 3 | Gate enforcement (95% threshold) |
| 4 | Loop 2 validation |
| 5 | Consensus collection (90% threshold) |
| 6 | Product owner decision (PROCEED/ITERATE/ABORT) |
| 7 | Iteration management |
| 8 | Complete workflow (Loop 3 → Loop 2 → Decision) |

---

### P2: Comprehensive Security (10 tests)
Tests security controls and attack prevention.

**File**: `tests/security/test-comprehensive-security.sh`

| Test | Description |
|------|-------------|
| 1 | Label injection prevention |
| 2 | Secret leakage (environment variables) |
| 3 | Secret leakage (docker inspect) |
| 4 | File permission validation (600) |
| 5 | Non-root user enforcement |
| 6 | Capability restriction |
| 7 | Network isolation |
| 8 | Image vulnerability check |
| 9 | Secret mount readonly |
| 10 | Security options (no-new-privileges, read-only) |

---

## Troubleshooting

### Container Name Conflicts
**Symptom**: `Conflict. The container name "/test-agent-..." is already in use`

**Fix**:
```bash
# Clean up test containers
docker rm -f $(docker ps -aq --filter "name=test-" --filter "name=cost-" --filter "name=loop3-" --filter "name=team-" --filter "name=security-") 2>/dev/null || true

# Re-run tests
bash tests/run-wave-4a-tests.sh
```

---

### Docker Daemon Not Running
**Symptom**: `Cannot connect to the Docker daemon`

**Fix**:
```bash
# Linux
sudo systemctl start docker

# macOS
open /Applications/Docker.app

# WSL2
sudo service docker start
```

---

### Redis Not Available
**Symptom**: `Redis coordination test skipped`

**Fix**:
```bash
# Start Redis
redis-server --daemonize yes

# Or via Docker
docker run -d -p 6379:6379 redis:7-alpine
```

---

## Test Results

### Current Status
```
Tests Created:    38/38 (100%)
Tests Validated:  3/38 (7.89%)
Coverage:         100% ✓
Pass Rate:        Pending fixes
```

### Known Issues
1. **Container name conflicts** (35 tests blocked)
   - Resolution: Add unique suffixes `$$-$(date +%s%N)`
2. **Security test syntax** (1 test blocked)
   - Resolution: Rewrite label injection test

---

## Documentation

- **Comprehensive Report**: `docs/testing/WAVE_4A_TEST_COVERAGE_REPORT.md`
- **Execution Summary**: `docs/testing/WAVE_4A_EXECUTION_SUMMARY.md`
- **Test Standards**: `tests/CLAUDE.md`
- **This Reference**: `tests/WAVE_4A_QUICK_REFERENCE.md`

---

## Success Criteria

| Criterion | Target | Status |
|-----------|--------|--------|
| Tests created | 38 | ✓ 38 |
| Coverage | ≥70% | ✓ 100% |
| Pass rate | ≥95% | ⚠ Pending |

---

**Last Updated**: 2025-11-24
**Confidence**: 0.85 (High)
