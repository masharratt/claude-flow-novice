# File Manifest System

**Status:** Manual snapshot (no auto-generator currently runs)
**Last Updated:** 2026-05-13

---

## Overview

This directory contains hand-maintained snapshots of the claude-flow-novice code organization. They are not generated, not authoritative for file counts, and not a replacement for CodeSearch. Use them as a top-down architecture map; for precise lookups use `/codebase-search` or `find`.

Trigger.dev and Redis-coordination sections were removed when those subsystems were deprecated; the original snapshots are archived under `docs/archive/`.

---

## Manifest Files

### 1. MANIFEST_INDEX.md
**Purpose:** Navigation hub
**Best For:** Finding which manifest to use, top-level file org

### 2. CODE_MANIFEST_SUMMARY.md
**Purpose:** Architecture overview, file statistics, key paths
**Best For:** High-level orientation

### 3. MANIFEST_README.md
**Purpose:** This file - system overview

Archived (no longer accurate):
- `docs/archive/FILE_MANIFEST.md` (was trigger.dev-only)
- `docs/archive/TRIGGER_TASKS_MANIFEST.md` (was trigger.dev task catalog)

---

## Scope

### Included
- TypeScript (.ts) and JavaScript (.js) files
- TypeScript React (.tsx) files
- YAML/YML configuration files
- SQL schema and migration files
- Dockerfile and docker-compose files
- Shell scripts (coordination, infrastructure)

### Excluded
- Documentation (*.md) - referenced separately
- Test files (*.test.ts, *.spec.ts) - see tests/ directory
- node_modules/ - dependencies
- dist/, build/ - generated artifacts
- .git/ - version control
- .archive/, docs/archive/ - deprecated files

---

## Implementation Paths

### Coordination Framework
```
.claude/skills/
├── cfn-agent-spawning/         Agent lifecycle
├── cfn-coordination/           Coordination primitives (chain/broadcast/mesh)
├── cfn-loop-orchestration-v2/  Loop control (mega-skill)
└── cfn-agent-lifecycle/        SQLite tracking
```

### MDAP Orchestration (replaces trigger.dev)
```
lib/mdap/
├── orchestrator.ts
├── implementer.ts
├── decomposers/
├── diff-applicator.ts
└── ...
```

---

## How to Use

### Find a Specific File
```bash
# Preferred: CodeSearch (400x faster than grep)
/codebase-search "your query"

# Fallback: find
find . -name "your-target" -not -path "*/node_modules/*"
```

### Understand Architecture
```bash
cat .claude/CODE_MANIFEST_SUMMARY.md
```

### Find Coordination Code
```bash
find ./.claude/skills/cfn-* -name "*.ts" -o -name "*.sh"
```

### Find MDAP Tasks
```bash
find ./lib/mdap -name "*.ts" -not -name "*.test.ts"
```

---

## Maintenance

These docs drift fast. Refresh when:
- Major file reorganization
- New skills under `.claude/skills/`
- Architectural shifts (subsystem deprecation, mega-skill consolidation)

Always update timestamp in the file header. If the doc is more than 6 months stale and the codebase has changed substantially, consider archiving rather than refreshing in place.

---

## Related Documentation

- `CLAUDE.md` - Operating guide and rules
- `.claude/CLAUDE.md` - CFN coordination guide
- `.claude/skills/cfn-coordination/SKILL.md` - Live coordination patterns
- `.claude/skills/cfn-loop-orchestration-v2/SKILL.md` - Loop orchestration
