---
name: cfn-task-planning
description: Classify tasks (type/domain), estimate complexity + iterations, recommend specialists, init structured configs with scope boundaries, decompose complex tasks. Use when starting CFN Loop Task Mode (scope config before spawning), setting scope contracts, estimating loop count, or breaking one task into sequential subtasks.
version: 1.1.0
tags: planning, classification, complexity, specialists, scope, decomposition, task-mode
status: production
---

## What it does
Single home for task-level planning intelligence: (1) classify by type/domain/complexity → agent specializations, (2) estimate complexity + iteration count, (3) recommend specialists from recurring feedback themes, (4) initialize config with scope boundaries, deliverables, acceptance criteria, (5) decompose large tasks into subtasks within tool budgets.

Absorbed cfn-task-intelligence (now a deprecated redirect): classification, complexity/iteration estimation, and specialist recommendation are documented here. cfn-task-planning classifies and estimates; cfn-agent-lifecycle consumes that classification to select and spawn agents.

## When to use (6 triggers)
1. Starting CFN Loop Task Mode → Generate scope config before spawning
2. Analyzing complexity → Select right agents and iteration thresholds
3. Estimating iterations → How many loops before gates pass
4. Recurring feedback → After repeated themes (e.g. 3 security), recommend a specialist
5. Breaking down epics → Sequential subtasks when one agent can't complete
6. Scope contracts → Establish in/out-of-scope before implementation

## When NOT to use (4 anti-patterns)
1. Well-defined and scoped → Go straight to spawning
2. Real-time classification during execution → Planning phase only
3. CLI mode with Redis → CLI stores in Redis, this is for Task Mode configs
4. Simple single-step → Skip for trivial changes

## How to use
Step 1 Classify: `./cli/classify-task.sh "Create REST API..." --format=json`
Step 2 Estimate complexity + iterations: `$HOME/.claude/skills/cfn-task-intelligence/lib/complexity/estimate-complexity.sh --description "..."`
Step 3 Init: `./cli/init-config.sh --task-id cfn-phase-123 --task-description "..." --mode standard`
Step 4 Decompose: `./cli/decompose-task.sh --task-id ... --description "..." --complexity high`
Step 5 (after recurring feedback) Recommend specialist: `$HOME/.claude/skills/cfn-task-intelligence/lib/specialist/recommend-specialist.sh --current-loop3 "..." --feedback-themes "security,auth" --recurring-count 3`

## Canonical script locations
Classification, config, decomposition, and audit live in this skill (`cli/` + `lib/`). Complexity/iteration estimation and specialist recommendation are absorbed from the deprecated cfn-task-intelligence skill; its scripts stay runnable in place and are the canonical implementations:
- Complexity + iterations: `.claude/skills/cfn-task-intelligence/lib/complexity/estimate-complexity.sh`
- Specialist recommendation: `.claude/skills/cfn-task-intelligence/lib/specialist/recommend-specialist.sh`
- Feedback-loop integration hooks: `.claude/skills/cfn-task-intelligence/lib/integration/`

## Parameters
- **classify**: TASK_DESCRIPTION, --format (json/simple)
- **complexity**: --description (returns complexity, estimated_iterations 2-7, confidence 0.70-0.80, factors)
- **specialist**: --current-loop3, --feedback-themes, --recurring-count
- **init**: --task-id, --task-description, --mode (mvp/standard/enterprise)
- **decompose**: --task-id, --description, --tool-budget, --complexity

## Expected output
- **Classify**: `{task_type, complexity, keywords_matched, suggested_agents}`
- **Complexity**: `{complexity, estimated_iterations, confidence, factors, reasoning}`
- **Specialist**: `{add_specialist, reasoning, new_loop3_agents[]}`
- **Init**: `.cfn/task-configs/task-{id}.json` with scope, agents, thresholds, acceptance criteria
- **Decompose**: JSON array of subtasks with deliverables, tool_budget, estimated_effort

## Real-world example
"Add JWT auth" → classify backend → estimate complexity (high, ~6 iterations) → init config with deliverables `[src/auth/jwt.ts, tests/]` + acceptance criteria → hand classification to cfn-agent-lifecycle to select and spawn agents with known scope

## Related skills
- **cfn-agent-lifecycle** (`.claude/skills/cfn-agent-lifecycle/`): consumes this skill's classification to select and spawn agents. Planning classifies and estimates here; lifecycle selects and spawns there. Do not re-classify in lifecycle.
- **cfn-task-intelligence** (deprecated): consolidated into this skill. Its lib scripts remain the canonical complexity/specialist implementations referenced above.