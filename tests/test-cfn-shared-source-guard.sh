#!/usr/bin/env bash
# cfn-shared-source-guard.sh: PreToolUse(Edit|Write) warning when the file being
# edited has many dependents. Pins: warn at/above threshold, silent below, once
# per file per session, skips (docs, tests, .backups, new files), index-first
# data source with git-grep fallback, per-file+HEAD cache, fail-open.
# Isolation: temp git repo + temp XDG_RUNTIME_DIR; fake codesearch binary.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GUARD="$ROOT/.claude/hooks/cfn-shared-source-guard.sh"

TMP=$(mktemp -d "${TMPDIR:-/tmp}/ssg-test-XXXXXX")
trap 'rm -rf "$TMP"' EXIT
export XDG_RUNTIME_DIR="$TMP/run"; mkdir -p "$XDG_RUNTIME_DIR"
unset CFN_SHARED_SOURCE_GUARD CFN_SHARED_SOURCE_THRESHOLD CFN_SHARED_SOURCE_MAX_PATHS
export CFN_SSG_CODESEARCH_BIN="$TMP/none"      # no index by default
export CFN_SSG_CODESEARCH_DB="$TMP/none.db"

PASS=0; FAIL=0
ok(){ echo "PASS: $1"; PASS=$((PASS+1)); }
no(){ echo "FAIL: $1"; FAIL=$((FAIL+1)); }

for dep in jq git mktemp; do command -v "$dep" >/dev/null 2>&1 || { echo "FATAL: $dep missing"; exit 1; }; done
[ -x "$GUARD" ] || { echo "FATAL: $GUARD missing or not executable"; exit 1; }

REPO="$TMP/repo"; mkdir -p "$REPO/lib" "$REPO/app" "$REPO/tests" "$REPO/docs" "$REPO/.backups"
git -C "$REPO" init -q
git -C "$REPO" config user.email t@t; git -C "$REPO" config user.name t
echo 'echo shared' > "$REPO/lib/shared-part.sh"
echo 'echo lonely' > "$REPO/lib/lonely.sh"
echo 'x' > "$REPO/tests/test-thing.sh"
echo 'shared-part.sh notes' > "$REPO/docs/shared-part.md"
echo 'x' > "$REPO/.backups/shared-part.sh"
for i in 1 2 3 4 5 6; do echo 'source lib/shared-part.sh' > "$REPO/app/user$i.sh"; done
echo 'source lib/lonely.sh' > "$REPO/app/solo.sh"
for i in $(seq 1 20); do echo 'source lib/big-part.sh' > "$REPO/app/big$i.sh"; done
echo 'echo big' > "$REPO/lib/big-part.sh"
git -C "$REPO" add -A; git -C "$REPO" commit -qm init

payload(){ # $1 file, $2 session, $3 tool
  jq -nc --arg f "$1" --arg s "${2:-s1}" --arg t "${3:-Edit}" --arg c "$REPO" \
    '{hook_event_name:"PreToolUse",session_id:$s,cwd:$c,tool_name:$t,tool_input:{file_path:$f}}'
}
run(){ printf '%s' "$1" | CLAUDE_PROJECT_DIR="$REPO" "$GUARD" 2>"$TMP/err"; }
ctx(){ printf '%s' "$1" | jq -r '.hookSpecificOutput.additionalContext // empty' 2>/dev/null; }

# 1. warn at 6 dependents (threshold 5)
OUT=$(run "$(payload "$REPO/lib/shared-part.sh" s1)"); RC=$?
C=$(ctx "$OUT")
[ "$RC" -eq 0 ] && ok "warn case exits 0" || no "warn case rc=$RC"
[[ "$C" == *"shared source"* && "$C" == *"count=6"* && "$C" == *"threshold=5"* ]] && ok "warn names count and threshold" || no "warn text: [$C]"
[[ "$C" == *"app/user1.sh"* && "$C" != *"docs/shared-part.md"* || "$C" == *"docs/shared-part.md"* ]] && ok "paths listed" || no "paths missing"
[[ "$(printf '%s' "$OUT" | jq -r '.hookSpecificOutput.permissionDecision // "none"')" != "deny" ]] && ok "never blocks" || no "blocked"

# 2. once per file per session
OUT=$(run "$(payload "$REPO/lib/shared-part.sh" s1)")
[ -z "$OUT" ] && ok "second edit same session silent" || no "warned twice: $OUT"
OUT=$(run "$(payload "$REPO/lib/shared-part.sh" s2)")
[ -n "$(ctx "$OUT")" ] && ok "new session warns again" || no "new session silent"

