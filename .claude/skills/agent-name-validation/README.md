# Agent Name Validation Skill

## Quick Start

```bash
./.claude/skills/agent-name-validation/validate-agent-names.sh
```

## What It Does

Validates that agent filenames match their frontmatter `name:` field across the entire `.claude/agents/` directory.

## Integration

This skill is automatically run by the `agent-builder` agent after:
- Creating new agents
- Updating agent frontmatter
- Renaming agent files

## Files

- `SKILL.md` - Complete documentation
- `validate-agent-names.sh` - Validation script
- `README.md` - This file

## Usage in Agent Builder

See `agent-builder.md` Post-Creation Validation section for integration details.
