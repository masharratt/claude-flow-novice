#!/usr/bin/env bash
# PROJECT_ROOT resolution gate.
#
# Regression tests for five path-resolution defects found in the 2026-08-20
# portability audit. All five are the same shape: a root variable that is either
# computed at the wrong depth, used before it is assigned, or anchored on the
# wrong thing entirely. None of them raise an error at parse time, and four of
# the five fail SILENTLY (a `[ -f ... ]` that is simply always false, a `|| true`
# side call, a file written into the wrong repo), which is why they survived for
# months and why they are checked mechanically here.
#
# The two anchors CFN uses are not interchangeable, and mixing them up is the
# root cause of BUG-2:
#
#   SHARED CFN CODE  -> derived from the script's own location (BASH_SOURCE /
#                       __dirname), or $HOME/.claude/... The skills reach every
#                       project through the reverse symlinks described in
#                       CLAUDE.md, so their own location is always the CFN
#                       checkout, which is exactly right for code and data that
#                       ships inside a skill.
#   PROJECT-LOCAL DATA -> $CLAUDE_PROJECT_DIR, falling back to the cwd. A
#                       backlog or changelog belongs to the project being worked
#                       on. Anchoring it on the script's location files every
#                       project's entries into the CFN repo instead.
#
# The bugs, and how each is proved here:
#
#   BUG-1  add-backlog-item.sh sourced its validation helper through
#          "$PROJECT_ROOT/..." at line 13, ~80 lines BEFORE PROJECT_ROOT was
#          assigned, so it expanded to the absolute path "/.claude/skills/..."
#          and the script died on every invocation. The skill it named
#          (cfn-changelog-management) had also been consolidated away.
#          Introduced by 74abc81e1 ("remove 198 hardcoded paths"), which
#          substituted an absolute prefix for $PROJECT_ROOT without checking
#          whether the variable existed yet at that point in the file.
#          Proof: run the script and require it to reach a validation error that
#          only the sourced helper can produce.
#
#   BUG-2  the same file (and its two changelog siblings) derived their data root
#          from BASH_SOURCE, which resolves into the CFN checkout, so every
#          project's backlog and changelog was written into the CFN repo.
#          Proof: run with CLAUDE_PROJECT_DIR pointed at a scratch dir from an
#          unrelated cwd, require the entry to land there, and require the CFN
#          repo's own readme/ files to be byte-identical afterwards.
#
#   BUG-4  ingest.sh computed the repo root as "$SCRIPT_DIR/../../..". That was
#          correct while the file lived three levels down; commit 11a517ca6
#          ("Consolidate 93 skills to 33") moved it two levels deeper without
#          updating the arithmetic, so the root landed on <repo>/.claude/skills.
#          Every downstream check probed .claude/skills/.claude/skills/... and
#          reported not-found unconditionally, and ingest.sh cd's to that root
#          before reading a manifest, so no repo-relative manifest path could
#          ever resolve. BUG-3 was the same defect in a second file,
#          test-typescript-integration.sh, which has since been deleted; see the
#          note at the probe below.
#          Proof: evaluate the file's own PROJECT_ROOT expression and require
#          the result to be the repo root, plus a landmark file under it.
#
#   BUG-5  the agent-selection TypeScript located agent-mappings.json via
#          `process.env.PROJECT_ROOT || process.cwd()`. That JSON and the agent
#          profiles ship only inside the CFN skill, never per project, so from
#          any other project the lookup pointed at a path that does not exist.
#          Proof: evaluate the real path expressions out of the sources with a
#          controlled __dirname (for both src/ and the sibling dist/ build) and
#          require every target to exist.
#
# Deliberately dynamic: every check below EVALUATES the code under test rather
# than pattern-matching it, because the whole class of bug is "the expression is
# syntactically fine and resolves somewhere useless". A grep for the fixed text
# would pass against any future re-break at a different depth.
#
# Usage:
#   tests/test-project-root-resolution.sh
set -uo pipefail

cd "$(git rev-parse --show-toplevel)"
ROOT="$PWD"

FAIL=0

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1" >&2; FAIL=1; }

# Scratch dir for the project-local-data checks. Nothing outside it is written.
TMP="$(mktemp -d "${TMPDIR:-/tmp}/cfn-projroot-test.XXXXXX")"
cleanup() {
  # Scoped to this test's own mktemp directory, and only ever under the temp dir.
  case "$TMP" in
    "${TMPDIR:-/tmp}"/cfn-projroot-test.*) [ -d "$TMP" ] && rm -rf "$TMP" ;;
  esac
}
trap cleanup EXIT

