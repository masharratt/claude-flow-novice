# Docker Test Infrastructure - Complete Guide

**Purpose:** Automated testing of Docker-based CFN infrastructure
**Version:** 1.0 (Initial Release)
**Date:** 2025-11-17
**Status:** Production-ready for local development and CI/CD integration

---

## Overview

This test infrastructure provides automated validation of the Docker environment used by CFN (Claude Flow) agents, coordinators, and orchestrators.

**Key Features:**
- Pre-flight environment validation (7 checks)
- Security tests (Docker socket, Redis auth, DoS protection)
- CI/CD pipeline integration
- Comprehensive error reporting
- Timeout protection and graceful failure handling

---

## Files in This Directory

### Core Test Infrastructure

| File | Purpose | Status |
|------|---------|--------|
| `test-runner.sh` | Main test execution script | ✅ Ready |
| `TEST_INFRASTRUCTURE_README.md` | This file | ✅ Ready |
| `CI_CD_TEST_INTEGRATION.md` | CI/CD configuration guide | ✅ Ready |

### Supporting Documentation

| File | Purpose | Related To |
|------|---------|-----------|
| `CLAUDE.md` | Docker architecture reference | Infrastructure design |
| `../DOCKER_TEST_RESULTS.md` | Test results and analysis | Test execution results |

---

## Quick Start

### 1. Run Tests Locally

```bash
# Navigate to project root
cd /mnt/c/Users/masha/Documents/claude-flow-novice

# Make test runner executable
chmod +x ./docker/test-runner.sh

# Run all tests with verbose output
./docker/test-runner.sh --verbose

# Or run specific tests
./docker/test-runner.sh --test1 --test2
```

### 2. Check Results

After execution, review:
- Console output (immediate feedback)
- `/DOCKER_TEST_RESULTS.md` (detailed analysis)

### 3. Integrate into CI/CD

See `CI_CD_TEST_INTEGRATION.md` for:
- GitHub Actions configuration
- GitLab CI setup
- Jenkins pipeline integration

---

## Test Execution Modes

### Mode A: Development (Full Checks)

```bash
./docker/test-runner.sh --verbose
```

**Use when:**
- Developing on local machine
- Before committing changes
- Debugging Docker environment issues

**Includes:**
- ✅ All 7 pre-flight checks
- ✅ All 3 security tests
- ✅ Detailed error messages
- ✅ Verbose logging

### Mode B: CI/CD (Fast Checks)

```bash
./docker/test-runner.sh --skip-preflight
```

**Use when:**
- Running in CI/CD pipeline
- Environment already validated
- Need quick feedback

**Includes:**
- ✅ 3 security tests only
- ✅ Standard error reporting
- ✅ Faster execution

### Mode C: Targeted Testing

```bash
./docker/test-runner.sh --test1 --test2
```

**Use when:**
- Debugging specific failures
- Testing after environment changes
- Running selective validation

**Includes:**
- ✅ Only requested tests
- ✅ Full pre-flight checks
- ✅ Detailed diagnostics

---

## Pre-flight Checks (7 Total)

### Check 1: Docker Daemon

**What it tests:** Docker service is responsive

**Command:** `docker ps`

**Success criteria:** Command completes without error

**If it fails:**
```bash
# Local: Restart Docker
sudo systemctl restart docker

# Or use Docker Desktop application
```

---

### Check 2: Docker Socket

**What it tests:** Docker socket is accessible to containers

**File:** `/var/run/docker.sock`

**Success criteria:** Socket file exists and is readable

**If it fails:**
```bash
# Verify socket permissions
ls -la /var/run/docker.sock
# Should show: srw-rw----

# If missing, restart Docker
sudo systemctl restart docker
```

---

### Check 3: Docker Network

**What it tests:** Required network `mcp-network` exists

**Success criteria:** Network is created or already exists

**If it fails:**
```bash
# Create network manually
docker network create mcp-network

# Verify creation
docker network ls | grep mcp-network
```

---

