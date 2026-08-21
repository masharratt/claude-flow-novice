#!/usr/bin/env bash
# Root-resolution gate.
#
# THE BUG THIS NAMES (root-depth family, 2026-08-20)
# -------------------------------------------------
# Commit 921604f4d ran a blind path substitution over 94 files to add
# BASH_SOURCE-derived roots. A later consolidation (11a517ca6, 970d936f0) moved
# most skills one or two directories deeper: a top-level `cfn-<thing>/` became
# `cfn-<parent>/lib/<sub>/`. Nobody recomputed the `../` depth, so 31 scripts
# were left computing a "repo root" that was not one:
#
#   .claude/skills/cfn-test-framework/lib/runner  +  ../../..   ->  <repo>/.claude/skills
#
# A path N components below the root needs N `../`. `.claude/skills/<skill>/lib/<sub>`
# is 5 components down, so it needs 5. Everything built on the short chain pointed
# into `.claude/skills/`: `$PROJECT_ROOT/tests/hello-world/...` became
# `<repo>/.claude/skills/tests/hello-world/...`, which cannot exist, and
# `$PROJECT_ROOT/.cfn/task-configs` silently wrote task configs into the CFN
# source tree.
#
# Failures were silent because most of these paths are `source ... || true`
# side calls, `-f` guards, or writes that succeed into the wrong directory.
# Counting `../` by eye is exactly what produced the bug, so this gate resolves
# every chain by EXECUTING it and checking the landing directory.
#
# THREE ANCHOR CLASSES (conflating them is the deeper defect)
# ----------------------------------------------------------
#   CFN_TREE      Shared CFN code and this repo's own sources: helper libs,
#                 `scripts/`, `src/`, `dist/`, `tests/`, `.claude/cfn-config/`.
#                 A BASH_SOURCE-derived repo root is correct. Check 1 asserts
#                 the chain lands on a directory holding a repo marker.
#
#   PROJECT_DATA  Per-project data and output the INVOKING project owns:
#                 `.artifacts/`, `.cfn/`, `planning/`, `.cfn-cache/`, a benchmark
#                 DB. A BASH_SOURCE root is WRONG here even at the correct depth,
#                 because skills reach every project through the reverse symlinks
#                 in CLAUDE.md, so it resolves into the shared CFN checkout and
#                 the skill writes into CFN instead of the caller. The anchor is
#                 `${CLAUDE_PROJECT_DIR:-$PWD}`. Check 2 asserts that literal and
#                 the absence of a BASH_SOURCE chain; check 3 proves at runtime
#                 that the output actually follows CLAUDE_PROJECT_DIR.
#
#   REPO_ONLY     A harness that must run against this repo's sources. A
#                 SCRIPT_DIR-derived repo root is right; a cwd-relative path
#                 needs `# portability-ok: <reason>` (see
#                 tests/test-shell-portability.sh).
#
# WHY A MANIFEST AND NOT A TREE SCAN
# ----------------------------------
# A generic scan cannot tell a bug from a deliberate choice: a variable named
# `ROOT` that genuinely means the SKILL root lands outside any repo marker and is
# correct. That heuristic found this family but also flagged legitimate skill
# roots. So the two manifests below are the contract: every entry was read
# use-by-use, classified, and fixed. An entry regressing fails here by name.
#
# Usage:
#   tests/test-root-resolution.sh           # check, non-zero on violation
#   tests/test-root-resolution.sh --list    # print both manifests
set -uo pipefail

cd "$(git rev-parse --show-toplevel)"

REPO_ROOT="$PWD"
FAIL=0

# A directory is a repo root iff it holds a repo marker. Both are required: the
# short chains in the bug landed on `<repo>/.claude` and `<repo>/.claude/skills`,
# neither of which holds either marker, which is precisely the signal.
has_repo_marker() {
  [ -f "$1/package.json" ] && [ -e "$1/.git" ]
}

