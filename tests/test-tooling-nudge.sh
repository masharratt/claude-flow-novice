#!/usr/bin/env bash
# tests/test-tooling-nudge.sh
# Tooling nudge hook (.claude/hooks/cfn-tooling-nudge.sh): PostToolUse on Bash and
# Edit/Write/MultiEdit. Counts normalised "shapes" of repeated manual work per
# project (worktrees pool to the main checkout) and, when a shape reaches the
# threshold inside the window, emits ONE additionalContext nudge per shape per
# session. Warn only: never blocks, fails open.
# Isolation: state root in a temp dir via CFN_TOOLING_NUDGE_STATE_ROOT; payload cwd
# points at throwaway git repos under a temp dir.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOK="$ROOT/.claude/hooks/cfn-tooling-nudge.sh"
# shellcheck disable=SC1091
source "$ROOT/.claude/cfn-scripts/lib/safe-rm.sh" || exit 1   # cfn_safe_rm_tmp
# shellcheck disable=SC1091
source "$ROOT/.claude/hooks/cfn-hook-budget.sh" || exit 1     # cfn_now_ms

TMP=$(mktemp -d "${TMPDIR:-/tmp}/tooling-nudge-test-XXXXXX") || exit 1
export CFN_TOOLING_NUDGE_STATE_ROOT="$TMP/state"
unset CFN_TOOLING_NUDGE CFN_TOOLING_NUDGE_THRESHOLD CFN_TOOLING_NUDGE_WINDOW CFN_TOOLING_NOW 2>/dev/null || true

PASS=0; FAIL=0
ok(){ echo "PASS: $1"; PASS=$((PASS+1)); }
no(){ echo "FAIL: $1"; FAIL=$((FAIL+1)); }
cleanup(){ chmod -R u+w "$TMP" 2>/dev/null; cfn_safe_rm_tmp "$TMP"; }
trap cleanup EXIT

for dep in jq git mktemp; do
    command -v "$dep" >/dev/null 2>&1 || { echo "FATAL: $dep not on PATH"; exit 1; }
done
[ -x "$HOOK" ] || { echo "FATAL: $HOOK missing or not executable"; exit 1; }

# --- fixtures: a main checkout and a linked worktree ----------------------------
REPO="$TMP/repo"; WT="$TMP/wt"
mkdir -p "$REPO" && git -C "$REPO" init -q
git -C "$REPO" -c user.email=t@t -c user.name=t commit --allow-empty -qm init
git -C "$REPO" worktree add -q "$WT" -b lane >/dev/null 2>&1
mkdir -p "$REPO/src/a" "$REPO/src/b"

# --- payload builders --------------------------------------------------------------
# bash_evt <session> <command> [cwd]
bash_evt(){
    jq -nc --arg s "$1" --arg c "$2" --arg d "${3:-$REPO}" '
      {session_id:$s, hook_event_name:"PostToolUse", tool_name:"Bash", cwd:$d,
       tool_input:{command:$c}, tool_response:{stdout:"", stderr:"", interrupted:false}}'
}
# edit_evt <session> <file> <new_string> [tool] [cwd]
edit_evt(){
    jq -nc --arg s "$1" --arg f "$2" --arg n "$3" --arg t "${4:-Edit}" --arg d "${5:-$REPO}" '
      {session_id:$s, hook_event_name:"PostToolUse", tool_name:$t, cwd:$d,
       tool_input:(if $t == "Write" then {file_path:$f, content:$n}
                   elif $t == "MultiEdit" then {file_path:$f, edits:[{old_string:"x", new_string:$n}]}
                   else {file_path:$f, old_string:"x", new_string:$n} end)}'
}
hook(){ printf '%s' "$1" | "$HOOK" >"$TMP/out.txt" 2>"$TMP/err.txt"; }
nudged(){ grep -q "TOOLING NUDGE" "$TMP/out.txt"; }
fresh(){ cfn_safe_rm_tmp "$CFN_TOOLING_NUDGE_STATE_ROOT" 2>/dev/null || true; }

CMD="./scripts/sync-assets.sh --env prod"

