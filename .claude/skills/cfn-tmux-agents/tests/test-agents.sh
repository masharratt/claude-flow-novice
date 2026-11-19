#!/usr/bin/env bash
# cfn-tmux-agents test suite. Uses a fake engine binary (--bin) so no real
# claude/codex/glm process is spawned. Every test runs on a per-run socket
# that the cleanup trap tears down with kill-server.
# Run: .claude/skills/cfn-tmux-agents/tests/test-agents.sh

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXE="$SKILL_DIR/execute.sh"
FAKE="$SKILL_DIR/tests/fake-engine.sh"
REAL_FENCE="$(cd "$SKILL_DIR/../../cfn-scripts" && pwd -P)/zai-fence.sh"
GITC=(-c user.name=t -c user.email=t@example.invalid -c commit.gpgsign=false)
APPROVE="$(cd "$SKILL_DIR/../../cfn-scripts" && pwd -P)/glm-open-approve.sh"
# shellcheck source=../../../cfn-scripts/lib/safe-rm.sh
. "$(cd "$SKILL_DIR/../../cfn-scripts/lib" && pwd -P)/safe-rm.sh"
# glm-open approvals (allow-list fence) go to a test store, never the real ~/.config
CFN_GLM_OPEN_APPROVALS=$(mktemp -d); export CFN_GLM_OPEN_APPROVALS
# allow-list fence worker homes go to a temp dir, never the real ~/.claude
ZAI_FENCE_WORKER_BASE=$(mktemp -d); export ZAI_FENCE_WORKER_BASE
SOCK="tagents-test-$$"
export TMUX_AGENTS_AUTH_TIMEOUT=1    # healthy auth probe must not eat 12s per spawn
export TMUX_AGENTS_BANNER_TIMEOUT=3  # banner-timeout test must fail fast

PASS=0 FAIL=0 TOTAL=0

# Claude-kind spawns probe the host sandbox (bwrap + socat on Linux). Tests
# run inside other sandboxes where a nested bwrap fails, so a probe-passing
# stub sits first on PATH; test 21 swaps in a failing one to check the refusal.
# Worker outboxes go to a per-run dir, never the shared /tmp default.
GTD=$(mktemp -d) || exit 1
mkdir -p "$GTD/sbx" "$GTD/out"
# The stub passes only the probe; every other bwrap call (the real zai-fence
# in the glm tests) goes to the real bwrap, or fails when there is none.
REAL_BWRAP=$(command -v bwrap 2>/dev/null || true)
printf '#!/bin/sh\n[ "$*" = "--ro-bind / / true" ] && exit 0\n[ -n "%s" ] || exit 127\nexec "%s" "$@"\n' "$REAL_BWRAP" "$REAL_BWRAP" > "$GTD/sbx/bwrap"
printf '#!/bin/sh\nexit 0\n' > "$GTD/sbx/socat"
chmod +x "$GTD/sbx/bwrap" "$GTD/sbx/socat"
export PATH="$GTD/sbx:$PATH"
GLOBAL_OUTBOX_ROOT="$GTD/out"
export TMUX_AGENTS_OUTBOX_ROOT="$GLOBAL_OUTBOX_ROOT"

cleanup() {
  cfn_safe_rm_tmp "$GTD" || true
  tmux -L "$SOCK" kill-server 2>/dev/null || true
  tmux -L "$SOCK-k" kill-server 2>/dev/null || true
  tmux -L "$SOCK-L" kill-server 2>/dev/null || true
  tmux -L "$SOCK-e" kill-server 2>/dev/null || true
  tmux -L "$SOCK-f" kill-server 2>/dev/null || true
  tmux -L "$SOCK-w" kill-server 2>/dev/null || true
  rm -rf "$CFN_GLM_OPEN_APPROVALS" "$ZAI_FENCE_WORKER_BASE"
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
#    not "provider: openai"; live-smoked 2026-09-10; "Ask Codex" re-verified
#    present in the 0.156.1 TUI binary 2026-09-24)
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
NH=$(mktemp -d) || exit 1; mkdir -p "$NH/.claude"; ln -s "$HOME/.claude/cfn-config" "$NH/.claude/cfn-config"
assert_rc 66 "glm without token exits 66 (empty fake HOME, no token file)" env -u FLEET_ZAI_TOKEN -u ZAI_TOKEN -u TMUX_AGENTS_ZAI_TOKEN HOME="$NH" \
  "$EXE" spawn g1 --socket "$SOCK" --engine glm --cwd /tmp

cfn_safe_rm_tmp "$NH"
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

# 17. BUG codex-approval-lost (2026-11-18): --args REPLACED the registry args,
# so a caller's "-s danger-full-access" or "--cd X" dropped --ask-for-approval
# never and the worker stopped on approval prompts. Final codex args must hold
# exactly one approval setting, "never"; the caller's sandbox is kept, default
# workspace-write. Dry-run prints "# codex args: ..." for the final args.
cxargs() { # cxargs [--args STR] -> the "# codex args:" line
  "$EXE" spawn cxa --socket "$SOCK" --engine codex --cwd "$PROJ_ROOT" --dry-run "$@" 2>&1 | grep '^# codex args:' || true
}
cx_count() { printf '%s' "$1" | grep -oE -- "$2" | wc -l | tr -d ' '; }
L=$(cxargs --args "-s danger-full-access")
case "$L" in *"-s danger-full-access"*"--ask-for-approval never"*|*"--ask-for-approval never"*"-s danger-full-access"*) ok "codex -s danger-full-access keeps full access and gets never" ;; *) bad "codex -s full: $L" ;; esac
case "$L" in *workspace-write*) bad "codex -s full gained workspace-write: $L" ;; *) ok "codex -s full not given a second sandbox" ;; esac
L=$(cxargs --args "-a on-request")
[ "$(cx_count "$L" 'never')" = 1 ] && case "$L" in *on-request*|*"-a "*) false ;; *) true ;; esac \
  && case "$L" in *"--sandbox workspace-write"*) true ;; *) false ;; esac \
  && ok "codex -a on-request forced to never, default sandbox added" || bad "codex -a on-request: $L"
L=$(cxargs --args "--ask-for-approval=untrusted --sandbox=read-only")
case "$L" in *untrusted*) bad "codex = form approval kept: $L" ;; *"--ask-for-approval never"*"--sandbox=read-only"*|*"--sandbox=read-only"*"--ask-for-approval never"*) ok "codex = forms replaced, sandbox kept" ;; *) bad "codex = forms: $L" ;; esac
L=$(cxargs --args "-c approval_policy=on-request --config=approval_policy=untrusted -c model=x")
case "$L" in *approval_policy*|*on-request*|*untrusted*) bad "codex config approval_policy kept: $L" ;; *"-c model=x"*"--ask-for-approval never"*) ok "codex approval_policy overrides stripped, other -c kept" ;; *) bad "codex -c: $L" ;; esac
L=$(cxargs)
[ "$L" = "# codex args: --sandbox workspace-write --ask-for-approval never" ] && ok "codex no --args stays registry default" || bad "codex default: $L"
L=$(cxargs --args "--cd /tmp/x")
case "$L" in *"--cd /tmp/x"*"--sandbox workspace-write"*"--ask-for-approval never"*) ok "codex --cd keeps never and workspace-write" ;; *) bad "codex --cd: $L" ;; esac
L=$(cxargs --args "-a never -a on-request --full-auto")
[ "$(cx_count "$L" 'never')" = 1 ] && case "$L" in *on-request*|*full-auto*) false ;; *) true ;; esac \
  && ok "codex repeated -a and --full-auto collapse to one never" || bad "codex repeated: $L"
L=$(cxargs --args "--dangerously-bypass-approvals-and-sandbox")
[ "$L" = "# codex args: --dangerously-bypass-approvals-and-sandbox" ] && ok "codex bypass flag left as is" || bad "codex bypass: $L"
OUT=$("$EXE" spawn cxa --socket "$SOCK" --engine codex --cwd "$PROJ_ROOT" --dry-run --args "-s danger-full-access -a on-request" 2>&1)
case "$OUT" in *"exec "*"-s danger-full-access"*"--ask-for-approval never"*) ok "codex pane command carries the final args" ;; *) bad "codex pane cmd: $OUT" ;; esac

# 16. BUG stale trust text + wrapper bin: claude 2.1.296 prints "Is this a
# project you created or one you trust?" (old regex missed it), and a wrapper
# bin named zai-fence.sh hid the engine kind (trust_re empty). Fakes live in a
# temp dir: engine kind = basename of bin, or of the first word of args.
TD=$(mktemp -d)
cat > "$TD/claude" <<'FAKE'
#!/usr/bin/env bash
printf '  Is this a project you created or one you trust?\n'
printf '  1. Yes, I trust this folder\n  2. No, exit\n'
IFS= read -r line
printf 'AGENTS-TEST-BANNER trust-answered\n'
exec cat
FAKE
chmod +x "$TD/claude"
OUT=$("$EXE" spawn t1 --socket "$SOCK" --bin "$TD/claude" \
  --banner-regex 'AGENTS-TEST-BANNER' --cwd /tmp 2>&1) || true
case "$OUT" in *trust-answered*) ok "stale trust text bug: 2.1.296 prompt answered (plain claude bin)" ;; *) bad "stale trust text bug: 2.1.296 prompt unanswered: $OUT" ;; esac
"$EXE" kill t1 --socket "$SOCK" >/dev/null 2>&1 || true
# the REAL fence (a look-alike wrapper is refused, test_sec_1)
OUT=$(TMUX_AGENTS_BANNER_TIMEOUT=15 "$EXE" spawn t2 --socket "$SOCK" --bin "$REAL_FENCE" --args "$TD/claude" \
  --banner-regex 'AGENTS-TEST-BANNER' --cwd "$TD" 2>&1) || true