# --- manifest 1: CFN_TREE class ------------------------------------------------
# "<file>|<var>" - var is assigned from a bare `../` chain off a
# $(dirname "${BASH_SOURCE[0]}")-derived directory and IS used as a repo root.
CFN_TREE_MANIFEST='
.claude/skills/cfn-agent-lifecycle/lib/spawning/spawn-agent-wrapper.sh|PROJECT_ROOT
.claude/skills/cfn-agent-lifecycle/lib/spawning/spawn-worker.sh|PROJECT_ROOT
.claude/skills/cfn-codesearch/cfn-integration.sh|PROJECT_ROOT
.claude/skills/cfn-decisions/tests/run-all.sh|REPO_ROOT
.claude/skills/cfn-deployment-lifecycle/lib/deployment/execute.sh|PROJECT_ROOT
.claude/skills/cfn-error-management/lib/logging/invoke-error-logging.sh|PROJECT_ROOT
.claude/skills/cfn-knowledge-base/lib/playbook/query-playbook.sh|PROJECT_ROOT
.claude/skills/cfn-knowledge-base/lib/playbook/update-playbook.sh|PROJECT_ROOT
.claude/skills/cfn-knowledge-base/lib/workflow/propagate-skill-update.sh|PROJECT_ROOT
.claude/skills/cfn-knowledge-base/lib/workflow/test-metadata-update.sh|PROJECT_ROOT
.claude/skills/cfn-knowledge-base/lib/workflow/track-cost-savings.sh|PROJECT_ROOT
.claude/skills/cfn-loop-orchestration-v2/lib/orchestrator/test-iteration-context-injection.sh|PROJECT_ROOT
.claude/skills/cfn-memory-persistence/lib/sqlite/ttl-cleanup.sh|PROJECT_ROOT
.claude/skills/cfn-operations/lib/log/execute.sh|PROJECT_ROOT
.claude/skills/cfn-operations/lib/log/test.sh|PROJECT_ROOT
.claude/skills/cfn-skill-management/lib/loader/execute.sh|PROJECT_ROOT
.claude/skills/cfn-skill-management/lib/propagation/propagate-skill-update.sh|PROJECT_ROOT
.claude/skills/cfn-sprint-execution/lib/checkpoint/cleanup-orphans.sh|PROJECT_ROOT
.claude/skills/cfn-sprint-execution/lib/checkpoint/resume-wave.sh|PROJECT_ROOT
.claude/skills/cfn-sprint-execution/lib/checkpoint/save-checkpoint.sh|PROJECT_ROOT
.claude/skills/cfn-task-planning/lib/audit/store-task-audit.sh|PROJECT_ROOT
.claude/skills/cfn-test-framework/lib/runner/detect-regressions.sh|CFN_ROOT
.claude/skills/cfn-test-framework/lib/runner/run-all-tests.sh|CFN_ROOT
.claude/skills/cfn-test-framework/lib/runner/store-benchmarks.sh|CFN_ROOT
.claude/skills/cfn-test-framework/lib/runner/validate-redis-keys.sh|PROJECT_ROOT
'

# --- manifest 2: PROJECT_DATA class -------------------------------------------
# "<file>|<var>" - var anchors per-project data and MUST be
# ${CLAUDE_PROJECT_DIR:-$PWD}, never a BASH_SOURCE chain at any depth.
PROJECT_DATA_MANIFEST='
.claude/skills/cfn-task-planning/lib/config/initialize-config.sh|PROJECT_DATA_ROOT
.claude/skills/cfn-knowledge-base/lib/workflow/deploy-approved-skill.sh|CONTENT_BASE_DIR
.claude/skills/cfn-knowledge-base/lib/workflow/propagate-skill-update.sh|CONTENT_BASE_DIR
.claude/skills/cfn-test-framework/lib/runner/detect-regressions.sh|PROJECT_DATA_ROOT
.claude/skills/cfn-test-framework/lib/runner/init-benchmark-db.sh|PROJECT_DATA_ROOT
.claude/skills/cfn-test-framework/lib/runner/run-all-tests.sh|PROJECT_DATA_ROOT
.claude/skills/cfn-test-framework/lib/runner/store-benchmarks.sh|PROJECT_DATA_ROOT
.claude/skills/cfn-workbench/render.sh|PROJECT_ROOT_DEFAULT
.claude/skills/cfn-workbench/watch.sh|ROOT
.claude/skills/cfn-knowledge-base/lib/workflow/approval-workflow.sh|ENV_FILE
.claude/skills/cfn-knowledge-base/lib/workflow/review-skill.sh|ENV_FILE
'

manifest() { echo "$1" | grep -v '^[[:space:]]*$'; }

if [ "${1:-}" = "--list" ]; then
  echo "# CFN_TREE (BASH_SOURCE-derived repo root)"
  manifest "$CFN_TREE_MANIFEST"
  echo "# PROJECT_DATA (\${CLAUDE_PROJECT_DIR:-\$PWD})"
  manifest "$PROJECT_DATA_MANIFEST"
  exit 0
