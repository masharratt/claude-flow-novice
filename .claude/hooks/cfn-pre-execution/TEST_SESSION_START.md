# Testing Session Start Hook

## How to Verify It Works

The session start hook will automatically execute in these scenarios:

### 1. **New Session** (startup)
When you first start Claude Code:
```bash
claude-code
```

You should see the context output displayed before the first prompt:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 SESSION START: Loading Project Context
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
...
```

### 2. **Resume Session** (resume)
When you resume a saved session:
```bash
claude-code --resume
claude-code --continue
# or use /resume command
```

The hook will run again, showing current project context.

### 3. **Clear Session** (clear)
After running `/clear` command:
```
User: /clear
[Session cleared]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 SESSION START: Loading Project Context
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
...
```

## Quick Test (Manual)

If you want to see what the output looks like right now:

```bash
bash .claude/hooks/cfn-pre-execution/session-start-context.sh
```

Expected output:
- ✅ CLAUDE.md loaded confirmation
- 📌 Quick reference with CFN Loop modes
- CTO Delegation guidelines
- Test-driven gate thresholds
- Environment status (Redis, Docker, custom routing)

## What You'll See

**Successful Hook Execution:**
- Context summary appears at session start
- Key project patterns displayed
- Environment status visible
- Ready to work message

**Hook Not Working:**
- No output at session start
- Check `.claude/hooks.json` configuration
- Verify hook script is executable: `ls -l .claude/hooks/cfn-pre-execution/session-start-context.sh`
- Check for errors: `bash -x .claude/hooks/cfn-pre-execution/session-start-context.sh`

## Troubleshooting

### Hook doesn't run automatically
1. Check hooks configuration:
   ```bash
   cat .claude/hooks.json | grep -A 10 "SessionStart"
   ```

2. Verify script permissions:
   ```bash
   chmod +x .claude/hooks/cfn-pre-execution/session-start-context.sh
   ```

3. Test manually:
   ```bash
   bash .claude/hooks/cfn-pre-execution/session-start-context.sh
   ```

### Script errors
Check for line ending issues (CRLF vs LF):
```bash
file .claude/hooks/cfn-pre-execution/session-start-context.sh
# Should show: "with LF line terminators" (not CRLF)

# Fix if needed:
sed -i 's/\r$//' .claude/hooks/cfn-pre-execution/session-start-context.sh
```

## Configuration

Hook configuration in `.claude/hooks.json`:
```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume|clear",
        "hooks": [
          {
            "type": "command",
            "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/cfn-pre-execution/session-start-context.sh\"",
            "description": "Load project context from CLAUDE.md at session start"
          }
        ]
      }
    ]
  }
}
```

## Next Session Test

**To verify the hook is working:**
1. End current session
2. Start new Claude Code session
3. Look for the context output before first prompt
4. If you see the formatted output with CLAUDE.md content → ✅ Working!
5. If you don't see anything → Check troubleshooting steps above
