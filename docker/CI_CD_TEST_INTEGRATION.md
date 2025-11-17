# Docker Test Suite - CI/CD Integration Guide

**Purpose:** Integrate Docker infrastructure tests into CI/CD pipelines
**Status:** Initial implementation (v1.0)
**Test Coverage:** Pre-flight checks + 3 critical security tests

---

## Quick Start for CI/CD

### GitHub Actions Integration

**File: `.github/workflows/docker-tests.yml`**

```yaml
name: Docker Infrastructure Tests

on:
  push:
    branches: [main, develop]
    paths:
      - 'docker/**'
      - 'Dockerfile*'
      - 'docker-compose.yml'
      - '.env.example'
  pull_request:
    branches: [main, develop]
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM UTC

jobs:
  docker-tests:
    runs-on: ubuntu-latest

    services:
      redis:
        image: redis:7-alpine
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v3

      - name: Set up Docker
        run: |
          docker --version
          docker ps

      - name: Load Docker images
        run: |
          # Build images if they don't exist in registry
          docker build -f docker/Dockerfile.agent -t cfn-agent:latest .
          docker build -f docker/Dockerfile.coordinator -t cfn-coordinator:latest .
          docker build -f docker/Dockerfile.orchestrator -t cfn-orchestrator:latest .

      - name: Run Docker tests
        run: |
          chmod +x ./docker/test-runner.sh
          ./docker/test-runner.sh --verbose --skip-preflight

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: docker-test-results
          path: DOCKER_TEST_RESULTS.md

      - name: Verify Redis connectivity
        run: |
          docker ps
          redis-cli -h localhost ping
```

### GitLab CI Integration

**File: `.gitlab-ci.yml` (Docker tests section)**

```yaml
docker:tests:
  stage: test
  image: docker:latest
  services:
    - docker:dind
    - redis:7-alpine
  variables:
    REDIS_HOST: redis
    REDIS_PORT: 6379
  script:
    - chmod +x ./docker/test-runner.sh
    - ./docker/test-runner.sh --verbose --skip-preflight
  artifacts:
    paths:
      - DOCKER_TEST_RESULTS.md
    reports:
      junit: test-results.xml
  only:
    changes:
      - docker/**
      - Dockerfile*
      - docker-compose.yml
```

### Jenkins Pipeline Integration

**File: `Jenkinsfile` (Docker tests stage)**

```groovy
pipeline {
    agent any

    stages {
        stage('Docker Tests') {
            steps {
                script {
                    // Start services
                    sh 'docker-compose -f docker-compose.yml up -d'

                    // Wait for Redis
                    sh 'sleep 5'

                    // Run tests
                    sh 'chmod +x ./docker/test-runner.sh'
                    sh './docker/test-runner.sh --verbose --skip-preflight'

                    // Archive results
                    archiveArtifacts artifacts: 'DOCKER_TEST_RESULTS.md'
                }
            }
            post {
                always {
                    sh 'docker-compose down'
                }
            }
        }
    }
}
```

---

## Test Execution Modes

### Mode 1: Local Development

**Use case:** Developer machine before commit

```bash
# Run with full checks and verbose output
./docker/test-runner.sh --verbose

# Run specific tests only
./docker/test-runner.sh --test1 --test2
```

**Expected:** All checks must pass before code commit

### Mode 2: CI/CD Pipeline

**Use case:** Automated testing on push/PR

```bash
# Skip preflight checks (CI already verified environment)
./docker/test-runner.sh --skip-preflight

# Timeout protection (30 minute max)
timeout 1800 ./docker/test-runner.sh --verbose
```

**Expected:** Critical tests must pass, warnings may be recorded

### Mode 3: Docker Cloud Deployment

**Use case:** Pre-deployment validation

```bash
# Run all checks with artifact generation
./docker/test-runner.sh --verbose > test-execution.log 2>&1

# Exit code indicates pass/fail
if [ $? -eq 0 ]; then
    echo "Tests passed - safe to deploy"
else
    echo "Tests failed - review logs"
    exit 1
fi
```

**Expected:** All checks must pass before deploying

---

## Test Failure Handling

### Common Failures and Recovery

#### Failure: Docker Daemon Not Available

**Symptom:**
```
[FAIL] Docker daemon is responsive
```

**Resolution (Local):**
```bash
# Restart Docker
sudo systemctl restart docker

# Or use Docker Desktop
# Verify daemon is running
docker ps
```

**Resolution (CI/CD):**
```yaml
# In workflow, add Docker service
services:
  docker:
    image: docker:latest
    options: --privileged
```

#### Failure: Required Images Missing

**Symptom:**
```
[WARN] Missing image: cfn-agent:latest
```