fi

# assignment_line <file> <var> - the LAST assignment of var in file, or empty.
# Last, not first, because two of these files carry a duplicated assignment
# block (deploy-approved-skill.sh, propagate-skill-update.sh) and the later one
# is the value every use actually sees. Fixing only the first is a no-op, which
# is a mistake this gate has to catch.
assignment_line() {
  grep -nE "^[[:space:]]*$2=" "$1" 2>/dev/null | tail -1
}

# --- check 1: every CFN_TREE chain resolves to a real repo root ----------------
echo "--- check 1: CFN_TREE roots land on a repo marker"
C1_BAD=""
C1_N=0
while IFS='|' read -r file var; do
  [ -n "$file" ] || continue
  C1_N=$((C1_N + 1))
  if [ ! -f "$file" ]; then
    C1_BAD="$C1_BAD\n  $file: missing (manifest is stale)"
    continue
  fi
  line=$(assignment_line "$file" "$var")
  if [ -z "$line" ]; then
    C1_BAD="$C1_BAD\n  $file: no '$var=' assignment (manifest is stale)"
    continue
  fi
  # Pull the ../ chain out of the assignment and resolve it for real, from a cwd
  # that is not this repo, so a chain that only works when cwd happens to be the
  # repo root cannot pass.
  chain=$(printf '%s' "$line" | grep -oE '(\.\./)+(\.\.)?' | head -1)
  if [ -z "$chain" ]; then
    C1_BAD="$C1_BAD\n  $file: $var has no ../ chain: $(printf '%s' "$line" | cut -c1-90)"
    continue
  fi
  landed=$(cd /tmp && cd "$REPO_ROOT/$(dirname "$file")" && cd "$chain" 2>/dev/null && pwd)
  if [ -z "$landed" ]; then
    C1_BAD="$C1_BAD\n  $file: $var chain '$chain' does not resolve"
  elif ! has_repo_marker "$landed"; then
    C1_BAD="$C1_BAD\n  $file: $var chain '$chain' -> $landed (no package.json + .git)"
  fi
done <<EOF
$(manifest "$CFN_TREE_MANIFEST")
EOF

if [ -n "$C1_BAD" ]; then
  echo "FAIL: root chain does not reach the repo root." >&2
  printf '%b\n' "$C1_BAD" >&2
  echo "  Fix: count the components between the script's directory and the repo" >&2
  echo "       root and use exactly that many '../'. Never count by eye: run" >&2
  echo "       (cd <script dir> && cd <chain> && pwd) and read the result." >&2
  echo "       .claude/skills/<skill>/lib/<sub> is 5 down, so it needs 5." >&2
  FAIL=1
else
  echo "PASS: $C1_N CFN_TREE root(s) resolve to a directory holding package.json + .git"
fi

# --- check 2: PROJECT_DATA anchors are CLAUDE_PROJECT_DIR, not BASH_SOURCE ----
echo "--- check 2: PROJECT_DATA anchors do not point into the CFN source tree"
C2_BAD=""
C2_N=0
while IFS='|' read -r file var; do
  [ -n "$file" ] || continue
  C2_N=$((C2_N + 1))
  if [ ! -f "$file" ]; then
    C2_BAD="$C2_BAD\n  $file: missing (manifest is stale)"
    continue
  fi
  line=$(assignment_line "$file" "$var")
  if [ -z "$line" ]; then
    C2_BAD="$C2_BAD\n  $file: no '$var=' assignment (manifest is stale)"
    continue
  fi
  body=${line#*:}
  case "$body" in
    *'${CLAUDE_PROJECT_DIR:-$PWD}'*) ;;
    *) C2_BAD="$C2_BAD\n  $file: $var is not anchored on \${CLAUDE_PROJECT_DIR:-\$PWD}: $(printf '%s' "$body" | cut -c1-90)" ;;
  esac
  case "$body" in
    *BASH_SOURCE*|*SCRIPT_DIR*)
      C2_BAD="$C2_BAD\n  $file: $var is derived from BASH_SOURCE/SCRIPT_DIR, which resolves into the shared CFN tree" ;;
  esac
done <<EOF
$(manifest "$PROJECT_DATA_MANIFEST")
EOF

