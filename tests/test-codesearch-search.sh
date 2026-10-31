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
if [[ " $* " == *" serve "* || "$*" == "serve" ]]; then
  # Record the launch, then stay up like a real daemon would.
  echo "serve args=$* sid=$(ps -o sid= -p $$ | tr -d ' ') pid=$$" >> "${FAKE_SERVE_MARK:-/dev/null}"
  sleep 3; exit 0
fi
if [[ " $* " == *" lexical "* ]]; then
  # Older installed binaries have no lexical subcommand.
  [ -n "${FAKE_NO_LEXICAL:-}" ] && { echo "error: unrecognized subcommand 'lexical'" >&2; exit 2; }
  # A project not reindexed since `lexical` landed has no rows: empty output.
  [ -n "${FAKE_LEXICAL_EMPTY:-}" ] && exit 0
  echo "hooks/reap.sh (score: 3.200) args=$*"; exit 0
fi
echo "LOG noise line"; echo "function f in $PWD/x.sh:1 (similarity: 0.9) key=[${OPENAI_API_KEY:-}] args=$*"
EOF
chmod +x "$FAKE_BIN"

# Daemon disabled by default so earlier steps never spawn it; step 8 enables it.
run() { (cd "$PROJ" && env -u OPENAI_API_KEY CLAUDE_PROJECT_DIR="$PROJ" CODESEARCH_DB="$DB" \
          CODESEARCH_BIN="$FAKE_BIN" CODESEARCH_SOCKET="$WORK/rt/serve.sock" \
          CODESEARCH_NO_DAEMON="${CODESEARCH_NO_DAEMON-1}" bash "$SEARCH" "$@" 2>&1); }
# Steps 1 and 4 cover the Names fallback used with binaries that predate `lexical`.
export FAKE_NO_LEXICAL=1

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

# 6. Lexical step (2026-10-30 engine fix): BM25 over path + content answers a
#    plain-English question with no identifier in it, where the Names step
#    found nothing; it gets the DB, project and --top passed through.
unset FAKE_NO_LEXICAL
OUT=$(run "what stops orphaned workers" --top 3)
[[ "$OUT" == *"=== Files ==="*"hooks/reap.sh (score: 3.200)"* ]] && ok "lexical step lists files" \
  || bad "lexical step: '$OUT'"
[[ "$OUT" == *"lexical what stops orphaned workers -n 3 --db $DB"* && "$OUT" == *"--project-dir $PROJ"* ]] \
  && ok "lexical gets db, project, top" || bad "lexical args: '$OUT'"
[[ "$OUT" != *"=== Names ==="* ]] && ok "lexical replaces Names" || bad "both steps ran: '$OUT'"
OUT=$(FAKE_NO_LEXICAL=1 run "Where is reap_kill defined?")
[[ "$OUT" == *"=== Names ==="*"reap_kill"* ]] && ok "old binary falls back to Names" || bad "fallback: '$OUT'"
OUT=$(FAKE_LEXICAL_EMPTY=1 run "Where is reap_kill defined?")
[[ "$OUT" == *"=== Names ==="*"reap_kill"* ]] && ok "empty lexical (not reindexed) falls back to Names" \
  || bad "empty fallback: '$OUT'"

# 7. Semantic is a fallback (2026-10-30 live rerun: lexical + mentions hit
#    18/20 in ~35 ms; semantic added 2 s per query and no extra hits). It runs
#    only when the earlier steps find nothing, or with --semantic.
OUT=$(run "what stops orphaned workers")
[[ "$OUT" == *"=== Files ==="* && "$OUT" != *"=== Semantic ==="* ]] && ok "semantic skipped when files found" \
  || bad "semantic not skipped: '$OUT'"
OUT=$(run "what stops orphaned workers" --semantic)
[[ "$OUT" == *"=== Files ==="* && "$OUT" == *"=== Semantic ==="* ]] && ok "--semantic forces semantic" \
  || bad "--semantic: '$OUT'"
OUT=$(FAKE_LEXICAL_EMPTY=1 run "what stops orphaned workers")
[[ "$OUT" == *"=== Semantic ==="* ]] && ok "semantic runs when nothing else found" || bad "no fallback: '$OUT'"

# 8. Resident model (2026-10-30): search.sh starts `serve` in the background
#    on first use, never waits for it, and starts only one.
MARK="$WORK/serve.mark"; : > "$MARK"
t0=$(date +%s%N)
OUT=$(CODESEARCH_NO_DAEMON= FAKE_SERVE_MARK="$MARK" run "what stops orphaned workers")
ms=$(( ($(date +%s%N) - t0) / 1000000 ))
[[ "$OUT" == *"=== Files ==="* ]] && [ "$ms" -lt 2000 ] && ok "search does not wait for the daemon (${ms} ms)" \
  || bad "search blocked or broke: ${ms} ms '$OUT'"
