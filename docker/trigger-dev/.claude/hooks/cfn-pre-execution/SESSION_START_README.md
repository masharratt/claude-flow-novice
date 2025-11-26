# Session Start Context Hook

## Purpose

Automatically loads project context at the beginning of each Claude Code session by reading `CLAUDE.md` and displaying key project guidelines, CFN Loop configuration, and environment status.

## Location

`.claude/hooks/cfn-pre-execution/session-start-context.sh`

## Trigger

This hook is designed to run automatically at session initialization when integrated with Claude Code's hook system.

## Manual Execution

```bash
bash .claude/hooks/cfn-pre-execution/session-start-context.sh
```

## What It Does

1. **Reads CLAUDE.md** from project root
2. **Extracts Key Information:**
   - Available CFN Loop execution modes (Task vs CLI)
   - CTO Delegation persona guidelines
   - Test-driven validation thresholds (v3.0+)
3. **Checks Environment:**
   - Custom provider routing status
   - Redis CLI availability
   - Docker availability
4. **Displays Quick Reference** for immediate context

## Example Output

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 SESSION START: Loading Project Context
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ CLAUDE.md loaded
   Location: /path/to/project/CLAUDE.md

📌 Quick Reference:

   CFN Loop Modes Available:
   • /cfn-loop-task (Task Mode - Debugging, Full Visibility)
   • /cfn-loop-cli  (CLI Mode - Production, 64% Cost Savings)

   Active Persona: CTO Delegation
   • Delegate all non-trivial work (>3 steps)
   • Use CFN Loop slash commands for complex tasks
   • Define success criteria, not adoption metrics

   Test-Driven Gates (v3.0+):
   • Standard Mode: ≥0.95 pass rate (Loop 3), ≥0.90 consensus (Loop 2)
   • MVP Mode: ≥0.70 pass rate, ≥0.80 consensus
   • Enterprise: ≥0.98 pass rate, ≥0.95 consensus

🔧 Environment Status:
   • Custom Provider Routing: DISABLED (default)
   • Redis CLI: Available
   • Docker: Available

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ Ready to delegate. Use /cfn-loop-cli or /cfn-loop-task for complex work.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Integration with Claude Code

To enable automatic execution at session start, this hook would need to be registered with Claude Code's hook system. The exact integration method depends on Claude Code's session lifecycle hooks implementation.

## Benefits

- **Immediate Context**: No need to manually reference CLAUDE.md
- **Quick Reference**: Key patterns and modes displayed upfront
- **Environment Awareness**: Instant visibility into available tools
- **Consistency**: All sessions start with same baseline context

## Customization

Edit `.claude/hooks/cfn-pre-execution/session-start-context.sh` to:
- Add/remove extracted sections from CLAUDE.md
- Modify environment checks
- Change output formatting
- Add project-specific context
