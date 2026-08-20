#!/usr/bin/env bash
# Unit tests for check 3 of tests/test-shell-portability.sh (cwd-relative
# references to the shared CFN skills dir).
#
# Check 3 is the only check in that gate that has to read markdown, and markdown
# legitimately cites repo-relative paths in tables and "see also" pointers. So
# the thing worth testing is not "does it find a bad path" but "does it tell
# code apart from prose". A gate with a 70% false-positive rate gets ignored,
# which is the same as not having one.
#
# The gate resolves its own scope with `git ls-files` inside
# `git rev-parse --show-toplevel`, so it cannot be tested against loose files.
# Each case therefore runs against a throwaway git repo containing only the
# fixture, which also means these tests cannot be perturbed by whatever the
# real tree currently looks like. No commit is made: `git ls-files` reads the
# index, so `git add` is enough and no git identity is required.
#
# What is verified here:
#   * each executable-position shape is caught (VAR=, ./, command arg, test
#     operand, backticked run instruction)
#   * a correctly-rooted reference is not caught, for every rooting form in use
#   * a commented reference is not caught
#   * `portability-ok: <reason>` exempts, and a reasonless marker does NOT
#   * prose citations are not caught (the false-positive class)
#   * excluded trees (tests/, docs/) are not scanned
#   * widening scope for check 3 did not widen checks 1 and 2
set -uo pipefail

cd "$(git rev-parse --show-toplevel)"
GATE="$PWD/tests/test-shell-portability.sh"

PASS=0; FAIL=0
ok()   { PASS=$((PASS + 1)); echo "PASS: $1"; }
bad()  { FAIL=$((FAIL + 1)); echo "FAIL: $1"; echo "        want: $2"; echo "        got:  $3"; }
eq()   { [ "$2" = "$3" ] && ok "$1" || bad "$1" "$2" "$3"; }

FIX=$(mktemp -d)
trap 'rm -rf "$FIX"' EXIT

mk() { mkdir -p "$FIX/$(dirname "$1")"; cat > "$FIX/$1"; }

# --- fixture ----------------------------------------------------------------
# One positive line per executable-position shape.
mk .claude/commands/pos-shapes.md <<'EOF'
PP=.claude/skills/cfn-megaplan/lib/plan-paths.sh
./.claude/skills/cfn-workbench/emit-event.sh --slug "$RUN_ID" --event started || true
bash .claude/skills/cfn-decisions/hook.sh --slug "$SLUG"
[ -f .claude/skills/cfn-megaplan/bars/check-size.sh ] && echo present
Run `.claude/skills/cfn-megaplan/bars/check-phase-width.sh PLAN_x.md` before finishing.
EOF

# Every rooting form that is actually correct. None may be reported.
mk .claude/commands/neg-rooted.md <<'EOF'
PP=$HOME/.claude/skills/cfn-megaplan/lib/plan-paths.sh
$HOME/.claude/skills/cfn-workbench/emit-event.sh --slug x || true
BARS="${HOME}/.claude/skills/cfn-megaplan/bars"
bash "$CFN_SKILLS/.claude/skills/cfn-decisions/hook.sh" --slug y
cd "$CLAUDE_PROJECT_DIR/.claude/skills/cfn-codesearch"
[ -f "$ROOT/.claude/skills/cfn-megaplan/bars/check-size.sh" ] && echo present
source /opt/cfn/.claude/skills/cfn-common/lib.sh
Run `$HOME/.claude/skills/cfn-megaplan/bars/check-phase-width.sh PLAN_x.md` first.
EOF

# Comments are provenance, not behavior. Same rule as check 2.
mk .claude/commands/neg-comment.md <<'EOF'
# PP=.claude/skills/cfn-megaplan/lib/plan-paths.sh
#   bash .claude/skills/cfn-decisions/hook.sh --slug y
   # ./.claude/skills/cfn-workbench/emit-event.sh --slug x
EOF

