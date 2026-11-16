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
# glm-open approvals (allow-list fence) go to a test store, never the real ~/.config
CFN_GLM_OPEN_APPROVALS=$(mktemp -d); export CFN_GLM_OPEN_APPROVALS
# allow-list fence worker homes go to a temp dir, never the real ~/.claude
ZAI_FENCE_WORKER_BASE=$(mktemp -d); export ZAI_FENCE_WORKER_BASE
SOCK="tagents-test-$$"
export TMUX_AGENTS_AUTH_TIMEOUT=1    # healthy auth probe must not eat 12s per spawn
export TMUX_AGENTS_BANNER_TIMEOUT=3  # banner-timeout test must fail fast

PASS=0 FAIL=0 TOTAL=0

cleanup() {
  tmux -L "$SOCK" kill-server 2>/dev/null || true
  tmux -L "$SOCK-k" kill-server 2>/dev/null || true
  tmux -L "$SOCK-L" kill-server 2>/dev/null || true
  tmux -L "$SOCK-e" kill-server 2>/dev/null || true
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

echo "== results: $PASS/$TOTAL passed, $FAIL failed =="
[ "$FAIL" -eq 0 ]
