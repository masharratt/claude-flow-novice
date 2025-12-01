# Test Execution Checklist

**Pre-Execution Checklist** - Complete these steps before running tests:

## Prerequisites

### 1. Docker Environment
```bash
# Verify Docker is running
docker info >/dev/null 2>&1 && echo "✅ Docker running" || echo "❌ Docker not running"

# Verify docker-compose installed
docker-compose --version && echo "✅ docker-compose installed" || echo "❌ docker-compose not found"
```

### 2. Redis Service
```bash
# Check if Redis is running
redis-cli -h localhost -p 6379 PING && echo "✅ Redis available" || echo "❌ Redis not available"

# If not running, start Redis:
docker run -d --name cfn-redis -p 6379:6379 redis:7-alpine
```

### 3. Docker Networks
```bash
# Create required networks
docker network create mcp-network 2>/dev/null && echo "✅ mcp-network created" || echo "⚠️  mcp-network exists"
docker network create trigger-cfn-network 2>/dev/null && echo "✅ trigger-cfn-network created" || echo "⚠️  trigger-cfn-network exists"

# Verify networks exist
docker network ls | grep -E "(mcp-network|trigger-cfn-network)" && echo "✅ Networks verified"
```

### 4. Docker Images
```bash
# Pull required images
docker pull alpine:latest
docker pull redis:7-alpine
docker pull tecnativa/docker-socket-proxy:latest

# Verify images
docker images | grep -E "(alpine|redis|socket-proxy)" && echo "✅ Images available"
```

---

## Test Execution Steps

### Quick Validation (5 minutes)

Run all tests in sequence:

```bash
cd tests/integration/collision-mitigation
./run-all-collision-tests.sh
```

**Expected output:**
```
✅ Phase 1: Redis Namespace Isolation PASSED (~10s)
✅ Phase 2: Service Discovery & Network Aliases PASSED (~20s)
✅ Phase 3: Environment Variable Contract PASSED (~15s)
✅ Phase 4: Socket Proxy Security Hardening PASSED (~30s)
✅ Integration: Simultaneous Execution PASSED (~20s)

Pass Rate: 100%
Total Duration: ~95s
```

---

### Individual Phase Testing

If full suite fails, run phases individually:

#### Phase 1: Redis Key Isolation
```bash
./test-phase1-redis-key-isolation.sh
```

**Troubleshooting:**
- If fails: Check Redis is running (`redis-cli PING`)
- If still fails: Review Redis connection settings in test script

#### Phase 2: Service Discovery
```bash
./test-phase2-service-discovery.sh
```

**Troubleshooting:**
- If fails: Verify Docker networks exist (`docker network ls`)
- If still fails: Check DNS resolution in containers

#### Phase 3: Environment Contract
```bash
./test-phase3-environment-contract.sh
```

**Troubleshooting:**
- If fails: Check environment contract file exists
- If still fails: Verify yq is installed (optional)

#### Phase 4: Socket Proxy
```bash
./test-phase4-socket-proxy.sh
```

**Troubleshooting:**
- If fails: Pull socket proxy image manually
- If still fails: Check Docker socket permissions

#### Integration Test
```bash
./test-simultaneous-execution.sh
```

**Troubleshooting:**
- If fails: Ensure all prerequisites completed
- If still fails: Check Docker resource limits

---

## Post-Execution Validation

### 1. Check Test Results
```bash
# Review pass rate
grep "Pass Rate:" /tmp/collision-mitigation-results-*.txt

# Check for failures
grep "^FAIL:" /tmp/collision-mitigation-results-*.txt || echo "✅ No failures"
```

### 2. Verify Cleanup
```bash
# Check for leftover test containers
docker ps -a | grep -E "(test-|collision-)" && echo "⚠️  Test containers not cleaned up" || echo "✅ Cleanup successful"

# Check for leftover Redis keys
redis-cli --scan --pattern "cfn:task:*:collision-test-*" | wc -l
# Expected: 0
```

### 3. Review Logs (if failures occurred)
```bash
# Check Redis logs
docker logs cfn-redis | tail -50

# Check Docker daemon logs
journalctl -u docker | tail -50
```

