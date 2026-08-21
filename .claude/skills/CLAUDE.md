# Claude Code Skills Development Guide

**Purpose:** Guidelines for developing, testing, and maintaining CFN skills.

---

## Skill Development Principles

- **Modularity:** Each skill handles one responsibility; compose skills for complex operations
- **Explicit Interfaces:** Document inputs, outputs, and side effects in SKILL.md
- **Minimal Dependencies:** Skills should be self-contained; avoid cross-skill imports
- **Thorough Testing:** Every skill needs functional tests and edge case coverage

## Testing Requirements (STRAT-005)

Skills must include tests covering:
- Functional requirements (happy path)
- Edge cases: timeouts, blocking operations, invalid inputs
- Resource cleanup on failure

**Example test location:** `.claude/skills/cfn-coordination/test-orchestrator.sh`

## Core Skill References

- **Coordination:** `.claude/skills/cfn-coordination/SKILL.md` - chain, broadcast, mesh, consensus patterns
- **Agent Spawning:** `.claude/skills/cfn-agent-lifecycle/lib/spawning/SKILL.md` - agent lifecycle management
- **Loop Validation:** `.claude/skills/cfn-loop-orchestration-v2/lib/validation/SKILL.md` - gate checks and consensus
- **Planning (token-lean):** `.claude/skills/cfn-megaplan-fast/SKILL.md` - program-mode planner; shares `cfn-megaplan/bars/` (incl. `check-size.sh`) and `cfn-megaplan/lib/extract-sections.sh`

## Skill File Structure

```
.claude/skills/<skill-name>/
├── SKILL.md           # Skill documentation (required)
├── <main-script>.sh   # Primary entry point
├── lib/               # Helper scripts/modules
└── tests/             # Skill-specific tests
```

## Skill Documentation Template

```markdown
# Skill: <name>

## Purpose
One-line description of what this skill does.

## Inputs
- `$1`: Description
- `ENV_VAR`: Description

## Outputs
- stdout: Description
- exit code: 0 = success, non-zero = failure

## Usage
\`\`\`bash
./.claude/skills/<skill-name>/<script>.sh [args]
\`\`\`

## Dependencies
- List required tools/skills
```

## Quality Checklist

- [ ] SKILL.md documents all inputs/outputs
- [ ] Scripts use `set -euo pipefail`
- [ ] Cleanup traps handle interrupts
- [ ] Tests cover happy path and failure modes
- [ ] No hardcoded paths (use `PROJECT_ROOT`)
