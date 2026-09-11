#!/usr/bin/env bash
# cfn-tmux-agents test suite. Uses a fake engine binary (--bin) so no real
# claude/codex/glm process is spawned. Every test runs on a per-run socket
# that the cleanup trap tears down with kill-server.
# Run: .claude/skills/cfn-tmux-agents/tests/test-agents.sh

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXE="$SKILL_DIR/execute.sh"
FAKE="$SKILL_DIR/tests/fake-engine.sh"
SOCK="tagents-test-$$"
export TMUX_AGENTS_AUTH_TIMEOUT=1    # healthy auth probe must not eat 12s per spawn
export TMUX_AGENTS_BANNER_TIMEOUT=3  # banner-timeout test must fail fast

PASS=0 FAIL=0 TOTAL=0

cleanup() {
  tmux -L "$SOCK" kill-server 2>/dev/null || true
}
trap cleanup EXIT

ok()   { TOTAL=$((TOTAL+1)); PASS=$((PASS+1)); echo "  PASS: $1"; }
bad()  { TOTAL=$((TOTAL+1)); FAIL=$((FAIL+1)); echo "  FAIL: $1"; }

assert_rc() { # assert_rc WANT_RC DESC cmd...
  local want="$1" desc="$2"; shift 2
  local rc=0
  "$@" >/dev/null 2>&1 || rc=$?
  [ "$rc" -eq "$want" ] && ok "$desc (rc=$rc)" || bad "$desc (want rc=$want got rc=$rc)"
}

assert_rc_ne() { # assert_rc_ne NOT_RC DESC cmd...
  local not="$1" desc="$2"; shift 2
  local rc=0
  "$@" >/dev/null 2>&1 || rc=$?
  [ "$rc" -ne "$not" ] && ok "$desc (rc=$rc)" || bad "$desc (unexpected rc=$rc)"
}

assert_out_has() { # assert_out_has NEEDLE DESC cmd...
  local needle="$1" desc="$2"; shift 2
  local out
  out=$("$@" 2>&1) || true
  case "$out" in *"$needle"*) ok "$desc" ;; *) bad "$desc (missing: $needle; got: ${out:0:200})" ;; esac
}

echo "== cfn-tmux-agents tests (socket: $SOCK) =="

# 0. banner regexes match current TUIs (codex-cli 0.150.1 shows "Ask Codex",
#    not "provider: openai"; live-smoked 2026-09-10)
CODEX_RE=$(bash -c '. "'"$SKILL_DIR"'/lib/engines.sh" >/dev/null 2>&1; _ta_engine_field codex 7')
case "$CODEX_RE" in *"Ask Codex"*) ok "codex banner regex matches current TUI" ;; *) bad "codex banner regex stale: $CODEX_RE" ;; esac
GLM_RE=$(bash -c '. "'"$SKILL_DIR"'/lib/engines.sh" >/dev/null 2>&1; _ta_engine_field glm 7')
case "$GLM_RE" in *"glm-"*) ok "glm banner regex present" ;; *) bad "glm banner regex stale: $GLM_RE" ;; esac

# 0b. single source of truth: the registry is READ from the shared
# ~/.claude/cfn-config/engines.env (also consumed by cfn-fleet via its
# template symlink), never an inline copy that can drift
SHARED_ENGINES="$HOME/.claude/cfn-config/engines.env"
if [ -f "$SHARED_ENGINES" ]; then
  SHARED_BODY=$(grep -vE '^[[:space:]]*(#|$)' "$SHARED_ENGINES")
  LOADED=$(bash -c '. "'"$SKILL_DIR"'/lib/engines.sh" >/dev/null 2>&1; printf "%s" "$_TA_ENGINES"')
  [ "$SHARED_BODY" = "$LOADED" ] && ok "registry loaded from shared cfn-config file" \
    || bad "registry differs from $SHARED_ENGINES (inline drift?)"
else
  bad "shared engine registry missing: $SHARED_ENGINES"
fi

# 1. spawn with the fake engine reaches the banner gate and prints spawned
OUT=$("$EXE" spawn w1 --socket "$SOCK" --bin "$FAKE" --banner-regex 'AGENTS-TEST-BANNER' --cwd /tmp 2>&1) \
  && ok "spawn fake engine exits 0" || bad "spawn fake engine exits nonzero: $OUT"
case "$OUT" in *spawned*) ok "spawn prints spawned line" ;; *) bad "spawn output lacks spawned: $OUT" ;; esac

# 2. status reports the session alive
assert_out_has "w1" "status lists w1" "$EXE" status w1 --socket "$SOCK"

# 3. capture reads pane content (the banner line)
assert_out_has "AGENTS-TEST-BANNER" "capture shows fake banner" "$EXE" capture w1 --socket "$SOCK"

