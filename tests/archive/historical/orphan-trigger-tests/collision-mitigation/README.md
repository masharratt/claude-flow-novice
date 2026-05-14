# CLI/Trigger.dev Collision Mitigation Test Suite

**Purpose:** Validate that CLI mode and Trigger.dev mode can execute simultaneously without collisions

**Reference Documents:**
- `planning/trigger/CLI_TRIGGER_COLLISION_ANALYSIS.md` - 4-phase mitigation strategy
- `planning/trigger/PHASE_1_COMPLETION_REPORT.md` - Phase 1 validation
- `docker/PHASE_2_VALIDATION_SUMMARY.md` - Phase 2 validation
- `planning/trigger/PHASE_3_COMPLETION_REPORT.md` - Phase 3 validation
- `planning/trigger/PHASE_4_SECURITY_VALIDATION_REPORT.md` - Phase 4 validation

---

## Test Suite Architecture

### Phase 1: Redis Key Namespace Isolation

**File:** `test-phase1-redis-key-isolation.sh`

**Purpose:** Verify that Redis keys are isolated by mode prefix (`cli:` vs `trigger:`)

**Test Coverage:**
- Redis key prefix isolation
- Completion signal independence
- Counter isolation
- Task status independence

**Success Criteria:**
- CLI keys: `cfn:task:cli:{taskId}:*`
- Trigger keys: `cfn:task:trigger:{taskId}:*`
- Zero key collisions
- Independent completion tracking

**Expected Duration:** ~10 seconds

---

### Phase 2: Service Name Aliases

**File:** `test-phase2-service-discovery.sh`

**Purpose:** Verify that service discovery works in both Docker networks with appropriate aliases

**Test Coverage:**
- CLI network service discovery (`cfn-redis`)
- Trigger.dev network service discovery (`redis` and `cfn-redis` aliases)
- Network isolation (cross-network access blocked)
- Docker Compose configuration validation

**Success Criteria:**
- CLI network resolves `cfn-redis`
- Trigger network resolves both `redis` and `cfn-redis`
- Networks are isolated from each other
- Service aliases configured in docker-compose.yml

**Expected Duration:** ~20 seconds

---

### Phase 3: Environment Variable Contract

**File:** `test-phase3-environment-contract.sh`

**Purpose:** Verify that environment variables resolve correctly for each mode

**Test Coverage:**
- Contract file existence and validity
- Mode-specific Redis host resolution
- Mode-specific network name resolution
- Variable precedence (CFN_ prefix > legacy > defaults)
- Required variables documentation
- Legacy variable deprecation warnings

**Success Criteria:**
- CLI mode: `CFN_REDIS_HOST=cfn-redis`, `CFN_NETWORK_NAME=mcp-network`
- Trigger mode: `CFN_REDIS_HOST=redis`, `CFN_NETWORK_NAME=trigger-cfn-network`
- Variable precedence honored
- Legacy variables emit warnings

**Expected Duration:** ~15 seconds

---

### Phase 4: Socket Proxy Security

**File:** `test-phase4-socket-proxy.sh`

**Purpose:** Verify that socket proxy is deployed and configured for security hardening

**Test Coverage:**
- Socket proxy deployment and health
- Docker API accessibility via proxy
- Privileged operations blocked (`PRIVILEGED=0`)
- Host network access blocked (`HOST=0`)
- Arbitrary volume mounts blocked (`VOLUMES=0`)
- Audit logging enabled (`LOG=1`)
- Docker Compose integration
- Coordinator connection to socket proxy

**Success Criteria:**
- Socket proxy container healthy
- Security settings enforced
- Coordinator uses `DOCKER_HOST=tcp://socket-proxy:2375`
- Direct socket mount removed from coordinator
- Audit logs capture API requests

**Expected Duration:** ~30 seconds

---

### Integration Test: Simultaneous Execution

**File:** `test-simultaneous-execution.sh`

**Purpose:** Verify that CLI and Trigger.dev modes can run simultaneously without interference

