# Bug #6: Redis Variable Name Mismatch

**Status:** FIXED
**Priority:** Critical
**Impact:** Blocks all Docker test phases - agents cannot connect to Redis coordination layer
**Fixed:** 2025-11-13

## Problem Statement

Node.js CLI files used escaped shell variable syntax `\${CFN_REDIS_HOST:-cfn-redis}` in TypeScript template strings passed to `execSync()` and `execAsync()`. This prevented proper variable expansion, causing agents to fail with "Could not connect to Redis at 127.0.0.1:6379: Connection refused" errors.

## Root Cause

When TypeScript template strings contain `\${VARIABLE}`, the backslash escapes the dollar sign, resulting in the literal string "${VARIABLE}" being passed to the shell command instead of the environment variable value. While the shell can expand variables, the command string was not being executed in a shell context that properly expanded these variables.

### Example of Broken Pattern:
```typescript
// WRONG: Escaped dollar signs don't get interpolated
execSync(`redis-cli -h \${CFN_REDIS_HOST:-cfn-redis} -p \${CFN_REDIS_PORT:-6379} get "key"`);
// Results in: redis-cli -h ${CFN_REDIS_HOST:-cfn-redis} -p ${CFN_REDIS_PORT:-6379} get "key"
// Shell doesn't expand because the $ is escaped
```

### Correct Pattern:
```typescript
// CORRECT: Read env vars in TypeScript and interpolate directly
const redisHost = process.env.CFN_REDIS_HOST || 'cfn-redis';
const redisPort = process.env.CFN_REDIS_PORT || '6379';
execSync(`redis-cli -h ${redisHost} -p ${redisPort} get "key"`);
// Results in: redis-cli -h cfn-redis -p 6379 get "key"
```

## Symptoms

1. Agents fail to connect to Redis with "Connection refused at 127.0.0.1:6379"
2. Coordinator shows "0/16 tasks, 16 queued" despite successful Docker network setup
3. Agent heartbeat monitoring fails
4. Epic context retrieval fails
5. Conversation fork management fails
6. Iteration history retrieval fails

## Files Fixed

### Modified Files (6 total):
1. `src/cli/agent-spawn.ts` - Epic/phase context retrieval (3 redis-cli calls)
2. `src/cli/anthropic-client.ts` - Agent heartbeat monitoring (3 redis-cli calls)
3. `src/cli/conversation-fork.ts` - Message storage and fork management (11 redis-cli calls)
4. `src/cli/iteration-history.ts` - Result/feedback storage (5 redis-cli calls)
5. `src/cli/agent-executor.ts` - Completion signaling (1 redis-cli call)
6. `src/cli/cfn-context.ts` - Context operations (6 redis-cli calls)

**Total redis-cli calls fixed:** 29

## Solution Implementation

### Phase 1: Variable Declaration
Added module-level Redis connection variables to each affected file:

```typescript
// Bug #6 Fix: Read Redis connection parameters from process.env
const redisHost = process.env.CFN_REDIS_HOST || 'cfn-redis';
const redisPort = process.env.CFN_REDIS_PORT || '6379';
```

### Phase 2: Command String Updates
Replaced all escaped shell variables with TypeScript variable interpolation:

**Before:**
```typescript
execSync(`redis-cli -h \${CFN_REDIS_HOST:-cfn-redis} -p \${CFN_REDIS_PORT:-6379} get "swarm:${taskId}:epic-context"`);
```

**After:**
```typescript
execSync(`redis-cli -h ${redisHost} -p ${redisPort} get "swarm:${taskId}:epic-context"`);
```

## Validation

### Test Command:
```bash
# Verify no escaped variables remain
grep -r "\\${CFN_REDIS" src/cli/

# Should return: No matches found
```

### Expected Behavior After Fix:
1. Agents successfully connect to Redis at `cfn-redis:6379` (Docker network)
2. Heartbeat monitoring works (30-second intervals)
3. Epic context loads from Redis
4. Conversation forks persist correctly
5. Iteration history retrieves past results
6. Coordinator shows accurate task counts

## Prevention

### Code Review Checklist:
- [ ] Never use `\${VARIABLE}` in TypeScript template strings for `execSync/execAsync`
- [ ] Always read environment variables using `process.env.VARIABLE`
- [ ] Interpolate TypeScript variables using `${variable}` (no backslash)
- [ ] Test Redis connections in Docker environment before committing

### Linting Rule Recommendation:
Add ESLint rule to detect escaped variables in shell commands:
```javascript
// Warn about \${VAR} in execSync/execAsync calls
"no-useless-escape": "error"
```

## Related Issues

- **Bug #4**: Coordinator architectural mismatch (FIXED - switched to Docker container status tracking)
- **Phase 0 Test Suite**: All Docker tests were blocked by this bug

## Impact Assessment

**Before Fix:**
- 0% agent completion success rate
- 100% Redis connection failures
- All 4 test phases blocked

**After Fix (Expected):**
- 100% agent connection success rate
- Proper heartbeat monitoring
- Unblocks Phase 1-4 testing

## References

- Test Suite Overview: `tests/docker/TEST_SUITE_OVERVIEW.md`
- Test Suite Execution: `tests/docker/TEST_SUITE_EXECUTION_PLAYBOOK.md`
- Redis Coordination: `.claude/skills/cfn-redis-coordination/SKILL.md`
- Docker Environment Standards: `docs/DOCKER_ENV_STANDARDIZATION.md`
