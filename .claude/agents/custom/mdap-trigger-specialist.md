---
name: mdap-trigger-specialist
description: DEPRECATED: This agent was specialized for MDAP and Trigger.dev workflows. Trigger.dev has been removed from CFN Loop architecture.
model: opus
tags: [mdap, deprecated, trigger-dev, decomposition, tier-escalation, coordinator, sprint-aggregation, cerebras, cli-mode, troubleshooting, cfn-loop]
priority: P0
skills: [mdap-context-injection]
version: 1.2.0
status: DEPRECATED
---

# ⚠️ DEPRECATED: MDAP/Trigger Workflow Specialist

**This agent has been deprecated.**
**Trigger.dev infrastructure has been completely removed from CFN Loop.**

## Migration Information

The MDAP functionality has been migrated to local orchestration:
- **Previous**: `docker/trigger-dev/src/trigger/` (removed)
- **Current**: `lib/mdap/` (local implementation)

## Current Architecture

### MDAP Mode (Local Implementation)
- Fast Cerebras API (~500ms-3s per micro-task)
- Local Promise.all() orchestration
- No external dependencies
- Tier escalation (T1→T2→T3) preserved

### CLI Mode
- Claude CLI sprint execution (~60-180s per sprint)
- Local coordination
- Sprint aggregation preserved

## Key Files (Current)

### Local MDAP Implementation
- `lib/mdap/` - Core MDAP logic (migrated from docker/trigger-dev)
- `lib/mdap/mdap-config.ts` - Tier definitions and atomicity
- `lib/mdap/sprint-aggregator.ts` - Sprint grouping logic
- `lib/mdap/coordinator.ts` - Main orchestration

### Commands
- `.claude/commands/cfn-loop/cfn-loop-cli.md` - CLI mode execution
- `.claude/commands/cfn-loop/cfn-loop-task.md` - Task mode execution

## Removal Details

**Removed in Sprint 5.4 (2025-12-07):**
- Entire `docker/trigger-dev/` directory (302MB)
- All Trigger.dev dependencies
- External orchestration requirements
- Redis coordination (for Trigger.dev mode)

## Preserved Functionality

The following features have been preserved with local implementation:
- ✅ MDAP micro-task execution
- ✅ Tier escalation (T1→T2→T3)
- ✅ Sprint aggregation
- ✅ 5-phase coordinator flow
- ✅ Async validation
- ✅ Gate checking
- ✅ Error recovery

## For Troubleshooting

For MDAP-related issues, use:
- `cfn-system-expert` agent for system-level troubleshooting
- `cfn-loops-cli-expert` for CLI mode issues
- Direct inspection of `lib/mdap/` implementation

## Documentation

- Migration report: `planning/phases/sprints/SPRINT_5_4_COMPLETION_REPORT.md`
- Current CFN Loop architecture: See README.md
- MDAP implementation: `lib/mdap/README.md` (if exists)

---
*Last updated: 2025-12-09*
*Status: DEPRECATED - Use local MDAP implementation instead*