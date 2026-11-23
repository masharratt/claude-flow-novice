#!/usr/bin/env bash
# tests/test-safe-rm-wrapper.sh
# Child-process delete guard: .claude/cfn-scripts/safe-bin/rm (wrapper first on
# PATH), its SessionStart installer hook, and the cfn-tmux-agents pane PATH.
#
# Incident 2026-11-23 ~14:42Z (MDTWII): a builder's bash test had broken
# escaping in mktemp, T was empty, and cleanup ran rm -rf "$T/home" "$T/tmp"
# = rm -rf /home /tmp as the user (~98 GB lost). The PreToolUse rm guard reads
# only the command text the AI types; deletes inside scripts never reach it.
#
# Safety: the wrapper always runs with a recording fake 'rm' right after it on
# PATH, so even a wrapper bug passes args to the recorder, never to a real rm.
# The only real deletes are cfn_safe_rm_tmp of the checked temp dir.
set -u

REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P) || exit 1
WRAP_DIR="$REPO/.claude/cfn-scripts/safe-bin"
WRAP="$WRAP_DIR/rm"
HOOK="$REPO/.claude/hooks/cfn-safe-rm-path.sh"
# shellcheck source=/dev/null
source "$REPO/.claude/cfn-scripts/lib/safe-rm.sh" || exit 1

T=$(mktemp -d /tmp/safe-rm-wrapper-test.XXXXXX) || exit 1
T=$(cd -P "$T" && pwd -P) || exit 1
case "$T" in /tmp/safe-rm-wrapper-test.?*) ;; *) echo "bad temp dir '$T'"; exit 1 ;; esac
trap 'cfn_safe_rm_tmp "$T"' EXIT

PASS=0 FAIL=0
ok()  { PASS=$((PASS + 1)); echo "  ok   $1"; }
bad() { FAIL=$((FAIL + 1)); echo "  FAIL $1"; }

# Recording fake rm: writes its args (one per line) and deletes nothing.
mkdir -p "$T/fakebin"
cat >"$T/fakebin/rm" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$@" >"$RM_LOG"
EOF
chmod +x "$T/fakebin/rm"
export RM_LOG="$T/rm.log"

# Fake home with the shapes that matter.
FH="$T/home"
mkdir -p "$FH/.cache/x" "$FH/projects/repo/.git" "$FH/projects/plain" \
    "$FH/work/data/keep" "$FH/work/data/other" "$FH/work/deep/a/b" "$FH/.config"
: >"$FH/.bashrc"; : >"$FH/work/file.txt"
ln -s "$FH" "$FH/work/lnk"
printf '# test list\n%s\n' "$FH/work/data/keep" >"$FH/.config/cfn-rm-protect.conf"

# run_wrap ARGS... -> rc in RC, stderr in ERR; cwd is $FH/work
run_wrap() {
    rm_log_reset
    [ -x "$T/fakebin/rm" ] || { echo "fake rm missing: abort"; exit 1; }
    ERR=$(cd "$FH/work" && HOME="$FH" PATH="$WRAP_DIR:$T/fakebin:/usr/bin:/bin" "$WRAP" "$@" 2>&1 >/dev/null); RC=$?
}
rm_log_reset() { : >"$RM_LOG"; }
logged() { cat "$RM_LOG"; }

refused() { # NAME ARGS...
    local name="$1"; shift
    run_wrap "$@"
    if [ "$RC" -ne 0 ] && [ ! -s "$RM_LOG" ] && [ -n "$ERR" ]; then ok "refused: $name"
    else bad "refused: $name (rc=$RC log=[$(logged | tr '\n' ' ')] err=[$ERR])"; fi
}
passed() { # NAME ARGS...
    local name="$1"; shift
    run_wrap "$@"
    local want got
    want=$(printf '%s\n' "$@"); got=$(logged)
    if [ "$RC" -eq 0 ] && [ "$got" = "$want" ]; then ok "passes: $name"
    else bad "passes: $name (rc=$RC want=[$want] got=[$got] err=[$ERR])"; fi
}

echo "== safe-rm wrapper =="
if [ ! -x "$WRAP" ]; then
    bad "wrapper $WRAP exists and is executable"