### Check 4: Required Images

**What it tests:** All needed Docker images are present

**Required images:**
- `cfn-agent:latest`
- `cfn-coordinator:latest`
- `cfn-orchestrator:latest`
- `redis:7-alpine`

**Success criteria:** All 4 images exist locally

**If it fails:**
```bash
# Build missing CFN images
./.claude/skills/docker-build/build.sh

# Or manually build specific images
docker build -f docker/Dockerfile.agent -t cfn-agent:latest .
docker build -f docker/Dockerfile.coordinator -t cfn-coordinator:latest .

# Pull Redis image
docker pull redis:7-alpine
```

---

### Check 5: Environment Configuration

**What it tests:** `.env` file has required variables

**Required variables:**
- `REDIS_PASSWORD` - Must not be empty
- Other CFN configuration

**Success criteria:** `.env` file exists and REDIS_PASSWORD is set

**If it fails:**
```bash
# Copy example config
cp .env.example .env

# Edit with your settings
nano .env

# Verify REDIS_PASSWORD is not empty
grep REDIS_PASSWORD .env
```

---

### Check 6: Redis Container

**What it tests:** Redis container exists and is running

**Success criteria:** Container status is "running"

**If it fails:**
```bash
# Start Redis if stopped
docker start cfn-redis

# Or start via docker-compose
docker-compose -f docker-compose.yml up -d cfn-redis

# Check status
docker ps | grep cfn-redis
```

---

### Check 7: Redis Connectivity

**What it tests:** Can connect to Redis and verify authentication

**Success criteria:** Redis requires authentication

**If it fails:**
```bash
# Check Redis logs
docker logs cfn-redis

# Verify password is set
grep REDIS_PASSWORD .env

# Test connection
REDIS_PASSWORD=$(grep REDIS_PASSWORD .env | cut -d'=' -f2)
docker exec cfn-redis redis-cli -a "$REDIS_PASSWORD" PING
```

---

## Security Tests (3 Total)

### Test 1: Docker Socket Access Control

**Purpose:** Validate socket has proper permission restrictions

**What it checks:**
- Socket is accessible to containers
- Socket has restricted permissions
- Only authorized users can use socket

**Expected result:** ✅ PASS

**If it fails:**
- Check socket permissions: `ls -la /var/run/docker.sock`
- Should show `srw-rw----` (owner and group only)
- If permissions are wrong, restart Docker daemon

---

### Test 2: Redis Authentication Enforcement

**Purpose:** Verify Redis requires authentication

**What it checks:**
- Unauthenticated connections are rejected (or at least password is configured)
- Authentication mechanism is in place
- Password is properly set in `.env`

**Expected result:** ✅ PASS

**If it fails:**
```bash
# Verify REDIS_PASSWORD in .env
grep REDIS_PASSWORD .env

# Test with credentials
REDIS_PASSWORD=$(grep REDIS_PASSWORD .env | cut -d'=' -f2)
docker exec cfn-redis redis-cli -a "$REDIS_PASSWORD" PING
# Should respond: PONG
```

---

### Test 3: Success Criteria DoS Protection

**Purpose:** Verify file size limits prevent denial-of-service attacks

**What it checks:**
- Large files (>10MB) are rejected
- File size validation is implemented
- Clear error messages on rejection

**Expected result:** ✅ PASS

**If it fails:**
- Check coordinator entrypoint script
- Verify 10MB limit is defined
- Test with actual file:

```bash
# Create 11MB test file
dd if=/dev/zero of=/tmp/test-large.json bs=1M count=11 2>/dev/null

# Try to load it
docker run --rm \
  -v /tmp/test-large.json:/criteria.json:ro \
  -e CFN_SUCCESS_CRITERIA_FILE=/criteria.json \
  cfn-coordinator:latest /app/coordinator-entrypoint.sh

# Should fail with file size error
```

---

## Exit Codes

