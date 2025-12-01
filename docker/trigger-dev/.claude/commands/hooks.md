---
description: "Automation hooks management"
argument-hint: "<action> [parameters]"
allowed-tools: ["Bash", "mcp__claude-flow-novice__memory_usage"]
---

# Automation Hooks Management

Manage automation hooks for pre/post operations and session coordination.

**Action**: $ARGUMENTS

**Available Hook Actions**:
- `enable` - Enable all automation hooks
- `disable` - Disable automation hooks
- `pre-task "<description>"` - Execute pre-task hook
- `post-task "<task-id>"` - Execute post-task hook
- `session-start` - Start coordination session
- `session-end` - End session with summary
- `notify "<message>"` - Send notification to swarm

**Hook Types**:

## Pre-Operation Hooks
- **Pre-Command**: Validate commands for safety
- **Pre-Edit**: Auto-assign agents by file type
- **Pre-Task**: Prepare resources and context

## Post-Operation Hooks
- **Post-Command**: Track metrics and results
- **Post-Edit**: Auto-format code and update memory
- **Post-Task**: Store completion data

## Session Hooks
- **Session Start**: Initialize coordination context
- **Session End**: Generate summaries and persist state

Execute the specified hook action and coordinate with the claude-flow-novice system for automation.