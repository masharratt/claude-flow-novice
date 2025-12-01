# Bug Report: CFN CLI Mode Coordination Failures

## Summary
Three critical bugs prevented CFN CLI Mode from successfully completing agent coordination. All bugs were discovered through live testing on 2025-11-26.

## Bug #1: Provider Routing Not Working

**Symptom**: All agents spawned with `--provider=kimi` failed with authentication errors
```
authentication_error: invalid x-api-key
status: 401
```

**Root Cause**: Environment variable mismatch
- Agent spawner set `PROVIDER` env var
- API client only checked `CLAUDE_API_PROVIDER` env var
- Agents defaulted to Anthropic (wrong fallback)

**Files Modified**:
- src/cli/anthropic-client.ts:22 - Check both CLAUDE_API_PROVIDER and PROVIDER
- src/cli/anthropic-client.ts:23 - Change default from 'anthropic' to 'zai'
- src/cli/agent-spawner.ts:85 - Set both PROVIDER and CLAUDE_API_PROVIDER
- src/cli/agent-executor.ts:15 - Check both env vars for provider

**Fix**: 
```typescript
// Before
const provider = process.env.CLAUDE_API_PROVIDER || 'anthropic';

// After
const provider = process.env.CLAUDE_API_PROVIDER || process.env.PROVIDER || 'zai';
```

## Bug #2: Redis Hostname Hardcoded for Docker

**Symptom**: Agents executed work but never sent completion signals
```
Could not connect to Redis at cfn-redis:6379: Temporary failure in name resolution
```

**Root Cause**: 13 source files had `process.env.CFN_REDIS_HOST || 'cfn-redis'`
- CLI mode runs on host machine (not Docker)
- Host execution requires `localhost:6379`
- `cfn-redis` is only valid inside Docker networks

**Files Modified** (13 total):
- src/cli/agent-executor.ts:84
- src/cli/anthropic-client.ts:22
- src/cli/agent-spawn.ts:45
- src/cli/cfn-context.ts:18
- src/cli/iteration-history.ts:15
- src/cli/cfn-redis.ts:12
- src/cli/cfn-metrics.ts:25
- src/cli/conversation-fork.ts:28
- src/cli/conversation-fork-cleanup.ts:18
- src/cli/agent-token-manager.js:8
- src/mcp/playwright-mcp-server-auth.js:15
- src/mcp/auth-middleware.js:12
- src/agent/skill-mcp-selector.js:22

**Fix**:
```typescript
// Before
const redisHost = process.env.CFN_REDIS_HOST || 'cfn-redis';

// After
const redisHost = process.env.CFN_REDIS_HOST || 'localhost';
```

## Bug #3: Redis Queue Key Format Mismatch

**Symptom**: Even after source code fixes, agents still couldn't signal completion

**Root Cause**: Agent prompt template and executor used wrong queue key format
- Template generated: `cfn-completion:${taskId}`
- Monitor expected: `cfn:cli:${taskId}:completion`
- Agents were signaling to a queue that no one was monitoring

**Files Modified** (3 instances):
- src/cli/agent-prompt-builder.ts:66 - Agent completion protocol template
- src/cli/agent-prompt-builder.ts:94 - Documentation comment
- src/cli/agent-executor.ts:285 - Main Chat signaling key
- src/cli/agent-executor.ts:287 - Debug log message

**Fix**:
```typescript
// Before
const signalKey = `cfn-completion:${process.env.TASK_ID}`;

// After
const signalKey = `cfn:cli:${process.env.TASK_ID}:completion`;
```

## Test Results

### First CLI Loop (Task ID: cfn-cli-082324-19737)
- **Result**: FAILED
- **Cause**: Bug #1 (provider routing)
- **Agents**: 4/4 failed with authentication errors

### Second CLI Loop (Task ID: cfn-cli-290874-15345)
- **Result**: FAILED
- **Cause**: Bug #2 (Redis hostname)
- **Fixes Applied**: Bug #1 only
- **Agents**: Spawned successfully with Z.ai, but no completion signals

### Third CLI Loop (Task ID: cfn-cli-145129-14391)
- **Result**: FAILED
- **Cause**: Bug #3 (queue key format)
- **Fixes Applied**: Bugs #1 and #2
- **Agents**: Spawned and executed, but signaled to wrong queue

## Resolution Status

**All 3 bugs fixed as of 2025-11-26**
- ✅ Provider routing: Default to Z.ai, check both env vars
- ✅ Redis hostname: Default to localhost for CLI mode
- ✅ Queue key format: Standardized to `cfn:cli:${taskId}:completion`

## Next Steps

1. Retry CFN CLI Loop with all 3 fixes applied
2. Validate end-to-end coordination workflow
3. Add integration tests for:
   - Provider routing in CLI mode
   - Redis connection with localhost default
   - Completion queue key format

## Investigation Notes

User's insight was critical: "verify that, we purged tge agent profiles of redis commands previously. it might be in the prompt injection we do for clinmode"

This directed investigation to agent-prompt-builder.ts where the queue key format was found hardcoded in the CLI Mode completion protocol template.

## Related Files

- Planning: planning/cli-changes-november/CLI_MODE_REDIS_COORDINATION_HANDOFF.md
- Expert Agent: .claude/agents/custom/cfn-loops-cli-expert.md
- Test Suite: tests/cli-mode/run-all-tests.sh