# 1. silent under threshold, nudge exactly once at the 3rd ----------------------------
fresh; S=s1
hook "$(bash_evt $S "$CMD")"; nudged && no "1st run nudged" || ok "1st run silent"
hook "$(bash_evt $S "$CMD")"; nudged && no "2nd run nudged" || ok "2nd run silent"
hook "$(bash_evt $S "$CMD")"; RC=$?
nudged && ok "3rd run nudges" || no "3rd run silent: $(cat "$TMP/out.txt") err=$(cat "$TMP/err.txt")"
[ "$RC" -eq 0 ] && ok "nudge exit code is 0 (warn only)" || no "nudge rc=$RC"
grep -q cfn-tooling-idea.sh "$TMP/out.txt" && ok "nudge names the idea script" || no "nudge lacks idea script"
grep -q additionalContext "$TMP/out.txt" && grep -q '"hookEventName":"PostToolUse"' "$TMP/out.txt" \
    && ok "nudge is PostToolUse additionalContext JSON" || no "bad nudge JSON: $(cat "$TMP/out.txt")"
grep -q '"decision"' "$TMP/out.txt" && no "nudge must not block" || ok "nudge carries no block decision"
hook "$(bash_evt $S "$CMD")"; nudged && no "4th run re-nudged" || ok "4th run silent (once per shape per session)"

# 2. variants: digits, basenames, quotes, plumbing, wrappers, env prefix -> same shape ---
fresh; S=s2
hook "$(bash_evt $S "node tools/gen.js --id 12 out/a.json")"
hook "$(bash_evt $S "node tools/gen.js --id 345 out/b.json")"; nudged && no "premature nudge on variants" || ok "variants: 2 silent"
hook "$(bash_evt $S "node tools/gen.js --id 7 out/c.json")"
nudged && ok "digit and basename variants pool into one shape" || no "variants did not pool: $(cat "$TMP/out.txt")"
fresh; S=s2b
hook "$(bash_evt $S "$CMD")"
hook "$(bash_evt $S "cd /x && $CMD 2>&1 | tee /tmp/a.txt")"
hook "$(bash_evt $S "FOO=1 timeout 30 rtk $CMD > /tmp/b.txt")"
nudged && ok "compound, redirect, env and wrapper noise strips to the same shape" || no "plumbing variants differ: $(cat "$TMP/out.txt")"
fresh; S=s2c
hook "$(bash_evt $S 'ci-tool push "message one" --force')"
hook "$(bash_evt $S "ci-tool push 'message two' --force")"
hook "$(bash_evt $S 'ci-tool push "msg 3 && more" --force')"
nudged && ok "quoted strings collapse (even ones containing &&)" || no "quotes did not collapse: $(cat "$TMP/out.txt")"
fresh; S=s2d
hook "$(bash_evt $S "$CMD")"; hook "$(bash_evt $S "$CMD --dry-run")"; hook "$(bash_evt $S "$CMD --other")"
nudged && no "different flags pooled" || ok "different flags stay different shapes"

# 3. read-only, noise and test runs never count -----------------------------------------
fresh; S=s3; ANY=0
for c in "ls -la src/foo" "cat a/b.txt" "git status" "git diff --stat" "git log --oneline" "grep -rn foo src" \
         "rg -n bar src" "find . -name '*.sh'" "head -20 f.txt" "tail -n 5 f.txt" "echo hello world" "pwd" "sleep 5" \
         "jq . data.json" "tmux capture-pane -p -t x" "git -C /p status" "wc -l a.txt" "du -sh src" \
         'bash $HOME/.claude/skills/cfn-mailbox/mailbox.sh read' 'bash $HOME/.claude/skills/cfn-codesearch/search.sh "q" --top 5'; do
    for _ in 1 2 3 4; do hook "$(bash_evt $S "$c")"; nudged && { ANY=1; echo "  nudged on: $c"; }; done
done
[ "$ANY" -eq 0 ] && ok "read-only and noise commands never nudge (x4 each)" || no "a read-only command nudged"
fresh; S=s3b; ANY=0
for c in "bash tests/test-foo.sh" "./tests/test-foo.sh 2>&1 | tee /tmp/x.txt" "npm test" "npm run test:unit" "npx vitest run" \
         "pytest -q tests/" "cargo test --lib" "go test ./..." "npx playwright test"; do
    for _ in 1 2 3 4; do hook "$(bash_evt $S "$c")"; nudged && { ANY=1; echo "  nudged on: $c"; }; done
done
[ "$ANY" -eq 0 ] && ok "test runs never nudge (x4 each)" || no "a test run nudged"
fresh; S=s3c
for _ in 1 2 3 4; do hook "$(bash_evt $S "foo a")"; done
nudged && no "too-short segment counted" || ok "segments shorter than 6 chars are skipped"