# The exemption, in both comment syntaxes the tree uses.
mk .claude/commands/neg-exempt.md <<'EOF'
PP=.claude/skills/cfn-megaplan/lib/plan-paths.sh # portability-ok: repo-root-only bootstrap
bash .claude/skills/cfn-decisions/hook.sh <!-- portability-ok: fixture data, never executed -->
EOF

# A marker with no reason is a silent mute, so it must NOT exempt.
mk .claude/commands/pos-bare-marker.md <<'EOF'
PP=.claude/skills/cfn-megaplan/lib/plan-paths.sh # portability-ok:
EOF

# The false-positive class: prose that legitimately names a repo path.
mk .claude/commands/neg-prose.md <<'EOF'
| `.claude/skills/cfn-agent-selector/select-agents.sh` | `.claude/skills/x/y.sh` |
See `.claude/skills/cfn-megaplan/SKILL.md` for the full contract.
- Orchestrator: `.claude/skills/cfn-loop-orchestration-v2/cli/orchestrate.sh`
- Tests: `.claude/skills/cfn-file-operations/test.sh`
**File**: `.claude/skills/cfn-loop-orchestration/orchestrate-enhanced.sh` (549 lines)
1. `.claude/skills/cfn-loop-orchestration/test-cfn-orchestration.sh` (path missing)
Read: .claude/skills/cfn-loop-orchestration/SKILL.md
The plan dir is resolved by .claude/skills/cfn-megaplan/lib/plan-paths.sh, which
prose can name mid-sentence without invoking it.
EOF

# A .sh inside the skills tree: in scope for check 3.
mk .claude/skills/cfn-fix/run.sh <<'EOF'
#!/usr/bin/env bash
AGENT=$(bash .claude/skills/cfn-agent-spawning/parse-agent-provider.sh "$1")
OUT=".claude/skills/cfn-task-decomposition/out.json"
echo "$AGENT $OUT"
EOF

# Excluded trees. Relative refs here must be ignored: prose, or root-only.
mk tests/fixture-excluded.sh <<'EOF'
#!/usr/bin/env bash
bash .claude/skills/cfn-decisions/hook.sh --slug from-repo-root
EOF
mk docs/fixture-excluded.md <<'EOF'
PP=.claude/skills/cfn-megaplan/lib/plan-paths.sh
EOF
mk readme/fixture-excluded.md <<'EOF'
./.claude/skills/cfn-workbench/emit-event.sh --slug x
EOF

