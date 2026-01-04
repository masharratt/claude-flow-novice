# Test Memory Guard Hook

## Overview

The Test Memory Guard hook prevents npm/npx test runs without memory limits, protecting against memory leaks that can crash WSL.

## Location

- Hook script: `.claude/hooks/cfn-test-memory-guard.sh`
- Configuration: `.claude/settings.json` (PreToolUse:Bash hook)

## How It Works

1. **Intercepts Bash commands** before execution
2. **Detects test commands** (npm test, npx test, vitest, jest, mocha, playwright, etc.)
3. **Checks for memory limits** in the command
4. **Blocks** commands without memory limits (exit code 2)
5. **Allows** commands with memory limits

## Allowed Patterns

The hook allows test commands that include:

### 1. CFN Memory Wrapper
```bash
.claude/cfn-scripts/run-with-memory-limit.sh 2G npm test
```

### 2. NODE_OPTIONS
```bash
NODE_OPTIONS="--max-old-space-size=2048" npm test
```

### 3. Node Flag
```bash
node --max-old-space-size=2048 ./node_modules/.bin/vitest
```

### 4. Package.json Scripts (Pre-configured)
```bash
npm run test:unit          # 2G limit
npm run test:integration   # 4G limit
npm run test:e2e          # 6G limit
npm run test:cfn-v3       # Configured limit
```

## Blocked Patterns

Commands without memory limits are blocked:

```bash
npm test                  # ❌ Blocked
npx vitest run           # ❌ Blocked
npx jest                 # ❌ Blocked
npm run test             # ❌ Blocked (generic test script)
```

## Error Message

When a test command is blocked, you'll see:

```
🔴 BLOCKED: Test commands must include memory limits

Your command:
  npm test

Memory leaks in test runners can crash WSL. Use one of these patterns:

1. Use the CFN memory-limited wrapper:
   .claude/cfn-scripts/run-with-memory-limit.sh 2G npm test

2. Use NODE_OPTIONS:
   NODE_OPTIONS="--max-old-space-size=2048" npm test

3. Use package.json scripts (already configured):
   npm run test:unit    (2G limit)
   npm run test:integration (4G limit)
   npm run test:e2e (6G limit)

Why this matters:
- WSL Memory Monitor kills processes >10% memory
- Prevents system crashes from memory leaks
- Ensures consistent test behavior
```

## Integration with WSL Memory Monitor

This hook works alongside the WSL Memory Monitor:

- **Hook (Proactive)**: Prevents test runs without memory limits
- **Monitor (Reactive)**: Kills test processes exceeding 10% memory

Together, they provide defense-in-depth against memory leaks.

## Logging

Hook activity is logged to `/tmp/test-memory-guard.log`:

```bash
tail -f /tmp/test-memory-guard.log
```

## Configuration

Add to `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/hooks/cfn-test-memory-guard.sh",
            "timeout": 3
          }
        ]
      }
    ]
  }
}
```

## Customization

To add more whitelisted test scripts, edit line 30 in `cfn-test-memory-guard.sh`:

```bash
# Before
npm\s+run\s+test:(unit|integration|e2e|cfn-v3)

# After (add custom-test)
npm\s+run\s+test:(unit|integration|e2e|cfn-v3|custom-test)
```

## Testing

Test the hook manually:

```bash
# Should block
echo '{"tool_input":{"command":"npm test"}}' | \
  bash .claude/hooks/cfn-test-memory-guard.sh

# Should allow
echo '{"tool_input":{"command":"npm run test:unit"}}' | \
  bash .claude/hooks/cfn-test-memory-guard.sh
```

## Troubleshooting

### Hook not firing

1. Check hook is executable: `ls -l .claude/hooks/cfn-test-memory-guard.sh`
2. Check settings.json syntax: `jq . .claude/settings.json`
3. Check logs: `tail /tmp/test-memory-guard.log`

### False positives

If a legitimate test command is blocked:

1. Check if it includes memory limit syntax
2. Add to package.json scripts with memory wrapper
3. Or whitelist the pattern in the hook script

## Benefits

- ✅ Prevents memory leak crashes
- ✅ Enforces consistent test behavior
- ✅ Educates developers about memory limits
- ✅ Works transparently (no workflow changes needed for approved patterns)
- ✅ Clear, actionable error messages
