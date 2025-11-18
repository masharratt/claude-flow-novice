# CLI Mode Redis Configuration Guide

## Overview

CFN Loop supports 3 execution modes. This guide explains how to configure Redis for CLI mode in different environments.

## Execution Modes Comparison

| Mode | Coordination | Redis Required | Use Case |
|------|--------------|----------------|----------|
| **Task Mode** | Main Chat via Task() | ❌ No | Debugging, learning, short tasks |
| **CLI Mode** | Coordinator via npx | ✅ Yes | Production, long tasks, cost optimization |
| **Docker Mode** | Container orchestration | ✅ Yes (built-in) | Multi-worktree teams, isolation |

---

## Task Mode (No Redis Required)

**Example:**
```bash
/cfn-loop-task "Create 6 hello world files" --mode=mvp
```

**How it works:**
- Main Chat spawns all agents directly via Task() tool
- No coordinator agent
- No Redis coordination needed
- Full visibility in Main Chat

**Result:** ✅ **VERIFIED WORKING** (created 6 language hello world files)

---

## CLI Mode Configuration

### Option 1: Non-Docker Environment (Localhost Redis)

**Prerequisites:**
- Redis server running on localhost:6379

**Configuration:**
```bash
export CFN_REDIS_HOST=localhost
export CFN_REDIS_PORT=6379

# Run CLI mode
/cfn-loop-cli "Your task description" --mode=mvp
```

**How it works:**
- TypeScript coordinator uses `process.env.CFN_REDIS_HOST || 'cfn-redis'`
- Bash scripts use `${CFN_REDIS_HOST:-${REDIS_HOST:-localhost}}`
- Falls back to localhost when CFN_REDIS_HOST is set

**Changes Made (commit e8c4ef683):**
1. `redis-functions.sh`: Added CFN_REDIS_HOST → REDIS_HOST → localhost fallback
2. `invoke-waiting-mode.sh`: Added CFN_REDIS_HOST → REDIS_HOST → localhost fallback

**Backward Compatibility:**
- ✅ Docker mode unchanged (uses "cfn-redis" service name)
- ✅ Existing REDIS_HOST env var still works (fallback)
- ✅ No breaking changes to any mode

---

### Option 2: Docker Environment (Service Discovery)

**Prerequisites:**
- Docker Compose running with cfn-redis service

**Configuration:**
```bash
# No environment variables needed
docker-compose up -d

# Redis accessible via service name "cfn-redis"
/cfn-loop-cli "Your task description" --mode=mvp
```

**How it works:**
- Docker DNS resolves "cfn-redis" to container IP automatically
- No env vars needed (defaults to "cfn-redis")
- Full isolation and multi-worktree support

---

## Environment Variable Priority

```
1. CFN_REDIS_HOST (TypeScript primary, bash primary)
2. REDIS_HOST (bash fallback only)
3. "localhost" (default fallback)
```

**TypeScript (src/cli/*.ts):**
```typescript
const redisHost = process.env.CFN_REDIS_HOST || 'cfn-redis';
const redisPort = process.env.CFN_REDIS_PORT || '6379';
```

**Bash (.claude/skills/cfn-redis-coordination/*.sh):**
```bash
export REDIS_HOST="${CFN_REDIS_HOST:-${REDIS_HOST:-localhost}}"
export REDIS_PORT="${CFN_REDIS_PORT:-${REDIS_PORT:-6379}}"
```

---

## Testing

### Verify Redis Connectivity

```bash
# Set environment
export CFN_REDIS_HOST=localhost
export CFN_REDIS_PORT=6379

# Test connection
redis-cli -h $CFN_REDIS_HOST -p $CFN_REDIS_PORT PING
# Expected: PONG
```

### Run Bug #6 Validation Test

```bash
bash tests/docker/validation/validate-bug6-redis-vars.sh
```

This test validates:
- ✅ CFN_REDIS_HOST/CFN_REDIS_PORT standardization
- ✅ Backward compatibility with REDIS_HOST
- ✅ Docker service name resolution

---

## Troubleshooting

### Error: "cfn-redis:6379: Temporary failure in name resolution"

**Cause:** CLI mode outside Docker without CFN_REDIS_HOST set

**Solution:**
```bash
export CFN_REDIS_HOST=localhost
export CFN_REDIS_PORT=6379
```

### Error: "Redis not available"

**Verify Redis is running:**
```bash
redis-cli PING
# or
redis-cli -h localhost -p 6379 PING
```

**Start Redis if needed:**
```bash
# Via Docker
docker run -d --name redis -p 6379:6379 redis:7-alpine

# Via system package manager
redis-server
```

---

## Mode Selection Guide

**Use Task Mode when:**
- Debugging CFN Loop behavior
- Learning how agents interact
- Task completes in <5 minutes
- Full visibility needed

**Use CLI Mode when:**
- Production deployments
- Long-running tasks (>10 min)
- Cost optimization important (95-98% savings)
- Background execution needed

**Use Docker Mode when:**
- Multiple developers with git worktrees
- Port/service isolation required
- Team coordination needed
- Container-based CI/CD

---

## Related Documentation

- Task Mode Guide: `.claude/commands/cfn/CFN_LOOP_TASK_MODE.md`
- CLI Mode Guide: `.claude/commands/cfn-loop-cli.md`
- Docker Mode Guide: `CLAUDE.md` (Multi-Worktree Docker Coordination section)
- Bug #6 Test: `tests/docker/validation/validate-bug6-redis-vars.sh`

---

**Version:** 1.0.0 (2025-11-18)
**Author:** Claude Code
**Commit:** e8c4ef683