else
    refused '$HOME'                         -rf "$FH"
    refused '$HOME/'                        -rf "$FH/"
    refused '$HOME/.cache'                  -rf "$FH/.cache"
    refused '$HOME/.bashrc (no -r)'         -f "$FH/.bashrc"
    refused '/home'                         -rf /home
    refused '/'                             -rf /
    refused '/tmp'                          -rf /tmp
    refused '/mnt/c'                        -rf /mnt/c
    refused 'incident shape "$T/home" with T empty' -rf "/home" "/tmp"
    refused 'empty string operand'          -rf ""
    refused 'relative .. reaching $HOME'    -rf ..
    refused 'relative ../.cache'            -rf ../.cache
    refused 'parent through a symlink (lnk/.cache)' -rf "$FH/work/lnk/.cache"
    refused 'symlink with trailing slash follows to $HOME' -rf "$FH/work/lnk/"
    refused 'mixed operands: nothing passes' -rf "$FH/work/deep" "$FH/.cache"
    refused 'repo root under ~/projects'    -rf "$FH/projects/repo"
    refused 'config-listed path'            -rf "$FH/work/data/keep"
    refused 'ancestor of a config-listed path' -rf "$FH/work/data"
    refused 'operand after --'              -rf -- "$FH/.cache"
    # Security review 2026-11-23: home protection must not depend on $HOME.
    REAL_HOME=$(getent passwd "$(id -u)" | cut -d: -f6)
    if [ -n "$REAL_HOME" ] && [ "$REAL_HOME" != / ]; then
        rm_log_reset
        ERR=$(cd "$FH/work" && env -u HOME PATH="$WRAP_DIR:$T/fakebin:/usr/bin:/bin" "$WRAP" -rf "$REAL_HOME" 2>&1 >/dev/null); RC=$?
        [ "$RC" -ne 0 ] && [ ! -s "$RM_LOG" ] && ok "refused: real home with HOME unset" || bad "real home with HOME unset (rc=$RC log=[$(logged)])"
        refused 'real home/.bashrc with HOME pointed elsewhere' -f "$REAL_HOME/.bashrc"
        refused 'real home with HOME pointed elsewhere' -rf "$REAL_HOME"
    else
        bad "getent gave no real home"
    fi
    # Any repo root with a .git DIRECTORY, anywhere; linked worktrees (.git file) stay deletable.
    mkdir -p "$FH/work/elsewhere/repo2/.git" "$FH/work/elsewhere/wt"
    printf 'gitdir: /nowhere\n' >"$FH/work/elsewhere/wt/.git"
    refused 'repo root outside ~/projects (.git dir)' -rf "$FH/work/elsewhere/repo2"
    passed  'linked worktree (.git file)'   -rf "$FH/work/elsewhere/wt"
    # Windows home folders.
    refused '/mnt/c/Users'                  -rf /mnt/c/Users
    refused '/mnt/d/Users/someone'          -rf /mnt/d/Users/someone
    passed  '/mnt/c/Users/x/sub (deeper is allowed)' -rf /mnt/c/Users/someone/AppData/tmpthing
    passed  'plain file'                    "$FH/work/file.txt"
    passed  'deep dir, -rf'                 -rf "$FH/work/deep/a/b"
    passed  'relative operand'              -rf deep/a
    passed  'symlink operand to $HOME (link only)' -f "$FH/work/lnk"
    passed  'plain dir under ~/projects (no .git)' -rf "$FH/projects/plain"
    passed  'sibling of a listed path'      -rf "$FH/work/data/other"
    passed  'options after operands, -v'    "$FH/work/file.txt" -v
    passed  '--help (no operands)'          --help
    # The real rm is found past the wrapper's own dir even when it is listed twice.
    rm_log_reset
    ( cd "$FH/work" && HOME="$FH" PATH="$WRAP_DIR:$WRAP_DIR:$T/fakebin:/usr/bin:/bin" "$WRAP" -f file.txt ) >/dev/null 2>&1
    [ "$(logged)" = "$(printf '%s\n' -f file.txt)" ] && ok "wrapper listed twice on PATH: still reaches the next rm" \
        || bad "wrapper listed twice on PATH (log=[$(logged)])"
    # Two copies of the wrapper on PATH must not hand off to each other forever.
    # The copy keeps its rules lib beside it (safe-bin/ + lib/), as a real install does.
    mkdir -p "$T/cs/wrap2" "$T/cs/lib"; cp "$WRAP" "$T/cs/wrap2/rm"; chmod +x "$T/cs/wrap2/rm"
    cp "$REPO/.claude/cfn-scripts/lib/path-guard.sh" "$T/cs/lib/"
    : >"$FH/work/two.txt"
    ( cd "$FH/work" && HOME="$FH" PATH="$WRAP_DIR:$T/cs/wrap2:/usr/bin:/bin" timeout 10 "$WRAP" -f two.txt ) >/dev/null 2>&1; rc=$?
    [ "$rc" -eq 0 ] && [ ! -e "$FH/work/two.txt" ] && ok "two wrapper copies on PATH: no loop, real rm runs" \
        || bad "two wrapper copies on PATH (rc=$rc, 124 = timed out looping)"
    # A copy whose rules lib is missing refuses every delete (fails closed).
    mkdir -p "$T/lone"; cp "$WRAP" "$T/lone/rm"; chmod +x "$T/lone/rm"
    : >"$FH/work/lone.txt"; rm_log_reset
    ( cd "$FH/work" && HOME="$FH" PATH="$T/lone:$T/fakebin:/usr/bin:/bin" "$T/lone/rm" -f lone.txt ) >/dev/null 2>&1; rc=$?
    [ "$rc" -ne 0 ] && [ ! -s "$RM_LOG" ] && [ -e "$FH/work/lone.txt" ] && ok "wrapper without its rules lib refuses (fails closed)" \
        || bad "wrapper without lib: rc=$rc log=$(logged)"
    # PATH lookup: a bare 'rm' resolves to the wrapper.
    got=$(HOME="$FH" PATH="$WRAP_DIR:$T/fakebin:/usr/bin:/bin" bash -c 'command -v rm')
    [ "$got" = "$WRAP" ] && ok "bare rm on PATH resolves to the wrapper" || bad "bare rm resolves to [$got]"
    # No env escape hatch: an AI-set variable must not unlock a refusal.
    rm_log_reset
    ( cd "$FH/work" && HOME="$FH" PATH="$WRAP_DIR:$T/fakebin:/usr/bin:/bin" CFN_SAFE_RM_DISABLE=1 SAFE_RM_OFF=1 "$WRAP" -rf "$FH" ) >/dev/null 2>&1
    [ ! -s "$RM_LOG" ] && ok "no env escape hatch" || bad "env var unlocked a refusal"