| Code | Meaning | Action |
|------|---------|--------|
| 0 | All tests passed | ✅ Safe to proceed |
| 1 | One or more tests failed | ❌ Review failures and fix |
| 124 | Timeout exceeded | ⏱️ Check for hung processes or slow system |
| 127 | Command not found | 📝 Verify test runner script exists |

---

## Common Issues and Solutions

### Issue: "Docker daemon not responding"

**Symptoms:**
```
[FAIL] Docker daemon is responsive
```

**Causes:**
- Docker not running
- Docker socket permission issues
- Docker process crashed

**Solutions:**
```bash
# Restart Docker
sudo systemctl restart docker

# Or check status
sudo systemctl status docker

# If using Docker Desktop
# Restart the application
```

---

### Issue: "Missing image: cfn-agent:latest"

**Symptoms:**
```
[WARN] Missing image: cfn-agent:latest
```

**Causes:**
- Image not built locally
- Image not pulled from registry
- Wrong image name/tag

**Solutions:**
```bash
# Build image using docker-build skill
./.claude/skills/docker-build/build.sh

# Or build manually
docker build -f docker/Dockerfile.agent -t cfn-agent:latest .

# Verify image was created
docker images | grep cfn-agent
```

---

### Issue: "Redis container not found"

**Symptoms:**
```
[WARN] Redis container (cfn-redis) not found
```

**Causes:**
- Container not created
- Container was deleted
- Container named differently

**Solutions:**
```bash
# Check if container exists (with any status)
docker ps -a | grep redis

# If it exists but not running, start it
docker start cfn-redis

# If it doesn't exist, create it
docker-compose -f docker-compose.yml up -d cfn-redis

# Verify it's running
docker ps | grep cfn-redis
```

---

### Issue: "Test timeout exceeded"

**Symptoms:**
```
[FAIL] Test timeout exceeded (300 seconds)
```

**Causes:**
- System is slow
- Test is hanging
- Network latency
- Resource constraints

**Solutions:**
```bash
# Increase timeout environment variable
export TEST_TIMEOUT=600
./docker/test-runner.sh --verbose

# Or check for hung processes
docker ps -a
docker logs cfn-redis

# Check system resources
docker stats
```

---

## Test Output Format

### Example Successful Run

```
============================================================================
  CFN Docker Test Runner
============================================================================
[INFO] Test execution started at 2025-11-17 06:30:42
[INFO] Environment: Linux / Docker 27.5.1

============================================================================
  Phase 0: Pre-flight Checks
============================================================================
[INFO] Checking Docker daemon...
[PASS] Docker daemon is responsive
[INFO] Checking Docker socket access...
[PASS] Docker socket is accessible
[INFO] Checking required Docker images...
[PASS] All required images present

Pre-flight Checks: 7/7 passed

============================================================================
  Phase 1: Docker Infrastructure Tests
============================================================================
[INFO] Test 1: Docker Socket Access Control
[PASS] Docker Socket Access Control: Proper permissions verified
[INFO] Test 2: Redis Authentication Enforcement
[PASS] Redis Authentication Enforcement: Requires authentication
[INFO] Test 3: Success Criteria DoS Protection
[PASS] Success Criteria DoS Protection: Implementation verified

============================================================================
  Test Report
============================================================================
Tests Passed:  3
Tests Failed:  0
Tests Skipped: 0
Pass Rate:     100%

Overall Status: PASS
Total execution time: 45s
```

### Example Failure

```
============================================================================
  Phase 1: Docker Infrastructure Tests
============================================================================
[INFO] Test 1: Docker Socket Access Control
[FAIL] Docker Socket Access Control: Socket not accessible

Tests Passed:  0
Tests Failed:  1
Tests Skipped: 0
Pass Rate:     0%

Overall Status: FAIL
```

---

## Integration Checklist

### For Local Development

- [ ] Understand all 7 pre-flight checks
- [ ] Know how to run tests: `./docker/test-runner.sh --verbose`
- [ ] Understand the 3 security tests
- [ ] Know how to interpret results
- [ ] Know basic troubleshooting steps