# Proof that widening scope for check 3 did not widen checks 1 and 2: a shebang
# and a hardcoded home path, both inside markdown. Checks 1 and 2 look only at
# `*.sh`, so both must stay silent.
# The fixture needs literal home paths, but check 2 scans *.sh and would flag
# THIS file for holding them. Assemble from parts so the source stays clean and
# the negative test still passes on file extension alone, not on an exemption.
_H=/home
_U=/Users
mk .claude/commands/neg-not-check12.md <<EOF
\`\`\`bash
#!/bin/bash
cp $_H/someuser/notes.txt $_U/someuser/notes.txt
\`\`\`
EOF
unset _H _U

( cd "$FIX" && git init -q . && git add -A ) >/dev/null 2>&1

# --- run --------------------------------------------------------------------
OUT=$( cd "$FIX" && bash "$GATE" 2>&1 )
RC=$?

# The gate prints check-2 and check-3 hits in the same `  <file>:<line>:` shape.
# Asserting checks 1 and 2 PASS first is what makes the extraction below
# unambiguous, so it is a precondition, not just a test.
eq "check 1 passes on the fixture (markdown shebang not scanned)" \
   "1" "$(echo "$OUT" | grep -c '^PASS: no script pins the interpreter')"
eq "check 2 passes on the fixture (markdown home path not scanned)" \
   "1" "$(echo "$OUT" | grep -c '^PASS: no hardcoded home paths')"

eq "gate exits nonzero when check 3 fires" "1" "$RC"

HITS=$(echo "$OUT" | sed -n 's/^  \([^ ]*\):\([0-9]*\):.*/\1:\2/p')
COUNT=$(echo "$OUT" | sed -n 's/^FAIL: \([0-9]*\) cwd-relative.*/\1/p')

hit()  { echo "$HITS" | grep -qx "$1"; }
caught()  { hit "$1" && ok "caught: $2 ($1)"    || bad "caught: $2" "$1 reported" "not reported"; }
ignored() { hit "$1" && bad "ignored: $2" "$1 not reported" "reported" || ok "ignored: $2 ($1)"; }

# --- each executable-position shape is caught -------------------------------
caught .claude/commands/pos-shapes.md:1 "VAR= assignment"
caught .claude/commands/pos-shapes.md:2 "line starting ./"
caught .claude/commands/pos-shapes.md:3 "argument to bash"
caught .claude/commands/pos-shapes.md:4 "operand of a -f test"
caught .claude/commands/pos-shapes.md:5 "backticked run instruction with arguments"
caught .claude/skills/cfn-fix/run.sh:2 "argument to bash inside a skill .sh"
caught .claude/skills/cfn-fix/run.sh:3 "quoted VAR= assignment inside a skill .sh"
caught .claude/commands/pos-bare-marker.md:1 "portability-ok with no reason does not exempt"

# --- correctly-rooted references are not caught -----------------------------
for n in 1 2 3 4 5 6 7 8; do
  ignored ".claude/commands/neg-rooted.md:$n" "rooted reference line $n"
done

# --- comments, exemptions, prose --------------------------------------------
for n in 1 2 3; do ignored ".claude/commands/neg-comment.md:$n" "commented reference line $n"; done
for n in 1 2; do ignored ".claude/commands/neg-exempt.md:$n" "portability-ok exemption line $n"; done
for n in 1 2 3 4 5 6 7 8 9; do ignored ".claude/commands/neg-prose.md:$n" "prose citation line $n"; done

# --- excluded trees ---------------------------------------------------------
ignored tests/fixture-excluded.sh:2 "tests/ excluded from check 3"
ignored docs/fixture-excluded.md:1 "docs/ excluded from check 3"
ignored readme/fixture-excluded.md:1 "readme/ excluded from check 3"

# --- exact total: proves nothing else was swept in --------------------------
eq "check 3 reports exactly the 8 planted violations" "8" "$COUNT"

# --- the clean case ---------------------------------------------------------
# Deleting only the positive fixtures must flip the gate to a clean pass. This
# is what proves the negative fixtures above are silent rather than merely
# outnumbered.
rm "$FIX/.claude/commands/pos-shapes.md" \
   "$FIX/.claude/commands/pos-bare-marker.md" \
   "$FIX/.claude/skills/cfn-fix/run.sh"
( cd "$FIX" && git add -A ) >/dev/null 2>&1

CLEAN=$( cd "$FIX" && bash "$GATE" 2>&1 ); CRC=$?
eq "gate exits zero once the planted violations are removed" "0" "$CRC"
eq "check 3 reports PASS on a clean tree" \
   "1" "$(echo "$CLEAN" | grep -c '^PASS: no cwd-relative')"

# --- scope listing ----------------------------------------------------------
REFS=$( cd "$FIX" && bash "$GATE" --list-refs )
eq "--list-refs includes command markdown" \
   "1" "$(echo "$REFS" | grep -cx '.claude/commands/neg-prose.md')"
eq "--list-refs excludes docs/" \
   "0" "$(echo "$REFS" | grep -cx 'docs/fixture-excluded.md')"
eq "--list-refs excludes tests/" \
   "0" "$(echo "$REFS" | grep -cx 'tests/fixture-excluded.sh')"
eq "--list (shell scope) still includes tests/" \
   "1" "$(cd "$FIX" && bash "$GATE" --list | grep -cx 'tests/fixture-excluded.sh')"

echo "---"
echo "portability skill-refs: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