---

## Common Issues & Solutions

### Issue 1: Redis Connection Failed
**Symptom:** Phase 1 fails with "Redis not available"

**Solution:**
```bash
# Start Redis if not running
docker run -d --name cfn-redis -p 6379:6379 redis:7-alpine

# Wait for Redis to be ready
sleep 2
redis-cli PING
```

### Issue 2: Docker Network Not Found
**Symptom:** Phase 2 fails with "network not found"

**Solution:**
```bash
# Create networks
docker network create mcp-network
docker network create trigger-cfn-network

# Verify
docker network ls | grep -E "(mcp|trigger)"
```

### Issue 3: Permission Denied (Docker Socket)
**Symptom:** Phase 4 fails with permission error

**Solution:**
```bash
# Add user to docker group
sudo usermod -aG docker $USER

# Reload group membership
newgrp docker

# Verify
docker ps >/dev/null 2>&1 && echo "✅ Docker access granted"
```

### Issue 4: Image Pull Failed
**Symptom:** Tests fail with "image not found"

**Solution:**
```bash
# Pull images manually
docker pull alpine:latest
docker pull redis:7-alpine
docker pull tecnativa/docker-socket-proxy:latest

# Verify
docker images
```

### Issue 5: Port Already In Use
**Symptom:** Redis fails to start with "port already in use"

**Solution:**
```bash
# Find process using port 6379
sudo lsof -i :6379

# Stop existing Redis
docker stop cfn-redis
docker rm cfn-redis

# Restart
docker run -d --name cfn-redis -p 6379:6379 redis:7-alpine
```

---

## CI/CD Integration Checklist

### GitHub Actions Setup

- [ ] Add workflow file: `.github/workflows/collision-tests.yml`
- [ ] Configure Redis service
- [ ] Create Docker networks in workflow
- [ ] Set test timeout (5 minutes recommended)
- [ ] Upload test results as artifact
- [ ] Configure branch protection (require passing tests)

### Example Workflow
```yaml
name: Collision Mitigation Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 10

    services:
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3

      - name: Set up Docker networks
        run: |
          docker network create mcp-network
          docker network create trigger-cfn-network

      - name: Pull Docker images
        run: |
          docker pull alpine:latest
          docker pull tecnativa/docker-socket-proxy:latest

      - name: Run collision mitigation tests
        run: |
          cd tests/integration/collision-mitigation
          ./run-all-collision-tests.sh

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: test-results
          path: /tmp/collision-mitigation-results-*.txt
```

---

## Success Criteria

### Test Pass Criteria
- ✅ All 5 phases pass (100% pass rate)
- ✅ Total execution time < 120 seconds
- ✅ Zero warnings in output
- ✅ All cleanup completed successfully

### Production Readiness Criteria
- ✅ Tests pass in CI/CD pipeline
- ✅ Tests pass on multiple environments (dev, staging)
- ✅ Performance metrics within acceptable range
- ✅ Documentation reviewed and approved

---

## Quick Reference Commands

```bash
# Full test suite
./run-all-collision-tests.sh

# Individual phase
./test-phase1-redis-key-isolation.sh

# Verbose output
DEBUG=1 ./run-all-collision-tests.sh

# Skip cleanup (for debugging)
SKIP_CLEANUP=1 ./test-phase1-redis-key-isolation.sh

# Clean up manually
docker rm -f $(docker ps -aq --filter "name=test-")
redis-cli FLUSHDB
```

---

## Contact & Support

**Documentation:**
- Test Suite README: `tests/integration/collision-mitigation/README.md`
- Implementation Report: `tests/integration/collision-mitigation/IMPLEMENTATION_REPORT.md`
- Phase Analysis: `planning/trigger/CLI_TRIGGER_COLLISION_ANALYSIS.md`

**Issue Reporting:**
If tests fail unexpectedly:
1. Review test output logs
2. Check prerequisites checklist
3. Consult troubleshooting section
4. Review phase-specific documentation

---

**Last Updated:** 2025-11-24
**Test Suite Version:** 1.0
**Confidence:** 0.92