### For CI/CD Integration

- [ ] Choose CI/CD platform (GitHub Actions, GitLab CI, Jenkins)
- [ ] Review `CI_CD_TEST_INTEGRATION.md` for your platform
- [ ] Implement test step in pipeline
- [ ] Configure artifact upload (optional)
- [ ] Set up failure notifications
- [ ] Test the pipeline with manual trigger

### For Production Deployment

- [ ] Run full test suite before deployment
- [ ] Review `/DOCKER_TEST_RESULTS.md` for any warnings
- [ ] Have a rollback plan if tests fail
- [ ] Monitor infrastructure post-deployment
- [ ] Schedule regular infrastructure audits

---

## Performance Notes

### Test Execution Time

**Expected duration:**
- Pre-flight checks: ~30 seconds
- Security tests: ~1-2 minutes
- Total: ~2-3 minutes

**Factors affecting duration:**
- Docker image pull/startup time
- Network latency to registries
- System resource availability
- Disk I/O performance

### Timeout Configuration

**Default:** 300 seconds (5 minutes) per test

**When to increase:**
- CI/CD on slower machines
- Network-constrained environments
- High-load systems

**When to decrease:**
- Quick validation needed
- Detecting hung processes
- Resource-limited environments

```bash
# Set custom timeout
export TEST_TIMEOUT=600  # 10 minutes
./docker/test-runner.sh
```

---

## Maintenance and Updates

### Regular Checks

**Weekly:**
- Review test results
- Check for warnings or issues
- Update .env if credentials changed

**Monthly:**
- Run full test suite
- Review Docker images for updates
- Check Redis version compatibility
- Audit security settings

**Quarterly:**
- Review entire infrastructure design
- Update Docker base images
- Review security practices
- Plan for upgrades

### When to Rebuild Images

- After code changes in `docker/` directory
- After updating dependencies
- Security vulnerability fixes
- When changing base image versions

```bash
# Rebuild using docker-build skill
./.claude/skills/docker-build/build.sh

# Or manually
docker build -f docker/Dockerfile.agent -t cfn-agent:latest .
```

---

## Support and Debugging

### Getting Help

1. **Review error messages** - They're descriptive and actionable
2. **Check this guide** - Solutions for common issues
3. **Review logs** - Check Docker and test output
4. **Run with verbose** - Get more detailed information
   ```bash
   ./docker/test-runner.sh --verbose
   ```

### Collecting Diagnostic Information

When reporting issues, include:

```bash
# Docker version
docker --version

# Available images
docker images | grep cfn

# Running containers
docker ps

# Network configuration
docker network ls

# Test output (verbose)
./docker/test-runner.sh --verbose > test-diagnostics.log 2>&1
```

---

## Next Steps

### Immediate (This Iteration)

- [ ] Run test suite locally
- [ ] Verify all pre-flight checks pass
- [ ] Review test results in `/DOCKER_TEST_RESULTS.md`
- [ ] Understand each security test

### Short-term (Week 1-2)

- [ ] Integrate into CI/CD pipeline
- [ ] Set up automated test scheduling
- [ ] Configure test result notifications
- [ ] Document any custom configurations

### Medium-term (Month 1)

- [ ] Add Phase 2 tests (Redis atomicity, lifecycle)
- [ ] Add Phase 3 tests (Port isolation, multi-language agents)
- [ ] Implement test result trending
- [ ] Add health check monitoring

---

## References

**Related Documentation:**
- `/docker/CLAUDE.md` - Docker architecture and design
- `/docker/CI_CD_TEST_INTEGRATION.md` - CI/CD setup guide
- `/DOCKER_TEST_RESULTS.md` - Latest test results and analysis
- `/docker/runtime/cfn-runtime.contract.yml` - Environment variable specification

**External Resources:**
- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose](https://docs.docker.com/compose/)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)

---

**Version:** 1.0
**Last Updated:** 2025-11-17
**Status:** Production-ready
**Maintainer:** DevOps Engineering Team
