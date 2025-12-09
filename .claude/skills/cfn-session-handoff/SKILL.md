---
name: cfn-session-handoff
type: skill
description: Session handoff functionality is provided by the handoff-coordinator agent
version: 1.0.0
status: delegated
triggers:
  - When: Session transition or context reset is needed
  - Who: Teams requiring handoff documentation
usage: See handoff-coordinator agent at .claude/agents/cfn-dev-team/coordinators/handoff-coordinator.md
---

# CFN Session Handoff

## Status: DELEGATED TO AGENT

This skill's functionality is now provided by the **handoff-coordinator agent**.

## Actual Implementation Location

`.claude/agents/cfn-dev-team/coordinators/handoff-coordinator.md`

## Usage

Instead of using this skill, invoke the handoff-coordinator agent directly:

```bash
npx claude-flow-novice agent-spawn handoff-coordinator \
  --task-id "handoff-$(date +%s)" \
  --prompt "Create session handoff for [domain], duration: [hours], focus: [areas]"
```

## Features Provided by Agent

- Extracts recent context from conversation history
- Generates comprehensive handoff documentation
- Creates smoke test scripts for validation
- Maintains context continuity across sessions

## Migration Note

This skill was deprecated in favor of the agent-based approach which provides:
- Better integration with CFN Loop
- More sophisticated context extraction
- Direct agent-to-agent communication
- Automated session state management

## Documentation Retained

This SKILL.md is retained for:
- Historical reference
- Search visibility
- Redirecting users to the actual implementation