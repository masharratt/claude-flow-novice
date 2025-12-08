# Security Fix: Redis Password Environment Variable Mismatch

**Date:** 2025-11-17
**Severity:** CVSS 9.1/10 (Critical)
**Agent:** docker-specialist
**Iteration:** 2

## Problem

Two docker-compose files used DIFFERENT environment variable names for Redis authentication:

**Root `docker-compose.yml`:**
```yaml
redis:
  command: redis-server --requirepass ${REDIS_PASSWORD}
  environment:
    - REDIS_PASSWORD=${REDIS_PASSWORD}
```

**Coordinator `docker/docker-compose.yml`:**
```yaml
cfn-redis:
  command: redis-server --requirepass ${CFN_REDIS_PASSWORD}  # ❌ NOT DEFINED
cfn-coordinator:
  environment:
    - CFN_REDIS_PASSWORD=${CFN_REDIS_PASSWORD:-}  # ❌ EMPTY
```

## Impact

**Production coordinator deployment had NO Redis authentication:**
- `.env` defines `REDIS_PASSWORD=<secure-value>`
- Coordinator compose referenced `CFN_REDIS_PASSWORD` (not defined)
- Result: `CFN_REDIS_PASSWORD` was empty → Redis had no password
- CVSS Score: 9.1/10 (unauthenticated network access to coordination layer)

## Root Cause

Environment variable naming inconsistency between:
1. **Legacy standard:** `REDIS_PASSWORD` (defined in `.env`)
2. **New standard:** `CFN_REDIS_PASSWORD` (runtime contract preference)
3. **Actual deployment:** Used new standard without updating `.env`

## Fix

Standardized to `REDIS_PASSWORD` (the variable actually defined in `.env`):

### File: `docker/docker-compose.yml`

**Changed 3 occurrences:**

1. **Redis command line:**
```diff
-    command: redis-server --save 60 1 --loglevel warning --requirepass ${CFN_REDIS_PASSWORD}
+    command: redis-server --save 60 1 --loglevel warning --requirepass ${REDIS_PASSWORD}
```

2. **Redis healthcheck:**
```diff
-      test: ["CMD", "redis-cli", "-a", "${CFN_REDIS_PASSWORD}", "ping"]
+      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
```

3. **Coordinator environment:**
```diff
-      - CFN_REDIS_PASSWORD=${CFN_REDIS_PASSWORD:-}
+      - CFN_REDIS_PASSWORD=${REDIS_PASSWORD:-}
```

**Why this works:**
- Redis container now reads password from `${REDIS_PASSWORD}` (defined in `.env`)
- Coordinator receives password as `CFN_REDIS_PASSWORD` environment variable (what code expects)
- Value flows: `.env REDIS_PASSWORD` → compose substitution → container `CFN_REDIS_PASSWORD`

## Validation

**Test:** `tests/security/test-redis-password-consistency.sh`

```bash
✅ Test 1: Both Redis containers use ${REDIS_PASSWORD}
✅ Test 2: .env defines REDIS_PASSWORD  
✅ Test 3: Coordinator maps REDIS_PASSWORD to CFN_REDIS_PASSWORD
```

**Manual verification:**
```bash
# Both files now use same variable source
grep 'requirepass.*REDIS_PASSWORD' docker-compose.yml
grep 'requirepass.*REDIS_PASSWORD' docker/docker-compose.yml

# Coordinator receives password correctly  
grep 'CFN_REDIS_PASSWORD=\${REDIS_PASSWORD' docker/docker-compose.yml
```

## Prevention

**Pre-deployment checklist:**
1. Verify all environment variables in compose files are defined in `.env`
2. Run `docker-compose config` to validate variable substitution
3. Check coordinator logs for Redis connection errors
4. Execute `tests/security/test-redis-password-consistency.sh` before deployment

**Runtime contract note:**
The environment variable contract (`docker/runtime/cfn-runtime.contract.yml`) shows:
- Standard: `CFN_REDIS_PASSWORD`
- Legacy aliases: `REDIS_PASSWORD`, `MCP_REDIS_PASSWORD`

For production, we use `REDIS_PASSWORD` in `.env` and map it to `CFN_REDIS_PASSWORD` inside containers. This maintains compatibility while using the defined variable.

## Security Impact Resolved

- ✅ Redis authentication enabled in production coordinator deployments
- ✅ Consistent variable usage across all Docker Compose files
- ✅ Automated test coverage prevents regression
- ✅ CVSS 9.1/10 vulnerability eliminated

**Confidence:** 0.95
