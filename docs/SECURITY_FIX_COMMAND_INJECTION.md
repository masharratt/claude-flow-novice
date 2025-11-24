# Security Fix: Command Injection Vulnerability in agent-executor.ts

**Date:** 2025-11-24
**Severity:** CRITICAL (CVSS 9.8 - Arbitrary Command Execution)
**Status:** FIXED
**File:** `src/cli/agent-executor.ts`

## Vulnerability Summary

The `executeCFNProtocol()` function (lines 169-174 in original code) contained a critical command injection vulnerability where unsanitized task IDs and agent IDs were interpolated into Redis CLI shell commands.

### Vulnerable Code Pattern

```typescript
// VULNERABLE - Lines 169, 174
const authFlag = redisPassword ? `-a "${redisPassword}"` : '';

// Orchestrator signal - Shell command with interpolated taskId/agentId
await execAsync(`redis-cli -h "${redisHost}" -p "${redisPort}" ${authFlag} lpush "swarm:${taskId}:${agentId}:done" "complete"`);

// Main Chat signal - Shell command with interpolated JSON
const agentMetadata = JSON.stringify({ agentId, taskId, status: 'completed', iteration, confidence: extractConfidence(output) });
await execAsync(`redis-cli -h "${redisHost}" -p "${redisPort}" ${authFlag} lpush "cfn-completion:${taskId}" '${agentMetadata}'`);
```

### Attack Vectors

1. **Command Injection via taskId:**
   ```
   taskId = "task; rm -rf /"
   Result: redis-cli lpush "swarm:task; rm -rf /:agentId:done" "complete"
   Executes: lpush command AND rm -rf
   ```

2. **Command Injection via agentId:**
   ```
   agentId = "agent`whoami`"
   Result: redis-cli lpush "swarm:taskId:agent`whoami`:done" "complete"
   Executes: lpush AND whoami commands
   ```

3. **Shell Escape via agentMetadata:**
   ```
   agentMetadata contains: '; DROP TABLE users--
   Result: redis-cli lpush "cfn-completion:taskId" '...; DROP TABLE users--...'
   Executes: lpush AND SQL injection (if Redis has SQL capabilities)
   ```

## Impact Assessment

**Exploitability:** HIGH - No authentication required to control taskId/agentId parameters
**Impact:** CRITICAL - Arbitrary command execution with process privileges
**Affected Components:**
- Agent coordination protocol
- Redis completion signaling
- Task lifecycle management

## Security Fix Implementation

### 1. Input Validation

Added strict validation functions to reject invalid characters before use:

```typescript
/**
 * Validate task ID format to prevent command injection
 * Allows: alphanumeric, hyphens, underscores
 */
function validateTaskId(taskId: string): void {
  if (!taskId || !/^[a-zA-Z0-9_-]+$/.test(taskId)) {
    throw new Error(`Invalid task ID format: "${taskId}". Must contain only alphanumeric characters, hyphens, and underscores.`);
  }
}

/**
 * Validate agent ID format to prevent command injection
 * Allows: alphanumeric, hyphens, underscores
 */
function validateAgentId(agentId: string): void {
  if (!agentId || !/^[a-zA-Z0-9_-]+$/.test(agentId)) {
    throw new Error(`Invalid agent ID format: "${agentId}". Must contain only alphanumeric characters, hyphens, and underscores.`);
  }
}
```

**Validation Pattern:** `^[a-zA-Z0-9_-]+$`
- Only allows: alphanumeric (a-z, A-Z, 0-9), hyphens (-), underscores (_)
- Rejects: quotes, backticks, semicolons, pipes, redirects, and all shell metacharacters

### 2. Eliminate Shell Command Interpolation

Replaced `redis-cli` shell commands with Redis client library calls:

```typescript
// Import Redis client
import { createClient, RedisClientType } from 'redis';

// Create secure connection helper
async function createRedisClient(): Promise<RedisClientType> {
  const portNum = parseInt(redisPort, 10);

  const client = createClient({
    host: redisHost,
    port: portNum,
    password: redisPassword || undefined,
    socket: {
      reconnectStrategy: (retries) => Math.min(retries * 50, 500),
      connectTimeout: 5000,
    },
  });

  await client.connect();
  return client;
}
```