case "$OUT" in *trust-answered*) ok "wrapper bin bug: zai-fence.sh wrapper sees through to claude trust regex" ;; *) bad "wrapper bin bug: trust prompt unanswered via zai-fence.sh: $OUT" ;; esac
"$EXE" kill t2 --socket "$SOCK" >/dev/null 2>&1 || true
rm -rf "$TD"

# 17. BUG key-in-argv: set-vars rode `tmux new-session -e K=V`, so the z.ai
# key sat in the tmux server's argv for its lifetime, readable by every
# process via ps; --dry-run printed the resolved key. Now: 0600 env file the
# pane sources and deletes; dry-run prints a silent read prompt instead.
TD=$(mktemp -d)
SENT="zai-sentinel-$$-$RANDOM"
printf '%s\n' "$SENT" > "$TD/needle"
cat > "$TD/envdump" <<'FAKE'
#!/usr/bin/env bash
case "${ANTHROPIC_AUTH_TOKEN:-}" in zai-sentinel-*) t=tok-ok ;; *) t=tok-missing ;; esac
printf 'AGENTS-TEST-BANNER %s\n' "$t"
exec cat
FAKE
chmod +x "$TD/envdump"
# glm --bin always runs inside the real zai-fence.sh (fence root = $TD)
mkdir -p "$TD/tmp"
OUT=$(TMPDIR="$TD/tmp" FLEET_ZAI_TOKEN="$SENT" "$EXE" spawn k1 --socket "$SOCK-k" --engine glm --bin "$TD/envdump" \
  --banner-regex 'AGENTS-TEST-BANNER' --cwd "$TD" 2>&1) || true
case "$OUT" in *tok-ok*) ok "key reaches the engine env" ;; *) bad "key missing in engine env: $OUT" ;; esac
# capture first: `ps | grep -q` under pipefail SIGPIPEs ps and reads as "absent"
PSOUT=$(ps -axww -o command=)
case "$PSOUT" in *"$SENT"*) bad "key-in-argv bug: key visible in ps" ;; *k1*) ok "key-in-argv bug: key not in any process argv" ;; *) bad "ps saw no k1 session, check examined nothing" ;; esac
if grep -rqF -f "$TD/needle" "$TD/tmp" 2>/dev/null; then bad "env file left on disk after launch"; else ok "env file deleted after launch"; fi
tmux -L "$SOCK-k" kill-server 2>/dev/null || true
OUT=$(FLEET_ZAI_TOKEN="$SENT" "$EXE" spawn k2 --socket "$SOCK" --engine glm --cwd /tmp --dry-run 2>&1) || true
case "$OUT" in *"$SENT"*) bad "dry-run printed the key" ;; *) ok "dry-run never prints the key" ;; esac
case "$OUT" in *"read -rs ANTHROPIC_AUTH_TOKEN"*) ok "dry-run pane prompts silently for the key" ;; *) bad "dry-run lacks silent key prompt: $OUT" ;; esac
rm -rf "$TD"

# 18. BUG truncated launch (f880ab87): a fresh macOS pty silently drops typed
# input past ~1024 bytes, so a long pane command lost its tail (`exec claude
# --model glm-5.3-flash --permi`) and never started. The typed line is now a
# short `. '<dir>/launch'`; the long command lives in the 0600 script.
TD=$(mktemp -d)
cat > "$TD/lastarg" <<'FAKE'
#!/usr/bin/env bash
for a in "$@"; do last="$a"; done
printf 'AGENTS-TEST-BANNER last=%s\n' "$last"
exec cat
FAKE
chmod +x "$TD/lastarg"
LONG=$(printf 'padding%.0s ' $(seq 1 140))
OUT=$("$EXE" spawn L1 --socket "$SOCK-L" --bin "$TD/lastarg" --args "$LONG TAIL-REACHED" \
  --banner-regex 'last=TAIL-REACHED' --cwd /tmp 2>&1) || true
case "$OUT" in *spawned*) ok "truncated-launch bug: 1100+ byte launch still starts the engine" ;; *) bad "truncated-launch bug: long launch never started: ${OUT:0:300}" ;; esac
tmux -L "$SOCK-L" kill-server 2>/dev/null || true
rm -rf "$TD"

# 19. BUG trust keys too early (live, 2026-10-12): the gate sent Down,Enter
# the instant "Yes, I trust this folder" rendered; the real TUI was not yet
# reading input, the keys were lost and the prompt sat until banner timeout.
# This fake drops all input for 1s after drawing the prompt, as the TUI did.
TD=$(mktemp -d)
cat > "$TD/claude" <<'FAKE'
#!/usr/bin/env bash
printf '  Is this a project you created or one you trust?\n  1. Yes, I trust this folder\n  2. No, exit\n'
end=$((SECONDS + 1))
while [ "$SECONDS" -lt "$end" ]; do IFS= read -r -t 0.2 _ || true; done
IFS= read -r _
printf 'AGENTS-TEST-BANNER trust-late-answered\n'
exec cat
FAKE
chmod +x "$TD/claude"
OUT=$(TMUX_AGENTS_BANNER_TIMEOUT=6 "$EXE" spawn t3 --socket "$SOCK" --bin "$TD/claude" \
  --banner-regex 'AGENTS-TEST-BANNER' --cwd /tmp 2>&1) || true
case "$OUT" in *trust-late-answered*) ok "trust-too-early bug: keys wait for the TUI to settle" ;; *) bad "trust-too-early bug: keys lost before the TUI read input: ${OUT:0:200}" ;; esac
"$EXE" kill t3 --socket "$SOCK" >/dev/null 2>&1 || true
rm -rf "$TD"

# 20. BUG inherited session env (2026-10-13): the tmux server copies the
# launching Claude session's env (CLAUDECODE, CLAUDE_CODE_CHILD_SESSION,
# CLAUDE_CODE_MESSAGING_SOCKET/TOKEN, CLAUDE_CODE_SESSION_ID, CLAUDE_PID...),
# so every worker ran as that session's child: transcripts off, and it held
# the launcher's messaging token. The launch script now clears them; engine
# set-vars that start with CLAUDE_CODE_ are exported after the clear.
TD=$(mktemp -d)
cat > "$TD/envcheck" <<'FAKE'
#!/usr/bin/env bash
# CLAUDE_CODE_TMPDIR and CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC are set by
# the fence itself, not inherited from the launcher
n=$(env | grep -E '^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_PID=|CLAUDE_TMPDIR=|CLAUDE_EFFORT=)' | grep -vEc '^CLAUDE_CODE_(DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT|TMPDIR|DISABLE_NONESSENTIAL_TRAFFIC)=')
printf 'AGENTS-TEST-BANNER engine_flag=%s inherited=%s\n' "${CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT:-unset}" "$n"
exec cat
FAKE
chmod +x "$TD/envcheck"
OUT=$(CLAUDECODE=1 CLAUDE_CODE_CHILD_SESSION=1 CLAUDE_CODE_MESSAGING_TOKEN=tok CLAUDE_PID=1 CLAUDE_EFFORT=high \
  FLEET_ZAI_TOKEN="zai-sentinel-env-abcdefghijklmnop" "$EXE" spawn e1 --socket "$SOCK-e" --engine glm \
  --bin "$TD/envcheck" --banner-regex 'AGENTS-TEST-BANNER' --cwd "$TD" 2>&1) || true
case "$OUT" in *"inherited=0"*) ok "inherited-env bug: launcher session vars cleared in the worker" ;; *) bad "inherited-env bug: worker still sees launcher vars: ${OUT:0:300}" ;; esac
case "$OUT" in *"engine_flag=1"*) ok "engine CLAUDE_CODE_ set-var survives the clear" ;; *) bad "engine set-var lost by the clear: ${OUT:0:300}" ;; esac
tmux -L "$SOCK-e" kill-server 2>/dev/null || true
rm -rf "$TD"

# 21. BUG --bin doubled program (2026-11-15): `spawn --engine glm --bin claude`
# exec'd `claude claude --model ...`, because glm's args start with the program
# the zai-fence.sh wrapper runs. Rule: for a fenced engine --bin replaces only
# that program word INSIDE the fence (zai-fence.sh <bin> <args>); glm is never
# launched unfenced. Live run through the real fence: the fake claude lives in
# the fence root (a temp git repo) and reports its first arg and the fence's
# per-worker TMPDIR.
TD=$(mktemp -d)
TD=$(cd "$TD" && pwd -P)
git -C "$TD" init -q
mkdir -p "$TD/opened" "$TD/proj"
git -C "$TD/proj" init -q
cat > "$TD/proj/claude" <<FAKE
#!/usr/bin/env bash
f=no; [ -d /run/zai-fence ] && f=yes
w=no; echo x > "$TD/opened/w.txt" 2>/dev/null && w=yes
# dashes as underscores: the banner poll drops pane lines holding "--model "
a="\${1:-none}"; printf 'AGENTS-TEST-BANNER first=%s fenced=%s openwrite=%s\n' "\${a//-/_}" "\$f" "\$w"
exec cat
FAKE
chmod +x "$TD/proj/claude"
OUT=$(TMUX_AGENTS_BANNER_TIMEOUT=15 FLEET_ZAI_TOKEN="zai-sentinel-bin-abcdefghijklmnop" "$EXE" spawn b1 --socket "$SOCK" \
  --engine glm --bin "$TD/proj/claude" --banner-regex 'AGENTS-TEST-BANNER first' --cwd "$TD/proj" 2>&1) || true
case "$OUT" in *"first=__model"*"fenced=yes"*) ok "bin-doubled bug: glm --bin claude runs the bin once, inside zai-fence.sh" ;;
  *) bad "bin-doubled bug: glm --bin not fenced or program doubled: ${OUT:0:300}" ;; esac
