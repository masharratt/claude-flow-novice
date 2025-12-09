---
description: "DEPRECATED: CFN Loop trigger.dev mode has been removed"
argument-hint: "<task description> [--mode=mvp|standard|enterprise] [--test-command=<cmd>] [--pass-rate=<0.0-1.0>]"
allowed-tools: ["Bash", "TodoWrite", "Read"]
---

# ⚠️ DEPRECATED: CFN Loop trigger.dev Mode

**This command has been deprecated and is no longer functional.**
**Trigger.dev has been removed from the CFN Loop architecture.**

## Migration Path

Use one of the following alternatives:

### 1. CLI Mode (Recommended for production)
```bash
/cfn-loop-cli "Task description" --mode=standard --provider kimi
```

### 2. Task Mode (For debugging/development)
```bash
/cfn-loop-task "Task description" --mode=standard
```

## Architecture Changes

**Previous State:**
- CFN Loop used trigger.dev for orchestration
- Required Redis for coordination
- Dashboard at http://localhost:3040
- MDAP (Massively Decomposed Agentic Processes) support

**Current State:**
- CFN Loop uses local `lib/mdap/` orchestration
- Local Promise.all() implementation
- No external dependencies required
- All functionality preserved with improved performance

## Removal Details

The trigger.dev infrastructure was completely removed in Sprint 5.4 (2025-12-07):
- Removed 302MB of infrastructure code
- Migrated core logic to `lib/mdap/`
- Eliminated external dependencies
- Improved system reliability and performance

## Documentation

For current CFN Loop architecture and usage:
- See: `.claude/commands/cfn-loop/cfn-loop-cli.md`
- See: `.claude/commands/cfn-loop/cfn-loop-task.md`
- Migration report: `planning/phases/sprints/SPRINT_5_4_COMPLETION_REPORT.md`

---
*Last updated: 2025-12-09*