**Resolution (Local):**
```bash
# Build missing images
docker build -f docker/Dockerfile.agent -t cfn-agent:latest .
docker build -f docker/Dockerfile.coordinator -t cfn-coordinator:latest .

# Or use docker-build skill
./.claude/skills/docker-build/build.sh
```

**Resolution (CI/CD):**
```yaml
# Add build step before tests
- name: Build Docker images
  run: |
    docker build -f docker/Dockerfile.agent -t cfn-agent:latest .
    docker build -f docker/Dockerfile.coordinator -t cfn-coordinator:latest .
```

#### Failure: Redis Not Responding

**Symptom:**
```
[WARN] Redis container not found
```

**Resolution (Local):**
```bash
# Start Redis container
docker-compose up -d cfn-redis

# Verify connectivity
docker exec cfn-redis redis-cli PING
```

**Resolution (CI/CD):**
```yaml
# Use Redis service
services:
  redis:
    image: redis:7-alpine
    options: --health-cmd "redis-cli ping"
    ports:
      - 6379:6379
```

#### Failure: Network Not Configured

**Symptom:**
```
[WARN] Failed to create mcp-network
```

**Resolution:**
```bash
# Create network manually
docker network create mcp-network

# Verify network
docker network ls | grep mcp-network
```

---

## Test Results Interpretation

### Exit Codes

| Code | Meaning | Action |
|------|---------|--------|
| 0 | All tests passed | ✅ Proceed to next stage |
| 1 | One or more tests failed | ❌ Review failures, fix issues |
| 124 | Test timeout (5 min exceeded) | ⏱️ Increase timeout or debug slowness |
| 127 | Test command not found | 📝 Verify test runner script exists |

### Test Result Categories

**PASS Tests:**
- All checks completed successfully
- No issues detected
- Infrastructure ready for use

**WARN Tests:**
- Check completed with warnings
- Issues logged but not blocking
- May indicate configuration needs attention

**SKIP Tests:**
- Test was skipped (dependency missing)
- Not counted against pass rate
- Re-run after fixing dependency

**FAIL Tests:**
- Test failed validation
- Critical issue detected
- Must be fixed before proceeding

---

## CI/CD Configuration Examples

### Minimal Configuration

For simplest CI/CD setup with GitHub Actions:

```yaml
name: Docker Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: chmod +x ./docker/test-runner.sh
      - run: ./docker/test-runner.sh --skip-preflight
```

### Production Configuration

For comprehensive testing with caching and artifacts:

```yaml
name: Docker Infrastructure Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]
  schedule:
    - cron: '0 2 * * *'

jobs:
  docker-tests:
    runs-on: ubuntu-latest

    services:
      redis:
        image: redis:7-alpine
        options: --health-cmd "redis-cli ping"
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v3

      - name: Cache Docker images
        uses: actions/cache@v3
        with:
          path: /tmp/docker-images
          key: docker-${{ hashFiles('docker/**') }}

      - name: Load cached images
        if: steps.cache.outputs.cache-hit == 'true'
        run: docker load < /tmp/docker-images/cfn.tar || true

      - name: Build Docker images
        run: |
          docker build -f docker/Dockerfile.agent -t cfn-agent:latest .
          docker build -f docker/Dockerfile.coordinator -t cfn-coordinator:latest .

      - name: Save images for cache
        run: |
          mkdir -p /tmp/docker-images
          docker save cfn-agent:latest cfn-coordinator:latest > /tmp/docker-images/cfn.tar

      - name: Run Docker tests
        run: |
          chmod +x ./docker/test-runner.sh
          ./docker/test-runner.sh --verbose --skip-preflight

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: docker-test-results
          path: DOCKER_TEST_RESULTS.md

      - name: Comment PR with results
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v6
        with:
          script: |
            const fs = require('fs');
            const results = fs.readFileSync('DOCKER_TEST_RESULTS.md', 'utf8');
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '## Docker Test Results\n\n' + results.slice(0, 2000)
            });
```

---

## Performance Optimization

### Test Timeout Settings

**Default:** 300 seconds per test (5 minutes)

**For faster feedback:**
```bash
# Reduce timeout (useful for simple tests)
export TEST_TIMEOUT=60
./docker/test-runner.sh --skip-preflight
```

**For slower environments:**
```bash
# Increase timeout (for CI with resource constraints)
export TEST_TIMEOUT=600
./docker/test-runner.sh --skip-preflight
```

### Parallel Test Execution

**Current:** Sequential execution (tests run one at a time)

**Why:** Prevents port conflicts and resource contention

**If needed:** Modify test-runner.sh to run independent tests in parallel

```bash
# Example (if implementing parallel tests)
test_docker_socket_access &
test_redis_authentication &
test_success_criteria_dos_protection &
wait
```

