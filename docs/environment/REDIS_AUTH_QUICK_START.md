# Redis Authentication Validation - Quick Start Guide

**Goal**: Verify that Redis server rejects unauthenticated connections

---

## Step 1: Static Configuration Check (No Containers Required)

```bash
# Navigate to project root
cd /mnt/c/Users/masha/Documents/claude-flow-novice

# Run static validation
bash tests/validate-redis-auth.sh
```

**Expected Output**:
```
======================================
Redis Authentication Validation
======================================

Task 1: Verify docker-compose.yml Configuration

✓ Redis service found
✓ --requirepass directive found

Redis command configuration:
    command: redis-server --appendonly yes --maxmemory 512mb ...
    --requirepass ${REDIS_PASSWORD} ...

Task 2: Verify .env Configuration

✓ REDIS_PASSWORD set
  Password length: 64 chars

Task 3: Check All Docker Compose Files

Files with Redis configuration:
  • docker-compose.yml
    ✓ --requirepass found

======================================
Configuration Validation PASSED
======================================

Next Steps:
1. Start Redis: docker-compose up -d redis
2. Test authentication:
   • Unauthenticated (should fail):
     docker exec cfn-redis redis-cli ping
   • Authenticated (should work):
     docker exec cfn-redis redis-cli -a '<PASSWORD>' ping
```

---

## Step 2: Start Redis Container

```bash
# Start Redis in background
docker-compose up -d redis

# Wait for container to be healthy
sleep 5

# Verify health status
docker ps | grep cfn-redis
```

**Expected Status**: `Up X seconds (healthy)`

---

## Step 3: Test Unauthenticated Connection (NEGATIVE TEST)

This connection should FAIL with NOAUTH error.

```bash
# Load environment
source .env

# Test unauthenticated access - THIS SHOULD FAIL
docker exec cfn-redis redis-cli ping
```

**Expected Output**:
```
(error) NOAUTH Authentication required.
```

**If you see "PONG" instead**: ⚠️ SECURITY ISSUE - Server accepting unauthenticated connections!

---

## Step 4: Test Authenticated Connection (POSITIVE TEST)

This connection should SUCCEED with PONG response.

```bash
# Load password from environment
source .env

# Test authenticated access - THIS SHOULD SUCCEED
docker exec cfn-redis redis-cli -a "$REDIS_PASSWORD" ping
```

**Expected Output**:
```
PONG
```

**If you see NOAUTH error**: Password mismatch - check .env file

---

## Step 5: Verify Server Configuration

Confirm that the Redis server has requirepass configured.

```bash
# Load password
source .env

# Check server configuration
docker exec cfn-redis redis-cli -a "$REDIS_PASSWORD" CONFIG GET requirepass
```

**Expected Output**:
```
1) "requirepass"
2) "Hbqt1bj1VdlWq4KTbzDZ2wL+o1xWVGvjDgzWKMkVtcyfoXmzpW9P43UZ6CgGlxjb"
```

---

## Step 6: Test Wrong Password (OPTIONAL)

Verify that wrong passwords are rejected.

```bash
# Test with incorrect password
docker exec cfn-redis redis-cli -a "wrong-password" ping
```

**Expected Output**:
```
(error) WRONGPASS invalid username-password pair
```

---

## Test Results Checklist

Complete validation includes these tests:

| # | Test | Command | Expected | Pass? |
|---|------|---------|----------|-------|
| 1 | Config Exists | grep requirepass docker-compose.yml | Found | ☐ |
| 2 | Password Set | grep REDIS_PASSWORD .env | Found (64 chars) | ☐ |
| 3 | Unauthenticated Ping | redis-cli ping | NOAUTH error | ☐ |
| 4 | Authenticated Ping | redis-cli -a $PASS ping | PONG | ☐ |
| 5 | Server Config | CONFIG GET requirepass | Password value | ☐ |
| 6 | Wrong Password | redis-cli -a "bad" ping | WRONGPASS error | ☐ |

---

## Automated Validation Script

For comprehensive testing, run the full validation script:

```bash
# Full validation with all checks
bash tests/redis-auth-validation.sh
```

This script performs all tests automatically and generates a detailed report.

---

## Troubleshooting

### Issue: "PONG" returned for unauthenticated connection

**Problem**: Server is NOT rejecting unauthenticated connections

**Cause**: `--requirepass` directive missing or not active

**Fix**:
```bash
# Verify docker-compose.yml has --requirepass
grep "requirepass" docker-compose.yml

# Restart Redis with new configuration
docker-compose restart redis
sleep 5

# Retest
docker exec cfn-redis redis-cli ping
# Should now show: (error) NOAUTH Authentication required.
```

---

### Issue: NOAUTH error even with correct password

**Problem**: Authenticated connection failing

**Cause**: Password mismatch between .env and server

**Fix**:
```bash
# Verify password in .env
grep REDIS_PASSWORD .env

# Stop and remove old container
docker-compose down redis

# Start with fresh configuration
docker-compose up -d redis
sleep 10

# Test again
source .env
docker exec cfn-redis redis-cli -a "$REDIS_PASSWORD" ping
# Should show: PONG
```

---

### Issue: Container not healthy

**Problem**: Redis container shows unhealthy status

**Cause**: Health check failing

**Fix**:
```bash
# Check logs
docker logs cfn-redis

# Verify password is set
grep REDIS_PASSWORD .env

# Check if password has special characters needing escaping
# Restart with explicit password
docker-compose restart redis

# Check status
docker ps | grep cfn-redis
```

---

## Configuration Locations

| File | Purpose | Check |
|------|---------|-------|
| `/docker-compose.yml` | Main compose file | Has `--requirepass ${REDIS_PASSWORD}` |
| `/docker/docker-compose.yml` | Build targets compose | Has `--requirepass ${CFN_REDIS_PASSWORD}` |
| `.env` | Environment variables | Has `REDIS_PASSWORD=<value>` |

---

## Key Files Created

1. **Test Scripts**:
   - `tests/validate-redis-auth.sh` - Quick configuration validation
   - `tests/redis-auth-validation.sh` - Comprehensive validation

2. **Documentation**:
   - `docs/REDIS_AUTH_VALIDATION_REPORT.md` - Detailed validation report
   - `docs/REDIS_AUTH_VALIDATION_APPROACH.md` - Technical methodology
   - `docs/REDIS_AUTH_QUICK_START.md` - This file

---

## Summary

✓ Configuration is properly set for server-side authentication enforcement
✓ Test scripts are ready to run
✓ Validation approach documented
✓ Troubleshooting guide available

**Next Action**: Run the tests to confirm behavioral validation!

```bash
# Quick test
bash tests/validate-redis-auth.sh

# Full test (after starting Redis)
docker-compose up -d redis && sleep 5
source .env
docker exec cfn-redis redis-cli ping  # Should fail
docker exec cfn-redis redis-cli -a "$REDIS_PASSWORD" ping  # Should succeed
```

---

## Support

For detailed information, see:
- **Validation Approach**: `docs/REDIS_AUTH_VALIDATION_APPROACH.md`
- **Detailed Report**: `docs/REDIS_AUTH_VALIDATION_REPORT.md`
- **Security Context**: SEC-001 Redis Authentication Enforcement