case "$OUT" in *"openwrite=no"*) ok "plain glm --bin cannot write outside its project" ;; *) bad "plain glm --bin wrote outside the project: ${OUT:0:300}" ;; esac
"$EXE" kill b1 --socket "$SOCK" >/dev/null 2>&1 || true
OUT=$(FLEET_ZAI_TOKEN="zai-sentinel-bin-abcdefghijklmnop" "$EXE" spawn b2 --socket "$SOCK" --engine glm \
  --bin "$TD/proj/claude" --cwd "$TD/proj" --dry-run 2>&1) || true
n=$(grep -o "$TD/proj/claude" <<<"$OUT" | wc -l)
case "$OUT" in *"zai-fence.sh $TD/proj/claude --model glm-5.3-flash"*) [ "$n" -eq 1 ] \
    && ok "bin-doubled bug: dry-run is zai-fence.sh <bin> --model ..., bin named once" \
    || bad "bin-doubled bug: bin named $n times: ${OUT:0:300}" ;;
  *) bad "bin-doubled bug: dry-run pane command not fenced as zai-fence.sh <bin> <args>: ${OUT:0:400}" ;; esac
# glm-open with --bin keeps the fence AND its opened folders
mkdir -p "$TD/proj/.claude"
printf '%s\n' "$TD/opened" > "$TD/proj/.claude/glm-open-dirs"
git -C "$TD/proj" add -f .claude/glm-open-dirs && git -C "$TD/proj" "${GITC[@]}" commit -qm list
"$APPROVE" "$TD/proj" >/dev/null
rm -f "$TD/opened/w.txt"
OUT=$(TMUX_AGENTS_BANNER_TIMEOUT=15 FLEET_ZAI_TOKEN="zai-sentinel-bin-abcdefghijklmnop" "$EXE" spawn b3 --socket "$SOCK" \
  --engine glm-open --bin "$TD/proj/claude" --banner-regex 'AGENTS-TEST-BANNER first' --cwd "$TD/proj" 2>&1) || true
case "$OUT" in *"first=__model"*"fenced=yes openwrite=yes"*) ok "glm-open --bin keeps the fence and its opened folders" ;;
  *) bad "glm-open --bin lost the fence or the opened folders: ${OUT:0:300}" ;; esac
"$EXE" kill b3 --socket "$SOCK" >/dev/null 2>&1 || true
rm -rf "$TD"

# 22. glm-open: extra writable folders only for a project that opted in with
# <repo>/.claude/glm-open-dirs. Without it spawn refuses (66) before any side
# effect and names the file; with a valid list it plans.
TD=$(mktemp -d)
git -C "$TD" init -q
mkdir -p "$TD/opened"
RC=0; OUT=$(FLEET_ZAI_TOKEN="zai-sentinel-open-abcdefghijklmnop" "$EXE" spawn o1 --socket "$SOCK" --engine glm-open \
  --cwd "$TD" --dry-run 2>&1) || RC=$?
[ "$RC" -eq 66 ] && ok "glm-open without the project setting exits 66" || bad "glm-open no-setting rc=$RC: ${OUT:0:300}"
case "$OUT" in *".claude/glm-open-dirs"*) ok "glm-open refusal names .claude/glm-open-dirs" ;;
  *) bad "glm-open refusal lacks the setting path: ${OUT:0:300}" ;; esac
case "$OUT" in *"new-session"*) bad "refused glm-open still printed launch commands" ;; *) ok "no launch commands on refusal" ;; esac
mkdir -p "$TD/.claude"
printf '%s\n' "$TD/opened" > "$TD/.claude/glm-open-dirs"
git -C "$TD" add -f .claude/glm-open-dirs && git -C "$TD" "${GITC[@]}" commit -qm list
"$APPROVE" "$TD" >/dev/null
RC=0; OUT=$(FLEET_ZAI_TOKEN="zai-sentinel-open-abcdefghijklmnop" "$EXE" spawn o2 --socket "$SOCK" --engine glm-open \
  --cwd "$TD" --dry-run 2>&1) || RC=$?
[ "$RC" -eq 0 ] && ok "glm-open with the project setting plans (dry-run rc 0)" || bad "glm-open with setting rc=$RC: ${OUT:0:300}"
case "$OUT" in *"ZAI_FENCE_OPEN_DIRS"*) ok "glm-open launch carries ZAI_FENCE_OPEN_DIRS" ;; *) bad "glm-open launch lacks ZAI_FENCE_OPEN_DIRS: ${OUT:0:300}" ;; esac
rm -rf "$TD"

# test_sec_1 (security review 2026-11-16): --bin must never replace the fence
# with a look-alike. A --bin named zai-fence.sh is accepted only when it is the
# real wrapper from this repo (realpath compare); any other is refused (66).
TD=$(mktemp -d)
printf '#!/usr/bin/env bash\nexec "$@"\n' > "$TD/zai-fence.sh"; chmod +x "$TD/zai-fence.sh"
RC=0; OUT=$(FLEET_ZAI_TOKEN="zai-sentinel-sec1-abcdefghijklmnop" "$EXE" spawn s1 --socket "$SOCK" --engine glm \
  --bin "$TD/zai-fence.sh" --cwd "$TD" --dry-run 2>&1) || RC=$?
[ "$RC" -eq 66 ] && ok "test_sec_1_lookalike_fence_refused (glm)" || bad "test_sec_1_lookalike_fence_refused (glm): rc=$RC ${OUT:0:200}"
RC=0; OUT=$("$EXE" spawn s2 --socket "$SOCK" --bin "$TD/zai-fence.sh" --args "$FAKE" --cwd "$TD" --dry-run 2>&1) || RC=$?
[ "$RC" -eq 66 ] && ok "test_sec_1_lookalike_fence_refused (custom engine)" || bad "test_sec_1_lookalike_fence_refused (custom): rc=$RC ${OUT:0:200}"
RC=0; OUT=$(FLEET_ZAI_TOKEN="zai-sentinel-sec1-abcdefghijklmnop" "$EXE" spawn s3 --socket "$SOCK" --engine glm \
  --bin "$REAL_FENCE" --cwd "$TD" --dry-run 2>&1) || RC=$?
[ "$RC" -eq 0 ] && ok "test_sec_1_real_fence_accepted" || bad "test_sec_1_real_fence_accepted: rc=$RC ${OUT:0:200}"
rm -rf "$TD"

# test_sec2_1: a relative --bin is refused. It was checked in this shell's cwd
# but launched in --cwd, where a look-alike wrapper could sit at the same path.
TD=$(mktemp -d)
mkdir -p "$TD/.claude/cfn-scripts"
printf '#!/usr/bin/env bash\nexec "$@"\n' > "$TD/.claude/cfn-scripts/zai-fence.sh"; chmod +x "$TD/.claude/cfn-scripts/zai-fence.sh"
RC=0; OUT=$(cd "$PROJ_ROOT" && FLEET_ZAI_TOKEN="zai-sentinel-sec21-abcdefghijklmnop" "$EXE" spawn s21 --socket "$SOCK" --engine glm \
  --bin .claude/cfn-scripts/zai-fence.sh --cwd "$TD" --dry-run 2>&1) || RC=$?
[ "$RC" -eq 66 ] && ok "test_sec2_1_relative_bin_refused" || bad "test_sec2_1_relative_bin_refused: rc=$RC ${OUT:0:200}"
rm -rf "$TD"

# test_sec2_2: inherited GIT_DIR/GIT_WORK_TREE must not pick the launch folder
# (default --cwd is the git toplevel); the launcher scrubs them first.
TD=$(mktemp -d); TD=$(cd "$TD" && pwd -P)
mkdir -p "$TD/mine" "$TD/other"; git -C "$TD/mine" init -q; git -C "$TD/other" init -q
RC=0; OUT=$(cd "$TD/mine" && GIT_DIR="$TD/other/.git" GIT_WORK_TREE="$TD/other" "$EXE" spawn s22 --socket "$SOCK" \
  --bin "$FAKE" --dry-run 2>&1) || RC=$?
case "$OUT" in *"-c $TD/mine"*) ok "test_sec2_2_git_env_scrubbed_tmux_agents" ;;
  *) bad "test_sec2_2_git_env_scrubbed_tmux_agents: rc=$RC ${OUT:0:300}" ;; esac
rm -rf "$TD"

# test_allow_15a: a relative PATH entry must never pick the engine. With
# PATH=.:... in the installed wrapper's own folder, `--bin zai-fence.sh` passed
# the realpath check but the pane exec'd `./zai-fence.sh` in --cwd.
TD=$(mktemp -d)
printf '#!/usr/bin/env bash\nexec "$@"\n' > "$TD/zai-fence.sh"; chmod +x "$TD/zai-fence.sh"
RC=0; OUT=$(cd "$(dirname "$REAL_FENCE")" && PATH=".:/usr/bin:/bin" FLEET_ZAI_TOKEN="zai-sentinel-a15-abcdefghijklmnop" \
  "$EXE" spawn a15 --socket "$SOCK" --engine glm --bin zai-fence.sh --cwd "$TD" --dry-run 2>&1) || RC=$?
case "$OUT" in *"exec ./"*|*"exec zai-fence.sh"*) bad "test_allow_15a_bin_absolute_exec: pane execs a relative name: ${OUT:0:300}" ;;
  *"exec $REAL_FENCE"*) ok "test_allow_15a_bin_absolute_exec" ;;
  *"not the installed fence"*) [ "$RC" -eq 66 ] && ok "test_allow_15a_bin_absolute_exec (refused: no absolute PATH entry holds it)" \
      || bad "test_allow_15a_bin_absolute_exec: rc=$RC" ;;
  *) bad "test_allow_15a_bin_absolute_exec: rc=$RC no absolute fence exec: ${OUT:0:300}" ;; esac