### 3. Parameterized Redis Calls

Use Redis client methods with proper parameter passing (no shell interpolation):

```typescript
// Before: Shell command with interpolation
await execAsync(`redis-cli -h "${redisHost}" -p "${redisPort}" ${authFlag} lpush "swarm:${taskId}:${agentId}:done" "complete"`);

// After: Parameterized Redis call
const orchestratorKey = `swarm:${taskId}:${agentId}:done`;
await redisClient.lPush(orchestratorKey, 'complete');
```

The difference:
- **Before:** Shell parses the command string, allowing injection
- **After:** Key name passed directly to Redis client, no shell parsing

### 4. Proper Resource Cleanup

Implemented try/finally pattern for Redis connection management:

```typescript
let redisClient: RedisClientType | null = null;

try {
  redisClient = await createRedisClient();
  // ... Redis operations ...
} catch (error) {
  console.error('[CFN Protocol] Error:', error);
  throw error;
} finally {
  // Always close the Redis connection
  if (redisClient) {
    await redisClient.quit();
  }
}
```

## Security Testing

### Validation Test Results

```
Testing validateTaskId...
✓ Valid task IDs accepted: task-123, task_456, abc123
✓ All command injection attempts blocked

Attack vectors tested:
❌ task; rm -rf /                  [BLOCKED]
❌ task"; lpush "key" "data"       [BLOCKED]
❌ task` whoami`                   [BLOCKED]
❌ task$(command)                  [BLOCKED]
❌ task'; DROP TABLE--              [BLOCKED]
❌ task' OR '1'='1                  [BLOCKED]

Security fix validation: PASSED ✓
```

## Code Changes Summary

### File: `src/cli/agent-executor.ts`

**Lines Changed:**
1. Added Redis import (line 13):
   ```typescript
   import { createClient, RedisClientType } from 'redis';
   ```

2. Added validation functions (lines 68-90):
   - `validateTaskId()` - Input validation for task IDs
   - `validateAgentId()` - Input validation for agent IDs

3. Added helper function (lines 92-112):
   - `createRedisClient()` - Secure Redis client creation

4. Modified `executeCFNProtocol()` function (lines 199-266):
   - Added input validation calls (lines 210-212)
   - Replaced shell commands with parameterized Redis calls (lines 220-237)
   - Added proper resource cleanup (lines 261-264)

**Removed Vulnerable Patterns:**
- ❌ `redis-cli` shell commands with interpolation
- ❌ JSON string passed in single quotes to shell
- ❌ Password passed to shell command

**Added Secure Patterns:**
- ✅ Input validation regex patterns
- ✅ Redis client library usage
- ✅ Parameterized method calls
- ✅ Proper connection lifecycle management

## Verification Checklist

- [x] Input validation prevents all shell metacharacters
- [x] Redis client library replaces redis-cli commands
- [x] No shell interpolation of user inputs
- [x] Proper error handling with try/catch/finally
- [x] Connection cleanup in finally block
- [x] Post-edit validation passing
- [x] No syntax errors in TypeScript
- [x] Command injection test vectors all blocked

## Recommendations for Future Work

1. **Extend validation:** Consider updating other agent spawning functions with similar patterns
2. **Automated testing:** Add security tests to CI/CD pipeline to catch shell command patterns
3. **Code review:** Establish guidelines prohibiting execAsync with string interpolation
4. **Dependency updates:** Keep redis library updated for security patches

## Related CVEs

- CWE-78: Improper Neutralization of Special Elements used in an OS Command
- CWE-94: Improper Control of Generation of Code
- OWASP A03:2021 - Injection

## References

- [OWASP Command Injection](https://owasp.org/www-community/attacks/Command_Injection)
- [CWE-78](https://cwe.mitre.org/data/definitions/78.html)
- [Node.js Child Process Documentation](https://nodejs.org/api/child_process.html)
- [Redis Client Security](https://github.com/redis/node-redis/security)
