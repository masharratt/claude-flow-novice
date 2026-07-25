# CFN v3 Phase 3: Epic Decomposition & Sprint Planning

## Overview

These components enable advanced epic decomposition and sprint planning in Claude Flow Novice, providing a systematic approach to breaking down large software development tasks.

## Components

### 1. Epic Decomposer
**Location:** `.claude/skills/epic-decomposer/decompose-epic.sh`

#### Purpose
Transform complex epics into structured, manageable sprints with clear dependencies and deliverables.

#### Usage
```bash
./decompose-epic.sh \
  --epic "Build authentication system with OAuth2, 2FA, session management" \
  --acceptance-criteria "OAuth2 working, 2FA enabled, sessions expire"
```

#### Output
- Generates a JSON configuration with sprint sequence
- Identifies dependencies
- Defines sprint-specific deliverables

### 2. Sprint Planner
**Location:** `.claude/skills/sprint-planner/plan-sprint.sh`

#### Purpose
Generate precise CFN Loop configuration for individual sprints, ensuring clear boundaries and context.

#### Usage
```bash
./plan-sprint.sh \
  --sprint-id "1" \
  --epic-context "Build authentication system" \
  --sprint-name "OAuth2 Integration" \
  --deliverables "src/auth/oauth2.ts,tests/auth/oauth2.test.ts"
```

#### Output
- Detailed sprint configuration
- Context-specific task description
- Deliverable list
- Scope boundaries

### 3. Dependency Extractor
**Location:** `.claude/skills/dependency-extractor/extract-dependencies.sh`

#### Purpose
Parse and extract dependencies between sprint components, ensuring correct implementation order.

#### Usage
```bash
./extract-dependencies.sh \
  --epic-description "Build authentication system with OAuth2, 2FA, session management" \
  --sprint-config "$(cat sprint_config.json)"
```

#### Output
- Dependency graph
- Execution order
- Blocking relationships

## Multi-Sprint Coordinator
**Location:** `.claude/agents/multi-sprint-coordinator.md`

### Purpose
Orchestrate epic execution across multiple sprints, managing dependencies and ensuring sequential completion.

## Integration with CFN Loop

These skills integrate seamlessly with the CFN v3 coordinator:

```bash
# Example CFN Loop Execution
npx claude-flow-novice epic-execute \
  --decomposer epic-decomposer/decompose-epic.sh \
  --sprint-planner sprint-planner/plan-sprint.sh \
  --epic "Build complex system"
```

## Key Design Principles

1. **Modularity**: Each component focuses on a specific task
2. **Dependency Awareness**: Sprints respect implementation order
3. **Flexible Configuration**: Supports various epic types
4. **Context Preservation**: Carry epic-level context through sprints

## Success Metrics

- Logical sprint decomposition
- Correct dependency ordering
- Clear scope boundaries
- Concrete, implementable deliverables

## Troubleshooting

- Ensure input parameters are complete
- Check epic description for clear goals
- Validate file paths in deliverables
- Verify JSON is well-formed

## Future Enhancements

- Enhanced NLP for epic parsing
- Machine learning for more accurate decomposition
- Integration with project management tools
- Advanced dependency conflict resolution

## Example Workflow

```bash
# 1. Decompose Epic
EPIC_CONFIG=$(./decompose-epic.sh --epic "Build authentication system")

# 2. For Each Sprint
for sprint in $(echo "$EPIC_CONFIG" | jq -c '.sprints[]'); do
  SPRINT_ID=$(echo "$sprint" | jq -r '.sprint_id')
  SPRINT_NAME=$(echo "$sprint" | jq -r '.name')
  DELIVERABLES=$(echo "$sprint" | jq -r '.deliverables | join(",")')

  # 3. Generate Sprint Configuration
  SPRINT_CONFIG=$(./plan-sprint.sh \
    --sprint-id "$SPRINT_ID" \
    --epic-context "Authentication System" \
    --sprint-name "$SPRINT_NAME" \
    --deliverables "$DELIVERABLES")

  # 4. Extract Dependencies
  DEPENDENCIES=$(./extract-dependencies.sh \
    --epic-description "Authentication System" \
    --sprint-config "$SPRINT_CONFIG")

  # 5. Execute Sprint (your CFN Loop execution)
  npx claude-flow-novice sprint-execute --config "$SPRINT_CONFIG"
done
```

## Getting Help

- Review SKILL.md files in each component directory
- Check example configurations
- Validate inputs carefully
- Start with simple epics

**Version:** 1.0.0 (Phase 3 CFN v3)
**Last Updated:** 2025-10-23