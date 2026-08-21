#!/usr/bin/env bash
# Tests for where cfn-task-planning's task decomposer writes its output.
#
# The decomposer used to write both its subtask JSON and its generated agent
# prompts to a cwd-relative `.claude/skills/cfn-task-decomposition/` path. That
# was wrong three ways at once:
#
#   1. `cfn-task-decomposition` is not a skill. The name is dead; the decomposer
#      lives in cfn-task-planning.
#   2. `.claude/skills/` is CFN *source*, shared into every project by the
#      reverse symlinks described in CLAUDE.md. Generated per-run artifacts
#      written there land in the source tree and, via the symlinks, in every
#      other project's view of it.
#   3. The path was cwd-relative, so the output landed under whatever project
#      happened to invoke the skill, at whatever depth the shell was in.
#
# The fix routes output to `.artifacts/task-decomposition/`, the convention CFN
# already uses for per-project generated output (cfn-edit-safety writes
# `.artifacts/feedback`, cfn-memory-persistence writes `.artifacts/memory`),
# anchored on $CLAUDE_PROJECT_DIR with a cwd fallback.
#
# What is verified here:
#   * output lands in $CLAUDE_PROJECT_DIR/.artifacts/task-decomposition
#   * the artifacts dir and its prompts/ subdir are created when absent
#   * with CLAUDE_PROJECT_DIR unset, output falls back to the cwd, not to $HOME
#     and not to the CFN source tree
#   * nothing whatsoever is written under any `.claude/skills/` path
#   * the source no longer names the dead `cfn-task-decomposition` skill, and no
#     longer carries the portability-ok markers that papered over the old path
set -uo pipefail

cd "$(git rev-parse --show-toplevel)"
REPO="$PWD"
DECOMPOSER="$REPO/.claude/skills/cfn-task-planning/lib/decomposition/task-decomposer.sh"

PASS=0; FAIL=0
ok()  { PASS=$((PASS + 1)); echo "PASS: $1"; }
bad() { FAIL=$((FAIL + 1)); echo "FAIL: $1"; echo "        want: $2"; echo "        got:  $3"; }
eq()  { [ "$2" = "$3" ] && ok "$1" || bad "$1" "$2" "$3"; }

if ! command -v jq >/dev/null 2>&1; then
    echo "SKIP: jq not installed; the decomposer cannot run without it"
    exit 0
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# The decomposer opportunistically pushes its result to redis. Shadow redis-cli
# with a no-op so a test run cannot touch a real instance, and so the result is
# identical on machines with and without redis installed.
mkdir -p "$TMP/shim"
printf '#!/usr/bin/env bash\nexit 0\n' > "$TMP/shim/redis-cli"
chmod +x "$TMP/shim/redis-cli"
export PATH="$TMP/shim:$PATH"

run_decomposer() {
    # run_decomposer <sandbox> <task-id> [set-project-dir]
    # Runs from inside the sandbox so a cwd-relative regression would be
    # visible there rather than silently in the repo.
    local sandbox="$1" task_id="$2" set_project_dir="${3:-yes}"
    mkdir -p "$sandbox"
    if [ "$set_project_dir" = "yes" ]; then
        ( cd "$sandbox" && CLAUDE_PROJECT_DIR="$sandbox" \
            bash "$DECOMPOSER" --task-id="$task_id" \
                --description="Fix TypeScript errors in the auth module" \
                >/dev/null 2>&1 )
    else
        ( cd "$sandbox" && unset CLAUDE_PROJECT_DIR && \
            bash "$DECOMPOSER" --task-id="$task_id" \
                --description="Fix TypeScript errors in the auth module" \
                >/dev/null 2>&1 )
    fi
    echo "$?"
}

# --- case 1: CLAUDE_PROJECT_DIR anchors the artifacts dir --------------------
PROJ="$TMP/proj-explicit"
eq "decomposer exits 0 with CLAUDE_PROJECT_DIR set" \
   "0" "$(run_decomposer "$PROJ" task-explicit yes)"

ART="$PROJ/.artifacts/task-decomposition"
eq "artifacts dir is created" \
   "1" "$([ -d "$ART" ] && echo 1 || echo 0)"
eq "subtasks JSON lands in the artifacts dir" \
   "1" "$([ -f "$ART/task-explicit-subtasks.json" ] && echo 1 || echo 0)"
eq "subtasks JSON is valid JSON naming its task" \
   "task-explicit" "$(jq -r '.task_id' "$ART/task-explicit-subtasks.json" 2>/dev/null)"
eq "prompts subdir is created" \
   "1" "$([ -d "$ART/prompts" ] && echo 1 || echo 0)"
eq "at least one agent prompt is written into prompts/" \
   "1" "$([ "$(find "$ART/prompts" -name '*-prompt.md' | wc -l)" -gt 0 ] && echo 1 || echo 0)"

# The whole point of the change: no generated file anywhere under .claude/skills.
eq "nothing is written under any .claude/skills path in the sandbox" \
   "0" "$(find "$PROJ" -path '*/.claude/skills/*' 2>/dev/null | wc -l)"
eq "no .claude dir is created in the sandbox at all" \
   "0" "$(find "$PROJ" -name '.claude' -type d 2>/dev/null | wc -l)"

# --- case 2: cwd fallback when CLAUDE_PROJECT_DIR is unset ------------------
FALLBACK="$TMP/proj-fallback"
eq "decomposer exits 0 with CLAUDE_PROJECT_DIR unset" \
   "0" "$(run_decomposer "$FALLBACK" task-fallback no)"
eq "output falls back to the cwd, not \$HOME or the CFN source tree" \
   "1" "$([ -f "$FALLBACK/.artifacts/task-decomposition/task-fallback-subtasks.json" ] && echo 1 || echo 0)"
eq "fallback run also writes nothing under .claude/skills" \
   "0" "$(find "$FALLBACK" -path '*/.claude/skills/*' 2>/dev/null | wc -l)"

# --- case 3: the real skill tree is untouched by a run ----------------------
# A regression that kept the old path would recreate the dead skill directory
# in this repo, which is exactly the damage worth asserting against.
eq "dead cfn-task-decomposition skill dir does not exist in the repo" \
   "0" "$([ -e "$REPO/.claude/skills/cfn-task-decomposition" ] && echo 1 || echo 0)"

# --- case 4: static guards on the source ------------------------------------
eq "source no longer names the dead cfn-task-decomposition skill" \
   "0" "$(grep -c 'cfn-task-decomposition' "$DECOMPOSER")"
# Comments may still discuss .claude/skills (the file explains why it must not
# write there). Only executable lines are a defect, so strip comment-only lines.
eq "source has no write target under .claude/skills outside comments" \
   "0" "$(grep -v '^[[:space:]]*#' "$DECOMPOSER" | grep -c '\.claude/skills/')"
eq "the portability-ok markers that masked the old path are gone" \
   "0" "$(grep -c 'portability-ok' "$DECOMPOSER")"
eq "artifacts dir is anchored on CLAUDE_PROJECT_DIR with a cwd fallback" \
   "1" "$(grep -c 'ARTIFACTS_DIR="\${CLAUDE_PROJECT_DIR:-\$PWD}/\.artifacts/task-decomposition"' "$DECOMPOSER")"
eq "artifacts anchor does not fall back to \$HOME" \
   "0" "$(grep -c 'ARTIFACTS_DIR=.*\$HOME' "$DECOMPOSER")"

echo "---"
echo "task-decomposer artifacts: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