rm -rf "$TD"

# test_allow_15b: --args and --model are argv words, never shell code. Raw
# interpolation ran `$(touch M)` in the launcher's pane shell, unfenced.
TD=$(mktemp -d)
"$EXE" spawn a15b --socket "$SOCK" --bin "$FAKE" --args "\$(touch $TD/m-args) x" --model "\$(touch $TD/m-model)" \
  --banner-regex 'AGENTS-TEST-BANNER' --cwd /tmp >/dev/null 2>&1 || true
sleep 1
if [ -e "$TD/m-args" ] || [ -e "$TD/m-model" ]; then bad "test_allow_15b_args_not_shell: command substitution ran ($(ls "$TD" | tr '\n' ' '))"
else ok "test_allow_15b_args_not_shell"; fi
"$EXE" kill a15b --socket "$SOCK" >/dev/null 2>&1 || true
rm -rf "$TD"

# 20. BUG code-mode-modal (Claude Code 2.1.325, reported 2026-11-15/16): a
# fresh profile shows the "Code Mode (experimental)" opt-in before anything
# else; spawn never answered it and timed out. Real text captured live
# (saved/codemode-modal-full.txt). Only Escape ("start without it") is safe:
# the fake exits 5 on any other answer, and chains the bypass-permissions
# accept screen that follows it on the same profile.
TD=$(mktemp -d)
cat > "$TD/claude" <<'FAKE'
#!/usr/bin/env bash
cat <<'MODAL'
  Code Mode (experimental)
  In Code Mode, Claude works by writing and running JavaScript that calls its tools, instead of calling them one at a time.
  A session that you start in Code Mode can be resumed only with Code Mode on.
  ❯ No, start without it
    Yes, turn on Code Mode
  Tell us how it goes with /feedback
  Enter to confirm · Esc to start without it
MODAL
IFS= read -rsn1 k
[ "$k" = $'\e' ] || { echo "FAKE-WRONG-KEY-CODEMODE"; exit 5; }
sleep 0.3
printf '\033[2J\033[H'   # the real TUI redraws the screen between modals
cat <<'MODAL'
  WARNING: Claude Code running in Bypass Permissions mode
  ❯ No, exit
    Yes, I accept
  Enter to confirm · Esc to cancel
MODAL
IFS= read -r line
[ "$line" = $'\e[B' ] || { echo "FAKE-WRONG-KEY-BYPASS"; exit 5; }
printf '\033[2J\033[H'
printf 'AGENTS-TEST-BANNER codemode-cleared\n'
exec cat
FAKE
chmod +x "$TD/claude"
OUT=$(TMUX_AGENTS_BANNER_TIMEOUT=10 TMUX_AGENTS_TRUST_SETTLE=0.3 "$EXE" spawn cm1 --socket "$SOCK" --bin "$TD/claude" \
  --banner-regex 'AGENTS-TEST-BANNER' --cwd /tmp 2>&1) || true
case "$OUT" in *codemode-cleared*) ok "code-mode bug: modal dismissed with Escape, chained bypass accepted, banner reached" ;; *) bad "code-mode bug: spawn stuck on modal: ${OUT:0:300}" ;; esac
"$EXE" kill cm1 --socket "$SOCK" >/dev/null 2>&1 || true

# 21. BUG first-prompt-unsubmitted (glm-open, 2026-11-16): the banner shows
# before the input box is live; text typed in that window is discarded, the
# input line is empty, and the old submit check read that as "submitted".
# This fake drops everything typed before it draws "❯" (3s after the banner).
cat > "$TD/claude" <<'FAKE'
#!/usr/bin/env bash
stty -icanon -echo -icrnl 2>/dev/null || true
printf 'AGENTS-TEST-BANNER early\n'
sleep 2.5
while IFS= read -rsn1 -t 0.2 _; do :; done   # discard pre-ready input
printf '\n❯ '
buf="" recent=0
while :; do
  rc=0; IFS= read -rsn1 -d '' -t 0.4 c || rc=$?
  if [ "$rc" -gt 128 ]; then recent=0; continue; fi
  [ "$rc" -eq 0 ] || exit 0
  if [ "$c" = $'\r' ] || [ "$c" = $'\n' ]; then
    [ "$recent" = 1 ] && continue
    printf '\nSUBMITTED: %s\n❯ ' "$buf"; buf=""
  else
    buf+="$c"; printf '%s' "$c"; recent=1
  fi
done
FAKE
OUT=$(TMUX_AGENTS_BANNER_TIMEOUT=10 TMUX_AGENTS_TRUST_TIMEOUT=1 TMUX_AGENTS_READY_TIMEOUT=8 "$EXE" spawn fp1 --socket "$SOCK" --bin "$TD/claude" \
  --banner-regex 'AGENTS-TEST-BANNER' --cwd /tmp --prompt "first prompt after ready" 2>&1) || true
sleep 0.5
CAP=$(tmux -L "$SOCK" capture-pane -p -t fp1 2>/dev/null || true)
case "$CAP" in *"SUBMITTED: first prompt after ready"*) ok "first-prompt bug: prompt waits for the input box and is submitted" ;; *) bad "first-prompt bug: prompt lost or unsubmitted: out=${OUT:0:200} pane=${CAP:0:300}" ;; esac
"$EXE" kill fp1 --socket "$SOCK" >/dev/null 2>&1 || true
rm -rf "$TD"

# 21b. BUG glm-first-prompt-lost (2026-11-17): Claude Code 2.1.326 shows a
# "Flicker-free output ... Yes, try it / Not now" opt-in modal AFTER its header
# (which is what the glm banner regex matches). The modal's "❯ 1. Yes, try it"
# menu cursor satisfied the ready check, so the prompt was typed into the modal
# and discarded, Enter picked "Yes, try it", and the empty input line read as
# "submitted". This fake discards every key except Esc while the modal is up.
FP=$(mktemp -d) || exit 1
cat > "$FP/claude" <<'FAKE'
#!/usr/bin/env bash
stty -icanon -echo -icrnl 2>/dev/null || true
printf 'AGENTS-TEST-BANNER glm-5.3-flash\n\n  Flicker-free output: no more flashing\n  ❯ 1. Yes, try it\n    2. Not now\n  Enter to confirm · Esc to cancel\n'
while :; do
  rc=0; IFS= read -rsn1 -d '' -t 30 c || rc=$?
  [ "$rc" -eq 0 ] || exit 0
  [ "$c" = $'\e' ] && break
  [ "$c" = $'\r' ] && break   # Enter picks "Yes, try it": modal gone, typed text already lost
done
printf '\033[2J\033[H\n❯ '
buf=""
while :; do
  rc=0; IFS= read -rsn1 -d '' -t 30 c || rc=$?
  [ "$rc" -eq 0 ] || exit 0
  if [ "$c" = $'\r' ] || [ "$c" = $'\n' ]; then printf '\nSUBMITTED: %s\n❯ ' "$buf"; buf=""
  else buf+="$c"; printf '%s' "$c"; fi
done
FAKE
chmod +x "$FP/claude"
RC=0; OUT=$(TMUX_AGENTS_BANNER_TIMEOUT=10 TMUX_AGENTS_READY_TIMEOUT=8 "$EXE" spawn fp2 --socket "$SOCK" --bin "$FP/claude" \
  --banner-regex 'AGENTS-TEST-BANNER' --cwd /tmp --prompt "prompt behind modal" 2>&1) || RC=$?
[ "$RC" -eq 0 ] && ok "modal then landing: spawn exits 0" || bad "modal then landing: rc=$RC ${OUT:0:300}"
sleep 0.5
CAP=$(tmux -L "$SOCK" capture-pane -p -t fp2 2>/dev/null || true)
case "$CAP" in *"SUBMITTED: prompt behind modal"*) ok "glm first-prompt bug: modal menu cursor is not the input box; prompt submitted" ;; *) bad "glm first-prompt bug: prompt lost behind modal: out=${OUT:0:200} pane=${CAP:0:300}" ;; esac
"$EXE" kill fp2 --socket "$SOCK" >/dev/null 2>&1 || true
cfn_safe_rm_tmp "$FP"

# 21c. First-prompt landing check (shared cfn-scripts/lib/tui-prompt.sh). The
# old submit check passed once the input line was empty; a TUI that swallows
# the prompt (modal, not-yet-ready box) empties it too, so spawn reported
# success for a prompt that never reached the agent. Spawn now needs the
# prompt echoed above the input line, or a working indicator, and fails
# loudly otherwise, leaving the session alive for inspection.
FP=$(mktemp -d) || exit 1
# swallow: echoes typed text in the box; Enter clears it without any history
cat > "$FP/swallow" <<'FAKE'
#!/usr/bin/env bash
stty -icanon -echo -icrnl 2>/dev/null || true
printf 'AGENTS-TEST-BANNER swallow\n\n❯ '
buf=""
while :; do
  rc=0; IFS= read -rsn1 -d '' -t 30 c || rc=$?
  [ "$rc" -eq 0 ] || exit 0
  if [ "$c" = $'\r' ] || [ "$c" = $'\n' ]; then printf '\r\033[K❯ '; buf=""
  else buf+="$c"; printf '%s' "$c"; fi
done
FAKE
# working: Enter clears the box and shows a spinner line, no history echo
cat > "$FP/working" <<'FAKE'
#!/usr/bin/env bash
stty -icanon -echo -icrnl 2>/dev/null || true
printf 'AGENTS-TEST-BANNER working\n\n❯ '
buf=""
while :; do
  rc=0; IFS= read -rsn1 -d '' -t 30 c || rc=$?
  [ "$rc" -eq 0 ] || exit 0
  if [ "$c" = $'\r' ] || [ "$c" = $'\n' ]; then printf '\r\033[K✻ Thinking… (esc to interrupt)\n❯ '; buf=""
  else buf+="$c"; printf '%s' "$c"; fi
