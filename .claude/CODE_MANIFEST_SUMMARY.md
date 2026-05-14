# Code File Manifest Summary

**Generated:** 2026-05-13  
**Status:** Active manifests in `.claude/`  
**Scope:** TypeScript, JavaScript, YAML, Docker, SQL configurations

> Historical snapshot. Trigger.dev and Redis-coordination sections were removed when those subsystems were deprecated. For the live architecture, see `.claude/CLAUDE.md` and the skills directory.

---

## Files Created

1. **`.claude/MANIFEST_INDEX.md`** - Navigation hub for manifests
2. **`.claude/MANIFEST_README.md`** - Manifest system overview
3. **`.claude/CODE_MANIFEST_SUMMARY.md`** - This file

Archived (no longer accurate):
- `docs/archive/FILE_MANIFEST.md` - was trigger.dev-only index
- `docs/archive/TRIGGER_TASKS_MANIFEST.md` - was trigger.dev task catalog

---

## Code Organization

### Top-Level Directories

```
claude-flow-novice/
├── src/                          # Core implementation
│   ├── cli-executor.ts           # CLI integration
│   └── mdap-*.ts                 # Message-driven primitives (replaces trigger.dev)
├── packages/                     # NPM workspaces
│   ├── cli/                      # CLI package
│   ├── sdk/                      # SDK package
│   └── ...
├── lib/                          # Active replacement code
│   └── mdap/                     # MDAP orchestration (extracted from trigger.dev migration)
├── .claude/                      # Agent coordination
│   ├── agents/cfn-dev-team/      # Agent definitions
│   ├── skills/cfn-*/             # Coordination skills
│   ├── hooks/cfn-*/              # Git hooks
│   └── commands/cfn/             # Slash commands
└── tests/                        # Test infrastructure
```

---

## Code File Statistics

### By Type

| File Type | Approx Count | Location |
|-----------|--------------|----------|
| TypeScript (*.ts) | ~3,000 | src/, packages/, lib/, .claude/skills/ |
| JavaScript (*.js) | ~2,400 | dist/, .artifacts/, .claude/ |
| TypeScript React (*.tsx) | ~800 | packages/web/, packages/ui/ |
| YAML/YML | ~150 | .claude/config/, kubernetes/ |
| SQL | ~45 | .claude/skills/cfn-ace-system/, migrations/ |
| Dockerfiles | ~10 | docker/ |

Counts are approximate; for an authoritative count, run `find . -type f -name '*.ts' | wc -l` etc.

### By Functional Area

| Area | Purpose |
|------|---------|
| MDAP Orchestration | Task definitions, executors, validators (replaces trigger.dev) |
| Infrastructure & DevOps | Docker, Kubernetes, CI/CD |
| Core Coordination | Agent spawning, orchestration |
| Database | Schemas, migrations, SQL |
| Application Code | All packages and src/ |
| Utilities & Helpers | Logging, validation, error handling |

---

## Key Implementation Files

### MDAP Orchestration

`lib/mdap/` is the local replacement for trigger.dev in the CFN Loop architecture. Key files:

```
lib/mdap/
├── orchestrator.ts
├── implementer.ts
├── decomposers/
├── diff-applicator.ts
└── ...
```

### Coordination Framework

```
.claude/skills/
├── cfn-agent-spawning/         # Agent lifecycle
├── cfn-coordination/           # Coordination primitives
│   └── SKILL.md                # chain/broadcast/mesh/consensus
├── cfn-loop-orchestration-v2/  # Loop control (mega-skill)
└── cfn-agent-lifecycle/        # SQLite tracking
```

---

## Access Patterns

### Find Coordination Code
```bash
find ./.claude/skills -name "*.ts" -o -name "*.sh" | grep -v node_modules
```

### Find MDAP Tasks
```bash
find ./lib/mdap -name "*.ts" -not -name "*.test.ts"
```

### Find Hook Implementations
```bash
ls .claude/hooks/cfn-*.sh
```

---

## Next Steps

1. **Code Navigation:** Use CodeSearch (`/codebase-search`) before grep
2. **Live Architecture:** See `.claude/CLAUDE.md` for current coordination guide
3. **Skill Index:** See `.claude/MANIFEST_INDEX.md`

---

## Manifest Maintenance

This document is a manual snapshot; no auto-generator currently runs.

**Update Triggers:**
- Major file reorganization
- Adding new skills under `.claude/skills/`
- Quarterly comprehensive refresh
