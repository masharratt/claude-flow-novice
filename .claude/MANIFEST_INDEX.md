# Code Manifest Index

**Last Updated:** 2026-05-13  
**Scope:** TypeScript, JavaScript, YAML, Docker, SQL configurations

> Historical snapshot, manually maintained. Trigger.dev and Redis-coordination sections were removed when those subsystems were deprecated.

---

## Quick Navigation

### 1. CODE_MANIFEST_SUMMARY.md
**Purpose:** Overview and quick reference  
**Best For:** High-level architecture, statistics, file locations

### 2. MANIFEST_README.md
**Purpose:** Manifest system overview and access scenarios  
**Best For:** Understanding scope, exclusions, and lookup workflows

Archived:
- `docs/archive/FILE_MANIFEST.md` (was trigger.dev-only)
- `docs/archive/TRIGGER_TASKS_MANIFEST.md` (was trigger.dev task catalog)

---

## File Organization Summary

```
Code Files by Category:

MDAP Orchestration   ~50 files     lib/mdap/ (replaces trigger.dev)
Infrastructure       ~45 files     docker/*, kubernetes/
Coordination         ~250 files    .claude/skills/cfn-*
Database             ~45 files     *.sql, migrations/
Application          ~4,000 files  src/, packages/
Utilities            ~500 files    helpers, lib, utils/
```

Counts are approximate.

---

## Quick Lookups

### Find Coordination Code
```bash
find .claude/skills/cfn-* -name "*.ts" -o -name "*.sh"
```

### Find MDAP Tasks
```bash
find lib/mdap -name "*.ts" -not -name "*.test.ts"
```

### Find Hook Implementations
```bash
ls .claude/hooks/cfn-*.sh
```

---

## Manifest Scope

**Included:**
- TypeScript (.ts) and JavaScript (.js)
- TSX/JSX files
- YAML/YML configuration
- SQL schema files
- Dockerfile and docker-compose files
- Shell scripts (coordination, infrastructure)

**Excluded:**
- Documentation (*.md) — see separate docs/
- Test files (*.test.ts, *.spec.ts) — see tests/
- node_modules/
- dist/ and build/ directories
- .git/

---

## Implementation Paths

### Coordination Framework

**Agent Spawning:**
```
.claude/skills/cfn-agent-spawning/
└── src/spawn-agent.sh
```

**Coordination:**
```
.claude/skills/cfn-coordination/
└── SKILL.md  (chain, broadcast, mesh, consensus patterns)
```

**Loop Orchestration (mega-skill):**
```
.claude/skills/cfn-loop-orchestration-v2/
└── SKILL.md
```

### MDAP Orchestration (live replacement for trigger.dev)

```
lib/mdap/
├── orchestrator.ts
├── implementer.ts
├── decomposers/
├── diff-applicator.ts
└── ...
```

---

## Using These Manifests

1. **Start with this index** to understand what each manifest covers
2. **Review CODE_MANIFEST_SUMMARY.md** for architecture and statistics
3. **Use CodeSearch** (`/codebase-search`) to locate specific files (400x faster than grep)

---

## Maintenance

These docs are manual snapshots; no auto-generator currently runs. Update when:
- New skills added under `.claude/skills/`
- Major file reorganization
- Architectural shifts (e.g., a coordination model deprecation)

---

## Related Documents

- `CLAUDE.md` — Operating guide and rules
- `.claude/CLAUDE.md` — CFN coordination and namespace guide
- `.claude/skills/cfn-coordination/SKILL.md` — Live coordination patterns
