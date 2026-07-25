# Docker Test Suite Execution Guide

**Version:** 1.0.0
**Last Updated:** 2025-11-13
**Target Audience:** Developers, QA Engineers, CI/CD Administrators

---

## Overview

This guide provides step-by-step instructions for executing the Docker test suite, including prerequisites, test categories, troubleshooting, and CI/CD integration.

**Related Documentation:**
- Architecture: `tests/docker/ARCHITECTURE.md`
- Maintenance: `tests/docker/MAINTENANCE.md`
- Technical Debt: `tests/docker/TECHNICAL_DEBT.md`
- Standards: `tests/CLAUDE.md`

---

## Prerequisites

### 1. Docker Environment

**Required Software:**
```bash
# Docker Engine 20.10+ or Docker Desktop
docker --version
# Expected: Docker version 20.10.x or higher

# Docker Compose 2.0+
docker-compose --version
# Expected: Docker Compose version 2.x.x or higher
```

**Installation:**
- **Linux:** `curl -fsSL https://get.docker.com | sh`
- **macOS:** Install Docker Desktop from docker.com
- **Windows:** Install Docker Desktop (requires WSL2)

**Verification:**
```bash
# Test Docker daemon
docker run hello-world

# Test Docker Compose
docker-compose --version
```

### 2. Redis Service

**Option A: Docker Container (Recommended for Testing)**
```bash
# Start Redis container
docker run -d \
    --name cfn-redis \
    --network cfn-network \
    -p 6379:6379 \
    redis:7.2-alpine

# Verify Redis is running
docker ps --filter "name=cfn-redis"
redis-cli -h localhost -p 6379 ping
# Expected: PONG
```

**Option B: Local Installation**
```bash
# macOS (Homebrew)
brew install redis
brew services start redis

# Ubuntu/Debian
sudo apt-get install redis-server
sudo systemctl start redis-server

# Verify
redis-cli ping
# Expected: PONG
```

**Configuration:**
```bash
# Set Redis environment variables
export CFN_REDIS_HOST=localhost
export CFN_REDIS_PORT=6379

# Or add to .env file
echo "CFN_REDIS_HOST=localhost" >> .env
echo "CFN_REDIS_PORT=6379" >> .env
```

### 3. Environment Variables

**Required Variables:**
```bash
# .env file (create in project root)
CFN_API_KEY=your-api-key-here
CFN_REDIS_HOST=localhost
CFN_REDIS_PORT=6379
CFN_CUSTOM_ROUTING=false
```

**Provider-Specific Variables:**
```bash
# For Z.ai provider
ZAI_API_KEY=your-zai-key

# For Kimi provider
KIMI_API_KEY=your-kimi-key

# For OpenRouter provider
OPENROUTER_API_KEY=your-openrouter-key
```

**Validation:**
```bash
# Verify environment file
cat .env | grep -E "CFN_(API_KEY|REDIS_HOST|REDIS_PORT)"

# Verify variables are set
env | grep CFN_
```

**Security Note:**
- Never commit `.env` file to version control
- Use `.env.example` as a template
- Rotate API keys regularly

### 4. Docker Images

**Build Required Images:**
```bash
# Build agent image
docker build -t cfn-agent:latest -f Dockerfile.agent .

# Build coordinator image
docker build -t cfn-intelligent-coordinator:latest -f Dockerfile.coordinator .

# Build orchestrator image (if needed)
docker build -t cfn-orchestrator:latest -f Dockerfile.orchestrator .
```

**Verify Images:**
```bash
docker images | grep cfn
# Expected output:
# cfn-agent                      latest    <image-id>    <timestamp>    <size>
# cfn-intelligent-coordinator    latest    <image-id>    <timestamp>    <size>
# cfn-orchestrator              latest    <image-id>    <timestamp>    <size>
```

**Image Sizes:**
- Agent: ~300-500 MB
- Coordinator: ~250-400 MB
- Orchestrator: ~250-400 MB

### 5. Docker Network

