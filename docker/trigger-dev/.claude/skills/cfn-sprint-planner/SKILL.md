# Sprint Planner Skill

## Purpose
Generate detailed sprint plans with focused context injection, ensuring clear scope boundaries and dependencies.

## Key Functions
- Parse epic decomposition
- Define sprint-specific deliverables
- Create clear in_scope and out_of_scope boundaries
- Generate agent configuration

## Input Requirements
- Sprint ID
- Epic JSON
- Task type
- Optional complexity overrides

## Output Specification
Produces JSON with:
- Sprint-level configuration
- Context injection details
- Agent recommendations
- Iteration estimates

## Usage
```bash
plan-sprint.sh \
  --sprint-id "1" \
  --epic-json "$EPIC_JSON" \
  --task-type "software-development"
```

## Sprint Planning Principles
- Strict scope management
- Explicit dependency tracking
- Focused context injection
- Agent specialization recommendations
