# CLI Mode Quick Fix Guide

**Issue:** Redis authentication failures in CLI mode
**Status:** ✅ FIXED
**Date:** 2025-11-18

---

## Quick Summary

**Problem:** CLI mode failed with `NOAUTH Authentication required` errors because Redis password wasn't passed to spawned coordinator.

**Solution:** Added `CFN_REDIS_PASSWORD`, `REDIS_PASSWORD`, and `PWD` to environment variable whitelist in `src/cli/agent-executor.ts`.

---

## Immediate Actions

### 1. Update Your Local Repository
```bash
git pull origin main
npm run build
```

### 2. Verify Redis Environment
```bash
# Check Redis password is set
echo "Redis password: ${CFN_REDIS_PASSWORD:+[SET]}"

# If not set, add to your environment
export CFN_REDIS_PASSWORD="your-redis-password"
# Or add to .env file
echo "CFN_REDIS_PASSWORD=your-redis-password" >> .env
```

### 3. Test CLI Mode
```bash
/cfn-loop-cli "Hello world test"

# Should see:
# ✅ Redis environment: localhost:6379
# ✅ Redis available and authenticated
# ✅ CFN Loop coordinator spawned successfully
```

---

## Common Errors (Now Fixed)

### ❌ Before Fix
```
Error: NOAUTH Authentication required
.claude/skills/cfn-loop-orchestration/orchestrate.sh failed
Success criteria in Redis contains invalid JSON
```

### ✅ After Fix
```
✅ Redis environment: localhost:6379
✅ Redis available and authenticated at localhost:6379
📋 Task ID: cfn-cli-1234567-89012
✅ CFN Loop coordinator spawned successfully
```

---

## Correct Agent Names

Use these exact names when specifying agents:

### ❌ Wrong (Generic Names)
```
frontend-developer
qa-tester
backend-engineer
```

### ✅ Correct (Actual Agent Files)
```
react-frontend-engineer
tester
backend-developer
```

**Quick Reference:**
```bash
# List all available agents
ls .claude/agents/cfn-dev-team/*/*.md | sed 's|.*/||' | sed 's|.md||' | sort
```

---

## Troubleshooting

### Redis Connection Issues
```bash
# Test Redis connectivity manually
redis-cli -h localhost -p 6379 -a "$CFN_REDIS_PASSWORD" PING

# Expected output: PONG
```

### Working Directory Issues
```bash
# Verify PWD is preserved
echo "Working directory: $PWD"

# Should be your project root
# Example: /home/user/projects/claude-flow-novice
```

### Agent Discovery Issues
```bash
# Check agent exists
ls .claude/agents/cfn-dev-team/*/react-frontend-engineer.md

# If not found, use correct name from:
find .claude/agents/cfn-dev-team/ -name "*.md"
```

---

## What Changed?

**File:** `src/cli/agent-executor.ts`

**Before:**
```typescript
const safeEnvVars = [
  'CFN_REDIS_HOST',
  'CFN_REDIS_PORT',
  // Missing: CFN_REDIS_PASSWORD ❌
  'PATH',
  'HOME'
];
```

**After:**
```typescript
const safeEnvVars = [
  'CFN_REDIS_HOST',
  'CFN_REDIS_PORT',
  'CFN_REDIS_PASSWORD',  // ✅ Added
  'REDIS_PASSWORD',      // ✅ Added (fallback)
  'PATH',
  'HOME',
  'PWD'                  // ✅ Added (working directory)
];
```

---

## Getting Help

**If you still see errors:**

1. Check Redis is running: `docker ps | grep redis`
2. Check password is set: `echo $CFN_REDIS_PASSWORD`
3. Check build is latest: `git log -1 --oneline`
4. Review full documentation: `docs/CLI_MODE_ORCHESTRATION_FIXES.md`

**Report issues with:**
- Task ID (e.g., cfn-cli-095578-2839)
- Full error message
- Redis connection test results

---

**Version:** 1.0
**Last Updated:** 2025-11-18
**See Also:** `docs/CLI_MODE_ORCHESTRATION_FIXES.md` (detailed analysis)