# 4. pooling across sessions and worktrees --------------------------------------------------
fresh
hook "$(bash_evt sA "$CMD")"; hook "$(bash_evt sA "$CMD")"; hook "$(bash_evt sB "$CMD")"
nudged && grep -q "sessions: 2" "$TMP/out.txt" && ok "two sessions in one project pool (sessions: 2)" || no "sessions did not pool: $(cat "$TMP/out.txt")"
fresh
hook "$(bash_evt sA "$CMD" "$REPO")"; hook "$(bash_evt sA "$CMD" "$REPO/src/a")"; hook "$(bash_evt sB "$CMD" "$WT")"
nudged && ok "worktree and subdir resolve to the main checkout (one pool)" || no "worktree did not pool: $(cat "$TMP/out.txt")"
OTHER="$TMP/other"; mkdir -p "$OTHER" && git -C "$OTHER" init -q
fresh
hook "$(bash_evt sA "$CMD" "$REPO")"; hook "$(bash_evt sA "$CMD" "$REPO")"; hook "$(bash_evt sB "$CMD" "$OTHER")"
nudged && no "different projects pooled" || ok "different projects do not pool"
fresh
hook "$(bash_evt sA "$CMD")"; hook "$(bash_evt sA "$CMD")"; hook "$(bash_evt sA "$CMD")"
hook "$(bash_evt sB "$CMD")"
nudged && ok "second session gets its own single nudge" || no "second session not nudged"
hook "$(bash_evt sB "$CMD")"; nudged && no "second session re-nudged" || ok "second session nudged only once"

# 5. Edit / Write / MultiEdit shapes ---------------------------------------------------------------
fresh; S=s5
hook "$(edit_evt $S "$REPO/src/a/one.ts" "import { logger } from './log-v2';")"
hook "$(edit_evt $S "$REPO/src/a/two.ts" "import { logger } from './log-v3';")"; nudged && no "edit premature" || ok "edit: 2 silent"
hook "$(edit_evt $S "$REPO/src/a/three.ts" "import { logger } from './log-v4';")"
nudged && ok "same edit (digits differ) across files in one dir nudges at 3" || no "edit shape missed: $(cat "$TMP/out.txt")"
fresh; S=s5b
hook "$(edit_evt $S "$REPO/src/a/one.ts" "const alpha = computeAlpha(input);")"
hook "$(edit_evt $S "$REPO/src/a/two.ts" "return beta(items).filter(Boolean);")"
hook "$(edit_evt $S "$REPO/src/a/three.ts" "export default function gamma() {}")"
nudged && no "different edits pooled" || ok "different edit contents do not pool"
fresh; S=s5c
hook "$(edit_evt $S "$REPO/src/a/one.ts" "// shared header comment line" Write)"
hook "$(edit_evt $S "$REPO/src/a/two.ts" "// shared header comment line" Write)"
hook "$(edit_evt $S "$REPO/src/a/three.ts" "// shared header comment line" Write)"
nudged && ok "Write shape counts" || no "Write shape missed"
fresh; S=s5d
hook "$(edit_evt $S "$REPO/src/a/one.ts" "// shared header comment line" MultiEdit)"
hook "$(edit_evt $S "$REPO/src/a/two.ts" "// shared header comment line" MultiEdit)"
hook "$(edit_evt $S "$REPO/src/a/three.ts" "// shared header comment line" MultiEdit)"
nudged && ok "MultiEdit shape counts" || no "MultiEdit shape missed"
fresh; S=s5e
hook "$(edit_evt $S "$REPO/src/a/one.ts" "// shared header comment line")"
hook "$(edit_evt $S "$REPO/src/b/two.ts" "// shared header comment line")"
hook "$(edit_evt $S "$REPO/src/a/three.ts" "// shared header comment line")"
nudged && no "edits in different dirs pooled" || ok "edit shape is per directory"
fresh; S=s5f
for f in one two three four; do hook "$(edit_evt $S "$REPO/src/a/$f.ts" "x")"; done
nudged && no "tiny edit counted" || ok "tiny edits (under 8 chars) are skipped"