# A cwd that is deliberately NOT the repo, so a cwd-relative path cannot pass by
# accident. This is the situation every CFN skill actually runs in.
FOREIGN_CWD="$TMP"

# Evaluate a shell file's own `PROJECT_ROOT=` expression with SCRIPT_DIR bound to
# that file's real directory, and print the result. Reads the expression out of
# the file so the test cannot drift from the code.
resolve_project_root() {
  local f="$1" dir line
  dir="$(cd "$(dirname "$f")" && pwd -P)"
  line="$(grep -m1 '^PROJECT_ROOT=' "$f")"
  [ -n "$line" ] || return 1
  (cd "$FOREIGN_CWD" && SCRIPT_DIR="$dir" bash -c "$line"'; printf %s "$PROJECT_ROOT"')
}

# --- BUG-1: validation helper is sourced before any root variable exists ------
BACKLOG_SH=".claude/skills/cfn-project-management/lib/backlog/add-backlog-item.sh"

# A bad --priority can only be reported by validate_enum, which only exists if
# the shared validation helper was sourced successfully. Pre-fix the script died
# at the source line, long before argument validation.
B1_OUT="$(cd "$FOREIGN_CWD" && CLAUDE_PROJECT_DIR="$TMP/b1" bash "$ROOT/$BACKLOG_SH" \
  --item "A sufficiently long backlog item description for validation" \
  --why "regression coverage for BUG-1" \
  --solution "source the helper from SCRIPT_DIR" \
  --priority "P9" 2>&1)"

if printf '%s' "$B1_OUT" | grep -q 'must be one of: P0, P1, P2, P3'; then
  pass "BUG-1: add-backlog-item.sh sources its validation helper successfully"
else
  fail "BUG-1: add-backlog-item.sh could not load lib/changelog/lib/validation.sh."
  printf '%s\n' "$B1_OUT" | sed 's/^/  /' >&2
  echo "  The helper must resolve from SCRIPT_DIR, not from a root variable that" >&2
  echo "  is assigned later in the file (it expanded to /.claude/skills/...)." >&2
fi

# The same file must not reference a root variable it has not defined. Comments
# are provenance, not behavior, so only executable lines count.
if grep -nE '\$\{?PROJECT_ROOT' "$BACKLOG_SH" | grep -vqE '^[0-9]+:[[:space:]]*#'; then
  fail "BUG-1: \$PROJECT_ROOT is referenced in executable position in $BACKLOG_SH"
  grep -nE '\$\{?PROJECT_ROOT' "$BACKLOG_SH" | grep -vE '^[0-9]+:[[:space:]]*#' | sed 's/^/  /' >&2
else
  pass "BUG-1: no undefined \$PROJECT_ROOT reference left in add-backlog-item.sh"
fi

# --- BUG-2: project-local data lands in the invoking project, not the CFN repo -
BACKLOG_BEFORE="$(md5sum "$ROOT/readme/BACKLOG.md" | cut -d' ' -f1)"
CHANGELOG_BEFORE="$(md5sum "$ROOT/readme/CHANGELOG.md" | cut -d' ' -f1)"

mkdir -p "$TMP/proj/readme"
B2_OUT="$(cd "$FOREIGN_CWD" && CLAUDE_PROJECT_DIR="$TMP/proj" bash "$ROOT/$BACKLOG_SH" \
  --item "Backlog entry that must land in the invoking project only" \
  --why "regression coverage for BUG-2" \
  --solution "anchor project data on CLAUDE_PROJECT_DIR" \
  --force 2>&1)"
B2_PATH="$(printf '%s' "$B2_OUT" | tail -1)"

if [ -f "$TMP/proj/readme/BACKLOG.md" ] \
   && grep -q "must land in the invoking project only" "$TMP/proj/readme/BACKLOG.md" \
   && [ "$B2_PATH" = "$TMP/proj/readme/BACKLOG.md" ]; then
  pass "BUG-2: backlog is written under \$CLAUDE_PROJECT_DIR"
else
  fail "BUG-2: backlog did not land under \$CLAUDE_PROJECT_DIR ($TMP/proj)."
  echo "  emitted path: ${B2_PATH:-<none>}" >&2
  printf '%s\n' "$B2_OUT" | sed 's/^/  /' >&2
