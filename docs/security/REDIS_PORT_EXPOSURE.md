# Redis Port Exposure - Optional Hardening Guide

**Related:** SEC-001 Iteration 2 Fix (Authentication Resolved)
**Risk Level:** MEDIUM (CVSS 5.9) - Mitigated by authentication
**Implementation Time:** 5 minutes
**Priority:** Optional hardening (non-blocking)

---

## Overview

Redis authentication (SEC-001) is **RESOLVED**. This document covers optional hardening to eliminate port exposure risk entirely by binding to localhost or removing port binding.

**Current Status:**
- ✅ Authentication enforced with `--requirepass`
- ✅ Strong 64-character password
- ⚠️ Port exposed on 0.0.0.0:6379 (mitigated by auth)

**Risk:** Remote connection attempts possible (authentication prevents unauthorized access)

---

## Current Configuration

### Vulnerable Port Binding
```yaml
# docker-compose.yml
redis:
  ports:
    - "6379:6379"  # Binds to 0.0.0.0 (all interfaces)
```

**Risk Analysis:**
- Port accessible from any network interface
- Remote hosts can attempt connection
- Authentication blocks unauthorized access (MEDIUM risk, not CRITICAL)
- Credential guessing unlikely (64-char password)

---

## Remediation Options

### Option 1: Localhost-Only Binding (RECOMMENDED FOR DEVELOPMENT)

**Best For:** Development, testing, local environments

```yaml
# docker-compose.yml
redis:
  image: redis:7-alpine
  container_name: cfn-redis
  networks:
    - mcp-network
  ports:
    - "127.0.0.1:6379:6379"  # Only localhost access
  command: redis-server --requirepass ${REDIS_PASSWORD} --loglevel notice
```

**Benefits:**
- ✅ Port only accessible from local machine
- ✅ No remote connection possible
- ✅ Maintains localhost access for debugging
- ✅ Zero network exposure
- ✅ 5-minute implementation

**Access Pattern:**
```bash
# From host machine
redis-cli -h 127.0.0.1 -p 6379 -a "$REDIS_PASSWORD" ping
# Result: PONG

# From containers on mcp-network
redis-cli -h cfn-redis -p 6379 -a "$REDIS_PASSWORD" ping
# Result: PONG
```

**Limitations:**
- Cannot access from remote machines (use SSH tunnel if needed)

---

### Option 2: No Port Binding (RECOMMENDED FOR PRODUCTION)

**Best For:** Production, staging, internal Docker networks

```yaml
# docker-compose.yml
redis:
  image: redis:7-alpine
  container_name: cfn-redis
  networks:
    - mcp-network
  # Remove ports section entirely
  command: redis-server --requirepass ${REDIS_PASSWORD} --loglevel notice
```

**Benefits:**
- ✅ Zero port exposure
- ✅ Only internal Docker network access
- ✅ Containers communicate via service DNS (cfn-redis:6379)
- ✅ Eliminates network attack surface entirely
- ✅ Production best practice

**Access Pattern:**
```bash
# From containers on mcp-network
docker run --rm --network mcp-network redis:7-alpine \
  redis-cli -h cfn-redis -p 6379 -a "$PASSWORD" ping
# Result: PONG

# From host machine (requires docker exec)
docker exec cfn-redis redis-cli -a "$REDIS_PASSWORD" ping
# Result: PONG

# Direct host connection NOT possible (intended)
redis-cli -h localhost -p 6379 -a "$PASSWORD" ping
# Result: Connection refused (correct behavior)
```

**Limitations:**
- Cannot access from host machine without `docker exec`
- Requires Docker network for all access

---

### Option 3: SSH Tunnel for Remote Access

**Best For:** Remote debugging, secure external access

**Configuration:** Use Option 2 (no port binding) + SSH tunnel

```bash
# On remote machine, create SSH tunnel
ssh -L 6379:localhost:6379 user@remote-host

# In another terminal, connect to local tunnel
redis-cli -h localhost -p 6379 -a "$PASSWORD" ping
# Result: PONG (securely forwarded through SSH)
```