# 6. thresholds, window, off switch ----------------------------------------------------------------
fresh; S=s6
CFN_TOOLING_NUDGE_THRESHOLD=2 hook "$(bash_evt $S "$CMD")"
CFN_TOOLING_NUDGE_THRESHOLD=2 hook "$(bash_evt $S "$CMD")"
nudged && ok "CFN_TOOLING_NUDGE_THRESHOLD=2 nudges at 2" || no "threshold env ignored"
fresh; S=s6b
CFN_TOOLING_NOW=1000 hook "$(bash_evt $S "$CMD")"
CFN_TOOLING_NOW=1100 hook "$(bash_evt $S "$CMD")"
CFN_TOOLING_NOW=20000 hook "$(bash_evt $S "$CMD")"
nudged && no "runs outside the window counted" || ok "runs older than the 7200s window do not count"
fresh; S=s6c
CFN_TOOLING_NOW=1000 hook "$(bash_evt $S "$CMD")"
CFN_TOOLING_NOW=1100 hook "$(bash_evt $S "$CMD")"
CFN_TOOLING_NOW=1200 hook "$(bash_evt $S "$CMD")"
nudged && ok "runs inside the window count" || no "in-window runs missed"
fresh; S=s6d; ANY=0
for _ in 1 2 3 4; do CFN_TOOLING_NUDGE=off hook "$(bash_evt $S "$CMD")"; nudged && ANY=1; done
[ "$ANY" -eq 0 ] && ok "CFN_TOOLING_NUDGE=off is silent" || no "off switch ignored"
[ ! -d "$CFN_TOOLING_NUDGE_STATE_ROOT" ] && ok "off switch writes no state" || no "off switch wrote state"

# 7. ignored events and fail-open ----------------------------------------------------------------------
fresh
printf 'not json{{' | "$HOOK" >"$TMP/out.txt" 2>"$TMP/err.txt"; RC=$?
[ "$RC" -eq 0 ] && [ ! -s "$TMP/out.txt" ] && ok "garbage stdin: exit 0, silent" || no "garbage stdin rc=$RC out=$(cat "$TMP/out.txt")"
printf '' | "$HOOK" >"$TMP/out.txt" 2>&1; RC=$?
[ "$RC" -eq 0 ] && [ ! -s "$TMP/out.txt" ] && ok "empty stdin: exit 0, silent" || no "empty stdin rc=$RC"
printf '%s' '{"session_id":"x","hook_event_name":"PostToolUse","tool_name":"Read","tool_input":{"file_path":"/a/b"}}' | "$HOOK" >"$TMP/out.txt" 2>&1; RC=$?
[ "$RC" -eq 0 ] && [ ! -s "$TMP/out.txt" ] && ok "other tools ignored" || no "Read tool not ignored"
printf '%s' '{"hook_event_name":"PostToolUse","tool_name":"Bash","tool_input":{"command":"./scripts/sync-assets.sh --env prod"}}' | "$HOOK" >"$TMP/out.txt" 2>&1; RC=$?
[ "$RC" -eq 0 ] && [ ! -s "$TMP/out.txt" ] && ok "payload without session_id: exit 0, silent" || no "no-session rc=$RC"
mkdir -p "$TMP/ro"; chmod 500 "$TMP/ro"
for _ in 1 2 3; do printf '%s' "$(bash_evt s-ro "$CMD")" | CFN_TOOLING_NUDGE_STATE_ROOT="$TMP/ro/x" "$HOOK" >"$TMP/out.txt" 2>"$TMP/err.txt"; RC=$?; done
[ "$RC" -eq 0 ] && ok "unwritable state root fails open (rc=0)" || no "unwritable state rc=$RC"
mkdir -p "$CFN_TOOLING_NUDGE_STATE_ROOT/stale-proj"; touch -d '30 days ago' "$CFN_TOOLING_NUDGE_STATE_ROOT/stale-proj"
mkdir -p "$TMP/newproj" && git -C "$TMP/newproj" init -q
hook "$(bash_evt s-new "$CMD" "$TMP/newproj")"
[ ! -d "$CFN_TOOLING_NUDGE_STATE_ROOT/stale-proj" ] && ok "stale project state pruned" || no "stale state left behind"

# 7b. pipeline fragments, loop keywords and wrappers (field report) ---------------------------------------
fresh; S=s7a; ANY=0
for c in 'cat a.txt | cut -c1-80' 'cat a.txt | cut -c5-9' 'cat a.txt | tr -d S' "cat a.txt | awk '{print 1}'" \
         "cat a.txt | sed 's/a/b/'" 'cat a.txt | sort -u' 'cat a.txt | uniq -c' 'cat a.txt | column -t' 'cat a.txt | nl' \
         'cat a.txt | tee /tmp/o.txt' 'cat a.txt | xargs -n1 echo hi' 'sed -n 5,9p a.txt' 'cat a.txt | less'; do
    for _ in 1 2 3 4; do hook "$(bash_evt $S "$c")"; nudged && { ANY=1; echo "  nudged on: $c"; }; done
