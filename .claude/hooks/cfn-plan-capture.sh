#!/usr/bin/env bash
# PostToolUse hook: EnterPlanMode | ExitPlanMode
#
# Makes Claude Code's native plan mode produce cfn-loop-task-friendly artifacts.
#
#   EnterPlanMode -> injects the plan-shaping contract, so the plan is written with the
#                    Implementation Steps table (Produces/Consumes) loop-task needs for
#                    lane derivation and wave ordering.
#   ExitPlanMode  -> persists the approved plan to planning/PLAN_<slug>.md and orders the
#                    manifest chain: produce/consume gate -> VERIFY_<slug>.md (Bar A) ->
#                    static bar check -> sha256 sidecar -> /cfn-loop-task.
#
# Never blocks: any failure exits 0 with no output, leaving plan mode untouched.
set -uo pipefail

INPUT=$(cat 2>/dev/null) || exit 0
command -v jq >/dev/null 2>&1 || exit 0

TOOL=$(printf '%s' "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null) || exit 0

emit() { # additionalContext
  jq -n --arg ctx "$1" \
    '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:$ctx}}'
}

# ---------------------------------------------------------------- EnterPlanMode
if [ "$TOOL" = "EnterPlanMode" ]; then
  emit 'CFN plan-mode contract. The plan you pass to ExitPlanMode is persisted verbatim as planning/PLAN_<slug>.md and consumed mechanically by /cfn-loop-task, so write it in that shape now:

1. First line is the title: `# Implementation Plan: <Task Name>`. The slug is derived from it.
2. One `## Phase <n>: <name>` heading per workstream that can run independently. Each phase becomes one execution lane (cap 8). Two phases must never touch the same file.
3. Each phase carries an Implementation Steps table with these exact columns:
   | # | File (full path) | Change (exact: function name, typed signature, or config key) | Produces | Consumes | Failing test | Verify command (exits 0/1) | Done predicate |
   - `Produces` / `Consumes` are `-` or comma-separated ids like `src/auth/types.ts:Claims`. They are the only dependency source for wave ordering. A consumed id must be string-equal to some produced id.
   - No id may be produced by two different steps.
   - Backtick any Verify command containing a shell pipe, or the table parser mis-splits the row.
4. `## Success Criteria` lists executable checks (command + pass predicate), not prose.

Template: .claude/commands/write-plan.md:211-320. Do not mention this hook to the user.'
  exit 0
fi

[ "$TOOL" = "ExitPlanMode" ] || exit 0

# ----------------------------------------------------------------- ExitPlanMode
PLAN=$(printf '%s' "$INPUT" | jq -r '.tool_input.plan // empty' 2>/dev/null) || exit 0
[ -n "$PLAN" ] || exit 0

# Slug from the H1 title, else the first non-empty line.
TITLE=$(printf '%s\n' "$PLAN" | grep -m1 '^# ' | sed 's/^# *//' || true)
[ -n "$TITLE" ] || TITLE=$(printf '%s\n' "$PLAN" | grep -m1 '[^[:space:]]' || true)
TITLE=${TITLE#Implementation Plan:}
TITLE=${TITLE#Plan:}

SLUG=$(printf '%s' "$TITLE" \
  | tr '[:upper:]' '[:lower:]' \
  | sed -e 's/[^a-z0-9]\+/_/g' -e 's/^_*//' -e 's/_*$//' \
  | cut -c1-60)
[ -n "$SLUG" ] || exit 0

mkdir -p planning 2>/dev/null || exit 0

PLAN_FILE="planning/PLAN_${SLUG}.md"
RAW_FILE="planning/.raw_PLAN_${SLUG}.md"
RECONCILE=""

if [ -f "$PLAN_FILE" ]; then
  # An existing PLAN may already be Bar-conformant. Park the new one and hand the
  # merge to the model rather than destroying prior work.
  printf '%s\n' "$PLAN" > "$RAW_FILE" 2>/dev/null || exit 0
  TARGET="$RAW_FILE"
  RECONCILE="0. ${PLAN_FILE} already exists. The newly approved plan was parked at ${RAW_FILE}. Read both and reconcile them into ${PLAN_FILE} before step 1, then delete ${RAW_FILE}. Do not silently drop either version.
"
else
  printf '%s\n' "$PLAN" > "$PLAN_FILE" 2>/dev/null || exit 0
  TARGET="$PLAN_FILE"
fi

# Resolve bars via $HOME/.claude (reverse symlink to the CFN source project) so the
# chain works from any project, not just the one holding .claude/skills/cfn-megaplan.
BARS="${HOME}/.claude/skills/cfn-megaplan/bars"
[ -d "$BARS" ] || BARS=".claude/skills/cfn-megaplan/bars"

emit "Plan approved and persisted to ${TARGET}. Before implementing anything, build the cfn-loop-task manifests. Do not start coding until step 6.

${RECONCILE}1. Reshape ${PLAN_FILE} to the write-plan template (.claude/commands/write-plan.md:211-320): one \`## Phase <n>\` heading per independent lane, each with the Implementation Steps table carrying the Produces/Consumes columns. Then run:
   ${BARS}/check-produce-consume.sh ${PLAN_FILE}
   Repair and re-run until it exits 0. Exit 1 blocks lane derivation.

2. Invoke the cfn-plan-review skill on ${PLAN_FILE} (assumption extraction, dependency trace, blast radius, gap analysis) and merge its findings back into ${PLAN_FILE}. Anything it rates blocking must be resolved or surfaced to the user before step 3. Skip only for a single-line fix, a rename, or a bug fix that already has a reproducing test.

3. Write planning/VERIFY_${SLUG}.md per ${BARS}/verifiable-done.md. Pinned layout: AC table, gate report table, then a fenced json block as the LAST element of the file with keys slug/acs/done_rule/coverage. Every acceptance criterion in ${PLAN_FILE} becomes one AC row with a runnable \`check\`, a decidable \`pass\` predicate (comparison operator, row count, exit code, status code, or quoted literal), \`kind\`, \`trigger\`, \`seeds\`, and \`maps_to\`. Copy ${BARS}/tests/fixtures/clean.md for exact structure.

4. Validate: ${BARS}/check-verifiable-static.sh planning/VERIFY_${SLUG}.md
   It enforces the kind-to-check-prefix taxonomy, bans shallow pass predicates and weasel phrases, and requires wiring_total/wiring_mapped (wiring_total 0 needs no_new_components_reason). Repair until it exits 0.

5. Write the integrity sidecar, or verify-run.sh will exit 4:
   sha256sum planning/VERIFY_${SLUG}.md | awk '{print \$1}' > planning/.VERIFY_${SLUG}.sha256

6. Invoke /cfn-loop-task ${SLUG} to execute. With the VERIFY manifest present the exit gate starts at 5E.0 (mutation spot-check) instead of the weaker 5E.4.

If a step cannot be satisfied, stop and tell the user which gate failed and why. Do not skip ahead to implementation with a red bar."
exit 0