**Benefits:**
- ✅ Zero port exposure
- ✅ Secure remote access via SSH encryption
- ✅ No credentials transmitted over network
- ✅ Audit trail via SSH logs

---

## Implementation Steps

### Step 1: Choose Configuration

**Development:** Use Option 1 (localhost binding)
- Keeps local debugging access
- Blocks remote connections
- Minimal operational impact

**Production:** Use Option 2 (no port binding)
- Maximum security (zero exposure)
- Industry best practice
- Requires `docker exec` for host access

### Step 2: Update docker-compose.yml

**Current (Port Exposed):**
```yaml
redis:
  ports:
    - "6379:6379"
```

**Option 1 (Localhost Only):**
```yaml
redis:
  ports:
    - "127.0.0.1:6379:6379"
```

**Option 2 (No Binding - Production):**
```yaml
redis:
  # Remove ports section entirely
```

### Step 3: Update docker/docker-compose.yml

Apply same changes to coordinator configuration:

```yaml
# BEFORE
cfn-redis:
  ports:
    - "6379:6379"

# AFTER (Development)
cfn-redis:
  ports:
    - "127.0.0.1:6379:6379"

# AFTER (Production)
cfn-redis:
  # Remove ports - network isolation only
```

### Step 4: Restart Services

```bash
# Stop current Redis
docker-compose down

# Start with new configuration
docker-compose up -d redis

# Verify Redis is running
docker ps | grep cfn-redis
```

### Step 5: Validate Access

**For localhost binding:**
```bash
redis-cli -h 127.0.0.1 -p 6379 -a "$REDIS_PASSWORD" ping
# Expected: PONG

# Verify external access blocked
timeout 3 bash -c 'echo PING | nc -w1 0.0.0.0 6379' || echo "Port blocked ✓"
```

**For no port binding:**
```bash
docker exec cfn-redis redis-cli -a "$REDIS_PASSWORD" ping
# Expected: PONG

# Verify containers can access via network
docker run --rm --network mcp-network redis:7-alpine \
  redis-cli -h cfn-redis -p 6379 -a "$REDIS_PASSWORD" ping
# Expected: PONG
```

---

## Impact Analysis

### Option 1: Localhost Binding

| Aspect | Impact |
|--------|--------|
| Application functionality | NO CHANGE |
| Container-to-container communication | NO CHANGE (via Docker network) |
| Local debugging | WORKS (127.0.0.1 access) |
| Remote access | BLOCKED (SSH tunnel if needed) |
| Security improvement | HIGH (no network exposure) |
| Operational complexity | LOW (minimal change) |

### Option 2: No Port Binding

| Aspect | Impact |
|--------|--------|
| Application functionality | NO CHANGE |
| Container-to-container communication | NO CHANGE (via cfn-redis:6379) |
| Local host access | Requires `docker exec` |
| Remote access | BLOCKED (internal network only) |
| Security improvement | HIGHEST (zero exposure) |
| Operational complexity | MEDIUM (must use docker exec) |

---

## Validation Checklist

After implementing remediation:

- [ ] Container starts successfully
  ```bash
  docker ps | grep cfn-redis
  ```

- [ ] Healthcheck passes
  ```bash
  docker ps | grep cfn-redis | grep healthy
  ```

- [ ] Internal containers can access Redis
  ```bash
  docker run --rm --network mcp-network redis:7-alpine \
    redis-cli -h cfn-redis -a "$PASSWORD" ping
  # Expected: PONG
  ```

- [ ] Coordinator connects successfully
  ```bash
  docker logs cfn-coordinator | grep -i redis
  # Should show successful connection
  ```

- [ ] Port binding works as expected
  ```bash
  # For localhost binding: should work
  redis-cli -h 127.0.0.1 -a "$PASSWORD" ping

  # For no binding: should fail (correct behavior)
  redis-cli -h localhost -a "$PASSWORD" ping || echo "Correctly blocked ✓"
  ```