done
FAKE
# normal: input box at once, Enter echoes the prompt into history
cat > "$FP/normal" <<'FAKE'
#!/usr/bin/env bash
stty -icanon -echo -icrnl 2>/dev/null || true
printf 'AGENTS-TEST-BANNER normal\n\n❯ '
buf=""
while :; do
  rc=0; IFS= read -rsn1 -d '' -t 30 c || rc=$?
  [ "$rc" -eq 0 ] || exit 0
  if [ "$c" = $'\r' ] || [ "$c" = $'\n' ]; then printf '\r\033[K> %s\n\n❯ ' "$buf"; buf=""
  else buf+="$c"; printf '%s' "$c"; fi
done
FAKE
chmod +x "$FP/swallow" "$FP/working" "$FP/normal"
RC=0; OUT=$(TMUX_AGENTS_BANNER_TIMEOUT=10 TMUX_AGENTS_READY_TIMEOUT=4 TMUX_AGENTS_SUBMIT_VERIFY=1 TMUX_AGENTS_SUBMIT_RETRIES=1 \
  "$EXE" spawn fl1 --socket "$SOCK" --bin "$FP/swallow" --banner-regex 'AGENTS-TEST-BANNER' --cwd /tmp \
  --prompt "prompt that never lands" 2>&1) || RC=$?
[ "$RC" -ne 0 ] && ok "never-lands: spawn fails loudly (rc=$RC)" || bad "never-lands: spawn reported success for a swallowed prompt: ${OUT:0:300}"
case "$OUT" in *"fl1"*"did not land"*) ok "never-lands: message names the session and says the prompt did not land" ;;
  *) bad "never-lands: unclear message: ${OUT:0:300}" ;; esac
tmux -L "$SOCK" has-session -t fl1 2>/dev/null && ok "never-lands: session kept alive for inspection" || bad "never-lands: session was killed"
"$EXE" kill fl1 --socket "$SOCK" >/dev/null 2>&1 || true
RC=0; OUT=$(TMUX_AGENTS_BANNER_TIMEOUT=10 TMUX_AGENTS_READY_TIMEOUT=4 TMUX_AGENTS_SUBMIT_VERIFY=1 \
  "$EXE" spawn fl2 --socket "$SOCK" --bin "$FP/working" --banner-regex 'AGENTS-TEST-BANNER' --cwd /tmp \
  --prompt "prompt the agent starts on" 2>&1) || RC=$?
[ "$RC" -eq 0 ] && ok "working indicator counts as landed" || bad "working indicator: rc=$RC ${OUT:0:300}"
"$EXE" kill fl2 --socket "$SOCK" >/dev/null 2>&1 || true
T0=$SECONDS; RC=0; OUT=$(TMUX_AGENTS_BANNER_TIMEOUT=10 TMUX_AGENTS_READY_TIMEOUT=8 \
  "$EXE" spawn fl3 --socket "$SOCK" --bin "$FP/normal" --banner-regex 'AGENTS-TEST-BANNER' --cwd /tmp \
  --prompt "plain first prompt" 2>&1) || RC=$?
CAP=$(tmux -L "$SOCK" capture-pane -p -t fl3 2>/dev/null || true)
if [ "$RC" -eq 0 ] && case "$CAP" in *"> plain first prompt"*) true ;; *) false ;; esac; then
  ok "normal start: prompt lands, spawn exits 0 ($((SECONDS - T0))s)"
else bad "normal start: rc=$RC out=${OUT:0:200} pane=${CAP:0:200}"; fi
"$EXE" kill fl3 --socket "$SOCK" >/dev/null 2>&1 || true
cfn_safe_rm_tmp "$FP"

