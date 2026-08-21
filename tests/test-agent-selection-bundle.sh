#!/usr/bin/env bash
# Agent-selection bundle gate.
#
# WHAT THIS LOCKS DOWN
# ---------------------
# .claude/skills/cfn-agent-lifecycle/lib/selection/dist/cli.cjs is a committed
# BUILD ARTIFACT (esbuild output of src/cli.ts), not source. execute.sh execs
# it directly (execute.sh:119) when --typescript is passed, and the skill is
# reached from other projects only through the ~/.claude/skills reverse
# symlink, where no `npm install` ever runs. Four ways that setup breaks
# silently, each with its own check below:
#
#   1. The exec bit is invisible to git in this repo (core.fileMode=false), so
#      a future contributor can commit this file as mode 100644 and the
#      `exec` in execute.sh:119 fails, but `ls -la` on the working tree still
#      shows it executable and hides the break. Must check the git INDEX.
#   2. The bundle can produce something that looks like output but is not the
#      JSON shape every caller of select-agents parses.
#   3. The bundle can pick up an accidental `require()` that only resolves
#      because THIS repo's node_modules happens to be sitting nearby. That
#      passes here and fails in every other project reached via the symlink.
#   4. The committed .cjs can drift from src/cli.ts: someone edits the
#      TypeScript, forgets to rebuild, and the shipped behavior silently stops
#      matching the source next to it. This is the reason to gate a committed
#      build artifact at all.
#
# Predecessor: this replaces
# .claude/skills/cfn-loop-orchestration-v2/lib/orchestrator/test-typescript-integration.sh,
# deleted because every check in it asserted on orchestrate-enhanced.sh (the
# v2 bash orchestrator the v3 rewrite replaced outright, not moved) or on a
# report file being deleted elsewhere. Asserting on code that no longer
# exists proves nothing about what runs; this file asserts on the thing that
# actually ships.
#
# Usage:
#   tests/test-agent-selection-bundle.sh
set -uo pipefail

cd "$(git rev-parse --show-toplevel)"
ROOT="$PWD"

FAIL=0
pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1" >&2; FAIL=1; }

SELECTION_DIR="$ROOT/.claude/skills/cfn-agent-lifecycle/lib/selection"
DIST="$SELECTION_DIR/dist/cli.cjs"
DIST_REL=".claude/skills/cfn-agent-lifecycle/lib/selection/dist/cli.cjs"
SRC="$SELECTION_DIR/src/cli.ts"

# A parser for the shared JSON contract, reused by checks 2 and 3. Exits
# nonzero and prints why on any shape violation; does not itself call fail()
# so both call sites can attach their own context.
check_selection_json() {
  node -e '
    let obj;
    try {
      obj = JSON.parse(process.argv[1]);
    } catch (e) {
      console.error("not valid JSON: " + e.message);
      process.exit(1);
    }
    const required = ["loop3", "loop2", "product_owner", "category", "confidence"];
    const missing = required.filter((k) => !(k in obj));
    if (missing.length) {
      console.error("missing key(s): " + missing.join(", "));
      process.exit(1);
    }
    if (!Array.isArray(obj.loop3) || obj.loop3.length === 0) {
      console.error("loop3 is not a non-empty array");
      process.exit(1);
    }
    if (!Array.isArray(obj.loop2) || obj.loop2.length === 0) {
      console.error("loop2 is not a non-empty array");
      process.exit(1);
    }
    if (typeof obj.product_owner !== "string" || obj.product_owner === "") {
      console.error("product_owner is not a non-empty string");
      process.exit(1);
    }
    if (typeof obj.category !== "string" || obj.category === "") {
      console.error("category is not a non-empty string");
      process.exit(1);
    }
    if (typeof obj.confidence !== "number" || Number.isNaN(obj.confidence)) {
      console.error("confidence is not a number");
      process.exit(1);
    }
  ' "$1" 2>&1
}

##############################################################################
# Check 1: dist/cli.cjs exists, is executable on disk, and mode 100755 in the
# git index (the filesystem bit alone proves nothing under core.fileMode=false).
##############################################################################

if [ ! -f "$DIST" ]; then
  fail "$DIST_REL does not exist"
elif [ ! -x "$DIST" ]; then
  fail "$DIST_REL exists but is not executable on disk"
else
  pass "$DIST_REL exists and is executable on disk"
fi

INDEX_MODE="$(git ls-files -s -- "$DIST_REL" 2>/dev/null | awk '{print $1}')"
if [ "$INDEX_MODE" = "100755" ]; then
  pass "$DIST_REL is mode 100755 in the git index"
elif [ -z "$INDEX_MODE" ]; then
  fail "$DIST_REL is not tracked in the git index"