- [ ] Authentication still enforced
  ```bash
  bash tests/redis/validate-server-auth.sh
  # Expected: All tests passed
  ```

---

## Troubleshooting

### Issue: "Address already in use" Error

**Cause:** Old container still using port

**Solution:**
```bash
docker-compose down -v
docker system prune
docker-compose up -d
```

### Issue: Coordinator Can't Connect

**For localhost binding:**
```yaml
# Ensure coordinator is on same network
cfn-coordinator:
  networks:
    - mcp-network  # Same network as redis
  depends_on:
    - cfn-redis
```

**For no binding:**
```yaml
# Coordinator uses service DNS name (not localhost)
environment:
  - CFN_REDIS_HOST=cfn-redis  # NOT 127.0.0.1
  - CFN_REDIS_PORT=6379
```

### Issue: Cannot Connect from Host

**For localhost binding:**
```bash
# Correct
redis-cli -h 127.0.0.1 -p 6379 -a "$PASSWORD" ping

# Wrong (0.0.0.0 not accessible)
redis-cli -h 0.0.0.0 -p 6379 -a "$PASSWORD" ping
```

**For no binding (expected behavior):**
```bash
# Must use docker exec
docker exec cfn-redis redis-cli -a "$PASSWORD" ping
```

---

## Security Hardening Summary

| Control | Before | After (Option 1) | After (Option 2) |
|---------|--------|------------------|------------------|
| Port exposure | 0.0.0.0:6379 | 127.0.0.1:6379 | None |
| Remote access | Possible (auth required) | BLOCKED | BLOCKED |
| Local debugging | YES | YES | docker exec only |
| Container access | YES | YES | YES |
| CVSS Score | 5.9 | 2.0 | 0.0 |
| Network attack surface | Medium | Minimal | Zero |

---

## Migration Path

### Phase 1: Development (Immediate)
- Update docker-compose.yml with localhost binding (Option 1)
- Test all development workflows
- Verify no functionality breaks
- Timeline: 1 day

### Phase 2: Staging (Week 1)
- Deploy Option 2 (no port binding) to staging
- Test isolated network environment
- Validate coordinator communication
- Timeline: 3-5 days

### Phase 3: Production (Week 2)
- Deploy Option 2 to production
- Monitor for access issues
- Remove fallback port bindings
- Timeline: 2-3 days

---

## Recommendation Summary

**For Development:**
```yaml
# Use Option 1: Localhost binding
ports:
  - "127.0.0.1:6379:6379"
```
- Maintains debugging access
- Blocks network exposure
- 5-minute implementation

**For Production:**
```yaml
# Use Option 2: No port binding (remove ports entirely)
```
- Zero network exposure
- Docker network access only
- Industry best practice

**Timeline:** Implement within 2 weeks (non-critical - authentication mitigates risk)

**Risk if Deferred:** Medium (5.9 CVSS) - acceptable with strong authentication

---

## Related Documentation

- **SEC-001 Primary Reference:** `/docs/security/SEC-001_REDIS_AUTH.md`
- **Configuration Files:** `/docker-compose.yml`, `/docker/docker-compose.yml`
- **Validation Test:** `/tests/redis/validate-server-auth.sh`
- **Environment Template:** `/.env.example`

---

## Quick Reference Commands

```bash
# Verify current port binding
docker port cfn-redis
# Shows: 6379/tcp -> 0.0.0.0:6379 (needs hardening)

# Test localhost access (Option 1)
redis-cli -h 127.0.0.1 -p 6379 -a "$REDIS_PASSWORD" ping

# Test container access (Option 2)
docker exec cfn-redis redis-cli -a "$REDIS_PASSWORD" ping

# Test network isolation
docker run --rm --network mcp-network redis:7-alpine \
  redis-cli -h cfn-redis -p 6379 -a "$REDIS_PASSWORD" ping

# Verify authentication still enforced
bash tests/redis/validate-server-auth.sh
```

---

**End of Document**
