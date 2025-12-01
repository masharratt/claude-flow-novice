# Deprecated Skills Quick Reference

**For:** Developers removing obsolete skills from codebase
**Scope:** CFN v3.2.0+ architecture (simplified 2-layer CLI mode)

---

## 1. cfn-coordination (ENTIRE DIRECTORY)

**Status:** ARCHIVE
**Size:** 58 files, 150+ LOC
**Purpose:** Redis BLPOP wrapper (v1.x-v2.x)

**Core Files:**
- `coordination-wait.sh` - BLPOP blocking
- `coordination-signal.sh` - Redis publish
- `test-orchestrator.sh` - Coordination tests

**Why Deprecated:**
- Replaced by direct Main Chat → CLI agent signaling
- No Redis required in v3.2.0+
- Coordination handled by orchestrator via process signaling

**References in Code:**
```
CLAUDE.md:274:- Coordination Protocols (`.claude/skills/cfn-coordination/SKILL.md`)
CLAUDE.md:515:Refer to `.claude/skills/cfn-coordination/SKILL.md` for:
CLAUDE.md:909: Example: `.claude/skills/cfn-coordination/test-orchestrator.sh`
CLAUDE.md:914:- Coordination Protocols: `.claude/skills/cfn-coordination/SKILL.md`
```

**Archive Location:**
```
.archive/cfn-redis-coordination-legacy/skills-cfn-coordination/
```

**Removal Steps:**
1. Move directory to archive
2. Delete CLAUDE.md references (lines 274, 515, 909, 914)
3. Remove any .claude.json references
4. Verify no orchestrator calls to coordination-wait.sh

---

## 2. cfn-redis-coordination (ENTIRE DIRECTORY)

**Status:** ARCHIVE (CONTAINS SQL INJECTION VULNERABILITIES)
**Size:** 40+ files, 800+ LOC
**Purpose:** Redis helper functions (v1.x-v2.x)

**Core Files:**
- `redis-cli-wrapper.sh` - Redis command wrapper
  - **SECURITY ISSUE:** BUG #21 - Auth bypass if REDIS_PASSWORD set but auth disabled
- `redis-functions.sh` - Helper functions
- `store-task-context.sh` - Task persistence via Redis
- `data/cfn-loop.db` - SQLite persistence
- `dist/redis-client.js` - Compiled Redis client

**Why Deprecated:**
- Redis coordination fully replaced by CLI direct signaling
- SQL injection vulnerabilities in benchmark scripts
- Local SQLite now handles all persistence

**References in Code:**
```
CLAUDE.md:202: sqlite3 "./claude-assets/skills/cfn-redis-coordination/data/cfn-loop.db"
CLAUDE.md:213:Database Location: `./claude-assets/skills/cfn-redis-coordination/data/cfn-loop.db`
docs/TEST_COVERAGE_GAP_ANALYSIS.md:123: Root cause of BUG #21
```

**Security Vulnerabilities:**
```
scripts/security/fix-sql-injection-batch.sh:
  - redis-cli-wrapper.sh → Safe, but wrapper not needed
  - store-task-context.sh → Consider deprecation
```

**Archive Location:**
```
.archive/cfn-redis-coordination-legacy/skills-cfn-redis-coordination/
```

**Removal Steps:**
1. Move directory to archive
2. Delete CLAUDE.md references (lines 202, 213)
3. Verify no orchestrator calls to store-task-context.sh
4. Update any Redis client imports in TypeScript code
5. Confirm SQLite persistence in cfn-loop-orchestration handles all data

---

## 3. cfn-docker-redis-coordination (ENTIRE DIRECTORY)

**Status:** ARCHIVE
**Size:** 25+ files, 600+ LOC
**Purpose:** Docker-based Redis coordination (v1.x-v2.x)

**Core Files:**
- `coordinate.sh` - Main coordination script (649 lines)
- `src/` - TypeScript source (partial migration)
- `docker-compose.yml` - Redis container config

**Why Deprecated:**
- Container-based Redis coordination obsolete
- Simplified 2-layer architecture removes need for Redis
- Direct process signaling replaces Redis BLPOP

**References in Code:**
```
.archive/cfn-redis-coordination-legacy/skills/cfn-docker-redis-coordination/README.md:
  - Source: `./.claude/skills/cfn-docker-redis-coordination/coordinate.sh` (649 lines)
  - Target: Deprecated (no TypeScript equivalent needed)
```

**Archive Location:**
```
.archive/cfn-redis-coordination-legacy/skills-cfn-docker-redis-coordination/
```

**Removal Steps:**
1. Move directory to archive
2. Remove any docker-compose references
3. Verify no orchestrator spawns Docker Redis
4. Confirm environment cleanup (no REDIS_PORT, REDIS_PASSWORD vars)

---

## 4. cfn-docker-loop-orchestration (SHELL ORCHESTRATOR)

**Status:** ARCHIVE (Replaced by TypeScript)
**Size:** 1,721 LOC shell script
**Purpose:** Legacy shell-based orchestrator (v1.x-v2.x)

**File:**
- `orchestrate.sh` - Main orchestration loop (1,721 LOC)

**Replaced By:**
```
.claude/skills/cfn-loop-orchestration/src/orchestrate.ts (1,200+ LOC)
.claude/skills/cfn-loop-orchestration/dist/orchestrate.js (compiled, 15KB)
```

**Why Deprecated:**
- TypeScript rewrite completed (docs/TYPESCRIPT_MIGRATION_VERIFICATION.md)
- Type safety and testability improved
- Compiled version production-ready
- No graceful shutdown in shell version

