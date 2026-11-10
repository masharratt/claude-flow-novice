#!/usr/bin/env bash
# Tests for the CodeSearch usage gate (cfn-codesearch-gate.sh) and the shared
# index-root resolver (cfn-codesearch/lib/index-root.sh) that search.sh uses.
#
# Regression context (2026-11-10): 3 days of server sessions made zero
# search.sh calls and ~460 grep/rg calls, and from a fleet worker clone
# (~/fleet-repos/MDTWII-wt/wsNNN) search.sh returned "No results" because the
# index is keyed by the main checkout (~/Projects/MDTWII).
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
GATE="$REPO/.claude/hooks/cfn-codesearch-gate.sh"
LIB="$REPO/.claude/skills/cfn-codesearch/lib/index-root.sh"
SEARCH="$REPO/.claude/skills/cfn-codesearch/search.sh"

PASS=0; FAIL=0
ok()   { echo "  PASS: $1"; PASS=$((PASS+1)); }
bad()  { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }
check() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (expected '$2', got '$3')"; fi; }

. "$REPO/.claude/cfn-scripts/lib/safe-rm.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/cs-gate-test-XXXXXX") || exit 1
T=$(cd -P "$T" && pwd -P) || exit 1
trap 'cfn_safe_rm_tmp "$T"' EXIT

# Fixture: a bare origin, a main checkout (indexed), a fleet clone and an
# unrelated repo (neither indexed).
git init -q --bare "$T/origin.git"
git clone -q "$T/origin.git" "$T/main" 2>/dev/null
git -C "$T/main" -c user.email=t@t -c user.name=t commit -q --allow-empty -m init
git -C "$T/main" push -q origin HEAD 2>/dev/null
git clone -q "$T/origin.git" "$T/worker" 2>/dev/null
git init -q "$T/other"
DB="$T/index.db"
sqlite3 "$DB" "CREATE TABLE entities(project_root TEXT, file_path TEXT, name TEXT, kind TEXT, line_number INT);
               INSERT INTO entities VALUES('$T/main','$T/main/src/save_game.rs','save_game','function',3);"
export CODESEARCH_DB="$DB" CFN_CS_GATE_DIR="$T/state" CFN_CS_LOG_DIR="$T/logs"
unset CLAUDE_PROJECT_DIR CFN_CODESEARCH_GATE

echo "== index-root resolver"
[ -f "$LIB" ] && . "$LIB"
if declare -F cs_index_root >/dev/null; then
  check "main checkout resolves to itself" "$T/main" "$(cs_index_root "$T/main" "$DB")"
  check "fleet clone resolves to the indexed main checkout" "$T/main" "$(cs_index_root "$T/worker" "$DB")"
  check "unrelated repo resolves to nothing" "" "$(cs_index_root "$T/other" "$DB")"
  check "missing DB resolves to nothing" "" "$(cs_index_root "$T/main" "$T/nope.db")"
else
  bad "cs_index_root is defined by $LIB"
fi

gate() { # gate <session> <cwd> <tool> <command>
  jq -nc --arg s "$1" --arg c "$2" --arg t "$3" --arg cmd "$4" \
    '{session_id:$s, cwd:$c, tool_name:$t, tool_input:(if $t=="Bash" then {command:$cmd} else {pattern:$cmd} end)}' |
    bash "$GATE" 2>/dev/null
}
decision() { jq -r '.hookSpecificOutput.permissionDecision // "allow"' 2>/dev/null <<<"${1:-}" || echo allow; }

echo "== gate"
if [ -f "$GATE" ]; then
  check "recursive grep before any search is denied" deny "$(decision "$(gate s1 "$T/main" Bash 'grep -rn save_game src')")"
  check "rg after cd && is denied" deny "$(decision "$(gate s1 "$T/main" Bash "cd $T/main && rg save_game")")"
  check "git grep is denied" deny "$(decision "$(gate s1 "$T/main" Bash 'git grep -n save_game')")"
  check "Grep tool is denied" deny "$(decision "$(gate s1 "$T/main" Grep 'save_game')")"
  check "deny names the search command" 1 "$(gate s1 "$T/main" Bash 'rg x' | grep -c 'cfn-codesearch/search.sh')"
  check "fleet clone is gated too" deny "$(decision "$(gate s2 "$T/worker" Bash 'rg save_game')")"
  check "piped grep (output filter) passes" "" "$(gate s1 "$T/main" Bash 'ls -la | grep foo')"
  check "plain grep on one file passes" "" "$(gate s1 "$T/main" Bash 'grep -n foo README.md')"
  check "unindexed repo passes" "" "$(gate s1 "$T/other" Bash 'rg foo')"
  check "search.sh call itself passes" "" "$(gate s1 "$T/main" Bash 'bash $HOME/.claude/skills/cfn-codesearch/search.sh "save game" --top 5')"
  check "grep after a search in the same session passes" "" "$(gate s1 "$T/main" Bash 'rg save_game')"
  check "another session is still gated" deny "$(decision "$(gate s3 "$T/main" Bash 'rg save_game')")"
  check "CFN_CODESEARCH_GATE=off passes" "" "$(CFN_CODESEARCH_GATE=off gate s4 "$T/main" Bash 'rg x')"
  check "garbage input fails open" "" "$(echo 'not json' | bash "$GATE" 2>/dev/null)"
  check "usage log records denies" 1 "$( [ "$(cat "$T"/logs/*.tsv 2>/dev/null | awk -F'\t' '$3=="deny"' | wc -l)" -ge 6 ] && echo 1 || echo 0)"
else
  bad "gate hook exists at $GATE"
fi

echo "== search.sh from a fleet clone uses the main index"
out=$(cd "$T/worker" && CODESEARCH_BIN=/nonexistent CODESEARCH_NO_DAEMON=1 bash "$SEARCH" "save_game" --top 3 2>/dev/null)
check "names fallback finds the main checkout's entity" 1 "$(grep -c 'src/save_game.rs' <<<"$out")"
check "search.sh says which index answered" 1 "$(grep -c "(index: $T/main" <<<"$out")"
check "search.sh logs its own use" 1 "$(cat "$T"/logs/*.tsv 2>/dev/null | awk -F'\t' '$3=="search"' | wc -l | tr -d ' ')"

echo
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