# 21. Locked sandbox for claude workers (owner-approved 2026-11-16). claude
# engines ran with --permission-mode bypassPermissions on the user's normal
# settings, where allowUnsandboxedCommands defaults to true and bypass mode
# auto-approves an unsandboxed run: a tricked worker could leave the sandbox
# (and sudo from a script). Claude workers now get the same locked --settings
# cfn-fleet host workers get (shared builder in cfn-scripts/sandbox-settings.sh);
# spawn refuses (66) when this host cannot build the sandbox, unless
# TMUX_AGENTS_UNSANDBOXED=1. Probes are faked with a bwrap stub on PATH.
TD=$(mktemp -d) || exit 1
TD=$(cd -P "$TD" && pwd -P)
mkdir -p "$TD/sbx-ok" "$TD/sbx-bad" "$TD/out" "$TD/repo" "$TD/fakebin"
printf '#!/bin/sh\nexit 0\n' > "$TD/sbx-ok/bwrap"
printf '#!/bin/sh\nexit 0\n' > "$TD/sbx-ok/socat"
printf '#!/bin/sh\necho "bwrap: No permissions to create new namespace" >&2\nexit 1\n' > "$TD/sbx-bad/bwrap"
printf '#!/bin/sh\nexit 0\n' > "$TD/sbx-bad/socat"
chmod +x "$TD"/sbx-ok/* "$TD"/sbx-bad/*
git -C "$TD/repo" init -q 2>/dev/null
REPO="$TD/repo"
export TMUX_AGENTS_OUTBOX_ROOT="$TD/out"
# settings_of TEXT -> the JSON after --settings '...' (empty when absent); the
# dry-run line escapes its double quotes as \" to stay copy-pasteable
settings_of() {
  python3 -c 'import re,sys; m=re.search(r"--settings \x27([^\x27]*)\x27", sys.argv[1]); print(m.group(1).replace(chr(92)+chr(34), chr(34)) if m else "")' "$1"
}
# jq_py JSON EXPR -> python expression over d, printed as JSON
jq_py() { python3 -c 'import json,sys; d=json.loads(sys.argv[1]); print(json.dumps(eval(sys.argv[2])))' "$1" "$2" 2>/dev/null || echo "<bad-json>"; }
# has_all JSON EXPR ITEM... -> "missing=[...]" listing ITEMs absent from the list EXPR
has_all() {
  python3 -c 'import json,sys; d=json.loads(sys.argv[1]); got=set(eval(sys.argv[2])); print("missing="+json.dumps([x for x in sys.argv[3:] if x not in got]))' "$@" 2>/dev/null || echo "missing=<bad-json>"
}
check_locked() { # check_locked LABEL JSON SESSION
  local lbl="$1" js="$2" ob="$TD/out/$SOCK/$3"
  [ -n "$js" ] && ok "$lbl: spawn passes --settings" || { bad "$lbl: no --settings in the launch"; return 0; }
  [ "$(jq_py "$js" 'd["sandbox"]["enabled"]')" = true ] && ok "$lbl: sandbox.enabled true" || bad "$lbl: sandbox.enabled not true: ${js:0:200}"
  [ "$(jq_py "$js" 'd["sandbox"]["failIfUnavailable"]')" = true ] && ok "$lbl: failIfUnavailable true" || bad "$lbl: failIfUnavailable not true"
  [ "$(jq_py "$js" 'd["sandbox"]["allowUnsandboxedCommands"]')" = false ] && ok "$lbl: allowUnsandboxedCommands false" || bad "$lbl: unsandboxed escape still open"
  [ "$(jq_py "$js" 'd["sandbox"]["network"]["allowAllUnixSockets"]')" = false ] && ok "$lbl: unix sockets blocked (no docker.sock)" || bad "$lbl: unix sockets not blocked"
  local aw m
  aw=$(jq_py "$js" 'sorted(d["sandbox"]["filesystem"]["allowWrite"])')
  [ "$aw" = "$(python3 -c 'import json,sys; print(json.dumps(sorted(sys.argv[1:])))' "$REPO" "$ob")" ] \
    && ok "$lbl: allowWrite is exactly the repo and the worker outbox" || bad "$lbl: allowWrite wrong: $aw (want $REPO, $ob)"
  m=$(has_all "$js" 'd["sandbox"]["filesystem"]["denyWrite"]' \
    "$REPO/.git/hooks" "$REPO/.git/config" "$REPO/.claude/settings.json" "$REPO/.claude/settings.local.json" "$REPO/.claude/hooks" \
    "$HOME/.claude" "$HOME/.bashrc" "$HOME/.profile" "$HOME/.zshrc")
  [ "$m" = "missing=[]" ] && ok "$lbl: denyWrite covers git hooks/config, Claude settings/hooks, shell startup" || bad "$lbl: denyWrite $m"
  m=$(has_all "$js" 'd["permissions"]["deny"]' \
    "Edit(/$REPO/.git/hooks/**)" "Edit(/$REPO/.git/config)" "Edit(/$REPO/.claude/settings.json)" "Edit(/$REPO/.claude/hooks/**)" \
    "Edit(/$HOME/.claude/**)" "Edit(/$HOME/.bashrc)" "Edit(/$HOME/.profile)" "Edit(/$HOME/.ssh/**)")
  [ "$m" = "missing=[]" ] && ok "$lbl: Edit deny rules fence the same files for Edit/Write" || bad "$lbl: permissions.deny $m"
}
for eng in claude-sub claude-haiku; do
  OUT=$(PATH="$TD/sbx-ok:$PATH" FLEET_ZAI_TOKEN="zai-sentinel-sbx-$$" "$EXE" spawn "s-$eng" --socket "$SOCK" \
    --engine "$eng" --cwd "$REPO" --dry-run 2>&1) || true
  check_locked "$eng" "$(settings_of "$OUT")" "s-$eng"
done
OUT=$(PATH="$TD/sbx-ok:$PATH" "$EXE" spawn s-model --socket "$SOCK" --engine claude-sub --model opus --cwd "$REPO" --dry-run 2>&1) || true
check_locked "claude-sub --model" "$(settings_of "$OUT")" "s-model"
# Fenced engines (glm, glm-open): Claude's sandbox cannot start inside the
# zai-fence (its --unshare-net bwrap needs a netlink socket the fence's seccomp
# refuses; probed live 2026-11-16), so they get the sandbox explicitly OFF plus
# the Edit deny rules, no outbox, and the host bwrap/socat probe never refuses
# them. sbx-bad on PATH proves the probe is skipped.
mkdir -p "$REPO/.claude" "$TD/opened"
printf '%s\n' "$TD/opened" > "$REPO/.claude/glm-open-dirs"
git -C "$REPO" add -f .claude/glm-open-dirs && git -C "$REPO" "${GITC[@]}" commit -qm list
"$APPROVE" "$REPO" >/dev/null
for eng in glm glm-open; do
  rc=0; OUT=$(PATH="$TD/sbx-bad:$PATH" FLEET_ZAI_TOKEN="zai-sentinel-sbx-$$" "$EXE" spawn "f-$eng" --socket "$SOCK" \
    --engine "$eng" --cwd "$REPO" --dry-run 2>&1) || rc=$?
  [ "$rc" -eq 0 ] && ok "fenced $eng: no-sandbox host probe does not refuse it (rc=0)" || bad "fenced $eng: rc=$rc: ${OUT:0:300}"
  case "$OUT" in *"would refuse"*) bad "fenced $eng: dry-run warns a live spawn would refuse" ;; *) ok "fenced $eng: no refusal warning" ;; esac
  JS=$(settings_of "$OUT")
  [ "$(jq_py "$JS" 'd["sandbox"]')" = '{"enabled": false}' ] && ok "fenced $eng: Claude sandbox explicitly off" || bad "fenced $eng: sandbox block wrong: ${JS:0:200}"
  m=$(has_all "$JS" 'd["permissions"]["deny"]' "Edit(/$REPO/.git/hooks/**)" "Edit(/$REPO/.claude/settings.json)" "Edit(/$HOME/.claude/**)" "Edit(/$HOME/.bashrc)")
  [ "$m" = "missing=[]" ] && ok "fenced $eng: Edit deny rules kept" || bad "fenced $eng: permissions.deny $m"
  case "$OUT" in *"zai-fence.sh claude "*"--settings '"*) ok "fenced $eng: --settings rides inside the fence on the claude argv" ;; *) bad "fenced $eng: --settings not on the fenced claude argv: ${OUT:0:400}" ;; esac
  case "$OUT" in *TMUX_AGENTS_OUTBOX*) bad "fenced $eng: got a host /tmp outbox the fence cannot see" ;; *) ok "fenced $eng: no outbox" ;; esac
done
# codex keeps its own sandbox flags and gets no Claude settings
OUT=$(PATH="$TD/sbx-ok:$PATH" "$EXE" spawn s-cx --socket "$SOCK" --engine codex --cwd "$PROJ_ROOT" --dry-run 2>&1) || true
case "$OUT" in *"--settings"*) bad "codex got Claude --settings" ;; *"--sandbox workspace-write --ask-for-approval never"*) ok "codex unchanged: own sandbox flags, no --settings" ;; *) bad "codex dry-run unexpected: ${OUT:0:300}" ;; esac
# a linked worktree commits into the main repo's git dir: it must be writable, its config/hooks not
git -C "$REPO" -c user.email=t@t -c user.name=t commit -q --allow-empty -m init 2>/dev/null
git -C "$REPO" worktree add -q "$TD/wt" -b sbx-wt 2>/dev/null
OUT=$(PATH="$TD/sbx-ok:$PATH" "$EXE" spawn s-wt --socket "$SOCK" --cwd "$TD/wt" --dry-run 2>&1) || true
JS=$(settings_of "$OUT")
m=$(has_all "$JS" 'd["sandbox"]["filesystem"]["allowWrite"]' "$TD/wt" "$REPO/.git" "$TD/out/$SOCK/s-wt")
[ "$m" = "missing=[]" ] && ok "worktree: allowWrite holds the worktree, the shared git dir and the outbox" || bad "worktree: allowWrite $m"
m=$(has_all "$JS" 'd["sandbox"]["filesystem"]["denyWrite"]' "$REPO/.git/config" "$REPO/.git/hooks" "$TD/wt/.git")
[ "$m" = "missing=[]" ] && ok "worktree: shared git config/hooks and the .git pointer stay unwritable" || bad "worktree: denyWrite $m"
# refusal: no sandbox on this host => 66 before any session, message names the opt-out
rc=0; OUT=$(PATH="$TD/sbx-bad:$PATH" "$EXE" spawn s-ref --socket "$SOCK" --cwd "$REPO" 2>&1) || rc=$?
[ "$rc" -eq 66 ] && ok "no sandbox: claude spawn refused (rc=66)" || bad "no sandbox: want rc=66, got rc=$rc: ${OUT:0:300}"
case "$OUT" in *TMUX_AGENTS_UNSANDBOXED=1*) ok "refusal names the TMUX_AGENTS_UNSANDBOXED=1 opt-out" ;; *) bad "refusal lacks the opt-out name: ${OUT:0:300}" ;; esac
case "$OUT" in *bwrap*) ok "refusal says what is missing (bwrap)" ;; *) bad "refusal lacks the reason: ${OUT:0:300}" ;; esac
tmux -L "$SOCK" has-session -t s-ref 2>/dev/null && bad "session created despite the refusal" || ok "no session created on refusal"
# live path: a fake claude receives the locked settings and the outbox env
cat > "$TD/fakebin/claude" <<'FAKE'
#!/usr/bin/env bash
printf '%s\n' "$@" > "$TMUX_AGENTS_OUTBOX/args.txt"
printf 'AGENTS-TEST-BANNER sbx-live\n'
exec cat
FAKE
chmod +x "$TD/fakebin/claude"
OUT=$(PATH="$TD/sbx-ok:$PATH" "$EXE" spawn s-live --socket "$SOCK" --bin "$TD/fakebin/claude" \
  --args "--model sonnet --permission-mode bypassPermissions" --banner-regex 'sbx-live' --cwd "$REPO" 2>&1) || true
sleep 0.3
if [ -f "$TD/out/$SOCK/s-live/args.txt" ]; then
  JS=$(sed -n '/^--settings$/{n;p;}' "$TD/out/$SOCK/s-live/args.txt")
  [ "$(jq_py "$JS" 'd["sandbox"]["allowUnsandboxedCommands"]')" = false ] && ok "live: engine argv carries the locked settings" || bad "live: engine argv lacks locked settings: $(head -c 300 "$TD/out/$SOCK/s-live/args.txt")"
  [ "$(stat -c %a "$TD/out/$SOCK/s-live" 2>/dev/null || stat -f %Lp "$TD/out/$SOCK/s-live")" = 700 ] && ok "live: outbox dir is 0700" || bad "live: outbox dir mode not 0700"
else
  bad "live: fake claude never ran with TMUX_AGENTS_OUTBOX set: ${OUT:0:300}"
fi
"$EXE" kill s-live --socket "$SOCK" >/dev/null 2>&1 || true
# --args may not smuggle a second --settings past the lock
rc=0; OUT=$(PATH="$TD/sbx-ok:$PATH" "$EXE" spawn s-smug --socket "$SOCK" --engine claude-sub \
  --args "--model sonnet --settings {}" --cwd "$REPO" --dry-run 2>&1) || rc=$?
[ "$rc" -eq 64 ] && ok "--args carrying --settings refused (rc=64)" || bad "--args --settings: want rc=64, got rc=$rc: ${OUT:0:200}"
# opt-out: sandbox off with a loud WARN, Edit deny rules kept
OUT=$(PATH="$TD/sbx-bad:$PATH" TMUX_AGENTS_UNSANDBOXED=1 "$EXE" spawn s-opt --socket "$SOCK" --bin "$TD/fakebin/claude" \
  --banner-regex 'sbx-live' --cwd "$REPO" 2>&1) || true
case "$OUT" in *"WITHOUT the Bash sandbox"*) ok "opt-out warns loudly" ;; *) bad "opt-out lacks WARN: ${OUT:0:300}" ;; esac
sleep 0.3
JS=$(sed -n '/^--settings$/{n;p;}' "$TD/out/$SOCK/s-opt/args.txt" 2>/dev/null || true)
[ "$(jq_py "$JS" 'd["sandbox"]["enabled"]')" = false ] && ok "opt-out: sandbox off" || bad "opt-out: sandbox not off: ${JS:0:200}"
m=$(has_all "$JS" 'd["permissions"]["deny"]' "Edit(/$HOME/.claude/**)" "Edit(/$REPO/.git/hooks/**)")
[ "$m" = "missing=[]" ] && ok "opt-out: Edit deny rules kept" || bad "opt-out: deny rules $m"
"$EXE" kill s-opt --socket "$SOCK" >/dev/null 2>&1 || true
# explicit sandbox opt-out (2026-11-19, MDTWII art desk): TMUX_AGENTS_SANDBOX_OFF=1
# or --no-sandbox turns the sandbox off even when the probe succeeds; the old
# TMUX_AGENTS_UNSANDBOXED=1 alone must NOT (it only means "run if unbuildable").
sbx_flag_case() { # sbx_flag_case LABEL WANT_ENABLED ENVVAR=VAL|- [spawn args...]
  local lbl="$1" want="$2" ev="$3"; shift 3
  local -a envs=(); [ "$ev" = - ] || envs=("$ev")
  OUT=$(env PATH="$TD/sbx-ok:$PATH" "${envs[@]}" "$EXE" spawn s-flag --socket "$SOCK" --engine claude-sub --cwd "$REPO" --dry-run "$@" 2>&1) || true
  JS=$(settings_of "$OUT")
  [ "$(jq_py "$JS" 'd["sandbox"]["enabled"]')" = "$want" ] && ok "$lbl: sandbox.enabled=$want" || bad "$lbl: want enabled=$want: ${JS:0:200}"
}
sbx_flag_case "SANDBOX_OFF=1 env" false TMUX_AGENTS_SANDBOX_OFF=1
case "$OUT" in *WARN*TMUX_AGENTS_SANDBOX_OFF*) ok "SANDBOX_OFF=1: WARN names the flag" ;; *) bad "SANDBOX_OFF=1: no WARN naming flag: ${OUT:0:300}" ;; esac
m=$(has_all "$JS" 'd["permissions"]["deny"]' "Edit(/$HOME/.claude/**)" "Edit(/$REPO/.git/hooks/**)")
[ "$m" = "missing=[]" ] && ok "SANDBOX_OFF=1: Edit deny rules kept" || bad "SANDBOX_OFF=1: deny rules $m"
sbx_flag_case "--no-sandbox" false - --no-sandbox
case "$OUT" in *WARN*TMUX_AGENTS_SANDBOX_OFF*) ok "--no-sandbox: WARN names the flag" ;; *) bad "--no-sandbox: no WARN: ${OUT:0:300}" ;; esac
sbx_flag_case "flag unset" true -
sbx_flag_case "SANDBOX_OFF=0" true TMUX_AGENTS_SANDBOX_OFF=0
sbx_flag_case "UNSANDBOXED=1 alone, probe ok" true TMUX_AGENTS_UNSANDBOXED=1
cfn_safe_rm_tmp "$TD"
export TMUX_AGENTS_OUTBOX_ROOT="$GLOBAL_OUTBOX_ROOT"

# test_allow_fence_wait (MDTWII field report 2026-11-16): the fence's secret
# scan of big opened folders outlasts the banner timeout (190s measured);
# spawn killed the pane mid-scan and showed only the launch line. While the
# pane is alive and shows "zai-fence: checking", spawn keeps waiting (up to
# TMUX_AGENTS_FENCE_TIMEOUT). A slow `find` stands in for /mnt/c.
TD=$(mktemp -d); TD=$(cd "$TD" && pwd -P)
mkdir -p "$TD/proj" "$TD/open" "$TD/slow"
git -C "$TD/proj" init -q
cp "$FAKE" "$TD/proj/fake-engine.sh"
mkdir -p "$TD/proj/.claude"; printf '%s\n' "$TD/open" > "$TD/proj/.claude/glm-open-dirs"
git -C "$TD/proj" add -f .claude/glm-open-dirs && git -C "$TD/proj" "${GITC[@]}" commit -qm list
"$APPROVE" "$TD/proj" >/dev/null
printf '#!/bin/bash\nsleep 6\nexec /usr/bin/find "$@"\n' > "$TD/slow/find"; chmod +x "$TD/slow/find"
RC=0; OUT=$(PATH="$TD/slow:$PATH" TMUX_AGENTS_BANNER_TIMEOUT=3 TMUX_AGENTS_FENCE_TIMEOUT=60 \
  FLEET_ZAI_TOKEN="zai-sentinel-fw-abcdefghijklmnop" "$EXE" spawn fw1 --socket "$SOCK-f" --engine glm-open \
  --bin "$TD/proj/fake-engine.sh" --banner-regex 'AGENTS-TEST-BANNER' --cwd "$TD/proj" 2>&1) || RC=$?
case "$OUT" in *spawned*) ok "test_allow_fence_wait: spawn waits out a slow fence scan" ;;
  *) bad "test_allow_fence_wait: rc=$RC ${OUT:0:300}" ;; esac
tmux -L "$SOCK-f" kill-server 2>/dev/null || true
# a fence refusal is shown and spawn exits non-zero
mkdir -p "$TD/proj/sub"; printf 'gitdir: /nonexistent/.git\n' > "$TD/proj/sub/.git"
RC=0; OUT=$(FLEET_ZAI_TOKEN="zai-sentinel-fw-abcdefghijklmnop" "$EXE" spawn fw2 --socket "$SOCK-f" --engine glm \
  --bin "$TD/proj/fake-engine.sh" --banner-regex 'AGENTS-TEST-BANNER' --cwd "$TD/proj" 2>&1) || RC=$?
if [ "$RC" -ne 0 ] && case "$OUT" in *"git pointer"*) true ;; *) false ;; esac; then ok "test_allow_fence_refusal_visible (rc=$RC)"
else bad "test_allow_fence_refusal_visible: rc=$RC ${OUT:0:300}"; fi
tmux -L "$SOCK-f" kill-server 2>/dev/null || true
rm -rf "$TD"

# 23. z.ai token file fallback (BUG 2026-11-17: tmux-agents ignored
# ~/.config/cfn-fleet/zai.token, so glm spawn died 66 when no env var was set).
# Fake HOME only; the real token file and ~/.config are never read.
ZH=$(mktemp -d) || exit 1; mkdir -p "$ZH/.claude" "$ZH/.config/cfn-fleet"
ln -s "$HOME/.claude/cfn-config" "$ZH/.claude/cfn-config"
ZTOK="zai-file-sentinel-0123456789abcdef"
zspawn() { env -u FLEET_ZAI_TOKEN -u ZAI_TOKEN -u TMUX_AGENTS_ZAI_TOKEN HOME="$ZH" PATH="$PATH" \
  "$EXE" spawn zt --socket "$SOCK" --engine glm --cwd /tmp --dry-run 2>&1; }
printf '%s\n' "$ZTOK" > "$ZH/.config/cfn-fleet/zai.token"; chmod 600 "$ZH/.config/cfn-fleet/zai.token"
RC=0; OUT=$(zspawn) || RC=$?
[ "$RC" -eq 0 ] && ok "token file (mode 600) alone resolves the glm spawn" || bad "token file spawn rc=$RC: ${OUT:0:200}"
case "$OUT" in *"$ZTOK"*) bad "token file value printed in spawn output" ;; *) ok "token file value never printed" ;; esac
chmod 644 "$ZH/.config/cfn-fleet/zai.token"
RC=0; OUT=$(zspawn) || RC=$?
[ "$RC" -eq 66 ] && ok "mode-644 token file refused (66)" || bad "644 rc=$RC: ${OUT:0:200}"
case "$OUT" in *"$ZTOK"*) bad "644 refusal printed the token" ;; *) ok "644 refusal never prints the token" ;; esac
printf 'null\n' > "$ZH/.config/cfn-fleet/zai.token"; chmod 600 "$ZH/.config/cfn-fleet/zai.token"
RC=0; OUT=$(zspawn) || RC=$?
[ "$RC" -eq 66 ] && case "$OUT" in *"at least 20"*) true ;; *) false ;; esac \
  && ok "short ('null') token file refused naming the minimum" || bad "short file rc=$RC: ${OUT:0:200}"
rm -f "$ZH/.config/cfn-fleet/zai.token"
RC=0; OUT=$(zspawn) || RC=$?
[ "$RC" -eq 66 ] && case "$OUT" in *"zai.token"*) true ;; *) false ;; esac \
  && ok "missing token error mentions the token file" || bad "no-token rc=$RC: ${OUT:0:200}"
RC=0; OUT=$(env -u FLEET_ZAI_TOKEN -u ZAI_TOKEN TMUX_AGENTS_ZAI_TOKEN=null HOME="$ZH" PATH="$PATH" \
  "$EXE" spawn zt --socket "$SOCK" --engine glm --cwd /tmp --dry-run 2>&1) || RC=$?
[ "$RC" -eq 66 ] && ok "short env token ('null') refused loudly" || bad "short env rc=$RC: ${OUT:0:200}"
cfn_safe_rm_tmp "$ZH"

# 24. codex-render preset (look-lab 2026-11-17): codex with full access for
# lanes that run a local server plus Chrome (workspace-write gives listen
# EPERM). Same banner/trust/unset as codex; approval still forced to never.
CR_ROW=$(bash -c '. "'"$SKILL_DIR"'/lib/engines.sh" >/dev/null 2>&1; _ta_engine_row codex-render' || true)
[ -n "$CR_ROW" ] && ok "codex-render is in the registry" || bad "codex-render missing from the registry"
for f in 2 5 6 7; do
  A=$(bash -c '. "'"$SKILL_DIR"'/lib/engines.sh" >/dev/null 2>&1; _ta_engine_field codex '$f)
  B=$(bash -c '. "'"$SKILL_DIR"'/lib/engines.sh" >/dev/null 2>&1; _ta_engine_field codex-render '$f 2>/dev/null || true)
  [ -n "$A" ] && [ "$A" = "$B" ] && ok "codex-render column $f equals codex" || bad "codex-render column $f differs ('$B' vs '$A')"
done
CRA=$(bash -c '. "'"$SKILL_DIR"'/lib/engines.sh" >/dev/null 2>&1; _ta_engine_field codex-render 3' 2>/dev/null || true)
[ "$CRA" = "--sandbox danger-full-access --ask-for-approval never" ] && ok "codex-render args are full access, approval never" || bad "codex-render args: '$CRA'"
CRP=$(mktemp -d) || exit 1; printf 'codex=true\n' > "$CRP/CLAUDE.md"
CRN=$(mktemp -d) || exit 1
CR_OUT=$("$EXE" spawn cr1 --socket "$SOCK" --engine codex-render --cwd "$CRP" --dry-run 2>&1) || true
case "$CR_OUT" in *"# codex args: --sandbox danger-full-access --ask-for-approval never"*) ok "codex-render goes through the codex arg forcing (full access, one approval never)" ;; *) bad "codex-render dry-run: ${CR_OUT:0:300}" ;; esac
CR_OUT=$("$EXE" spawn cr1 --socket "$SOCK" --engine codex-render --cwd "$CRP" --args "--sandbox danger-full-access -a on-request" --dry-run 2>&1) || true
case "$CR_OUT" in *"on-request"*) bad "codex-render --args approval override survived" ;; *"--ask-for-approval never"*) ok "codex-render --args cannot restore approval prompts" ;; *) bad "codex-render override dry-run: ${CR_OUT:0:300}" ;; esac
printf 'x\n' > "$CRN/CLAUDE.md"
RC=0; "$EXE" spawn cr2 --socket "$SOCK" --engine codex-render --cwd "$CRN" --dry-run >/dev/null 2>&1 || RC=$?
[ "$RC" -eq 66 ] && ok "codex-render refused (66) without codex=true" || bad "codex-render gate rc=$RC"
cfn_safe_rm_tmp "$CRP"; cfn_safe_rm_tmp "$CRN"

# 25. watch: one alert when a pane is idle and the result file is missing.
# Fake panes on a private socket, fake HOME with a fake mailbox.sh, never real mail.
WS="$SOCK-w"
WH=$(mktemp -d) || exit 1
mkdir -p "$WH/.claude/skills/cfn-mailbox"
ln -s "$HOME/.claude/cfn-config" "$WH/.claude/cfn-config"
MAILLOG="$WH/mail.log"
printf '#!/usr/bin/env bash\nprintf "%%s\\n" "$*" >> "%s"\n' "$MAILLOG" > "$WH/.claude/skills/cfn-mailbox/mailbox.sh"
chmod +x "$WH/.claude/skills/cfn-mailbox/mailbox.sh"
wpane() { tmux -L "$WS" new-session -d -s "$1" -x 100 -y 20 "$2"; }
# wrun NAME RESULT [idle-min]: foreground watch in background, rc to $WH/rc-NAME
wrun() {
  ( env HOME="$WH" PATH="$PATH" TMUX_AGENTS_WATCH_UNIT=1 timeout 20 "$EXE" watch "$1" --socket "$WS" \
      --result "$2" --notify proj/s/lead --idle-min "${3:-2}" --interval 0.5 >"$WH/out-$1" 2>&1; echo $? > "$WH/rc-$1" ) &
}
mails() { [ -f "$MAILLOG" ] && wc -l < "$MAILLOG" | tr -d ' ' || echo 0; }

# idle pane, no result: exactly one alert, even after many more polls
wpane wi 'echo ready; exec sleep 60'
: > "$MAILLOG"; wrun wi "$WH/res-wi"
sleep 7
[ "$(mails)" = 1 ] && ok "watch: alert once after idle with no result" || bad "watch idle: mails=$(mails)"
case "$(cat "$MAILLOG")" in *"send proj/s/lead"*"wi"*) ok "watch: alert goes through mailbox.sh send ADDR and names the session" ;; *) bad "watch alert text: $(cat "$MAILLOG")" ;; esac
printf 'done\n' > "$WH/res-wi"; sleep 2
[ "$(cat "$WH/rc-wi" 2>/dev/null)" = 0 ] && ok "watch: exits 0 when the result appears" || bad "watch did not exit on result (rc=$(cat "$WH/rc-wi" 2>/dev/null))"
[ "$(mails)" = 1 ] && ok "watch: still one alert after exit" || bad "watch extra mail: $(mails)"

# codex placeholder only (no working line, static): idle, so it alerts
wpane wph 'printf "Ask Codex to do anything\n"; exec sleep 60'
: > "$MAILLOG"; wrun wph "$WH/res-wph"
sleep 6
[ "$(mails)" = 1 ] && ok "watch: codex placeholder alone does not count as busy" || bad "watch placeholder: mails=$(mails)"

# codex placeholder plus a working line: busy, no alert
wpane wb 'printf "Ask Codex to do anything\n"; printf "• Working (5s • esc to interrupt)\n"; exec sleep 60'
: > "$MAILLOG"; wrun wb "$WH/res-wb"
sleep 6
[ "$(mails)" = 0 ] && ok "watch: no alert while a codex pane shows the working line" || bad "watch busy: mails=$(mails)"

# pane content keeps changing without any marker: busy by change, no alert
wpane wc 'i=0; while :; do i=$((i+1)); echo "line $i"; sleep 0.3; done'
: > "$MAILLOG"; wrun wc "$WH/res-wc"
sleep 6
[ "$(mails)" = 0 ] && ok "watch: no alert while pane content changes" || bad "watch content change: mails=$(mails)"

# old result file present at start (a review round rewrites the same file):
# ignored until rewritten, then ends the watch with no alert
wpane wr 'echo ready; exec sleep 60'
: > "$MAILLOG"; printf 'old\n' > "$WH/res-wr"; touch -d '1 hour ago' "$WH/res-wr"; wrun wr "$WH/res-wr" 60
sleep 3
[ ! -e "$WH/rc-wr" ] && ok "watch: old result file present at start does not end the watch" || bad "watch exited on stale result: rc=$(cat "$WH/rc-wr" 2>/dev/null)"
printf 'new\n' > "$WH/res-wr"; sleep 3
[ "$(cat "$WH/rc-wr" 2>/dev/null)" = 0 ] && [ "$(mails)" = 0 ] && ok "watch: rewritten result file ends the watch, exit 0, no alert" || bad "watch rewrite: rc=$(cat "$WH/rc-wr" 2>/dev/null) mails=$(mails)"

# old result file left untouched and the pane idle: still alerts once
wpane wo 'echo ready; exec sleep 60'
: > "$MAILLOG"; printf 'old\n' > "$WH/res-wo"; touch -d '1 hour ago' "$WH/res-wo"; wrun wo "$WH/res-wo"
sleep 7
[ "$(mails)" = 1 ] && [ ! -e "$WH/rc-wo" ] && ok "watch: untouched old result plus idle pane sends the alert" || bad "watch stale+idle: mails=$(mails) rc=$(cat "$WH/rc-wo" 2>/dev/null)"

# session dies: exits 0, no alert
wpane wd 'echo ready; sleep 2'
: > "$MAILLOG"; wrun wd "$WH/res-wd" 60
sleep 6
[ "$(cat "$WH/rc-wd" 2>/dev/null)" = 0 ] && [ "$(mails)" = 0 ] && ok "watch: exits 0 when the session dies" || bad "watch session death: rc=$(cat "$WH/rc-wd" 2>/dev/null) mails=$(mails)"

# argument checks
RC=0; env HOME="$WH" PATH="$PATH" "$EXE" watch wi --socket "$WS" --notify a >/dev/null 2>&1 || RC=$?
[ "$RC" -eq 64 ] && ok "watch: --result is required (64)" || bad "watch no --result rc=$RC"
RC=0; env HOME="$WH" PATH="$PATH" "$EXE" watch nosuch --socket "$WS" --result /x --notify a >/dev/null 2>&1 || RC=$?
[ "$RC" -eq 65 ] && ok "watch: unknown session (65)" || bad "watch unknown session rc=$RC"
RC=0; env HOME="$WH" PATH="$PATH" "$EXE" watch wi --socket "$WS" --result /x --notify a --idle-min x >/dev/null 2>&1 || RC=$?
[ "$RC" -eq 64 ] && ok "watch: --idle-min must be a number (64)" || bad "watch bad idle-min rc=$RC"
wait
tmux -L "$WS" kill-server 2>/dev/null || true
cfn_safe_rm_tmp "$WH"

# BUG tmux-send-paste (2026-11-19): a long send lands in a Codex pane as a
# "[Pasted Content N chars]" block that needs a second Enter; send pressed Enter
# once and exited 0, leaving the message unsent for ~25 min. send must re-press
# Enter until the input line is clear, and fail loudly if it never clears.
PL=$(mktemp -u "$GTD/paste-log.XXXXXX"); export FAKE_PASTE_LOG="$PL"
LONG=$(printf 'review job %.0s' $(seq 1 40))
"$EXE" spawn pp1 --socket "$SOCK" --bin "$SKILL_DIR/tests/fake-engine-paste.sh" --banner-regex 'AGENTS-TEST-BANNER' --cwd /tmp >/dev/null 2>&1 || bad "paste engine spawn fails"
RC=0; "$EXE" send pp1 --socket "$SOCK" "$LONG" >/dev/null 2>&1 || RC=$?
[ "$RC" -eq 0 ] && ok "send of a pasted block exits 0" || bad "send of a pasted block rc=$RC"
[ "$(cat "$PL" 2>/dev/null | wc -l)" = 1 ] && [ "$(head -n1 "$PL")" = "${#LONG}" ] \
  && ok "send re-presses Enter so the pasted block is submitted exactly once" \
  || bad "pasted block not submitted once: log=[$(cat "$PL" 2>/dev/null | tr '\n' ' ')] want ${#LONG}"
touch "$PL.never"
RC=0; ERR=$(TUI_SUBMIT_VERIFY=1 TUI_SUBMIT_RETRIES=1 "$EXE" send pp1 --socket "$SOCK" "$LONG" 2>&1 >/dev/null) || RC=$?
[ "$RC" -ne 0 ] && ok "send exits non-zero when the message never lands" || bad "send hid a message that never landed"
case "$ERR" in *"not submitted"*) ok "never-landed error says the message was not submitted" ;; *) bad "never-landed error unclear: $ERR" ;; esac
"$EXE" kill pp1 --socket "$SOCK" >/dev/null 2>&1 || true

echo "== results: $PASS/$TOTAL passed, $FAIL failed =="
[ "$FAIL" -eq 0 ]
