#!/usr/bin/env bash
# tests/test-careful-guard-force-push.sh
# cfn-careful-guard.sh :: force-push rule judges only the push's own segment.
#
# Regression (2026-10-16): the rule was `git push .*(-f|--force)`, so any
# "-f" later on the same line tripped it: `git push -q vps main 2>&1|tail -1`,
# `... && git pull --ff-only`, a branch named feature-fix, a `--force` on a
# later `git worktree remove`. 14 of 14 logged force-push blocks were false.
# A JSON "\n" (heredoc, multi-line script) also glued later lines onto the
# push segment. Now the force flag must be a whole argument of that git push,
# inside the same command segment and the same line.
#
# The hook runs as a subprocess exactly as production invokes it. Deny is
# exit 2; allow is exit 0 with no ask on stdout.
set -euo pipefail
PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"
HOOK="$PROJECT_ROOT/.claude/hooks/cfn-careful-guard.sh"

T=$(mktemp -d "${TMPDIR:-/tmp}/careful-push.XXXXXX") || exit 1
T=$(cd -P "$T" && pwd -P) || exit 1
trap 'cfn_safe_rm_tmp "$T"' EXIT

pass=0; fail=0
run() { # want(allow|deny) description command
  local want=$1 desc=$2 cmd=$3 out rc=0 got
  out=$(python3 -c 'import json,sys; print(json.dumps({"tool_name":"Bash","tool_input":{"command":sys.argv[1]}}))' "$cmd" \
    | env CFN_DATA_DIR="$T/data" TYPESAFE_API_KEY= FLEET_RUN_DIR= CLAUDE_PROJECT_DIR= bash "$HOOK" 2>/dev/null) || rc=$?
  if [ "$rc" = 2 ]; then got=deny
  elif [ "$rc" = 0 ] && ! printf '%s' "$out" | grep -q '"permissionDecision"'; then got=allow
  else got="rc$rc"; fi
  if [ "$got" = "$want" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL ($desc): want $want got $got :: $cmd"; fi
}

# --- real force pushes stay blocked ------------------------------------------
run deny "short flag"                 'git push -f origin main'
run deny "long flag"                  'git push --force origin main'
run deny "force-with-lease"           'git push --force-with-lease origin main'
run deny "flag after refspec"         'git push origin main --force'
run deny "combined short flags"       'git push -uf origin main'
run deny "plus refspec"               'git push origin +main'
run deny "plus refspec with dest"     'git push vps +HEAD:refs/heads/main'
run deny "after cd and &&"            'cd /x && git push --force origin main'
run deny "git -C dir push"            'git -C /x push -f origin main'
run deny "on a later line"            $'echo hi\ngit push --force origin main'
run deny "uppercase"                  'GIT PUSH --FORCE origin main'

# --- ordinary pushes with an -f somewhere else on the line (logged 2026-10) --
run allow "plain push"                'git push origin main'
run allow "push piped to tail -1"     'git push -q vps main 2>&1|tail -1'
run allow "push then tail -4 later"   'git push -q vps main; timeout 120 fleet sync WS445 2>&1 | tail -4'
run allow "push then pull --ff-only"  "git push origin main 2>&1 | tail -1; ssh vps 'cd ~/p && git pull -q --ff-only origin main'"
run allow "push then worktree --force" 'git push -q vps main && V=vps.sh && $V run P -- git worktree remove --force /tmp/w'
run allow "branch name with -f"       'git push origin feature-fix'
run allow "sha to ref"                'git push -q vps c8199ae29:refs/heads/cand/ws260'
run allow "heredoc mentioning push"   $'cat > notes.md <<\'EOF\'\nnever git push without asking, -f is banned\nEOF'
run allow "tail -f on next line"      $'git push origin main\ntail -f log.txt'

echo "passed=$pass failed=$fail"
[ "$fail" = 0 ]