fi

echo "== SessionStart installer hook =="
if [ ! -f "$HOOK" ]; then
    bad "hook $HOOK exists"
else
    EF="$T/claude-env"
    : >"$EF"
    CLAUDE_ENV_FILE="$EF" bash "$HOOK" </dev/null >/dev/null 2>&1; rc=$?
    CLAUDE_ENV_FILE="$EF" bash "$HOOK" </dev/null >/dev/null 2>&1
    n=$(grep -c 'safe-bin' "$EF" || true)
    [ "$rc" -eq 0 ] && [ "$n" = 1 ] && ok "hook writes one PATH export (idempotent)" || bad "hook rc=$rc lines=$n: $(cat "$EF")"
    # The written line, sourced, puts the wrapper first.
    got=$(env -i HOME="$FH" PATH="/usr/bin:/bin" bash -c ". '$EF'; command -v rm")
    [ "$got" = "$WRAP" ] && ok "sourcing the env file makes rm the wrapper" || bad "after sourcing, rm is [$got]"
    out=$(env -u CLAUDE_ENV_FILE bash "$HOOK" </dev/null 2>&1); rc=$?
    [ "$rc" -eq 0 ] && ok "hook without CLAUDE_ENV_FILE exits 0" || bad "hook without CLAUDE_ENV_FILE rc=$rc out=$out"
fi

echo "== cfn-tmux-agents pane PATH =="
EXE="$REPO/.claude/skills/cfn-tmux-agents/execute.sh"
printf '#!/usr/bin/env bash\necho BANNER\n' >"$T/eng"; chmod +x "$T/eng"
mkdir -p "$T/repo"
OUT=$("$EXE" spawn rmguard-lane --socket "rmguard-$$" --bin "$T/eng" --cwd "$T/repo" --dry-run 2>&1 || true)
case "$OUT" in *"$WRAP_DIR"*) ok "dry-run pane command puts safe-bin first on PATH" ;;
    *) bad "dry-run omits safe-bin: $(printf '%s' "$OUT" | head -c 400)" ;; esac

echo "== zai-fence =="
# A fenced command started with a bare PATH still finds the wrapper first.
if command -v bwrap >/dev/null 2>&1 || command -v sandbox-exec >/dev/null 2>&1; then
    mkdir -p "$T/fence-repo" && git -C "$T/fence-repo" init -q
    got=$(cd "$T/fence-repo" && env PATH=/usr/bin:/bin timeout 120 "$REPO/.claude/cfn-scripts/zai-fence.sh" /bin/bash -c 'command -v rm' 2>/dev/null | tail -1)
    case "$got" in */cfn-scripts/safe-bin/rm) ok "fenced command: rm is the wrapper ($got)" ;;
        *) bad "fenced command: rm is [$got]" ;; esac
else
    echo "  skip fence check: no bwrap/sandbox-exec"
fi

# Live pane: the engine process (and so its children) sees the wrapper as rm.
if command -v tmux >/dev/null 2>&1; then
    export TMUX_TMPDIR="$T/tmux"; mkdir -p "$TMUX_TMPDIR"
    printf '#!/usr/bin/env bash\necho "RMG-BANNER rm=$(command -v rm)"\nsleep 30\n' >"$T/eng2"; chmod +x "$T/eng2"
    git -C "$T/repo" init -q 2>/dev/null
    TMUX_AGENTS_BANNER_TIMEOUT=6 TMUX_AGENTS_TRUST_TIMEOUT=1 TMUX_AGENTS_AUTH_TIMEOUT=1 \
        "$EXE" spawn rmguard-live --socket "rmguard-$$" --bin "$T/eng2" --banner-regex 'RMG-BANNER' --cwd "$T/repo" >/dev/null 2>&1 || true
    sleep 0.3
    CAP=$(tmux -L "rmguard-$$" capture-pane -p -J -t rmguard-live 2>/dev/null || true)
    tmux -L "rmguard-$$" kill-server 2>/dev/null || true
    case "$CAP" in *"rm=$WRAP_DIR/rm"*) ok "live lane: rm resolves to the wrapper" ;;
        *) bad "live lane rm: $(printf '%s' "$CAP" | grep RMG-BANNER | head -c 300)" ;; esac
else
    echo "  skip live lane check: tmux not installed"
fi

echo "== results: $PASS passed, $FAIL failed =="
[ "$FAIL" -eq 0 ]