# 4. send delivers literal text: pty echo puts the typed line in the pane
"$EXE" send w1 --socket "$SOCK" "hello 'quoted' \"double\" \$(pwd) ; end" >/dev/null 2>&1 || bad "send exits nonzero"
sleep 0.5
assert_out_has 'hello' "send text lands in pane" "$EXE" capture w1 --socket "$SOCK"
assert_out_has '$(pwd)' "send text is literal (no expansion)" "$EXE" capture w1 --socket "$SOCK"

# 5. duplicate session name is refused
assert_rc_ne 0 "duplicate spawn name refused" "$EXE" spawn w1 --socket "$SOCK" --bin "$FAKE" --banner-regex 'AGENTS-TEST-BANNER' --cwd /tmp

# 6. banner timeout is a distinct failure, and diagnostics hit stderr
assert_rc 68 "banner timeout exits 68" "$EXE" spawn wbad --socket "$SOCK" --bin "$FAKE" --banner-regex 'NEVER-MATCHES' --cwd /tmp

# 7. glm without a token source resolves to exit 66 BEFORE touching tmux
assert_rc 66 "glm without token exits 66" env -u FLEET_ZAI_TOKEN -u ZAI_TOKEN -u TMUX_AGENTS_ZAI_TOKEN \
  "$EXE" spawn g1 --socket "$SOCK" --engine glm --cwd /tmp

# 8. unknown engine is refused
assert_rc 65 "unknown engine exits 65" "$EXE" spawn u1 --socket "$SOCK" --engine nosuch --cwd /tmp

# 9. invalid session name is refused
assert_rc 64 "bad name exits 64" "$EXE" spawn 'bad name;rm' --socket "$SOCK" --cwd /tmp

# 10. kill removes exactly the named session
"$EXE" kill w1 --socket "$SOCK" >/dev/null 2>&1 || bad "kill w1 exits nonzero"
assert_rc_ne 0 "status of killed session is nonzero" "$EXE" status w1 --socket "$SOCK"

# 11. spawn with a prompt file: thin text sent after banner
printf 'do the thing via /tmp/out.txt\n' > /tmp/tagents-prompt-$$.txt
"$EXE" spawn w2 --socket "$SOCK" --bin "$FAKE" --banner-regex 'AGENTS-TEST-BANNER' --cwd /tmp \
  --prompt-file "/tmp/tagents-prompt-$$.txt" >/dev/null 2>&1 && ok "spawn with prompt-file exits 0" || bad "spawn with prompt-file fails"
sleep 0.5
assert_out_has "do the thing" "prompt text delivered" "$EXE" capture w2 --socket "$SOCK"

# 12. list shows remaining session
assert_out_has "w2" "list shows w2" "$EXE" list --socket "$SOCK"

# 13. kill --all tears the server down
assert_rc 0 "kill --all exits 0" "$EXE" kill --all --socket "$SOCK"
assert_rc_ne 0 "list after kill --all is nonzero/empty" "$EXE" list --socket "$SOCK"

# 14. startup modal gate: codex-cli update modal is dismissed with "2" (Skip),
# never Enter (Enter picks "Update now" = surprise npm -g install). Measured
# live 2026-09-10 on codex-cli 0.153.4.
OUT=$("$EXE" spawn m1 --socket "$SOCK" --bin "$SKILL_DIR/tests/fake-engine-modal.sh" \
  --banner-regex 'AGENTS-TEST-BANNER' --cwd /tmp 2>&1) \
  && ok "modal engine spawn exits 0" || bad "modal engine spawn fails: $OUT"
case "$OUT" in *modal-cleared*) ok "modal dismissed with 2, banner reached" ;; *) bad "modal not dismissed: $OUT" ;; esac
"$EXE" kill m1 --socket "$SOCK" >/dev/null 2>&1 || true

# 15. codex delegation gate: codex engine requires a literal codex=true line
# in the TARGET project's CLAUDE.md (global CLAUDE.md rule); /tmp has none.
assert_rc 66 "codex engine without codex=true exits 66" "$EXE" spawn cx1 --socket "$SOCK" --engine codex --cwd /tmp
OUT=$("$EXE" spawn cx1 --socket "$SOCK" --engine codex --cwd /tmp 2>&1) || true
case "$OUT" in *codex=true*) ok "refusal names the gate" ;; *) bad "refusal lacks gate text: $OUT" ;; esac
# positive: this repo's CLAUDE.md carries codex=true; --dry-run stops after
# the guards, so no real codex runs
PROJ_ROOT="$(cd "$SKILL_DIR/../../.." && pwd)"
assert_rc 0 "codex engine with codex=true passes gate (dry-run)" "$EXE" spawn cx2 --socket "$SOCK" --engine codex --cwd "$PROJ_ROOT" --dry-run

echo "== results: $PASS/$TOTAL passed, $FAIL failed =="
[ "$FAIL" -eq 0 ]
