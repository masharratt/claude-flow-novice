# Core Test Standards (shared)

Authoring standards and core-suite inclusion criteria for shell-based tests (Docker, CLI, Task mode). Referenced by `tests/CLAUDE.md`, `tests/cli-mode/core/CLAUDE.md`, `tests/docker/core/CLAUDE.md`, and the plan docs under `tests/docker/`.

## Structure & boilerplate

- Start with `#!/bin/bash` + `set -euo pipefail`.
- `PROJECT_ROOT=$(git rev-parse --show-toplevel)`, then `source "$PROJECT_ROOT/tests/test-utils.sh"` for helpers/logging.
- One function per check (`test_<scenario>()`), invoked explicitly at the bottom so order is obvious.
- `cleanup()` + `trap cleanup EXIT` whenever containers, worktrees, temp dirs, or env files are created — clean up even on failure.
- Route noisy commands through `log_step`, `log_info`, `annotate`, `assert_success`.
- Header docstring: one-line purpose, phase, priority, related bug/ticket. Cite the bug inline on any assertion that guards a past regression.
- Cluster comments with GIVEN/WHEN/THEN only where logic is non-obvious.

```bash
#!/bin/bash
# tests/<mode>/core/<category>/test-name.sh
# Phase X :: <purpose> (Priority X / Bug #<id>)
set -euo pipefail
PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

cleanup() { : ; }   # docker rm -f, git worktree prune, rm -rf "$TMP_DIR", etc.
trap cleanup EXIT

test_scenario() {
  log_step "GIVEN <context>"
  # WHEN <action>
  # THEN assert_* "<result>"
}
test_scenario
```

## Directory & naming

- Docker-first flows → `tests/docker/`; CLI → `tests/cli-mode/`; Task() → `tests/task-mode/`; frozen legacy → `tests/archive/historical/<sprint-id>/`.
- Split a topic into a subfolder (`coordination/`, `lifecycle/`, `perf/`) once it exceeds five scripts.
- Semantic suffixes (`-fault-tolerance`, `-sharded`, `-perf`), not numeric variants.

## Core-suite inclusion criteria

A test qualifies for a `core/` suite only if it meets ALL:

1. **Clear purpose & docs** — header docstring (purpose, phase, priority), bug reference if applicable, self-describing name.
2. **Production-code fidelity** — integration/e2e tests use real production scripts and images (`cfn-agent:latest`, real `spawn-agent.sh`), never `alpine:latest` inline scripts or mocks.
3. **Non-redundant** — unique validation not covered by another core/unit/integration/e2e test; redundant ones move to `core/legacy/` with a README note.
4. **Correct category** — unit (`core/unit/`, no external deps, <10s), integration (`core/integration/`, may need Redis/Docker, 10-60s), e2e (`core/e2e/`, all deps, 1-5m).
5. **Structure compliance** — boilerplate above: `set -euo pipefail`, sources `test-utils.sh`, `cleanup()` trap, structured logging, GIVEN/WHEN/THEN.
6. **Runner integration** — executable, referenced/discovered by `run-all-tests.sh`, passes via the runner, cleans up on failure. Legacy excluded by default.
7. **Idempotent & maintainable** — runs repeatedly without side effects; comments explain non-obvious logic; clear pass/fail criteria.

Move to `core/legacy/` when a test duplicates newer coverage, uses mocks instead of real paths, targets an already-fixed bug now validated elsewhere, lacks a clear description, or adds no unique value. Record the reason (and replacement) in `core/legacy/README.md`.

## BUG #21: tests must exercise real production paths

**The gap:** tests used `docker run alpine:latest sh -c "inline script"`; production used real `cfn-spawn → spawn-agent.sh → cfn-agent image → npx claude-flow-novice agent`.

**The failure:** `spawn-agent.sh` had wrong CLI syntax (`npx ... agent "$AGENT_TYPE"` missing `--task-id "$TASK_ID"`). Tests passed 100% while production failed 100%, because tests bypassed the real spawning mechanism.

**Prevention — integration/e2e tests MUST:**
- Use `.claude/skills/cfn-docker-agent-spawning/spawn-agent.sh` and `claude-flow-novice-agent:latest` (not alpine).
- Validate the actual Docker CMD construction, not inline scripts.
- Check container logs for CLI errors (e.g. "Agent type is required"), not just exit codes.
- Confirm agents produce deliverables (no "consensus on vapor").

Every production code path needs both a unit test (script logic / syntax, fast, no containers) and an integration test (end-to-end with real images/scripts, logs checked).

The North Star e2e test (`tests/cli-mode/core/e2e/test-cfn-loop-cli-real-execution.sh`) is the final gate: zero mocks, exact production flow, 5 full iterations validating context passing and the ITERATE → feedback → retry workflow. Runtime 5-10 min; if it passes, production works.
