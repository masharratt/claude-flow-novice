# Code Manifest Index

**Last Updated:** 2026-05-13  
**Total Code Files:** 7,246  
**Scope:** TypeScript, JavaScript, YAML, Docker, SQL configurations

---

## Quick Navigation

### 1. FILE_MANIFEST.md
**Purpose:** Complete code file inventory  
**Contents:**
- Trigger.dev task implementations
- Infrastructure (Docker, Kubernetes, CI/CD)
- Core library code (coordination, validation)
- Database schemas and migrations
- Application source code
- Statistics by file type

**Use When:** You need to find where implementation files are located, understand project structure, or locate specific code patterns.

**Key Sections:**
- Trigger.dev Task Implementations - all *.ts files in `src/trigger/`
- Infrastructure Code - Docker Compose, Dockerfiles, YAML configs
- Core Library Code - CFN agent spawning, Redis coordination, orchestration
- Database Schemas - SQL files for migrations and schema definitions
- Core Application Code - Main packages and source root

---

### 2. TRIGGER_TASKS_MANIFEST.md
**Purpose:** Trigger.dev v4 task reference  
**Contents:**
- Task files by category
- Task configuration (trigger.config.ts)
- Task execution methods (CLI, API, direct)
- Task structure template
- Infrastructure integration details
- Deployment checklist

**Use When:** You're deploying, configuring, or implementing new Trigger.dev tasks.

**Key Reference:**
- Task definition pattern: `{ id, run, maxDuration, retry }`
- Configuration file: `trigger.config.ts`
- Main API URL: `http://localhost:8030` (default)
- Task location: `src/trigger/*.ts`

---

### 3. CODE_MANIFEST_SUMMARY.md
**Purpose:** Overview and quick reference  
**Contents:**
- File statistics by type and area
- Key implementation file paths
- Architecture overview
- Access patterns (grep/find commands)
- Implementation highlights
- Maintenance procedures

**Use When:** You need a high-level overview, statistics, or quick lookup of file locations.

**Key Stats:**
- TypeScript (*.ts): ~3,200 files
- JavaScript (*.js): ~2,400 files
- YAML: ~150 files
- SQL: ~45 files
- Trigger.dev tasks: ~200 files

---

## File Organization Summary

```
Code Files by Category:

Trigger.dev          ~200 files    src/trigger/*.ts
Infrastructure       ~45 files     docker/*, kubernetes/
Coordination         ~250 files    .claude/skills/cfn-*
Database             ~45 files     *.sql, migrations/
Application          ~4,000 files  src/, packages/
Utilities            ~500 files    helpers, lib, utils/
Generated            ~2,200 files  dist/, build/
```

---

## Quick Lookups

### Find Trigger.dev Tasks
```bash
grep -r "^export const.*task(" src/trigger/ --include="*.ts"
```

### Find Infrastructure Files
```bash
find docker/trigger-dev -name "docker-compose.yml" -o -name "Dockerfile"
```

### Find Coordination Code
```bash
find .claude/skills/cfn-* -name "*.ts" -o -name "*.sh"
```

### Find a Specific Task
```bash
grep -r "id: \"cfn-agent-coordinator\"" src/trigger/
```

---

## Manifest Scope

**Included:**
- ✓ TypeScript (.ts) and JavaScript (.js)
- ✓ TSX/JSX files
- ✓ YAML/YML configuration
- ✓ SQL schema files
- ✓ Dockerfile and docker-compose files
- ✓ Shell scripts (coordination, infrastructure)

**Excluded:**
- ✗ Documentation (*.md) - see separate docs/
- ✗ Test files (*.test.ts, *.spec.ts) - see tests/
- ✗ node_modules/
- ✗ dist/ and build/ directories
- ✗ .git/
- ✗ .archive/ (deprecated files)

---

## Implementation Paths

### Trigger.dev Integration

**Task Definitions:**
```
/mnt/c/Users/masha/Documents/claude-flow-novice/src/trigger/
├── hello-world.ts
├── cfn-agent-coordinator.ts
├── cfn-implementer.ts
├── cfn-validator.ts
└── cfn-product-owner.ts
```

**Configuration:**
```
/mnt/c/Users/masha/Documents/claude-flow-novice/
└── trigger.config.ts
```

### Infrastructure

**Webapp Services:**
```
/mnt/c/Users/masha/Documents/claude-flow-novice/docker/trigger-dev/webapp/
├── docker-compose.yml    (PostgreSQL, Redis, Registry, MinIO)
├── Dockerfile
└── .env
```

**Worker Services:**
```
/mnt/c/Users/masha/Documents/claude-flow-novice/docker/trigger-dev/worker/
├── docker-compose.yml    (Supervisor, Task Runners)
├── Dockerfile
└── .env
```

### Coordination Framework

**Agent Spawning:**
```
/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-agent-spawning/
└── src/spawn-agent.sh
```

**Coordination:**
```
/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-coordination/
└── SKILL.md  (chain, broadcast, mesh, consensus patterns)
```

**Loop Orchestration:**
```
/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills/cfn-loop-orchestration/
└── orchestrate.sh
```

---

## Using These Manifests

1. **Start with this index** to understand what each manifest covers
2. **Review CODE_MANIFEST_SUMMARY.md** for architecture and statistics
3. **Use FILE_MANIFEST.md** to locate specific files
4. **Reference TRIGGER_TASKS_MANIFEST.md** for Trigger.dev-specific info

---

## Maintenance

**Update Frequency:** As needed when:
- New task files added to src/trigger/
- Infrastructure changes (Dockerfile, docker-compose updates)
- New coordination skills created
- Major file reorganization

**Update Process:**
```bash
# Run manifest generator (when implemented)
bash ./.claude/FILE_MANIFEST_GENERATOR.sh
```

---

## Related Documents

- `CLAUDE.md` - Operating guide and rules
- `docs/CFN_LOOP_ARCHITECTURE.md` - Loop system details
- `docs/AGENT_OUTPUT_STANDARDS.md` - Code output conventions
- `docker/trigger-dev/README.md` - Infrastructure guide

