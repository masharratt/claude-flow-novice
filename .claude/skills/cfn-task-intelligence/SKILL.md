---
name: cfn-task-intelligence
description: "DEPRECATED. Consolidated into cfn-task-planning. Task classification, complexity/iteration estimation, and specialist recommendation now live there."
version: 1.1.0
tags: deprecated, redirect
status: deprecated
---

# Deprecated: consolidated into cfn-task-planning

This skill is deprecated. Task classification (type/domain), complexity + iteration
estimation, and specialist recommendation are now documented in one home:

`.claude/skills/cfn-task-planning/SKILL.md`

## Why
Classification, complexity estimation, and specialist recommendation overlapped
three ways across cfn-task-planning, cfn-task-intelligence, and cfn-agent-lifecycle.
cfn-task-planning is the single documented home. cfn-agent-lifecycle keeps agent
selection and spawning; it consumes cfn-task-planning's classification instead of
duplicating it.

## Scripts still live here (runnable, referenced by cfn-task-planning)
The directory is retained so nothing 404s and its scripts stay callable. They are
the canonical implementations referenced from cfn-task-planning:
- `lib/complexity/estimate-complexity.sh`: complexity + iteration estimation
- `lib/specialist/recommend-specialist.sh`: specialist from recurring feedback themes
- `lib/integration/`: pre-execution and post-feedback hooks (learning loop)
- `lib/classifier/classify-task.sh`: classification (cfn-task-planning's own
  `cli/classify-task.sh` is the preferred entry point)

Do not add new task-planning documentation here. Update cfn-task-planning instead.