for _ in $(seq 1 40); do [ -s "$MARK" ] && break; sleep 0.05; done
grep -q "serve args=" "$MARK" && ok "daemon launched on first use" || bad "no serve launch: '$(cat "$MARK")'"
sid=$(sed -n 's/.* sid=\([0-9]*\) pid=\([0-9]*\)/\1 \2/p' "$MARK" | head -1)
[ -n "$sid" ] && [ "${sid%% *}" = "${sid##* }" ] && ok "daemon detached in its own session (setsid)" \
  || bad "daemon not detached: '$(cat "$MARK")'"
[ -f "$WORK/rt/serve.log" ] && ok "daemon log next to socket" || bad "no log at $WORK/rt/serve.log"
# Running daemon (socket present, lock held): no second launch.
mkdir -p "$WORK/rt"; : > "$MARK"
python3 -c "import socket,sys; s=socket.socket(socket.AF_UNIX); s.bind(sys.argv[1])" "$WORK/rt/serve.sock"
exec 9>"$WORK/rt/serve.sock.lock"; flock -n 9
CODESEARCH_NO_DAEMON= FAKE_SERVE_MARK="$MARK" run "what stops orphaned workers" >/dev/null
sleep 0.3
[ ! -s "$MARK" ] && ok "no launch while a daemon holds the lock" || bad "relaunched: '$(cat "$MARK")'"
exec 9>&-
# Stale socket (daemon died, lock free): relaunch.
CODESEARCH_NO_DAEMON= FAKE_SERVE_MARK="$MARK" run "what stops orphaned workers" >/dev/null
for _ in $(seq 1 40); do [ -s "$MARK" ] && break; sleep 0.05; done
[ -s "$MARK" ] && ok "stale socket: daemon relaunched" || bad "stale socket not relaunched"
# Opt-out.
: > "$MARK"; CODESEARCH_NO_DAEMON=1 FAKE_SERVE_MARK="$MARK" run "what stops orphaned workers" >/dev/null; sleep 0.3
[ ! -s "$MARK" ] && ok "CODESEARCH_NO_DAEMON=1 never launches" || bad "launched despite opt-out"

# 10. Default policy (80-question eval 2026-10-30: fusing semantic into Files
#     at weight 0.5 hit 76/80 vs 74/80 lexical-only, same bytes): fuse only
#     while a daemon is alive, so no query pays the ~2 s in-process model load.
python3 -c "import socket,sys; s=socket.socket(socket.AF_UNIX); s.bind(sys.argv[1])" "$WORK/rt/serve.sock" 2>/dev/null
exec 9>"$WORK/rt/serve.sock.lock"; flock -n 9
OUT=$(CODESEARCH_NO_DAEMON= run "what stops orphaned workers")
[[ "$OUT" == *"--semantic-weight 0.5"* ]] && ok "daemon alive: semantic fused at 0.5 by default" || bad "no default fusion: '$OUT'"
OUT=$(CODESEARCH_NO_DAEMON= run "what stops orphaned workers" --semantic-weight 0)
[[ "$OUT" != *"--semantic-weight"* ]] && ok "--semantic-weight 0 turns fusion off" || bad "weight 0: '$OUT'"
exec 9>&-
OUT=$(CODESEARCH_NO_DAEMON= run "what stops orphaned workers")
[[ "$OUT" != *"--semantic-weight"* ]] && ok "daemon not alive: lexical only (no 2 s load)" || bad "fused without daemon: '$OUT'"
OUT=$(run "what stops orphaned workers")
[[ "$OUT" != *"--semantic-weight"* ]] && ok "CODESEARCH_NO_DAEMON=1: lexical only" || bad "fused with opt-out: '$OUT'"

# 9. --semantic-weight W fuses semantic into Files via lexical.
OUT=$(run "what stops orphaned workers" --semantic-weight 0.5)
[[ "$OUT" == *"--semantic-weight 0.5"* ]] && ok "--semantic-weight passed to lexical" || bad "weight: '$OUT'"
OUT=$(run "what stops orphaned workers" --semantic-weight 'x;rm')
[[ "$OUT" != *"--semantic-weight x"* ]] && ok "non-numeric weight ignored" || bad "bad weight passed: '$OUT'"

echo "pass=$PASS fail=$FAIL"
[ "$FAIL" = 0 ]