fi

# The changelog sibling has the identical defect and the identical fix.
CHANGELOG_SH=".claude/skills/cfn-project-management/lib/changelog/add-changelog-entry.sh"
printf '# Changelog\n\n## [Unreleased]\n\n### Features\n\n' > "$TMP/proj/readme/CHANGELOG.md"
B2C_OUT="$(cd "$FOREIGN_CWD" && CLAUDE_PROJECT_DIR="$TMP/proj" bash "$ROOT/$CHANGELOG_SH" \
  --type feature \
  --summary "Changelog entry for the BUG-2 regression test" \
  --impact "proves project-local anchoring" 2>&1)"

if grep -q "Changelog entry for the BUG-2 regression test" "$TMP/proj/readme/CHANGELOG.md"; then
  pass "BUG-2: changelog is written under \$CLAUDE_PROJECT_DIR"
else
  fail "BUG-2: add-changelog-entry.sh did not write under \$CLAUDE_PROJECT_DIR."
  printf '%s\n' "$B2C_OUT" | sed 's/^/  /' >&2
fi

# The CFN checkout must be untouched by all of the above. This is the actual
# damage the bug caused: other projects' entries accumulating in this repo.
if [ "$BACKLOG_BEFORE" = "$(md5sum "$ROOT/readme/BACKLOG.md" | cut -d' ' -f1)" ] \
   && [ "$CHANGELOG_BEFORE" = "$(md5sum "$ROOT/readme/CHANGELOG.md" | cut -d' ' -f1)" ]; then
  pass "BUG-2: the CFN repo's own readme/BACKLOG.md and readme/CHANGELOG.md were not touched"
else
  fail "BUG-2: a run against another project modified the CFN repo's readme/ files."
  echo "  Project data must be anchored on \$CLAUDE_PROJECT_DIR, never on BASH_SOURCE." >&2
fi

# bulk-import.sh reaches its sibling entry script. The path it used to hold
# (cfn-changelog-management) was consolidated away, so the call always failed,
# silently, because the invocation is inside an `if ... >/dev/null 2>&1`.
BULK_SH=".claude/skills/cfn-project-management/lib/changelog/bulk-import.sh"
BULK_SIBLING="$(cd "$(dirname "$BULK_SH")" && pwd -P)/add-changelog-entry.sh"
# Comments are provenance, not behavior: the fix leaves a note naming the skill
# that went away, so only executable lines are checked for the dead path.
if [ -x "$BULK_SIBLING" ] \
   && ! grep -n 'cfn-changelog-management' "$BULK_SH" | grep -qvE '^[0-9]+:[[:space:]]*#'; then
  pass "BUG-2: bulk-import.sh calls its sibling add-changelog-entry.sh"
else
  fail "BUG-2: bulk-import.sh does not resolve add-changelog-entry.sh as a sibling."
  echo "  Expected an executable at $BULK_SIBLING and no cfn-changelog-management reference." >&2
fi

# --- BUG-3 / BUG-4: repo root computed at the wrong depth ---------------------
check_root_depth() {
  local label="$1" script="$2" landmark="$3" resolved
  resolved="$(resolve_project_root "$script")"

  if [ "$resolved" != "$ROOT" ]; then
    fail "$label: $script resolves PROJECT_ROOT to '$resolved', expected '$ROOT'"
    echo "  Count the components: this file is five levels below the repo root," >&2
    echo "  so the expression needs five '..' segments." >&2
    return
  fi
  if [ ! -e "$resolved/$landmark" ]; then
    fail "$label: PROJECT_ROOT resolved to '$resolved' but '$landmark' is not under it"
    return
  fi
  pass "$label: $(basename "$script") resolves PROJECT_ROOT to the repo root"
}

# BUG-3's subject, cfn-loop-orchestration-v2/.../test-typescript-integration.sh,
# was deleted on 2026-08-20: it asserted on module paths that no longer exist and
# failed 10/10 before any of this work started (its replacement gate is
# tests/test-agent-selection-bundle.sh). BUG-4 below covers the identical
# wrong-depth regression class, so retiring the BUG-3 probe loses no coverage.
check_root_depth "BUG-4" \
  ".claude/skills/cfn-dependency-management/lib/ingestion/ingest.sh" \
  ".claude/skills"