**Test Coverage:**
- Simultaneous Redis operations
- Parallel agent containers in separate networks
- Resource contention handling
- Failure isolation (one mode failure doesn't affect other)
- Concurrent service discovery

**Success Criteria:**
- Both modes complete tasks independently
- Completion signals isolated
- Counters accurate and isolated
- Network isolation maintained
- Failures isolated between modes

**Expected Duration:** ~20 seconds

---

## Quick Start

### Run All Tests

```bash
cd tests/integration/collision-mitigation
./run-all-collision-tests.sh
```

**Output:**
- Phase-by-phase execution
- Pass/fail status for each phase
- Total duration and pass rate
- Detailed validation report

### Run Individual Phase

```bash
# Phase 1: Redis isolation
./test-phase1-redis-key-isolation.sh

# Phase 2: Service discovery
./test-phase2-service-discovery.sh

# Phase 3: Environment contract
./test-phase3-environment-contract.sh

# Phase 4: Socket proxy
./test-phase4-socket-proxy.sh

# Integration test
./test-simultaneous-execution.sh
```

---

## Prerequisites

### Required Services

1. **Redis** (for Phase 1, Integration test)
   ```bash
   docker run -d --name cfn-redis -p 6379:6379 redis:7-alpine
   ```

2. **Docker** (for all phases)
   - Docker daemon running
   - Access to Docker socket
   - Networks: `mcp-network`, `trigger-cfn-network`

3. **Docker Compose Files** (for configuration validation)
   - `docker/docker-compose.yml` (CLI mode)
   - `docker/trigger-dev/docker-compose.yml` (Trigger.dev mode)

### Optional Dependencies

- `yq` (for YAML validation in Phase 3)
- `jq` (for JSON parsing)
- `nslookup`/`dig` (for DNS resolution tests)

---

## Test Results Interpretation

### Pass Rate Thresholds

| Pass Rate | Status | Meaning |
|-----------|--------|---------|
| 100% | ✅ Excellent | Zero collision risk, production-ready |
| 80-99% | ⚠️ Good | Minor issues, review failed tests |
| 60-79% | ⚠️ Caution | Significant gaps, collision risk exists |
| <60% | ❌ Poor | Critical issues, not production-ready |

### Common Failure Modes

**Phase 1 Failures:**
- Redis not running
- Key prefixes not implemented
- Completion signals colliding

**Phase 2 Failures:**
- Networks not created
- Service aliases missing in docker-compose.yml
- DNS resolution issues

**Phase 3 Failures:**
- Environment contract file missing
- Variable precedence incorrect
- Legacy variables not deprecated

**Phase 4 Failures:**
- Socket proxy image not available
- Security settings not enforced
- Coordinator still using direct socket mount

**Integration Failures:**
- Cross-network communication (isolation broken)
- Counter collisions (namespace prefix missing)
- Failure propagation between modes

---

## Performance Metrics

**Total Suite Duration:** ~95 seconds

**Breakdown:**
- Phase 1: ~10s (Redis operations)
- Phase 2: ~20s (Docker network operations)
- Phase 3: ~15s (File and script validation)
- Phase 4: ~30s (Container deployment and health checks)
- Integration: ~20s (Parallel execution)

**Resource Usage:**
- Memory: ~500MB (temporary containers)
- Disk: Negligible (no persistent storage)
- Network: Internal Docker networks only

---

## Troubleshooting

### Redis Connection Issues

**Symptom:** Phase 1 fails with "Redis not available"

**Solutions:**
```bash
# Check if Redis is running
docker ps --filter "name=cfn-redis"

# Start Redis if needed
docker run -d --name cfn-redis -p 6379:6379 redis:7-alpine

# Test connectivity
redis-cli -h localhost -p 6379 PING
```

### Docker Network Issues

**Symptom:** Phase 2 fails with network not found

**Solutions:**
```bash
# Create missing networks
docker network create mcp-network
docker network create trigger-cfn-network

# Verify networks exist
docker network ls | grep -E "(mcp|trigger)"
```

### Socket Proxy Issues

**Symptom:** Phase 4 fails with image pull error

**Solutions:**
```bash
# Pull socket proxy image
docker pull tecnativa/docker-socket-proxy:latest

# Check image exists
docker images | grep docker-socket-proxy
```

### Permission Issues

**Symptom:** Tests fail with "Permission denied"

**Solutions:**
```bash
# Make all test scripts executable
chmod +x tests/integration/collision-mitigation/*.sh

# Verify current user is in docker group
groups | grep docker

# If not, add user to docker group
sudo usermod -aG docker $USER
newgrp docker
```

---

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Collision Mitigation Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  collision-tests:
    runs-on: ubuntu-latest
    services:
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v3

      - name: Set up Docker networks
        run: |
          docker network create mcp-network
          docker network create trigger-cfn-network

      - name: Run collision mitigation tests
        run: |
          cd tests/integration/collision-mitigation
          ./run-all-collision-tests.sh

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: collision-test-results
          path: /tmp/collision-mitigation-results-*.txt
```

---

## Maintenance

### Adding New Tests

1. Create test script following template:
   ```bash
   #!/bin/bash
   set -euo pipefail

   PROJECT_ROOT=$(git rev-parse --show-toplevel)
   source "$PROJECT_ROOT/tests/test-utils.sh"

   cleanup() {
       # Cleanup code
   }
   trap cleanup EXIT

   test_new_scenario() {
       log_step "GIVEN ..."
       # Test implementation
   }

   test_new_scenario
   ```

2. Add test to `run-all-collision-tests.sh`:
   ```bash
   run_phase_test 5 \
       "$TEST_DIR/test-phase5-new-feature.sh" \
       "New Feature Validation"
   ```

3. Update this README with new test documentation

### Updating Phase Tests

When implementation changes:

1. Update corresponding phase test
2. Run individual phase test to verify
3. Run full suite to ensure no regressions
4. Update phase documentation if behavior changes

---

## Success Criteria Summary

**Overall Goal:** Achieve 100% pass rate across all phases

**Phase-Specific Goals:**
- ✅ Phase 1: Zero Redis key collisions
- ✅ Phase 2: Service discovery in both networks
- ✅ Phase 3: Correct environment resolution per mode
- ✅ Phase 4: Security hardening via socket proxy
- ✅ Integration: Simultaneous execution without interference

**Production Readiness:**
- All phases pass (100%)
- No warnings in test output
- Performance metrics within acceptable ranges
- CI/CD pipeline green

---

## Related Documentation

- **Architecture:** `planning/trigger/CLI_TRIGGER_COLLISION_ANALYSIS.md`
- **Phase Reports:** `planning/trigger/PHASE_*_*.md`
- **Test Standards:** `tests/CLAUDE.md`
- **Test Utilities:** `tests/test-utils.sh`
- **Docker Configuration:** `docker/docker-compose.yml`, `docker/trigger-dev/docker-compose.yml`

---

## Version History

- **2025-11-24**: Initial test suite created
- Comprehensive validation of all 4 collision mitigation phases
- Integration test for simultaneous execution
- Master test runner with detailed reporting
- CI/CD integration examples

---

**For support:** Review test output logs and consult phase-specific documentation in `planning/trigger/` directory.
