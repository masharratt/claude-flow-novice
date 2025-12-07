# MDAP Task Specification: Agent Profile Standardization

## Task Overview
Standardize all 61 agent profiles in `.claude/agents-mdap-test/cfn-dev-team/` to ensure consistent frontmatter fields.

## Standardization Requirements

### Required Fields (add if missing)
Each agent YAML frontmatter MUST have:

```yaml
---
name: agent-name                    # Already present in all
description: "..."                  # Already present in all
model: haiku|sonnet|opus           # Already present in all
type: specialist|coordinator|validator  # Already present in most
skills: []                          # ADD - list relevant skills from .claude/skills/
tags: []                           # ADD - searchable keywords
version: "1.0.0"                   # ADD - semantic version
priority: P1|P2|P3                 # ADD - P2 default for most
acl_level: 1                       # Already present in most
validation_hooks:                  # Already present in most
  - agent-template-validator
---
```

### Skills Mapping Rules
Based on agent type, add relevant skills:

| Agent Category | Default Skills |
|----------------|----------------|
| analysts | [cfn-project-analysis, cfn-ruvector-codebase-index] |
| architecture | [cfn-planning, cfn-task-planning] |
| coordinators | [cfn-loop-orchestration, cfn-redis-coordination] |
| dev-ops | [cfn-docker-runtime, cfn-github-workflow] |
| developers | [cfn-agent-spawning, cfn-test-framework] |
| documentation | [cfn-session-handoff, cfn-knowledge-base] |
| product-owners | [cfn-sprint-execution, cfn-validation-framework] |
| reviewers | [cfn-validation-framework, cfn-test-framework] |
| testers | [cfn-test-framework, cfn-validation-framework] |
| utility | [cfn-agent-tooling, cfn-skill-management] |

### Tags Generation Rules
Extract tags from:
1. Agent name (split on hyphens)
2. Capabilities array (if present)
3. Keywords in description

### Priority Assignment
- P1: coordinators, security-specialist
- P2: all developers, architects, testers (default)
- P3: documentation, utility agents

## Atomic Task Definition

Each micro-task handles ONE agent file:

**Input:**
- File path: `.claude/agents-mdap-test/cfn-dev-team/{category}/{agent-name}.md`
- Category: derived from path
- Current frontmatter: parsed from file

**Output:**
- Updated frontmatter with all required fields
- Preserve existing content after frontmatter
- <50 lines of changes per file

**Validation:**
- YAML frontmatter parses correctly
- All required fields present
- Skills array references valid skill names
- Tags array has 3-8 entries
- Version follows semver format

## Decomposition Plan

Total files: 61 agent profiles

**Category breakdown:**
- analysts: 2 files
- architecture: 5 files
- coordinators: 4 files
- dev-ops: 4 files
- developers: ~20 files
- documentation: ~5 files
- product-owners: ~3 files
- reviewers: ~8 files
- testers: ~12 files
- utility: ~3 files

Each file = 1 atomic micro-task
Estimated total micro-tasks: 61
Parallelization: All 61 can run simultaneously (no dependencies)

## Success Criteria

1. All 61 files have complete frontmatter
2. YAML validation passes for all files
3. Skills references are valid (exist in .claude/skills/)
4. Tags are meaningful and searchable
5. Version is "1.0.0" for new standardization
6. Priority assigned based on rules above

## Test Command

```bash
# Validate all agent files after MDAP
node .claude/agents-mdap-test/validate-agent.js --dir .claude/agents-mdap-test/cfn-dev-team
```