done
[ "$ANY" -eq 0 ] && ok "pipeline filter segments never nudge on their own (x4 each)" || no "a pipe filter nudged"
fresh; S=s7b; ANY=0
for c in 'for f in a b; do echo "$f"; done' 'while read l; do echo "$l"; done < in.txt' 'for f in a b; do echo hi; done'; do
    for _ in 1 2 3 4; do hook "$(bash_evt $S "$c")"; nudged && { ANY=1; echo "  nudged on: $c"; }; done
done
[ "$ANY" -eq 0 ] && ok "loop keywords stripped: 'do echo S' does not nudge" || no "loop keyword fragment nudged"
fresh; S=s7c
hook "$(bash_evt $S 'for f in 1 2; do cp art/1.png game/1.png; done')"
hook "$(bash_evt $S 'for f in 3 4; do cp art/3.png game/3.png; done')"
hook "$(bash_evt $S 'for f in 5; do cp art/5.png game/5.png; done')"
nudged && grep -q "'cp " "$TMP/out.txt" && ok "'do cp a/1 b/1' keys to the cp shape" || no "loop body cp not keyed: $(cat "$TMP/out.txt")"
fresh; S=s7d; ANY=0
for _ in 1 2 3 4; do hook "$(bash_evt $S 'ssh -n vps_personal "echo hi"')"; nudged && ANY=1; done
for _ in 1 2 3 4; do hook "$(bash_evt $S 'ssh -n vps_personal "ls -la /srv"')"; nudged && ANY=1; done
[ "$ANY" -eq 0 ] && ok "ssh wrapper of an ignorable inner command never nudges" || no "ssh echo/ls nudged"
fresh; S=s7e
hook "$(bash_evt $S 'ssh -n vps_personal "cp art/1.png game/1.png"')"
hook "$(bash_evt $S 'ssh -n vps_personal "cp art/2.png game/2.png"')"
hook "$(bash_evt $S 'ssh -n vps_personal "cp art/3.png game/3.png"')"
nudged && grep -q 'ssh:vps_personal' "$TMP/out.txt" && ok "ssh -n host \"cp ...\" x3 still nudges, shape tagged ssh:host" || no "ssh cp x3 silent: $(cat "$TMP/out.txt")"
fresh; S=s7f
hook "$(bash_evt $S 'cp art/1.png game/1.png')"
hook "$(bash_evt $S 'cp art/2.png game/2.png')"
hook "$(bash_evt $S 'ssh vps_personal "cp art/3.png game/3.png"')"
nudged && no "local and remote cp pooled" || ok "local and remote shapes differ"
fresh; S=s7g
hook "$(bash_evt $S 'sudo cp art/1.png game/1.png')"
hook "$(bash_evt $S 'sudo -n cp art/2.png game/2.png')"
hook "$(bash_evt $S 'nohup cp art/3.png game/3.png')"
nudged && ok "sudo and nohup are unwrapped to the inner shape" || no "sudo/nohup not unwrapped: $(cat "$TMP/out.txt")"
fresh; S=s7h
hook "$(bash_evt $S 'ls src | xargs -I{} cp {} dst/')"
hook "$(bash_evt $S 'ls lib | xargs -I{} cp {} dst/')"
hook "$(bash_evt $S 'ls bin | xargs -n 1 -I{} cp {} dst/')"
nudged && ok "xargs prefix is unwrapped to the inner shape" || no "xargs not unwrapped: $(cat "$TMP/out.txt")"

# 8. latency ----------------------------------------------------------------------------------------------
fresh; MAX=0
for i in 1 2 3 4 5; do
    P=$(bash_evt s-lat "cd /x && npm run build:assets -- --env prod$i 2>&1 | tee /tmp/out.log")
    t0=$(cfn_now_ms); hook "$P"; t1=$(cfn_now_ms)
    [ $((t1 - t0)) -gt "$MAX" ] && MAX=$((t1 - t0))
done
[ "$MAX" -lt 1000 ] && ok "slowest call ${MAX}ms < 1000ms" || no "slowest call ${MAX}ms >= 1000ms"

echo
echo "tooling-nudge: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