**Create Network:**
```bash
# Create cfn-network for container isolation
docker network create cfn-network

# Verify network exists
docker network ls | grep cfn-network
```

**Network Configuration:**
- Name: `cfn-network`
- Driver: `bridge` (default)
- Subnet: Auto-assigned by Docker

---

## Step-by-Step Execution Instructions

### Phase 1: Environment Setup (5 minutes)

**Step 1.1: Clone Repository**
```bash
git clone <repository-url>
cd claude-flow-novice
```

**Step 1.2: Create Environment File**
```bash
# Copy example
cp .env.example .env

# Edit with your credentials
nano .env
# Add: CFN_API_KEY, CFN_REDIS_HOST, CFN_REDIS_PORT
```

**Step 1.3: Build Docker Images**
```bash
# Build all images
docker build -t cfn-agent:latest -f Dockerfile.agent .
docker build -t cfn-intelligent-coordinator:latest -f Dockerfile.coordinator .

# Expected time: 3-5 minutes
```

**Step 1.4: Start Redis**
```bash
# Create network
docker network create cfn-network

# Start Redis
docker run -d \
    --name cfn-redis \
    --network cfn-network \
    -p 6379:6379 \
    redis:7.2-alpine

# Verify
redis-cli -h localhost -p 6379 ping
# Expected: PONG
```

**Validation Checklist:**
- [ ] Docker daemon running
- [ ] `.env` file created with API keys
- [ ] All Docker images built successfully
- [ ] Redis container running
- [ ] `cfn-network` exists

### Phase 2: Run P0 (Critical) Tests (10 minutes)

**P0 tests are required for production deployment.**

**Test 1: Redis Coordination (3 minutes)**
```bash
bash tests/docker/redis-coordination-tests.sh
```

**Expected Output:**
```
✅ Test 1: Redis heartbeat validation - PASS
✅ Test 2: Coordinator registration - PASS
✅ Test 3: Agent spawning metadata - PASS
⚠️ Test 4: Agent completion reporting - SKIP (Bug #6 blocked)
⚠️ Test 5: Task coordination flow - SKIP (Bug #6 blocked)
⚠️ Test 6: Multi-agent synchronization - SKIP (Bug #6 blocked)

RESULT: 3/6 tests passed (50%)
```

**Known Issues:**
- Bug #6: 3 tests blocked by Redis variable mismatch
- See `tests/docker/TECHNICAL_DEBT.md` for details

**Test 2: Agent Lifecycle (2 minutes)**
```bash
bash tests/docker/agent-lifecycle-tests.sh
```

**Expected Output:**
```
✅ Test 1: Agent spawn and initialization - PASS
✅ Test 2: Agent execution and logging - PASS
⚠️ Test 3: Agent completion and cleanup - SKIP (Bug #6 blocked)

RESULT: 2/3 tests passed (67%)
```

**Test 3: Memory Budget (2 minutes)**
```bash
bash tests/docker/memory-budget-tests.sh
```

**Expected Output:**
```
✅ Test 1: Memory budget enforcement - PASS
✅ Test 2: Tier allocation limits - PASS
✅ Test 3: OOM prevention - PASS

RESULT: 3/3 tests passed (100%)
```

**Test 4: Provider Authentication (2 minutes)**
```bash
bash tests/docker/provider-auth-tests.sh
```

**Expected Output:**
```
✅ Test 1: API key propagation - PASS
✅ Test 2: Multi-provider support - PASS
✅ Test 3: Failover handling - PASS

RESULT: 3/3 tests passed (100%)
```

**Test 5: Coordinator Iteration (1 minute)**
```bash
bash tests/docker/coordinator-iteration-tests.sh
```

**Expected Output:**
```
✅ Test 1: Iteration loop convergence - PASS
✅ Test 2: Max iteration handling - PASS

RESULT: 2/2 tests passed (100%)
```

