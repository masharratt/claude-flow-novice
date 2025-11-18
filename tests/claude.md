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

## Production Testing Requirements

**Critical Lesson from BUG #21**: Tests must replicate actual production code paths, not just infrastructure.

### Infrastructure Tests vs Integration Tests

**Infrastructure Tests** (can use mocks):
- Docker networking functionality
- Volume mounting and permissions
- Redis connectivity
- Basic container lifecycle

**Integration Tests** (MUST use production images/scripts):
- Agent spawning via spawn-agent.sh
- CLI command construction and execution
- Actual CFN agent image (claude-flow-novice-agent:latest)
- Real coordination protocols and Redis patterns

### BUG #21 Case Study

**The Gap**:
```bash
# Tests used: alpine:latest with inline scripts
docker run alpine:latest sh -c "inline script"

# Production uses: cfn-agent image with spawn-agent.sh
spawn-agent.sh → docker run cfn-agent:latest → npx claude-flow-novice agent
```

**Result**: Tests passed 100% while production failed 100% due to wrong CLI syntax in spawn-agent.sh.

**Prevention**: Integration tests MUST exercise the actual production spawning mechanism:
- Use `.claude/skills/cfn-docker-agent-spawning/spawn-agent.sh`
- Use `claude-flow-novice-agent:latest` image (not alpine)
- Validate Docker CMD construction (not just inline scripts)
- Check container logs for CLI errors ("Agent type is required")

### Test Coverage Requirements

Every production code path needs two test types:

1. **Unit Tests**: Validate script logic and command syntax
   - Example: `test-spawn-command-syntax.sh` (grep for correct npx syntax)
   - Fast, no containers required
   - Catch syntax errors before integration

2. **Integration Tests**: Validate end-to-end execution
   - Example: `test-real-agent-spawning.sh` (actual spawn-agent.sh + cfn-agent)
   - Use real images and scripts
   - Check container logs for runtime errors

## Review Checklist
- [ ] Script location matches its execution mode (Docker vs CLI vs Task).
- [ ] Template header, cleanup trap, and helper sourcing are present.
- [ ] Functions emit structured logs and cite relevant bugs.
- [ ] Temporary artifacts (containers, worktrees, env files) are deleted.
- [ ] Script can run idempotently on CI and locally without manual edits.
- [ ] **Production code paths tested with real images/scripts (not mocks).**
- [ ] **Both unit tests (syntax) and integration tests (execution) exist.**

Detailed scenario-specific plans live under the following documents:
1. `tests/docker/TEST_SUITE_OVERVIEW.md`
2. `tests/docker/TEST_SUITE_MAINTENANCE_PLAN.md`
3. `tests/docker/TEST_SUITE_EXECUTION_PLAYBOOK.md`

Refer back to this file whenever creating or reviewing test scripts referenced by those plans.
