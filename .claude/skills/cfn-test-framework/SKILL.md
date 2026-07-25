---
name: cfn-test-framework
description: Test execution and webapp testing for CFN. Use to run unit/integration/webapp tests.
version: 1.0.0
tags: [mega-skill, testing, execution, playwright, webapp]
status: production
---

# Test Framework Skill (Mega-Skill)

**Version:** 1.0.0
**Purpose:** Test execution, running, and webapp testing for CFN
**Status:** Production
**Consolidates:** cfn-test-execution, cfn-test-runner, cfn-webapp-testing

---

## Overview

This mega-skill provides complete testing capabilities:
- **Execution** - Test suite execution and reporting
- **Runner** - Test process management and parallelization
- **Webapp** - Browser-based webapp testing (Playwright)

---

## Running Tests (standard capture pattern)

Capture full output to a project-unique file, then read the file for all errors in one run. No watch mode, no bail/fail-fast flag.

```bash
OUT=/tmp/test-${PWD##*/}-$(date +%s).txt
<test-cmd> 2>&1 | tee "$OUT"
# then read "$OUT" for the complete failure set
```

- `${PWD##*/}` plus the timestamp keeps the filename unique across concurrent project runs.
- Use `vitest run` (not `vitest`), drop `-x`/`--bail`/`--fail-fast`, keep verbose + full traces so every failure shows on the first pass.
- Compile errors are not test failures: dump all compile errors first (`tsc --noEmit`, `cargo check --message-format=short`, `go build ./...`) before blaming tests.
- **Leaked workers:** if a runner dies and orphans worker processes (reparented to PID 1), `.claude/hooks/reap-orphan-test-workers.sh` reaps them so they do not burn CPU/RAM.

---

## Directory Structure

```
test-framework/
├── SKILL.md
├── lib/
│   ├── execution/        # From cfn-test-execution
│   ├── runner/           # From cfn-test-runner
│   └── webapp/           # From cfn-webapp-testing
└── cli/
```

---

## Migration Paths

| Old Path | New Path |
|----------|----------|
| cfn-test-execution/ | test-framework/lib/execution/ |
| cfn-test-runner/ | test-framework/lib/runner/ |
| cfn-webapp-testing/ | test-framework/lib/webapp/ |

---

## Version History

### 1.0.0 (2025-12-02)
- Consolidated 3 testing skills into mega-skill