### Resource Requirements

**Minimum:**
- CPU: 1 core
- RAM: 512MB
- Disk: 10GB (for images)

**Recommended:**
- CPU: 2+ cores
- RAM: 2GB+
- Disk: 20GB (for images + test artifacts)

---

## Test Reporting

### Standard Output Format

Tests produce human-readable output:

```
============================================================================
  CFN Docker Test Runner
============================================================================
[INFO] Test execution started at 2025-11-17 06:30:42

============================================================================
  Phase 0: Pre-flight Checks
============================================================================
[PASS] Docker daemon is responsive
[WARN] Redis is accepting unauthenticated connections

Pre-flight Checks: 6/7 passed

============================================================================
  Test Report
============================================================================
Tests Passed:  3
Tests Failed:  0
Tests Skipped: 0
Pass Rate:     100%

Overall Status: PASS
```

### Machine-Readable Output

For CI/CD integration, capture test results:

```bash
# Run tests and capture output
./docker/test-runner.sh --verbose > test-results.log 2>&1
TEST_EXIT_CODE=$?

# Parse pass rate
PASS_RATE=$(grep "Pass Rate:" test-results.log | cut -d: -f2 | xargs)

# Report to CI system
echo "PASS_RATE=$PASS_RATE" >> $GITHUB_ENV
echo "EXIT_CODE=$TEST_EXIT_CODE" >> $GITHUB_ENV
```

### Artifact Storage

Tests generate reports in these locations:

- **DOCKER_TEST_RESULTS.md** - Detailed test report
- **.artifacts/test-results/** - Test logs (if implemented)
- **test-execution.log** - Raw output (if captured)

---

## Scheduled Testing

### Daily Tests

**Use case:** Continuous validation of infrastructure

```bash
# Cron job on build server
0 2 * * * /path/to/docker/test-runner.sh --skip-preflight >> /var/log/docker-tests.log 2>&1
```

**GitHub Actions:**
```yaml
schedule:
  - cron: '0 2 * * *'  # Daily at 2 AM UTC
```

### Weekly Infrastructure Audit

**Extended test suite (includes Phase 2 & 3 tests)**

```bash
# Run comprehensive tests
./docker/test-runner.sh --verbose

# Generate compliance report
docker system df  # Check disk usage
docker stats     # Check resource usage
```

---

## Troubleshooting CI/CD Test Failures

### Debug Checklist

1. **Verify test runner exists:**
   ```bash
   ls -la ./docker/test-runner.sh
   ```

2. **Check permissions:**
   ```bash
   chmod +x ./docker/test-runner.sh
   ```

3. **Run with verbose output:**
   ```bash
   ./docker/test-runner.sh --verbose
   ```

4. **Check Docker daemon:**
   ```bash
   docker ps
   docker images
   ```

5. **Verify environment:**
   ```bash
   echo $REDIS_HOST
   echo $REDIS_PORT
   ```

6. **Check logs:**
   ```bash
   docker logs cfn-redis
   docker logs cfn-agent
   ```

### Common Issues

| Issue | Symptom | Solution |
|-------|---------|----------|
| Docker not available | `Cannot connect to Docker daemon` | Use Docker service in CI |
| Image not found | `[WARN] Missing image` | Build images before tests |
| Redis not running | `[WARN] Redis container not found` | Start Redis service |
| Network isolated | `Cannot reach service` | Verify network mode in CI |
| Timeout exceeded | `[FAIL] Command timed out` | Increase TEST_TIMEOUT or debug slowness |

---

## Next Steps

### Short-term (Week 1)

- [ ] Integrate test runner into CI/CD pipeline
- [ ] Configure GitHub Actions workflow
- [ ] Test on multiple platforms (Ubuntu, Alpine, macOS)
- [ ] Verify exit codes work correctly

### Medium-term (Week 2-4)

- [ ] Add Phase 2 tests (Redis auth, DoS protection)
- [ ] Add Phase 3 tests (Port isolation, atomicity, lifecycle)
- [ ] Implement test result artifact generation
- [ ] Add health check monitoring

### Long-term (Month 2+)

- [ ] Parallel test execution (where possible)
- [ ] Advanced reporting (metrics, trends)
- [ ] Integration with issue tracking
- [ ] Automated remediation workflows

---

## References

- **Main test runner:** `/docker/test-runner.sh`
- **Test results:** `/DOCKER_TEST_RESULTS.md`
- **Docker reference:** `/docker/CLAUDE.md`
- **Environment contract:** `/docker/runtime/cfn-runtime.contract.yml`

---

**Version:** 1.0
**Last Updated:** 2025-11-17
**Status:** Initial implementation complete