if [ -n "$C2_BAD" ]; then
  echo "FAIL: per-project data anchored on the CFN source tree." >&2
  printf '%b\n' "$C2_BAD" >&2
  echo "  Fix: .artifacts/, .cfn/, planning/ and .cfn-cache/ belong to the project" >&2
  echo "       that invoked the skill. Use \${CLAUDE_PROJECT_DIR:-\$PWD}. A" >&2
  echo "       BASH_SOURCE root resolves into the CFN checkout that every project" >&2
  echo "       shares through the reverse symlinks in CLAUDE.md." >&2
  FAIL=1
else
  echo "PASS: $C2_N PROJECT_DATA anchor(s) honor \${CLAUDE_PROJECT_DIR:-\$PWD}"
fi

# --- check 3: runtime proof that output follows CLAUDE_PROJECT_DIR ------------
# Checks 1 and 2 read the assignment. This one runs the script and looks at where
# the file lands, which is the behavior the bug actually broke. Scoped to the two
# scripts whose whole job is to create one artifact, so nothing else is executed.
echo "--- check 3: runtime, output lands under CLAUDE_PROJECT_DIR"
C3_BAD=""
C3_RAN=0

if command -v jq >/dev/null 2>&1; then
  SANDBOX=$(mktemp -d "${TMPDIR:-/tmp}/cfn-root-resolution.XXXXXX")
  # cwd is deliberately / so that only CLAUDE_PROJECT_DIR can steer the write.
  ( cd / && CLAUDE_PROJECT_DIR="$SANDBOX" \
      "$REPO_ROOT/.claude/skills/cfn-task-planning/lib/config/initialize-config.sh" \
      --task-description "root resolution regression probe" \
      --task-id "rootres-probe" ) >/dev/null 2>&1
  C3_RAN=$((C3_RAN + 1))
  if [ ! -f "$SANDBOX/.cfn/task-configs/task-rootres-probe.json" ]; then
    C3_BAD="$C3_BAD\n  initialize-config.sh: no config under \$CLAUDE_PROJECT_DIR/.cfn/task-configs"
  fi
  # The pre-fix form wrote into the CFN tree. Assert it did not.
  if [ -e "$REPO_ROOT/.claude/skills/.cfn" ] || \
     [ -f "$REPO_ROOT/.cfn/task-configs/task-rootres-probe.json" ]; then
    C3_BAD="$C3_BAD\n  initialize-config.sh: wrote into the CFN tree instead of \$CLAUDE_PROJECT_DIR"
  fi
  rm -rf "$SANDBOX"
else
  echo "  SKIP initialize-config.sh probe: jq not installed"
fi

if command -v sqlite3 >/dev/null 2>&1; then
  SANDBOX=$(mktemp -d "${TMPDIR:-/tmp}/cfn-root-resolution.XXXXXX")
  ( cd / && CLAUDE_PROJECT_DIR="$SANDBOX" \
      "$REPO_ROOT/.claude/skills/cfn-test-framework/lib/runner/init-benchmark-db.sh" ) >/dev/null 2>&1
  C3_RAN=$((C3_RAN + 1))
  if [ ! -f "$SANDBOX/.artifacts/test-benchmarks.db" ]; then
    C3_BAD="$C3_BAD\n  init-benchmark-db.sh: no benchmark DB under \$CLAUDE_PROJECT_DIR/.artifacts"
  fi
  if [ -e "$REPO_ROOT/.claude/skills/.artifacts" ]; then
    C3_BAD="$C3_BAD\n  init-benchmark-db.sh: created .artifacts inside .claude/skills (short ../ chain is back)"
  fi
  rm -rf "$SANDBOX"
else
  echo "  SKIP init-benchmark-db.sh probe: sqlite3 not installed"
fi

if [ -n "$C3_BAD" ]; then
  echo "FAIL: per-project output did not follow CLAUDE_PROJECT_DIR." >&2
  printf '%b\n' "$C3_BAD" >&2
  FAIL=1
elif [ "$C3_RAN" -eq 0 ]; then
  echo "SKIP: no runtime probe could run (jq and sqlite3 both absent)"
else
  echo "PASS: $C3_RAN runtime probe(s) wrote under \$CLAUDE_PROJECT_DIR"
fi

echo "---"
if [ "$FAIL" -eq 0 ]; then
  echo "root resolution: OK ($C1_N CFN_TREE, $C2_N PROJECT_DATA, $C3_RAN runtime)"
else
  echo "root resolution: FAILED. See the header of this file for the anchor classes." >&2
fi
exit "$FAIL"
