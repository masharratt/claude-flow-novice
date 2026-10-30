#!/usr/bin/env bash
# Tests for .claude/skills/cfn-codesearch/search.sh (backs /codebase-search).
#
# Regressions from the 2026-10-30 CodeSearch-vs-grep benchmark (20 questions):
# - the SQL step matched the WHOLE question as a name (LIKE '%Where is X
#   defined?%') and found 0 of 20;
# - the semantic step ran only when OPENAI_API_KEY started with sk-, and read
#   that key out of the project's .env, although the local model needs no key;
# - "who uses X" questions had no step that lists files mentioning X, so
#   CodeSearch found 1 of 6 callers (grep 5 of 6).
#
# Synthetic repo, synthetic index DB and a fake CodeSearch binary; the live
# index is never read.
#
# Run: bash tests/test-codesearch-search.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SEARCH="$REPO_ROOT/.claude/skills/cfn-codesearch/search.sh"
source "$REPO_ROOT/.claude/cfn-scripts/lib/safe-rm.sh" || exit 1  # cfn_safe_rm_tmp

PASS=0
FAIL=0
ok()  { PASS=$((PASS + 1)); echo "ok: $1"; }
bad() { FAIL=$((FAIL + 1)); echo "FAIL: $1"; }

WORK="$(mktemp -d "${TMPDIR:-/tmp}/cfn-cs-search.XXXXXX")" || exit 1
trap 'cfn_safe_rm_tmp "$WORK"' EXIT

PROJ="$WORK/proj"
mkdir -p "$PROJ/hooks" "$PROJ/lib" "$PROJ/archive"
(
  cd "$PROJ" && git init -q && git config user.email t@example.com && git config user.name t
  printf 'reap_kill() { kill "$1"; }\n' > hooks/reap.sh
  printf '#!/usr/bin/env bash\necho limit\n' > lib/run-with-memory-limit.sh
  printf '{"scripts":{"t":"bash lib/run-with-memory-limit.sh jest"}}\n' > package.json
  printf 'case "$c" in *run-with-memory-limit.sh*) ;; esac\n' > hooks/guard.sh
  printf 'old: run-with-memory-limit.sh\n' > archive/old.md
  printf 'OPENAI_API_KEY=sk-should-never-be-read\n' > .env
  git add -A && git commit -qm base
) || { echo "setup failed"; exit 1; }

DB="$WORK/index.db"
sqlite3 "$DB" "CREATE TABLE entities (file_path TEXT, line_number INTEGER, kind TEXT, name TEXT, project_root TEXT);
INSERT INTO entities VALUES ('$PROJ/hooks/reap.sh', 1, 'function', 'reap_kill', '$PROJ');
INSERT INTO entities VALUES ('$PROJ/lib/run-with-memory-limit.sh', 1, 'module', 'run-with-memory-limit', '$PROJ');
INSERT INTO entities VALUES ('/elsewhere/hooks/reap.sh', 1, 'function', 'reap_kill', '/elsewhere');" || exit 1

FAKE_BIN="$WORK/fake-codesearch"
cat > "$FAKE_BIN" <<'EOF'
#!/usr/bin/env bash
echo "LOG noise line"; echo "function f in $PWD/x.sh:1 (similarity: 0.9) key=[${OPENAI_API_KEY:-}] args=$*"
EOF
chmod +x "$FAKE_BIN"

run() { (cd "$PROJ" && env -u OPENAI_API_KEY CLAUDE_PROJECT_DIR="$PROJ" CODESEARCH_DB="$DB" \
          CODESEARCH_BIN="$FAKE_BIN" bash "$SEARCH" "$@" 2>&1); }

# 1. Identifier inside a natural-language question is found by name.
OUT=$(run "Where is reap_kill defined?")
[[ "$OUT" == *"hooks/reap.sh:1"*"reap_kill"* ]] && ok "name inside question found" || bad "name lookup: '$OUT'"
[[ "$OUT" != *"/elsewhere/"* ]] && ok "other projects excluded" || bad "leaked other project: '$OUT'"

# 2. "Who uses X": every file mentioning X is listed, archive dirs skipped.
OUT=$(run "Who uses run-with-memory-limit.sh?")
[[ "$OUT" == *"package.json"* && "$OUT" == *"hooks/guard.sh"* ]] && ok "mentioning files listed" \
  || bad "mentions: '$OUT'"
[[ "$OUT" != *"archive/old.md"* ]] && ok "archive mentions skipped" || bad "archive listed: '$OUT'"

# 3. Semantic step runs without any API key and never reads .env.
OUT=$(run "what stops orphaned workers")
[[ "$OUT" == *"key=[]"* ]] && ok "semantic runs keyless, .env not read" || bad "semantic: '$OUT'"
# The binary logs on stdout; only result lines reach the agent, paths relative.
[[ "$OUT" != *"LOG noise"* && "$OUT" == *"f in x.sh:1"* ]] && ok "log noise dropped, path relative" \
  || bad "semantic filter: '$OUT'"
[[ "$OUT" == *"--max-results 5"* ]] && ok "default top 5" || bad "top default: '$OUT'"
OUT=$(run "what stops orphaned workers" --top 3)
[[ "$OUT" == *"--max-results 3"* ]] && ok "--top honored" || bad "--top: '$OUT'"

# 4. A quote in the question neither breaks the SQL nor errors.
OUT=$(run "where's reap_kill"); RC=$?
[ "$RC" = 0 ] && [[ "$OUT" == *"reap_kill"* ]] && ok "quote-safe" || bad "quote: rc=$RC '$OUT'"

# 5. Missing index: mentions still work, reindex hint printed, exit 0.
OUT=$(cd "$PROJ" && env -u OPENAI_API_KEY CLAUDE_PROJECT_DIR="$PROJ" CODESEARCH_DB="$WORK/none.db" \
      CODESEARCH_BIN="$WORK/none-bin" bash "$SEARCH" "Who uses run-with-memory-limit.sh?" 2>&1); RC=$?
[ "$RC" = 0 ] && [[ "$OUT" == *"package.json"* && "$OUT" == *"cfn-codebase-reindex"* ]] \
  && ok "no index: mentions + hint" || bad "no index: rc=$RC '$OUT'"

echo "pass=$PASS fail=$FAIL"
[ "$FAIL" = 0 ]