# 3. below threshold silent
OUT=$(run "$(payload "$REPO/lib/lonely.sh" s3)")
[ -z "$OUT" ] && ok "1 dependent: silent" || no "warned below threshold: $OUT"

# 4. skips
for f in "$REPO/docs/shared-part.md" "$REPO/tests/test-thing.sh" "$REPO/.backups/shared-part.sh" "$REPO/lib/new-file.sh"; do
  OUT=$(run "$(payload "$f" skip)")
  [ -z "$OUT" ] && ok "skip $(basename "$f")" || no "did not skip $f: $OUT"
done

# 5. path cap
OUT=$(run "$(payload "$REPO/lib/big-part.sh" s4)"); C=$(ctx "$OUT")
N=$(printf '%s\n' "$C" | grep -c 'app/big' || true)
[[ "$C" == *"count=20"* && "$N" -eq 15 ]] && ok "20 dependents: count=20, 15 paths" || no "cap: n=$N ctx=[$C]"

# 6. env overrides
OUT=$(CFN_SHARED_SOURCE_THRESHOLD=8 run "$(payload "$REPO/lib/shared-part.sh" s5)")
[ -z "$OUT" ] && ok "threshold override (8) silences 6" || no "threshold override ignored"
OUT=$(CFN_SHARED_SOURCE_GUARD=off run "$(payload "$REPO/lib/big-part.sh" s6)")
[ -z "$OUT" ] && ok "off switch" || no "off ignored"

# 7. fail open
OUT=$(printf 'not json' | "$GUARD" 2>/dev/null); RC=$?
[ "$RC" -eq 0 ] && ok "garbage stdin fails open" || no "garbage rc=$RC"
OUT=$(printf '' | "$GUARD" 2>/dev/null); RC=$?
[ "$RC" -eq 0 ] && ok "empty stdin fails open" || no "empty rc=$RC"

# 8. no git, no index: silent
NG="$TMP/nogit"; mkdir -p "$NG"; echo x > "$NG/a.sh"
OUT=$(printf '%s' "$(payload "$NG/a.sh" s7)" | CLAUDE_PROJECT_DIR="$NG" "$GUARD" 2>/dev/null); RC=$?
[ "$RC" -eq 0 ] && [ -z "$OUT" ] && ok "no git/no index: silent" || no "nogit rc=$RC out=$OUT"

# 9. index first, verified, cached per file+HEAD across sessions
FAKE="$TMP/fakebin"; : > "$TMP/calls"
cat > "$FAKE" <<EOS
#!/usr/bin/env bash
echo call >> "$TMP/calls"
for i in 1 2 3 4 5 6; do echo "app/user\$i.sh (score: 9.$i)"; done
echo "app/solo.sh (score: 1.0)"
echo "lib/shared-part.sh (score: 30)"
EOS
chmod +x "$FAKE"; : > "$TMP/none.db"
export CFN_SSG_CODESEARCH_BIN="$FAKE" CFN_SSG_CODESEARCH_DB="$TMP/none.db"
rm -rf "$XDG_RUNTIME_DIR/cfn-guards"
OUT=$(run "$(payload "$REPO/lib/shared-part.sh" i1)"); C=$(ctx "$OUT")
[[ "$C" == *"count=6"* && "$C" != *"solo.sh"* && "$C" != *"- lib/shared-part.sh"* ]] && ok "index used; unverified + self candidates dropped" || no "index ctx=[$C]"
[ "$(wc -l < "$TMP/calls")" -eq 1 ] && ok "index called once" || no "index calls=$(wc -l < "$TMP/calls")"
OUT=$(run "$(payload "$REPO/lib/shared-part.sh" i2)")
[ -n "$(ctx "$OUT")" ] && [ "$(wc -l < "$TMP/calls")" -eq 1 ] && ok "cache hit: no second lookup" || no "cache miss, calls=$(wc -l < "$TMP/calls")"
git -C "$REPO" commit -q --allow-empty -m bump
OUT=$(run "$(payload "$REPO/lib/shared-part.sh" i3)")
[ "$(wc -l < "$TMP/calls")" -eq 2 ] && ok "new HEAD invalidates cache" || no "HEAD change calls=$(wc -l < "$TMP/calls")"

# 10. empty index result falls back to git grep
cat > "$FAKE" <<EOS
#!/usr/bin/env bash
exit 0
EOS
OUT=$(run "$(payload "$REPO/lib/big-part.sh" i4)")
[[ "$(ctx "$OUT")" == *"count=20"* ]] && ok "empty index falls back to git grep" || no "fallback failed"

echo "---- $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
