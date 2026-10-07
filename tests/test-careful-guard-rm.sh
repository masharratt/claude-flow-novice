#!/usr/bin/env bash
# tests/test-careful-guard-rm.sh
# cfn-careful-guard.sh :: target-aware rm classification.
#
# Every rm is judged by WHERE it points, not by its flags:
#   allow  temp areas, rebuildable folders (node_modules, .next, ...), files
#          git can restore (tracked and unchanged), paths that do not exist
#   ask    unrecoverable work inside a repo (untracked, modified, ignored like
#          .env), anything outside a repo and outside temp, and any target the
#          guard cannot resolve (unknown variable, command substitution)
#   deny   /, top-level folders, $HOME and its key folders, a repo root, .git,
#          and any ancestor of the working directory
#
# "ask" is a PreToolUse permissionDecision on stdout with exit 0; "deny" is
# exit 2. The hook runs as a subprocess exactly as production invokes it.
# Temp roots are pointed at a dedicated scratch dir via CFN_CAREFUL_TEMP_ROOTS
# so the fixture repo (itself under the OS temp dir) is not classed as temp.
set -euo pipefail
PROJECT_ROOT=$(git rev-parse --show-toplevel)
HOOK="$PROJECT_ROOT/.claude/hooks/cfn-careful-guard.sh"

T=$(mktemp -d "${TMPDIR:-/tmp}/careful-rm.XXXXXX")
T=$(cd "$T" && pwd -P)
trap 'rm -rf "$T"' EXIT
FAKE_HOME="$T/home"
SCRATCH="$T/scratch"
REPO="$FAKE_HOME/Projects/demo"
mkdir -p "$SCRATCH/pkg" "$FAKE_HOME/Downloads/stuff" "$REPO"

# Fixture repo: tracked clean, tracked modified, untracked, ignored secret,
# rebuildable folders.
(
  cd "$REPO"
  git init -q
  git config user.email t@example.com; git config user.name t
  mkdir -p src clean_dir node_modules/pkg .next/cache
  echo a > src/a.txt; echo b > src/b.txt; echo c > clean_dir/c.txt
  echo keep > tracked.txt
  printf '.env\nnode_modules/\n.next/\n' > .gitignore
  git add -A; git commit -qm init
  echo changed >> src/b.txt
  echo new > untracked.txt
  echo SECRET=1 > .env
  echo x > node_modules/pkg/index.js; echo x > .next/cache/c
)

pass=0; fail=0
run() { # want(allow|ask|deny) description command
  local want=$1 desc=$2 cmd=$3 out rc=0 got
  out=$(python3 -c 'import json,sys; print(json.dumps({"tool_name":"Bash","cwd":sys.argv[2],"tool_input":{"command":sys.argv[1]}}))' "$cmd" "$REPO" \
    | env HOME="$FAKE_HOME" CFN_CAREFUL_TEMP_ROOTS="$SCRATCH" CFN_DATA_DIR="$T/data" TYPESAFE_API_KEY= \
        bash "$HOOK" 2>/dev/null) || rc=$?
  if [ "$rc" = 2 ]; then got=deny
  elif printf '%s' "$out" | grep -q '"permissionDecision": *"ask"'; then got=ask
  elif [ "$rc" = 0 ]; then got=allow
  else got="rc$rc"; fi
  if [ "$got" = "$want" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL ($desc): want $want got $got :: $cmd"; fi
}

# --- allow -------------------------------------------------------------------
run allow "temp folder"                 "rm -rf $SCRATCH/pkg"
run allow "temp via variable"           "S=$SCRATCH/pkg; rm -rf \$S; mkdir -p \$S"
run allow "temp via braced variable"    "T=$SCRATCH; rm -rf \"\${T}/pkg\""
run allow "node_modules"                "rm -rf node_modules"
run allow "nested rebuildable"          "rm -rf .next/cache"
run allow "tracked unchanged file"      "rm tracked.txt"
run allow "tracked unchanged folder"    "rm -rf clean_dir"
run allow "path that does not exist"    "rm -f nothing-here.txt"
run allow "rm mentioned in prose"       "echo 'never run rm -rf / here'"
run allow "cd then relative temp"       "cd $SCRATCH && rm -rf pkg"

# --- ask ---------------------------------------------------------------------
run ask   "untracked file"              "rm untracked.txt"
run ask   "folder with a modified file" "rm -rf src"
run ask   "ignored secret file"         "rm -f .env"
run ask   "unknown variable"            "rm -rf \$SOMETHING_UNSET/x"
run ask   "command substitution"        "rm -rf \"\$(pwd)/src\""
run ask   "outside repo, not temp"      "rm -rf ~/Downloads/stuff"
run ask   "glob over repo files"        "rm -f *.txt"
run ask   "one bad target of two"       "rm -rf node_modules untracked.txt"

# --- deny --------------------------------------------------------------------
run deny  "root"                        "rm -rf /"
run deny  "home"                        "rm -rf ~"
run deny  "home via variable"           "rm -rf \$HOME"
run deny  "projects folder"             "rm -rf \$HOME/Projects"
run deny  "git history"                 "rm -rf .git"
run deny  "repo root"                   "rm -rf $REPO"
run deny  "parent of working dir"       "rm -rf .."
run deny  "empty variable lands on /"   "S=; rm -rf \$S/Tests"
run deny  "top-level folder"            "rm -rf /usr/local"

# --- other rules still apply after an allowed rm ------------------------------
run deny  "allowed rm then force push"  "rm -rf node_modules && git push --force origin x"

echo "passed=$pass failed=$fail"
[ "$fail" = 0 ]
