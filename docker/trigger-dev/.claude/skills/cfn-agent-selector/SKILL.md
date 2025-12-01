---
name: cfn-agent-selector
description: Selects appropriate Loop 3 and Loop 2 agents based on task classification
version: 1.0.0
tags: [agent-selection, cfn-loop, coordination]
---

# CFN Agent Selector Skill

Selects appropriate agents for CFN Loop execution based on task classification and mode.

## Usage

```bash
./.claude/skills/cfn-agent-selector/select-agents.sh \
  --classification <type> \
  [--mode <mode>] \
  [--loop <3|2>]
```

## Arguments

- `--classification <type>` - Task classification (comma-separated): frontend, backend, devops, testing, security, data, performance, general
- `--mode <mode>` - Execution mode: mvp, standard, enterprise (default: standard)
- `--loop <3|2>` - Output specific loop agents (3 for implementers, 2 for validators)

## Agent Mapping

### Loop 3 Agents (Implementation)

| Classification | Agent Type |
|----------------|------------|
| frontend | react-frontend-engineer |
| backend | backend-developer |
| devops | devops-engineer |
| testing | tester |
| security | security-specialist |
| data | database-architect |
| performance | performance-optimizer |
| general | backend-developer |

### Loop 2 Agents (Validation)

| Classification | Agent Types |
|----------------|-------------|
| frontend | code-reviewer, ui-designer |
| backend | code-reviewer, security-specialist |
| devops | code-reviewer, security-specialist |
| testing | code-reviewer, qa-specialist |
| security | code-reviewer, security-specialist |
| data | code-reviewer, database-architect |
| performance | code-reviewer, performance-benchmarker |
| general | code-reviewer, tester |

## Output Formats

### JSON (Default)

```bash
$ select-agents.sh --classification "frontend,backend" --mode standard
{
  "loop3": "backend-developer,react-frontend-engineer",
  "loop2": "code-reviewer,security-specialist,ui-designer",
  "mode": "standard",
  "classifications": "frontend,backend"
}
```

### Loop 3 Only

```bash
$ select-agents.sh --classification "frontend" --loop 3
react-frontend-engineer
```

### Loop 2 Only

```bash
$ select-agents.sh --classification "backend" --loop 2
code-reviewer,security-specialist
```

## Examples

```bash
# Full-stack task
$ select-agents.sh --classification "frontend,backend"
{
  "loop3": "backend-developer,react-frontend-engineer",
  "loop2": "code-reviewer,security-specialist,ui-designer",
  ...
}

# DevOps task - only Loop 3 agents
$ select-agents.sh --classification "devops" --loop 3
devops-engineer

# Security audit - only Loop 2 agents
$ select-agents.sh --classification "security" --loop 2
code-reviewer,security-specialist
```

## Integration with CFN Loop

```bash
# 1. Classify task
CLASSIFICATION=$(classify-task.sh "$TASK_DESCRIPTION")

# 2. Select agents
AGENTS_JSON=$(select-agents.sh --classification "$CLASSIFICATION" --mode standard)

# 3. Extract agent lists
LOOP3_AGENTS=$(echo "$AGENTS_JSON" | jq -r '.loop3')
LOOP2_AGENTS=$(echo "$AGENTS_JSON" | jq -r '.loop2')

# 4. Spawn CFN Loop with selected agents
./orchestrate.sh \
  --task-id "$TASK_ID" \
  --loop3-agents "$LOOP3_AGENTS" \
  --loop2-agents "$LOOP2_AGENTS" \
  --mode standard
```

## Features

- **Deduplication:** Removes duplicate agents from multi-classification tasks
- **Automatic Mapping:** Uses predefined agent mapping for consistency
- **Mode-Aware:** Future enhancement for mode-specific agent selection
- **Extensible:** Easy to add new classifications and agent types

## Implementation Details

- Uses associative arrays for agent mapping
- Sorts and deduplicates agent lists
- Outputs comma-separated agent names (no spaces)
- Exit code 0 on success, 1 on error
- Stateless execution (no persistent configuration)

## Used By

- `cfn-v3-coordinator` - For automatic agent selection based on task
- CFN Loop CLI commands - For agent list generation
- Manual orchestration - For expert-driven agent selection