**References in Code:**
```
docs/TRIGGER_DEV_QUICK_REFERENCE.md:187:
  ❌ .claude/skills/cfn-docker-loop-orchestration/orchestrate.sh (1,721)
docs/TRIGGER_DEV_MIGRATION_PLAN.md:1389:
  4. `.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh` (1,721 LOC)
docs/testing/performance/GRACEFUL_SHUTDOWN_TEST_REPORT.md:277:
  - `.claude/skills/cfn-loop-orchestration/orchestrate.sh`: NO graceful shutdown
```

**Archive Location:**
```
.archive/cfn-redis-coordination-legacy/shell-orchestrators/orchestrate.sh
```

**Removal Steps:**
1. Move file to archive
2. Verify TypeScript orchestrator called instead
3. Check all orchestrator invocations use compiled .js version
4. Remove any shell sourcing of this script

---

## 5. cfn-test-runner (LEGACY BENCHMARKING)

**Status:** ARCHIVE (Contains SQL Injection Vulnerabilities)
**Size:** 5+ files
**Purpose:** Redis-based test result benchmarking (v1.x-v2.x)

**Core Files:**
- `init-benchmark-db.sh` - Initialize benchmark DB
- `store-benchmarks.sh` - Store test results (SQL injection vulnerability)
- `detect-regressions.sh` - Detect performance regressions
- `validate-redis-keys.sh` - Validate Redis state
- `run-all-tests.sh` - Test runner

**Why Deprecated:**
- Redis benchmarking obsolete (no Redis in v3.2.0+)
- Test-driven gate validation replaces manual benchmarking
- SQL injection vulnerabilities in store-benchmarks.sh

**Security Issues:**
```
scripts/security/fix-sql-injection-batch.sh:
  ["$PROJECT_ROOT/.claude/skills/cfn-test-runner/store-benchmarks.sh"]="DONE"
  ["$PROJECT_ROOT/.claude/skills/cfn-test-runner/init-benchmark-db.sh"]="PENDING"
  ["$PROJECT_ROOT/.claude/skills/cfn-test-runner/detect-regressions.sh"]="PENDING"
```

**Replaced By:**
```
.claude/skills/cfn-loop-validation/ (4 TypeScript validators)
.claude/skills/cfn-loop-orchestration/ (test-driven gates)
```

**References in Code:**
```
readme/logs-features.md:903: Test runner: `.claude/skills/cfn-test-runner/run-all-tests.sh`
scripts/security/fix-sql-injection-batch.sh: 5 SQL injection fixes pending
docs/cfn-system/ITERATION_2_TEST_EXECUTION_REPORT.md: Legacy test runner reference
```

**Archive Location:**
```
.archive/cfn-redis-coordination-legacy/test-runners/cfn-test-runner/
```

**Removal Steps:**
1. Move directory to archive
2. Remove references from readme/logs-features.md
3. Verify test execution via orchestrator handles benchmarking
4. Remove any benchmark DB initialization from agent startup

---

## CONSOLIDATION CHECKLIST

After archiving all 5 deprecated skill groups:

- [ ] Verify no .claude/skills references to cfn-coordination
- [ ] Verify no .claude/skills references to cfn-redis-coordination
- [ ] Verify no .claude/skills references to cfn-docker-redis-coordination
- [ ] Verify no .claude/skills references to cfn-docker-loop-orchestration
- [ ] Verify no .claude/skills references to cfn-test-runner
- [ ] Update CLAUDE.md lines 202, 213, 274, 515, 909, 914
- [ ] Add DEPRECATED_SKILLS section to CLAUDE.md with archive location
- [ ] Verify orchestrator uses TypeScript version (not shell)
- [ ] Verify no Redis environment variables required
- [ ] Verify test execution via cfn-loop-validation + orchestrator
- [ ] Grep entire codebase for any remaining references to deprecated skills
- [ ] Run full test suite to verify functionality unaffected

---

## EDGE CASES TO INVESTIGATE

Before archiving, investigate these 5 skills (see agent-4-kimi-analysis.md for details):

1. **cfn-agent-spawning** - Likely replaced by cfn-agent-selection-with-fallback (TypeScript)
2. **cfn-agent-output-processing** - May be integrated into orchestrator
3. **cfn-product-owner-decision** - Verify execute-decision.sh integration
4. **cfn-automatic-memory-persistence** - Determine if test infrastructure only
5. **confidence-aggregator.ts** - Likely deprecated in favor of test-driven validation

---

## ARCHIVE STRUCTURE

```
.archive/cfn-redis-coordination-legacy/
├── DEPRECATION_MANIFEST.md                    (this reference)
├── skills-cfn-coordination/                   (58 files)
├── skills-cfn-redis-coordination/             (40+ files)
├── skills-cfn-docker-redis-coordination/      (25+ files)
├── shell-orchestrators/                       (1 file)
│   └── orchestrate.sh (1,721 LOC)
└── test-runners/                              (5+ files)
    └── cfn-test-runner/
```

---

## VALIDATION

Run this to verify all deprecated skills archived:

```bash
# Should return no results
find .claude/skills -name "*redis*" -o -name "*coordination*" -o -name "*docker-loop*" -o -name "*test-runner*"

# Should confirm archive contains them
ls -la .archive/cfn-redis-coordination-legacy/

# Verify orchestrator is TypeScript
file .claude/skills/cfn-loop-orchestration/dist/orchestrate.js
# Should show: JavaScript
```

---

**Last Updated:** November 23, 2025
**Scope:** CFN v3.2.0+ (simplified 2-layer CLI mode)
**Status:** Ready for deprecation (pending review)
