# Claude Test Authoring Standards

These standards apply to every shell-based test (Docker, CLI, Task mode, etc.) and are referenced by all plan documents under `tests/docker/`.

## Structure & Imports
- Start each script with `#!/bin/bash` plus `set -euo pipefail`.
- Resolve `PROJECT_ROOT=$(git rev-parse --show-toplevel)` immediately and `source "$PROJECT_ROOT/tests/test-utils.sh"` for shared helpers/logging.
- Define one function per logical check (`test_<scenario>()`). Invoke the functions explicitly at the bottom so execution order is obvious.
- Use `cleanup()` + `trap cleanup EXIT` whenever containers, worktrees, temp dirs, or env files are created. Clean up even when tests fail.
- Route noisy commands through helpers like `log_step`, `log_info`, `annotate`, or `assert_success` to keep CI logs searchable.

## Comments & Context
- Add a short docstring block below the shebang summarizing the scenario, related bugs/JIRA tickets, and which execution phase owns the test.
- Inside each test function, cluster comments using **GIVEN / WHEN / THEN** markers only where logic would otherwise be non-obvious. Avoid narrating trivial commands.
- If an assertion guards against a previously reported bug (e.g., Bug #1–#4), cite it inline so future readers know why the check exists.

## Directory & Naming Rules
- Docker-first flows belong under `tests/docker/` with thematic subfolders (e.g., `coordination/`, `lifecycle/`, `perf/`) once a topic exceeds five scripts.
- CLI-specific coverage moves to `tests/cli-mode/`, Task() flows to `tests/task-mode/`, and frozen legacy references to `tests/archive/historical/<sprint-id>/`.
- Cleanup and archival helpers stay in `tests/docker/cleanup/` alongside a README describing their usage.
- Prefer semantic suffixes (`-fault-tolerance`, `-sharded`, `-perf`) rather than numeric variants when multiple flavors of the same scenario exist.

## Required Boilerplate Template

```bash
#!/bin/bash
# tests/docker/<topic>/<name>.sh
# Phase X :: <one-line purpose> (Bug #<id> / Ticket <ref>)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

cleanup() {
  # docker rm -f ..., git worktree prune, rm -rf "$TMP_DIR", etc.
}
trap cleanup EXIT

test_case_name() {
  log_step "GIVEN <context>"
  # WHEN <action>
  # THEN assert_* "<result>"
}

test_case_name
```

## Review Checklist
- [ ] Script location matches its execution mode (Docker vs CLI vs Task).
- [ ] Template header, cleanup trap, and helper sourcing are present.
- [ ] Functions emit structured logs and cite relevant bugs.
- [ ] Temporary artifacts (containers, worktrees, env files) are deleted.
- [ ] Script can run idempotently on CI and locally without manual edits.

Detailed scenario-specific plans live under the following documents:
1. `tests/docker/TEST_SUITE_OVERVIEW.md`
2. `tests/docker/TEST_SUITE_MAINTENANCE_PLAN.md`
3. `tests/docker/TEST_SUITE_EXECUTION_PLAYBOOK.md`

Refer back to this file whenever creating or reviewing test scripts referenced by those plans.
