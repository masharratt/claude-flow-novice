---
name: cfn-epic-parser
description: Parse natural language epic documents to structured JSON configuration
version: 1.0.0
tags: [epic, parser, json, planning]
status: production
---

# Epic Parser Skill

Parse natural language epic markdown documents into structured JSON configuration for CFN Loop execution.

## Purpose

Converts human-readable epic planning documents into machine-readable JSON configs with phases, sprints, and dependencies.

## Usage

```bash
# Basic parsing
./.claude/skills/cfn-epic-parser/parse.sh planning/example-epic

# With custom output
./.claude/skills/cfn-epic-parser/parse.sh planning/my-epic --output epic-config.json

# With validation
./.claude/skills/cfn-epic-parser/parse.sh planning/auth-epic --validate
```

## Input Format

```
planning/example-epic/
├── OVERVIEW.md              # Epic description, goals, scope
├── phase-1-authentication.md
├── phase-2-authorization.md
└── dependencies.md          # Cross-phase dependencies (optional)
```

## Output Format

Structured JSON with:
- Epic metadata (name, goal, risk profile)
- Phase definitions with deliverables
- Sprint breakdowns with agent estimates
- Dependency graph

## Features

- Natural language parsing
- Automatic dependency detection
- Sprint estimation from content
- Validation against schema
- Error reporting with line numbers