else
  fail "$DIST_REL is mode $INDEX_MODE in the git index, not 100755 (execute.sh:119's exec will fail on checkout even though the working-tree file looks fine)"
fi

##############################################################################
# Check 2: running the bundle produces the JSON shape every select-agents
# caller depends on. Parsed structurally (node -e), not grepped as text.
##############################################################################

if [ -x "$DIST" ]; then
  RUN_OUTPUT="$(node "$DIST" "Implement auth" 2>&1)"
  RUN_RC=$?
  if [ "$RUN_RC" -ne 0 ]; then
    fail "running $DIST_REL exited $RUN_RC: $RUN_OUTPUT"
  elif PARSE_ERR="$(check_selection_json "$RUN_OUTPUT")"; then
    pass "bundle output is valid JSON with loop3/loop2/product_owner/category/confidence"
  else
    fail "bundle output does not match the selection JSON contract: $PARSE_ERR (raw: $RUN_OUTPUT)"
  fi
else
  fail "skipping output-shape check: $DIST_REL missing or not executable (see check 1)"
fi

##############################################################################
# Check 3: the bundle runs with no node_modules reachable. This is the
# property that actually matters: the skill is invoked from other projects
# through the ~/.claude/skills reverse symlink, where no install ever ran.
##############################################################################

if [ -x "$DIST" ]; then
  ISOLATED_WORK="$(mktemp -d "${TMPDIR:-/tmp}/cfn-agent-selection-isolated.XXXXXX")"
  ISOLATED_OUTPUT="$(cd "$ISOLATED_WORK" && env -i PATH="$PATH" HOME="$HOME" node "$DIST" "Fix a bug in the login flow" 2>&1)"
  ISOLATED_RC=$?
  rm -rf "$ISOLATED_WORK"
  if [ "$ISOLATED_RC" -ne 0 ]; then
    fail "bundle failed with no node_modules reachable (cwd outside the repo, env -i): exit $ISOLATED_RC: $ISOLATED_OUTPUT"
  elif PARSE_ERR="$(check_selection_json "$ISOLATED_OUTPUT")"; then
    pass "bundle runs correctly with no node_modules reachable (isolated cwd, env -i)"
  else
    fail "bundle ran but output was malformed with no node_modules reachable: $PARSE_ERR (raw: $ISOLATED_OUTPUT)"
  fi
else
  fail "skipping node_modules-isolation check: $DIST_REL missing or not executable (see check 1)"
fi

##############################################################################
# Check 4: the committed bundle is not stale relative to src/cli.ts. This is
# the reason to gate a committed build artifact at all: without this, src/
# and dist/ can silently diverge forever. Rebuilds to a temp path so it never
# touches the committed file. Skips (does not pass) if esbuild cannot be
# resolved, so the gate stays usable without dev dependencies installed.
##############################################################################

ESBUILD_BIN="$ROOT/node_modules/.bin/esbuild"
if [ ! -x "$ESBUILD_BIN" ]; then
  echo "SKIP: staleness check needs esbuild (node_modules/.bin/esbuild not found); run 'npm install' to enable it"
else
  DRIFT_OUT="$(mktemp "${TMPDIR:-/tmp}/cfn-agent-selection-drift.XXXXXX.cjs")"
  if ! BUILD_ERR="$("$ESBUILD_BIN" "$SRC" --bundle --platform=node --format=cjs --outfile="$DRIFT_OUT" 2>&1)"; then
    fail "rebuilding src/cli.ts for the staleness check failed: $BUILD_ERR"
  elif cmp -s "$DRIFT_OUT" "$DIST"; then
    pass "dist/cli.cjs matches a fresh build of src/cli.ts"
  else
    fail "dist/cli.cjs is STALE relative to src/cli.ts (rebuild differs). Run: npm run build:agent-selection -- then commit the result."
  fi
  rm -f "$DRIFT_OUT"
fi

##############################################################################
# Check 5: the build:agent-selection script is wired into package.json,
# checked against the actual key via jq rather than grepping for a literal.
##############################################################################

if ! command -v jq >/dev/null 2>&1; then
  echo "SKIP: build-script check needs jq, which is not installed"
else
  SCRIPT_VAL="$(jq -r '.scripts["build:agent-selection"] // empty' "$ROOT/package.json")"
  if [ -n "$SCRIPT_VAL" ]; then
    pass "package.json scripts[\"build:agent-selection\"] is wired: $SCRIPT_VAL"
  else
    fail "package.json has no scripts[\"build:agent-selection\"] entry"
  fi
fi

echo "---"
if [ "$FAIL" -eq 0 ]; then
  echo "agent-selection bundle: OK"
else
  echo "agent-selection bundle: FAILED" >&2
fi
exit "$FAIL"