# --- BUG-5: skill-owned JSON located from the module, not from the cwd --------
# The path expressions are lifted out of the real sources and evaluated with
# __dirname bound explicitly, so the test exercises the shipped arithmetic
# instead of restating it. src/ and dist/ are siblings, so both must resolve.
SEL_DIR=".claude/skills/cfn-agent-lifecycle/lib/selection"
SEL_TS="$SEL_DIR/src/agent-selector.ts"
CLI_TS="$SEL_DIR/src/cli.ts"

eval_paths() {
  # $1 = snippet of JS declarations, $2 = object literal to return,
  # $3.. = __dirname values to evaluate it under.
  local snippet="$1" ret="$2"; shift 2
  node -e '
    const path = require("path");
    const fs = require("fs");
    const snippet = process.argv[1];
    const ret = process.argv[2];
    const dirs = process.argv.slice(3);
    const fn = new Function("path", "__dirname", snippet + "\nreturn " + ret + ";");
    let bad = 0;
    for (const d of dirs) {
      const out = fn(path, d);
      for (const [k, v] of Object.entries(out)) {
        if (!fs.existsSync(v)) { bad++; console.log("  MISSING " + k + " -> " + v + "  (__dirname=" + d + ")"); }
      }
    }
    process.exit(bad === 0 ? 0 : 1);
  ' "$snippet" "$ret" "$@"
}

# Strip CR BEFORE slicing: some of these sources are still checked out with CRLF
# (they predate the repo's .gitattributes), and a trailing CR defeats a `$`-anchored
# sed range, which silently over-captures into unrelated code.
SEL_SNIPPET="$(tr -d '\r' < "$SEL_TS" | sed -n '/^const SELECTION_DIR/,/^);$/p' | sed 's/^export //')"
CLI_SNIPPET="$(tr -d '\r' < "$CLI_TS" | sed -n '/const selectionDir = /,/^ *);$/p')"

if [ -z "$SEL_SNIPPET" ] || [ -z "$CLI_SNIPPET" ]; then
  fail "BUG-5: could not extract the path expressions from $SEL_TS / $CLI_TS"
else
  B5_OUT="$( { cd "$FOREIGN_CWD" && eval_paths "$SEL_SNIPPET" \
      '({DEFAULT_MAPPINGS_PATH, DEFAULT_AGENTS_DIR})' \
      "$ROOT/$SEL_DIR/src" "$ROOT/$SEL_DIR/dist"; } 2>&1 )"
  if [ $? -eq 0 ]; then
    pass "BUG-5: agent-selector.ts resolves agent-mappings.json and the agent profiles from its own module"
  else
    fail "BUG-5: agent-selector.ts path expressions do not resolve."
    printf '%s\n' "$B5_OUT" >&2
  fi

  B5C_OUT="$( { cd "$FOREIGN_CWD" && eval_paths "$CLI_SNIPPET" \
      '({mappingsPath, agentsDir})' \
      "$ROOT/$SEL_DIR/src" "$ROOT/$SEL_DIR/dist"; } 2>&1 )"
  if [ $? -eq 0 ]; then
    pass "BUG-5: cli.ts resolves agent-mappings.json and the agent profiles from its own module"
  else
    fail "BUG-5: cli.ts path expressions do not resolve."
    printf '%s\n' "$B5C_OUT" >&2
  fi
fi

# No cwd anchoring and no dead skill name may come back in any of the three.
B5_BAD="$(grep -nE 'process\.cwd\(\)|process\.env\.PROJECT_ROOT|cfn-agent-selection-with-fallback' \
  "$SEL_TS" "$CLI_TS" "$SEL_DIR/src/agent-selector.test.ts" 2>/dev/null \
  | grep -vE ':[0-9]+:[[:space:]]*(//|\*|/\*)')"
if [ -n "$B5_BAD" ]; then
  fail "BUG-5: cwd anchoring or the dead cfn-agent-selection-with-fallback path is back."
  printf '%s\n' "$B5_BAD" | sed 's/^/  /' >&2
else
  pass "BUG-5: no cwd anchoring or dead skill path in the selection sources"
fi

# The test file must locate the fixtures the same way the implementation does,
# or it goes green against paths production never uses.
if grep -q 'DEFAULT_MAPPINGS_PATH' "$SEL_DIR/src/agent-selector.test.ts" \
   && grep -q 'DEFAULT_AGENTS_DIR' "$SEL_DIR/src/agent-selector.test.ts"; then
  pass "BUG-5: agent-selector.test.ts uses the implementation's own path constants"