**P0 Summary:**
- **Expected Pass Rate:** 13/17 tests (76%)
- **Blocked Tests:** 4 tests (Bug #6 - Redis variable mismatch)
- **Total Execution Time:** ~10 minutes

### Phase 3: Run P1 (High Priority) Tests (15 minutes)

**P1 tests validate architecture alignment.**

**Test 6: Clustering Accuracy (3 minutes)**
```bash
bash tests/docker/clustering-accuracy-tests.sh
```

**Expected Output:**
```
⚠️ Test 1: Error complexity clustering - SKIP (infrastructure incomplete)
⚠️ Test 2: Tier allocation accuracy - SKIP (infrastructure incomplete)

RESULT: 0/2 tests passed (blocked)
```

**Test 7: Environment Propagation (2 minutes)**
```bash
bash tests/docker/env-propagation-tests.sh
```

**Expected Output:**
```
✅ Test 1: Environment variable inheritance - PASS
✅ Test 2: Conditional env file loading - PASS
✅ Test 3: Sensitive data masking - PASS

RESULT: 3/3 tests passed (100%)
```

**Test 8: Wave Spawning (3 minutes)**
```bash
bash tests/docker/wave-spawning-tests.sh
```

**Expected Output:**
```
✅ Test 1: Wave parallelism validation - PASS
✅ Test 2: Memory budget per wave - PASS
✅ Test 3: Sequential wave execution - PASS

RESULT: 3/3 tests passed (100%)
```

**Test 9: TypeScript Analysis (4 minutes)**
```bash
bash tests/docker/typescript-analysis-tests.sh
```

**Expected Output:**
```
✅ Test 1: Error parsing accuracy - PASS
✅ Test 2: Complexity classification - PASS
✅ Test 3: Batch size optimization - PASS

RESULT: 3/3 tests passed (100%)
```

**Test 10: CFN Loop Compliance (3 minutes)**
```bash
bash tests/docker/cfn-loop-compliance-tests.sh
```

**Expected Output:**
```
✅ Test 1: Loop 3 protocol compliance - PASS
✅ Test 2: Loop 2 validator protocol - PASS
✅ Test 3: Product owner decision flow - PASS

RESULT: 3/3 tests passed (100%)
```

**P1 Summary:**
- **Expected Pass Rate:** 12/14 tests (86%)
- **Blocked Tests:** 2 tests (clustering infrastructure incomplete)
- **Total Execution Time:** ~15 minutes

### Phase 4: Run P2 (Medium Priority) Tests (10 minutes)

**P2 tests improve reliability but are not blocking.**

**Test 11: Build Sync (3 minutes)**
```bash
bash tests/docker/build-sync-tests.sh
```

**Expected Output:**
```
⚠️ Test 1: Build context size validation - SKIP (optimization pending)
⚠️ Test 2: Layer caching efficiency - SKIP (optimization pending)

RESULT: 0/2 tests passed (blocked)
```

**Test 12: Coordinator Fault Tolerance (4 minutes)**
```bash
bash tests/docker/coordinator-fault-tolerance-tests.sh
```

**Expected Output:**
```
✅ Test 1: Coordinator restart recovery - PASS
✅ Test 2: Redis connection loss handling - PASS
✅ Test 3: Agent crash recovery - PASS

RESULT: 3/3 tests passed (100%)
```

**Test 13: Rate Limiting (3 minutes)**
```bash
bash tests/docker/rate-limiting-tests.sh
```

**Expected Output:**
```
✅ Test 1: API rate limit enforcement - PASS
✅ Test 2: Backoff and retry logic - PASS

RESULT: 2/2 tests passed (100%)
```

**P2 Summary:**
- **Expected Pass Rate:** 5/7 tests (71%)
- **Blocked Tests:** 2 tests (build optimization pending)
- **Total Execution Time:** ~10 minutes

### Phase 5: Run Integration Tests (10 minutes)

**Integration tests validate end-to-end workflows.**

**Test 14: Intelligent Coordinator (8 minutes)**
```bash
bash tests/docker/intelligent-coordinator-test.sh
```

**Expected Output:**
```
✅ Configuration validated
✅ Docker environment setup complete
✅ Redis coordination layer initialized
✅ Coordinator execution completed
✅ Error reduction achieved: 10-20%

RESULT: Integration test PASSED
```

**Known Issues:**
- Coordinator completes successfully
- Agent completion reporting fails (Bug #6)
- Shows "0/16 tasks, 16 queued" despite success

**Test 15: Docker Hello World Parity (2 minutes)**
```bash
bash tests/docker/docker-hello-world-parity-tests.sh
```

**Expected Output:**
```
✅ Test 1: Docker agent vs CLI mode - PASS
✅ Test 2: Output parity validation - PASS
✅ Test 3: Performance comparison - PASS

RESULT: 3/3 tests passed (100%)
```

**Integration Summary:**
- **Expected Pass Rate:** 2/2 tests (100%)
- **Total Execution Time:** ~10 minutes

---

## Expected Pass Rates by Phase

| Phase | Category | Tests | Pass Rate | Execution Time |
|-------|----------|-------|-----------|----------------|
| Phase 2 | P0 (Critical) | 17 | 13/17 (76%) | 10 min |
| Phase 3 | P1 (High) | 14 | 12/14 (86%) | 15 min |
| Phase 4 | P2 (Medium) | 7 | 5/7 (71%) | 10 min |
| Phase 5 | Integration | 2 | 2/2 (100%) | 10 min |
| **Total** | **All Tests** | **40** | **32/40 (80%)** | **45 min** |

**Blocked Tests Summary:**
- Bug #6 (Redis variables): 4 tests blocked
- Infrastructure incomplete: 4 tests blocked
- **Total Blocked:** 8 tests (20%)

**Resolution Timeline:**
- Bug #6 fix: Week of 2025-11-14 (URGENT)
- Infrastructure unblocking: Week of 2025-11-18+

---

## Troubleshooting Common Issues

### Issue 1: Redis Connection Refused

**Symptom:**
```
Error: Could not connect to Redis at 127.0.0.1:6379: Connection refused
```

**Solutions:**

**A. Check Redis Container Status**
```bash
docker ps --filter "name=cfn-redis"
# If not running:
docker start cfn-redis
```

**B. Verify Environment Variables**
```bash
echo $CFN_REDIS_HOST
echo $CFN_REDIS_PORT
# If empty:
export CFN_REDIS_HOST=localhost
export CFN_REDIS_PORT=6379
```

**C. Test Connection Manually**
```bash
redis-cli -h "$CFN_REDIS_HOST" -p "$CFN_REDIS_PORT" ping
# Expected: PONG
# If fails: Restart Redis container
```

### Issue 2: Docker Image Not Found

**Symptom:**
```
Error: Unable to find image 'cfn-agent:latest' locally
```

**Solution:**
```bash
# Build missing image
docker build -t cfn-agent:latest -f Dockerfile.agent .

# Verify
docker images | grep cfn-agent
```

### Issue 3: Permission Denied on .env File

**Symptom:**
```
Error: EACCES: permission denied, open '/workspace/.env'
```

**Solution:**
```bash
# Fix file permissions
chmod 644 .env

# Verify
ls -la .env
# Expected: -rw-r--r-- (644)
```

### Issue 4: Network Not Found

**Symptom:**
```
Error: network cfn-network not found
```

**Solution:**
```bash
# Create network
docker network create cfn-network

# Verify
docker network ls | grep cfn-network
```

### Issue 5: Container Exit Code 1

**Symptom:**
```
Container exited with code 1
```

**Diagnosis:**
```bash
# Check container logs
docker logs <container-id>

# Check exit code details
docker inspect --format='{{.State.ExitCode}}: {{.State.Error}}' <container-id>
```

**Common Causes:**
1. Missing environment variables → Check `.env` file
2. Volume mount failures → Verify PROJECT_ROOT path
3. Network issues → Check `cfn-network` exists
4. Memory limits → Increase Docker memory allocation

### Issue 6: Test Timeout

**Symptom:**
```
Timeout waiting for agent completion after 300 seconds
```

**Diagnosis:**
```bash
# Check agent container status
docker ps --filter "label=cfn.task.id=<task-id>"

# Check logs
docker logs <container-id>

# Check Redis state
redis-cli -h "$CFN_REDIS_HOST" -p "$CFN_REDIS_PORT" keys "swarm:*"
```

**Solution:**
```bash
# Kill stuck container
docker kill <container-id>

# Clear Redis state
redis-cli -h "$CFN_REDIS_HOST" -p "$CFN_REDIS_PORT" flushall

# Retry test
```

---

## CI/CD Integration Recommendations

### GitHub Actions Example

```yaml
name: Docker Test Suite

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  docker-tests:
    runs-on: ubuntu-latest
    timeout-minutes: 60

    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v2

      - name: Create .env file
        run: |
          echo "CFN_API_KEY=${{ secrets.CFN_API_KEY }}" >> .env
          echo "CFN_REDIS_HOST=localhost" >> .env
          echo "CFN_REDIS_PORT=6379" >> .env
          echo "CFN_CUSTOM_ROUTING=false" >> .env

      - name: Start Redis
        run: |
          docker network create cfn-network
          docker run -d \
            --name cfn-redis \
            --network cfn-network \
            -p 6379:6379 \
            redis:7.2-alpine
          sleep 5
          redis-cli -h localhost -p 6379 ping

      - name: Build Docker images
        run: |
          docker build -t cfn-agent:latest -f Dockerfile.agent .
          docker build -t cfn-intelligent-coordinator:latest -f Dockerfile.coordinator .

      - name: Run P0 tests
        run: |
          for test in redis-coordination agent-lifecycle memory-budget provider-auth coordinator-iteration; do
            bash tests/docker/${test}-tests.sh || exit 1
          done

      - name: Run P1 tests
        run: |
          for test in env-propagation wave-spawning typescript-analysis cfn-loop-compliance; do
            bash tests/docker/${test}-tests.sh || exit 1
          done
        continue-on-error: true

      - name: Run integration tests
        run: |
          bash tests/docker/intelligent-coordinator-test.sh
        continue-on-error: true

      - name: Cleanup
        if: always()
        run: |
          docker rm -f $(docker ps -aq --filter "label=cfn.task.id=*") || true
          docker network rm cfn-network || true
```

### GitLab CI Example

```yaml
docker-tests:
  image: docker:latest
  services:
    - docker:dind
  variables:
    DOCKER_DRIVER: overlay2
    CFN_REDIS_HOST: localhost
    CFN_REDIS_PORT: "6379"
  before_script:
    - apk add --no-cache bash redis
    - echo "CFN_API_KEY=${CFN_API_KEY}" >> .env
    - echo "CFN_REDIS_HOST=localhost" >> .env
    - echo "CFN_REDIS_PORT=6379" >> .env
  script:
    - docker network create cfn-network
    - docker run -d --name cfn-redis --network cfn-network -p 6379:6379 redis:7.2-alpine
    - docker build -t cfn-agent:latest -f Dockerfile.agent .
    - docker build -t cfn-intelligent-coordinator:latest -f Dockerfile.coordinator .
    - bash tests/docker/redis-coordination-tests.sh
    - bash tests/docker/intelligent-coordinator-test.sh
  after_script:
    - docker rm -f $(docker ps -aq) || true
    - docker network rm cfn-network || true
  only:
    - main
    - develop
```

### Jenkins Pipeline Example

```groovy
pipeline {
    agent any

    environment {
        CFN_API_KEY = credentials('cfn-api-key')
        CFN_REDIS_HOST = 'localhost'
        CFN_REDIS_PORT = '6379'
    }

    stages {
        stage('Setup') {
            steps {
                sh '''
                    echo "CFN_API_KEY=${CFN_API_KEY}" > .env
                    echo "CFN_REDIS_HOST=localhost" >> .env
                    echo "CFN_REDIS_PORT=6379" >> .env
                '''
            }
        }

        stage('Start Redis') {
            steps {
                sh '''
                    docker network create cfn-network || true
                    docker run -d --name cfn-redis --network cfn-network -p 6379:6379 redis:7.2-alpine
                    sleep 5
                '''
            }
        }

        stage('Build Images') {
            steps {
                sh '''
                    docker build -t cfn-agent:latest -f Dockerfile.agent .
                    docker build -t cfn-intelligent-coordinator:latest -f Dockerfile.coordinator .
                '''
            }
        }

        stage('Run Tests') {
            parallel {
                stage('P0 Tests') {
                    steps {
                        sh 'bash tests/docker/redis-coordination-tests.sh'
                        sh 'bash tests/docker/memory-budget-tests.sh'
                    }
                }
                stage('P1 Tests') {
                    steps {
                        sh 'bash tests/docker/env-propagation-tests.sh'
                        sh 'bash tests/docker/wave-spawning-tests.sh'
                    }
                }
            }
        }

        stage('Integration Tests') {
            steps {
                sh 'bash tests/docker/intelligent-coordinator-test.sh'
            }
        }
    }

    post {
        always {
            sh '''
                docker rm -f $(docker ps -aq) || true
                docker network rm cfn-network || true
            '''
        }
    }
}
```

### CI/CD Best Practices

**1. Resource Management**
- Set Docker memory limits to prevent OOM on CI runners
- Use timeouts to prevent hung tests from blocking pipeline
- Clean up containers/networks in `post` or `always` blocks

**2. Secrets Management**
- Store API keys in CI/CD secrets (GitHub Secrets, GitLab Variables)
- Never commit `.env` file to repository
- Rotate API keys regularly

**3. Caching Strategy**
- Cache Docker layers between builds
- Cache npm dependencies in images
- Use BuildKit for faster builds

**4. Parallel Execution**
- Run independent test suites in parallel
- Reduce total CI time from 45 min to 15-20 min
- Monitor resource usage to avoid overload

**5. Failure Handling**
- Use `continue-on-error: true` for non-blocking tests
- Fail fast on P0 test failures
- Collect logs and artifacts on failure

---

## Quick Reference

### Start Fresh Test Environment

```bash
# Cleanup previous runs
docker rm -f $(docker ps -aq --filter "label=cfn.task.id=*") 2>/dev/null || true
docker network rm cfn-network 2>/dev/null || true
redis-cli -h localhost -p 6379 flushall

# Setup
docker network create cfn-network
docker run -d --name cfn-redis --network cfn-network -p 6379:6379 redis:7.2-alpine

# Build images
docker build -t cfn-agent:latest -f Dockerfile.agent .
docker build -t cfn-intelligent-coordinator:latest -f Dockerfile.coordinator .

# Run tests
bash tests/docker/intelligent-coordinator-test.sh
```

### One-Line Test Execution

```bash
# Run single test
bash tests/docker/<test-name>.sh

# Run all P0 tests
for t in redis-coordination agent-lifecycle memory-budget provider-auth coordinator-iteration; do bash tests/docker/${t}-tests.sh; done

# Run all P1 tests
for t in env-propagation wave-spawning typescript-analysis cfn-loop-compliance; do bash tests/docker/${t}-tests.sh; done

# Run integration tests
bash tests/docker/intelligent-coordinator-test.sh
```

---

## Additional Resources

- **Architecture:** `tests/docker/ARCHITECTURE.md`
- **Maintenance:** `tests/docker/MAINTENANCE.md`
- **Technical Debt:** `tests/docker/TECHNICAL_DEBT.md`
- **Standards:** `tests/CLAUDE.md`
- **Helper Documentation:** `tests/docker/ARCHITECTURE_TEST_HELPERS.md`
- **Bug Tracking:** `docs/bugs/`

---

**Document Version:** 1.0.0
**Last Updated:** 2025-11-13
**Maintainers:** CFN Dev Team