else
  fail "BUG-5: agent-selector.test.ts does not reuse DEFAULT_MAPPINGS_PATH / DEFAULT_AGENTS_DIR"
fi


# ---------------------------------------------------------------------------
# BUG-6  integrate-cli.sh: unset PROJECT_ROOT in a sourced file, plus a
#        fallback that could never fire.
#
# `cfn_preflight_check` ran `df "$PROJECT_ROOT"` while PROJECT_ROOT was never
# assigned by this file and never set by any caller. Two separate faults on one
# line: df got an empty path, and the trailing `|| echo "0"` bound to the awk
# pipeline rather than to the assignment, so a df failure left the variable
# EMPTY instead of zero. `[ "" -lt 100 ]` then raised
# "integer expression expected". docs/archive/testing/*/PREFLIGHT_VALIDATION_
# TEST_RESULTS.md:140 reported this line as broken and it was never fixed.
#
# The same file also assigned a bare SCRIPT_DIR despite documenting itself as
# `source`d, silently overwriting the caller's SCRIPT_DIR.
#
# Proof: source it and actually RUN the preflight function, rather than grepping
# for the fixed text, so a re-break in a different form still fails.
# ---------------------------------------------------------------------------
B6_FILE="$ROOT/.claude/skills/cfn-error-management/lib/logging/integrate-cli.sh"

if [ ! -f "$B6_FILE" ]; then
  fail "BUG-6: integrate-cli.sh not found at $B6_FILE"
else
  # Run with PROJECT_ROOT deliberately unset, from a scratch project dir, with
  # the error-capture side effect stubbed out so the check stays hermetic.
  B6_SCRATCH="$(mktemp -d)"
  B6_ERR="$(
    unset PROJECT_ROOT
    cd "$B6_SCRATCH" || exit 1
    CLAUDE_PROJECT_DIR="$B6_SCRATCH" bash -c '
      source "$1" >/dev/null 2>&1
      cfn_capture_error() { :; }
      log() { :; }
      cfn_preflight_check "bug6-regression" >/dev/null
    ' _ "$B6_FILE" 2>&1
  )"
  if printf '%s' "$B6_ERR" | grep -q 'integer expression expected'; then
    fail "BUG-6: cfn_preflight_check still raises 'integer expression expected' with PROJECT_ROOT unset."
    printf '%s\n' "$B6_ERR" | sed 's/^/  /' >&2
  else
    pass "BUG-6: cfn_preflight_check survives an unset PROJECT_ROOT"
  fi
  rm -rf "$B6_SCRATCH"

  # A bare `|| echo "0"` on a pipeline assignment is the shape that caused this;
  # it cannot rescue an empty-but-successful pipeline.
  if grep -qE '=\$\(.*\|.*awk.*\|\| echo "0"\)' "$B6_FILE"; then
    fail "BUG-6: the unrescuable '|| echo \"0\"' pipeline assignment is back in integrate-cli.sh."
  else
    pass "BUG-6: no '|| echo \"0\"' pipeline-assignment fallback in integrate-cli.sh"
  fi

  # Sourced files must not clobber the caller's namespace.
  B6_SD="$(SCRIPT_DIR=B6_SENTINEL bash -c 'source "$1" >/dev/null 2>&1; printf "%s" "$SCRIPT_DIR"' _ "$B6_FILE")"
  if [ "$B6_SD" = "B6_SENTINEL" ]; then
    pass "BUG-6: sourcing integrate-cli.sh preserves the caller's SCRIPT_DIR"
  else
    fail "BUG-6: sourcing integrate-cli.sh overwrote the caller's SCRIPT_DIR with '$B6_SD'."
  fi

  # And the helper it needs must still resolve after that rename.
  B6_ELS="$(bash -c 'source "$1" >/dev/null 2>&1; printf "%s" "$ERROR_LOGGING_SCRIPT"' _ "$B6_FILE")"
  if [ -n "$B6_ELS" ] && [ -f "$B6_ELS" ]; then
    pass "BUG-6: ERROR_LOGGING_SCRIPT still resolves to an existing file"
  else
    fail "BUG-6: ERROR_LOGGING_SCRIPT does not resolve (got '$B6_ELS')."
  fi
fi

echo "---"
if [ "$FAIL" -eq 0 ]; then
  echo "PROJECT_ROOT resolution: OK"
else
  echo "PROJECT_ROOT resolution: FAILED" >&2
fi
exit "$FAIL"
