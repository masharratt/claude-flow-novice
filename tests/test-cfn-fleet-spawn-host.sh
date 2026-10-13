#!/usr/bin/env bash
# tests/test-cfn-fleet-spawn-host.sh
# Plan Phase 4 (planning/PLAN_fleet-remote-host-workers.md): `fleet spawn WSxx
# --host H` launches a claude worker on a remote host.
#
# The real ssh, scp and server are never touched. Stubs first on PATH:
#   ssh  logs its argv, then RUNS the remote command locally with HOME set to
#        a fixture "server home", so the server-side git (fetch, worktree add,
#        symlinks, outbox) is real git against fixture repos. STUB_SSH_RC=255
#        simulates an unreachable host.
#   scp  logs its argv and copies the files into the fixture server path.
#   tmux logs its argv (prefixed with [host] when run through the ssh stub)
#        and replays scripted capture-pane output (Nth call -> N.txt).
# The Mac-side `git push <remote>` is a real push to the fixture bare repo
# (the remote URL is a local path), so the pushed ref can be checked directly.
set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

SKILL_DIR="$PROJECT_ROOT/.claude/skills/cfn-fleet"
TMP_DIR=$(cd "$(mktemp -d "${TMPDIR:-/tmp}/cfn-fleet-spawn-host.XXXXXX")" && pwd -P)
trap 'cleanup_temp_dir "$TMP_DIR"' EXIT

STUB_LOG="$TMP_DIR/stub-calls.log"
TMUX_LOG="$TMP_DIR/tmux-calls.log"
export STUB_LOG FLEET_TMUX_LOG="$TMUX_LOG"

mkdir -p "$TMP_DIR/bin"
cat > "$TMP_DIR/bin/ssh" <<'STUB'
#!/usr/bin/env bash
# test stub for ssh: log argv, then run the remote command locally as the
# fixture server (HOME=$STUB_SERVER_HOME). Never contacts a real host.
set -u
while [ $# -gt 0 ]; do
    case "$1" in
        -o|-p|-i|-l|-F) shift 2 ;;
        -*) shift ;;
        *) break ;;
    esac
done
host="$1"; shift
printf 'ssh %s :: %s\n' "$host" "$*" >> "$STUB_LOG"
[ "${STUB_SSH_RC:-}" = "255" ] && { echo "ssh: connect to host $host: Connection refused" >&2; exit 255; }
eval "set -- $*"
if [ "${1:-}" != bash ] || [ "${2:-}" != -lc ]; then
    echo "ssh stub: expected 'bash -lc <script>', got: $*" >&2
    exit 97
fi
export STUB_VIA_SSH="$host"
HOME="$STUB_SERVER_HOME" exec bash -c "$3"
STUB
cat > "$TMP_DIR/bin/scp" <<'STUB'
#!/usr/bin/env bash
# test stub for scp: log argv, copy sources into the host:path target locally.
set -u
printf 'scp %s\n' "$*" >> "$STUB_LOG"
[ -n "${STUB_SCP_RC:-}" ] && exit "$STUB_SCP_RC"
files=()
while [ $# -gt 0 ]; do
    case "$1" in
        -o|-P|-i|-F) shift 2 ;;
        -*) shift ;;
        *) files+=("$1"); shift ;;
    esac
done
dst="${files[${#files[@]}-1]}"
unset "files[${#files[@]}-1]"
cp -p "${files[@]}" "${dst#*:}"
STUB
cat > "$TMP_DIR/bin/tmux" <<'STUB'
#!/usr/bin/env bash
# test stub for tmux: log argv, replay scripted capture-pane output
set -u
printf '%stmux %s\n' "${STUB_VIA_SSH:+[$STUB_VIA_SSH] }" "$*" >> "${FLEET_TMUX_LOG:-/dev/null}"
cmd=""
while [ $# -gt 0 ]; do
    case "$1" in
        -L|-S|-f|-c) shift 2 ;;
        -*) shift ;;
        *) cmd="$1"; break ;;
    esac
done
case "$cmd" in
    has-session)
        # Snapshot the roster and the spawning marker mid-spawn (this call
        # happens after the spawn marked the row, before any push).
        if [ -n "${STUB_SNAP_DIR:-}" ]; then
            cp "$STUB_SNAP_DIR/../roster.tsv" "$STUB_SNAP_DIR/roster.snap" 2>/dev/null
            cp "$STUB_SNAP_DIR/../.spawning/WS01" "$STUB_SNAP_DIR/marker.snap" 2>/dev/null
        fi
        [ -n "${STUB_TMUX_HAS_SESSION:-}" ] && exit 0 || exit 1 ;;
    capture-pane)
        d="${FLEET_CAPTURE_DIR:-}"
        if [[ -n $d && -d $d ]]; then
            n=$(( $(cat "$d/.count" 2>/dev/null || printf 0) + 1 ))
            printf '%s' "$n" > "$d/.count"
            f="$d/$n.txt"
            if [[ ! -f $f ]]; then
                f=$(ls "$d" 2>/dev/null | grep -E '^[0-9]+\.txt$' | sort -n | tail -1)
                [[ -n $f ]] && f="$d/$f"
            fi
            [[ -n $f && -f $f ]] && cat "$f"
        fi
        ;;
esac
exit 0
STUB
# Sandbox and limit probes on the "server": bwrap, socat and systemd-run
# succeed unless STUB_BWRAP_RC / STUB_SOCAT_RC / STUB_SYSTEMD_RC say otherwise.
cat > "$TMP_DIR/bin/bwrap" <<'STUB'
#!/usr/bin/env bash
printf 'bwrap %s\n' "$*" >> "$STUB_LOG"
exit "${STUB_BWRAP_RC:-0}"
STUB
cat > "$TMP_DIR/bin/socat" <<'STUB'
#!/usr/bin/env bash
exit "${STUB_SOCAT_RC:-0}"
STUB
cat > "$TMP_DIR/bin/systemd-run" <<'STUB'
#!/usr/bin/env bash
printf 'systemd-run %s\n' "$*" >> "$STUB_LOG"
exit "${STUB_SYSTEMD_RC:-0}"
STUB
cat > "$TMP_DIR/bin/claude" <<'STUB'
#!/usr/bin/env bash
echo "ENGINE-STUB claude $*" >> "${STUB_LOG:-/dev/null}"
exit 0
STUB
chmod +x "$TMP_DIR/bin/"*

FLEET_OUT=""
FLEET_RC=0
PROJ=""
RUN_DIR=""
SRV=""
CAPTURE_DIR=""

_fleet_invoke() {
    {
        cd "$PROJ"
        export FLEET_RUN_DIR="$RUN_DIR"
        export PATH="$TMP_DIR/bin:$PATH"
        export STUB_SERVER_HOME="$SRV"
        mkdir -p "$TMP_DIR/tmp"
        export TMPDIR="$TMP_DIR/tmp"
        export HOME="$TMP_DIR/mac-home"
        # shellcheck disable=SC1091
        source "$SKILL_DIR/lib/common.sh"
        # shellcheck disable=SC1091
        source "$SKILL_DIR/lib/cmd-spawn.sh"
        main "$@"
    } 2>&1
}

run_spawn() {
    local out rc=0
    out=$(_fleet_invoke "$@") || rc=$?
    FLEET_OUT=$out
    FLEET_RC=$rc
}

# make_fixture SLUG: Mac repo "proj" with run dir planning/fleet-main, a
# fixture server home with the bare repo, the fleet clone, the user's own
# checkout (link source) and fleet-runs/. Roster uses the pre-host 11-column
# header so the first host write also exercises the migration.
make_fixture() {
    local slug="$1"
    local base="$TMP_DIR/$slug"
    PROJ="$base/mac/proj"
    RUN_DIR="$PROJ/planning/fleet-main"
    SRV="$base/srv"
    mkdir -p "$PROJ/src" "$RUN_DIR/briefs" "$RUN_DIR/handoffs" "$TMP_DIR/mac-home"
    git -C "$PROJ" init -q -b main
    git -C "$PROJ" config user.email fleet@test.local
    git -C "$PROJ" config user.name fleet
    echo a > "$PROJ/src/a.md"
    git -C "$PROJ" add -A
    git -C "$PROJ" commit -qm "init"
    printf 'ws_id\tname\ttask\tstatus\tclaims\tlanded_sha\tmigration_num\tscratch_db\theartbeat\tnotes\tengine\n' > "$RUN_DIR/roster.tsv"
    printf 'WS01\tws01\tRemote work\tpending\tsrc/a.md,docs/b.md\t\t0042\t\t0\t\t\n' >> "$RUN_DIR/roster.tsv"
    touch "$RUN_DIR/.roster.lock"
    printf 'FLEET_WORKTREE=off\nFLEET_DB=none\nFLEET_TRUST_TIMEOUT=1\nFLEET_BANNER_TIMEOUT=1\nFLEET_AUTH_TIMEOUT=1\nFLEET_REMOTE_MIN_FREE_GB=0\nFLEET_REMOTE_LINKS=extracted,missingdir\n' > "$RUN_DIR/fleet.env"
    echo "Do the remote thing in src/a.md." > "$RUN_DIR/briefs/WS01.md"

    mkdir -p "$SRV/git" "$SRV/fleet-repos" "$SRV/fleet-runs" "$SRV/Projects/proj/extracted"
    git init -q --bare "$SRV/git/proj.git"
    git -C "$PROJ" remote add fakehost "$SRV/git/proj.git"
    git -C "$PROJ" push -q fakehost main
    git clone -q "$SRV/git/proj.git" "$SRV/fleet-repos/proj"

    : > "$STUB_LOG"
    : > "$TMUX_LOG"
    CAPTURE_DIR="$base/capture"
    mkdir -p "$CAPTURE_DIR"
    export FLEET_CAPTURE_DIR="$CAPTURE_DIR"
    export FLEET_TRUST_SETTLE=0
    unset STUB_SSH_RC STUB_SCP_RC STUB_BWRAP_RC STUB_SOCAT_RC STUB_SYSTEMD_RC
    unset FLEET_REMOTE_UNSANDBOXED FLEET_REMOTE_MEM FLEET_REMOTE_CPU
}

capture_script() { printf '%s\n' "$2" > "$CAPTURE_DIR/$1.txt"; }

roster_field() {
    awk -F'\t' -v ws="$1" -v field="$2" '
        NR == 1 { for (i = 1; i <= NF; i++) if ($i == field) idx = i; next }
        $1 == ws { if (idx) print $idx; exit }' "$RUN_DIR/roster.tsv"
}

env_val() { # KEY -> value from remote/WS01.env (sourced in a subshell)
    ( set +u; source "$RUN_DIR/remote/WS01.env"; eval "printf '%s' \"\${$1:-}\"" )
}

ssh_calls() { grep -c '^ssh ' "$STUB_LOG" 2>/dev/null || true; }

file_mode() { stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"; }

# ============================================================================

test_spawn_host_refuses_glm_and_codex() {
    log_step "AC 4.1: --host refuses non-claude engines (exit 64) before any ssh"
    make_fixture refuse
    local e
    for e in glm codex; do
        run_spawn WS01 --engine "$e" --host fakehost
        assert_equals "64" "$FLEET_RC" "--host with engine $e exits 64"
        assert_contains "$FLEET_OUT" "claude" "refusal for $e names the claude-only rule"
    done
    assert_equals "0" "$(ssh_calls)" "no ssh call for a refused engine"
    assert_equals "pending" "$(roster_field WS01 status)" "row stays pending"

    run_spawn WS01 --host 'bad;host'
    assert_equals "64" "$FLEET_RC" "unsafe host alias refused with 64"
    run_spawn WS01 --host fakehost --no-tmux
    assert_equals "64" "$FLEET_RC" "--host with --no-tmux refused with 64"
    assert_equals "0" "$(ssh_calls)" "still no ssh call"
}

test_spawn_host_dry_run_plan() {
    log_step "GIVEN --host and --dry-run, THEN PLAN lines name the host and server paths, no ssh"
    make_fixture dry
    run_spawn WS01 --host fakehost --dry-run
    assert_equals "0" "$FLEET_RC" "dry run exits 0"
    assert_contains "$FLEET_OUT" "PLAN host WS01 host=fakehost" "PLAN host line"
    assert_contains "$FLEET_OUT" "fleet-repos/proj-wt/ws01" "PLAN names the server worktree"
    assert_contains "$FLEET_OUT" "fleet-runs/proj/fleet-main/WS01" "PLAN names the server outbox"
    assert_equals "0" "$(ssh_calls)" "dry run never calls ssh"
    assert_equals "pending" "$(roster_field WS01 status)" "dry run mutates nothing"
    assert_success "dry run writes no spawning marker" test ! -e "$RUN_DIR/.spawning"
}

test_spawn_host_preflight_refuses_missing_clone_github_remote_and_low_disk() {
    log_step "AC 4.3: preflight refuses missing clone, foreign remote, low disk"
    make_fixture pre-missing
    rm -rf "$SRV/fleet-repos/proj"
    run_spawn WS01 --host fakehost
    assert_equals "66" "$FLEET_RC" "missing fleet clone exits 66"
    assert_contains "$FLEET_OUT" "fleet host-setup" "missing clone points at host-setup"
    assert_failure "nothing pushed when preflight fails" \
        git --git-dir="$SRV/git/proj.git" rev-parse --verify --quiet refs/heads/fleet-base/WS01
    assert_equals "pending" "$(roster_field WS01 status)" "row stays pending"

    make_fixture pre-github
    git -C "$SRV/fleet-repos/proj" remote add github https://github.com/example/proj.git
    run_spawn WS01 --host fakehost
    assert_equals "66" "$FLEET_RC" "clone with a GitHub remote exits 66"
    assert_contains "$FLEET_OUT" "github" "refusal names the foreign remote"
    assert_contains "$FLEET_OUT" "fleet host-setup" "foreign remote points at host-setup"

    make_fixture pre-disk
    printf 'FLEET_REMOTE_MIN_FREE_GB=999999\n' >> "$RUN_DIR/fleet.env"
    sed -i.bak '/^FLEET_REMOTE_MIN_FREE_GB=0$/d' "$RUN_DIR/fleet.env"
    run_spawn WS01 --host fakehost
    assert_equals "66" "$FLEET_RC" "low disk exits 66"
    assert_contains "$FLEET_OUT" "disk" "refusal names the disk"
    assert_success "no worktree made on low disk" test ! -e "$SRV/fleet-repos/proj-wt/ws01"
}

test_spawn_host_unreachable_stays_pending() {
    log_step "GIVEN ssh fails (rc 255), THEN exit 66, row pending, nothing pushed"
    make_fixture unreach
    export STUB_SSH_RC=255
    run_spawn WS01 --host fakehost
    unset STUB_SSH_RC
    assert_equals "66" "$FLEET_RC" "unreachable host exits 66"
    assert_contains "$FLEET_OUT" "unreachable" "message says unreachable"
    assert_equals "pending" "$(roster_field WS01 status)" "row stays pending"
}

test_spawn_host_refuses_row_without_claims() {
    log_step "GIVEN a row with no claims, THEN --host refuses (65): the worker could never commit"
    make_fixture noclaims
    awk -F'\t' -v OFS='\t' 'NR>1 && $1=="WS01" { $5="" } { print }' "$RUN_DIR/roster.tsv" > "$RUN_DIR/r.tmp"
    mv "$RUN_DIR/r.tmp" "$RUN_DIR/roster.tsv"
    run_spawn WS01 --host fakehost
    assert_equals "65" "$FLEET_RC" "no claims exits 65"
    assert_equals "0" "$(ssh_calls)" "no ssh call without claims"
}

test_spawn_host_ssh_sequence() {
    log_step "AC 4.2: happy path: push base, remote worktree, links, outbox kit, remote tmux launch"
    make_fixture happy
    capture_script 1 "  Do you trust the files in this folder? No, exit"
    capture_script 2 "Sonnet 5 with high effort | Claude Team"
    local before after
    before=$(date +%s)
    run_spawn WS01 --host fakehost
    after=$(date +%s)
    assert_equals "0" "$FLEET_RC" "host spawn exits 0"
    assert_contains "$FLEET_OUT" 'spawned WS01 engine=claude-sub host=fakehost' "spawn reports host"

    # base branch pushed from the Mac's HEAD
    assert_equals "$(git -C "$PROJ" rev-parse HEAD)" \
        "$(git --git-dir="$SRV/git/proj.git" rev-parse refs/heads/fleet-base/WS01)" \
        "fleet-base/WS01 pushed at the Mac HEAD"
    # worktree on the server, own branch, from the fleet clone
    local wt="$SRV/fleet-repos/proj-wt/ws01"
    assert_dir_exists "$wt" "remote worktree created"
    assert_equals "fleet/WS01" "$(git -C "$wt" rev-parse --abbrev-ref HEAD)" "worktree on fleet/WS01"
    assert_success "symlink to the user's checkout path" test -L "$wt/extracted"
    assert_equals "$SRV/Projects/proj/extracted" "$(readlink "$wt/extracted")" "link points at ~/Projects/<project>"
    assert_contains "$FLEET_OUT" "missingdir" "missing link source is warned about"
    assert_equals "" "$(git -C "$wt" status --porcelain)" "symlinks do not dirty the worktree"
    assert_success "user's checkout untouched (no .git made there)" test ! -e "$SRV/Projects/proj/.git"

    # outbox kit
    local ob="$SRV/fleet-runs/proj/fleet-main/WS01"
    assert_file_exists "$ob/outbox.env" "outbox.env shipped"
    assert_file_exists "$ob/claims.txt" "claims.txt shipped"
    assert_file_exists "$ob/brief.md" "brief shipped"
    assert_success "remote-worker.sh shipped executable" test -x "$ob/remote-worker.sh"
    assert_equals "$(cat "$SKILL_DIR/templates/remote-worker.sh")" "$(cat "$ob/remote-worker.sh")" "remote-worker.sh is the Mac template"
    assert_equals "700" "$(file_mode "$ob")" "outbox is owner-only"
    assert_equals $'src/a.md\ndocs/b.md' "$(cat "$ob/claims.txt")" "claims.txt lists roster claims one per line"
    local brief
    brief=$(cat "$ob/brief.md")
    assert_contains "$brief" "Workstream Brief (remote host): WS01" "brief built from BRIEF_REMOTE.md"
    assert_contains "$brief" "~/fleet-repos/proj-wt/ws01" "project and ws filled"
    assert_contains "$brief" "~/fleet-runs/proj/fleet-main/WS01/" "run filled"
    assert_contains "$brief" "this brief: 0042" "reserved migration number filled"
    assert_contains "$brief" "src/a.md docs/b.md" "claims filled"
    assert_contains "$brief" "Do the remote thing in src/a.md." "master's brief appended"
    assert_not_contains "$brief" "<project>" "no project placeholder left"
    assert_not_contains "$brief" "<reserved migration number" "no migration placeholder left"
    assert_not_contains "$brief" "WSxx" "no WSxx placeholder left"
    # outbox.env for remote-worker.sh
    local gen
    gen=$( ( source "$ob/outbox.env"; printf '%s' "$FLEET_GEN" ) )
    assert_success "generation id is hex (got '$gen')" test -n "$(printf '%s' "$gen" | grep -E '^[0-9a-f]{8,}$')"
    assert_equals "WS01" "$( ( source "$ob/outbox.env"; printf '%s' "$FLEET_WS" ) )" "outbox.env FLEET_WS"
    assert_equals "fleet/WS01" "$( ( source "$ob/outbox.env"; printf '%s' "$FLEET_BRANCH" ) )" "outbox.env FLEET_BRANCH"
    assert_equals "$ob" "$( ( source "$ob/outbox.env"; printf '%s' "$FLEET_OUTBOX" ) )" "outbox.env FLEET_OUTBOX absolute"
    assert_not_contains "$(cat "$ob/outbox.env")" "FLEET_PUSH_REMOTE" "outbox.env names no push remote (workers commit locally only)"

    # remote/<WS>.env contract (lanes 5-7 read it)
    local envf="$RUN_DIR/remote/WS01.env"
    assert_file_exists "$envf" "remote/WS01.env written"
    assert_equals "600" "$(file_mode "$envf")" "remote/WS01.env is 0600"
    assert_equals "fakehost" "$(env_val FLEET_HOST)" "env FLEET_HOST"
    assert_equals "fakehost" "$(env_val FLEET_GIT_REMOTE)" "env FLEET_GIT_REMOTE defaults to the host alias"
    assert_equals "proj" "$(env_val FLEET_PROJECT)" "env FLEET_PROJECT"
    assert_equals "fleet-main" "$(env_val FLEET_RUN)" "env FLEET_RUN"
    assert_equals "$gen" "$(env_val FLEET_GEN)" "env FLEET_GEN matches outbox.env"
    assert_equals "$wt" "$(env_val FLEET_REMOTE_WT)" "env FLEET_REMOTE_WT absolute"
    assert_equals "$ob" "$(env_val FLEET_OUTBOX)" "env FLEET_OUTBOX absolute"
    assert_equals "fleet/WS01" "$(env_val FLEET_BRANCH)" "env FLEET_BRANCH"
    assert_equals "fleet-base/WS01" "$(env_val FLEET_BASE_REF)" "env FLEET_BASE_REF"
    assert_equals "$SRV/fleet-repos/proj" "$(env_val FLEET_REMOTE_CLONE)" "env FLEET_REMOTE_CLONE: land fetches the lane from the fleet clone"
    assert_equals "fleet-main" "$(env_val FLEET_SOCK)" "env FLEET_SOCK"
    assert_equals "ws01" "$(env_val FLEET_SESSION)" "env FLEET_SESSION"
    local at
    at=$(env_val FLEET_SPAWNED_AT)
    assert_success "env FLEET_SPAWNED_AT is the Mac epoch ($at)" test "$at" -ge "$before" -a "$at" -le "$after"

    # tmux ran on the host, never locally
    local tl
    tl=$(cat "$TMUX_LOG")
    assert_contains "$tl" "[fakehost] tmux -L fleet-main new-session -d -s ws01 -c $wt" "remote session on the run socket, cwd = server worktree"
    assert_equals "0" "$(grep -vc '^\[fakehost\]' "$TMUX_LOG" || true)" "no local tmux call"
    assert_contains "$tl" "send-keys -t ws01 -l . '$ob/.launch-ws01'" "typed line sources the server launch script"
    assert_contains "$tl" "send-keys -t ws01 Down Enter" "trust prompt answered"
    assert_contains "$tl" "read $ob/brief.md and start" "thin prompt points at the server brief"
    assert_not_contains "$tl" "$RUN_DIR/briefs" "thin prompt never names the Mac brief path"
    assert_contains "$(cat "$STUB_LOG")" "scp " "kit shipped with scp"
    assert_success "server launch script deleted after shipping locally" \
        test -z "$(ls "$TMP_DIR/tmp" 2>/dev/null | grep cfn-spawn-launch || true)"
    local launch="$ob/.launch-ws01"
    assert_file_exists "$launch" "launch script on the server (stub tmux never sources it)"
    assert_equals "600" "$(file_mode "$launch")" "server launch script is 0600"
    local lb
    lb=$(cat "$launch")
    assert_contains "$lb" "rm -f '$launch'" "launch script deletes itself on the server"
    assert_contains "$lb" "exec systemd-run --user --scope --quiet -p MemoryMax=12G -p CPUQuota=400% -- claude --model sonnet" "launch script execs the engine inside a capped scope"
    assert_contains "$lb" "--settings '{" "launch script passes the generated settings"
    assert_contains "$lb" "unset ANTHROPIC_AUTH_TOKEN" "engine unset list applied"
    assert_not_contains "$lb" "_fleet_tick_loop" "no Mac heartbeat ticker on a host pane"
    assert_not_contains "$lb" "$RUN_DIR" "no Mac run dir in the server pane command"

    # roster
    assert_equals "started" "$(roster_field WS01 status)" "row started after banner"
    assert_equals "fakehost" "$(roster_field WS01 host)" "roster host column written"
    assert_equals "claude-sub" "$(roster_field WS01 engine)" "roster engine written"
    assert_success "spawning marker cleared after success" test ! -e "$RUN_DIR/.spawning/WS01"
}

test_spawn_host_new_generation_each_spawn() {
    log_step "AC 4.1: each spawn mints a new generation; a respawn reuses the worktree"
    make_fixture regen
    capture_script 1 "Sonnet 5 with high effort | Claude Team"
    run_spawn WS01 --host fakehost
    assert_equals "0" "$FLEET_RC" "first spawn exits 0"
    local g1 g2
    g1=$(env_val FLEET_GEN)
    echo "worker edit" > "$SRV/fleet-repos/proj-wt/ws01/src/a.md"
    rm -f "$CAPTURE_DIR/.count"
    run_spawn WS01 --host fakehost
    assert_equals "0" "$FLEET_RC" "respawn exits 0 (existing worktree reused)"
    g2=$(env_val FLEET_GEN)
    assert_success "generation changed ($g1 -> $g2)" test -n "$g1" -a -n "$g2" -a "$g1" != "$g2"
    assert_equals "worker edit" "$(cat "$SRV/fleet-repos/proj-wt/ws01/src/a.md")" "respawn keeps the worker's uncommitted work"
}

test_spawn_host_banner_timeout_cleans_remote_worktree() {
    log_step "GIVEN the remote banner never shows, THEN 66, row pending, half-made worktree removed"
    make_fixture cleanup
    capture_script 1 "worker@srv:~\$ "
    run_spawn WS01 --host fakehost
    assert_equals "66" "$FLEET_RC" "banner timeout exits 66"
    assert_contains "$FLEET_OUT" "pending" "message says the row stays pending"
    assert_equals "pending" "$(roster_field WS01 status)" "row pending"
    assert_equals "" "$(roster_field WS01 host)" "host not recorded on failure"
    assert_success "remote worktree removed" test ! -e "$SRV/fleet-repos/proj-wt/ws01"
    assert_failure "branch made by this spawn deleted" \
        git -C "$SRV/fleet-repos/proj" rev-parse --verify --quiet refs/heads/fleet/WS01
    assert_contains "$(cat "$TMUX_LOG")" "[fakehost] tmux -L fleet-main kill-session -t ws01" "remote session killed"
    assert_success "no remote/WS01.env on failure" test ! -e "$RUN_DIR/remote/WS01.env"
    assert_equals "0" "$(grep -ac 'and start' "$TMUX_LOG" || true)" "no prompt before a banner"
    assert_success "spawning marker cleared after failure" test ! -e "$RUN_DIR/.spawning/WS01"
}

test_spawn_host_scp_failure_cleans_remote_worktree() {
    log_step "GIVEN scp fails after the worktree is made, THEN 66 and the worktree is removed"
    make_fixture scpfail
    capture_script 1 "Sonnet 5 with high effort | Claude Team"
    export STUB_SCP_RC=1
    run_spawn WS01 --host fakehost
    unset STUB_SCP_RC
    assert_equals "66" "$FLEET_RC" "scp failure exits 66"
    assert_equals "pending" "$(roster_field WS01 status)" "row pending"
    assert_success "remote worktree removed" test ! -e "$SRV/fleet-repos/proj-wt/ws01"
    assert_equals "" "$(grep -a 'new-session' "$TMUX_LOG" || true)" "no session started"
}

test_spawn_host_git_remote_knob() {
    log_step "GIVEN fleet.env FLEET_HOST_REMOTE=srvgit, THEN push goes there and env records FLEET_GIT_REMOTE"
    make_fixture knob
    git -C "$PROJ" remote rename fakehost srvgit
    printf 'FLEET_HOST_REMOTE=srvgit\n' >> "$RUN_DIR/fleet.env"
    capture_script 1 "Sonnet 5 with high effort | Claude Team"
    run_spawn WS01 --host fakehost
    assert_equals "0" "$FLEET_RC" "spawn with a custom git remote exits 0"
    assert_equals "srvgit" "$(env_val FLEET_GIT_REMOTE)" "env FLEET_GIT_REMOTE from the knob"
    assert_success "base pushed through the knob's remote" \
        git --git-dir="$SRV/git/proj.git" rev-parse --verify --quiet refs/heads/fleet-base/WS01

    make_fixture knob-missing
    git -C "$PROJ" remote remove fakehost
    run_spawn WS01 --host fakehost
    assert_equals "66" "$FLEET_RC" "missing Mac git remote exits 66"
    assert_contains "$FLEET_OUT" "fleet host-setup" "missing remote points at host-setup"
    assert_success "no remote worktree when the push fails" test ! -e "$SRV/fleet-repos/proj-wt/ws01"
}

test_spawn_host_refuses_live_session_name() {
    log_step "GIVEN the server already has a tmux session of that name, THEN 66 and nothing is created or killed"
    make_fixture live
    export STUB_TMUX_HAS_SESSION=1
    run_spawn WS01 --host fakehost
    unset STUB_TMUX_HAS_SESSION
    assert_equals "66" "$FLEET_RC" "live session exits 66"
    assert_contains "$FLEET_OUT" "already exists" "message names the live session"
    assert_equals "0" "$(grep -ac 'kill-session' "$TMUX_LOG" || true)" "never kills a session this spawn did not start"
    assert_success "no remote worktree" test ! -e "$SRV/fleet-repos/proj-wt/ws01"
}

test_spawn_host_roster_host_column_routes_respawn() {
    log_step "GIVEN the roster row already names a host, THEN spawn without --host goes to that host"
    make_fixture rosterhost
    printf 'ws_id\tname\ttask\tstatus\tclaims\tlanded_sha\tmigration_num\tscratch_db\theartbeat\tnotes\tengine\thost\n' > "$RUN_DIR/roster.tsv"
    printf 'WS01\tws01\tRemote work\tpending\tsrc/a.md\t\t0042\t\t0\t\t\tfakehost\n' >> "$RUN_DIR/roster.tsv"
    capture_script 1 "Sonnet 5 with high effort | Claude Team"
    run_spawn WS01
    assert_equals "0" "$FLEET_RC" "spawn without --host exits 0"
    assert_contains "$FLEET_OUT" "host=fakehost" "went to the row's host"
    assert_file_exists "$RUN_DIR/remote/WS01.env" "remote env written"
}

test_spawn_host_warns_on_cfn_commit_drift() {
    log_step "GIVEN the server's claude-flow-novice-src differs from the Mac's, THEN a WARN, spawn proceeds"
    make_fixture drift
    mkdir -p "$SRV/claude-flow-novice-src"
    git -C "$SRV/claude-flow-novice-src" init -q
    git -C "$SRV/claude-flow-novice-src" -c user.email=a@b.c -c user.name=x commit -q --allow-empty -m other
    capture_script 1 "Sonnet 5 with high effort | Claude Team"
    run_spawn WS01 --host fakehost
    assert_equals "0" "$FLEET_RC" "drift is a warning, not a refusal"
    assert_contains "$FLEET_OUT" "differs from this machine" "drift warned about"
}

# snap_field FILE FIELD: a roster column from a roster snapshot taken mid-spawn.
snap_field() {
    awk -F'\t' -v field="$2" '
        NR == 1 { for (i = 1; i <= NF; i++) if ($i == field) idx = i; next }
        $1 == "WS01" { if (idx) print $idx; exit }' "$1"
}

test_spawn_host_row_is_spawning_while_launch_runs() {
    log_step "GIVEN a host spawn in progress, THEN the row reads spawning with host set and a live marker; started after"
    make_fixture spawning
    capture_script 1 "Sonnet 5 with high effort | Claude Team"
    # The stub reads <snapdir>/../roster.tsv, so point it at the run dir layout.
    export STUB_SNAP_DIR="$RUN_DIR/snap"
    mkdir -p "$STUB_SNAP_DIR"
    run_spawn WS01 --host fakehost
    unset STUB_SNAP_DIR
    assert_equals "0" "$FLEET_RC" "spawn exits 0"
    local snap="$RUN_DIR/snap/roster.snap"
    assert_file_exists "$snap" "roster snapshot taken during the spawn"
    assert_equals "spawning" "$(snap_field "$snap" status)" "status is spawning mid-spawn"
    assert_equals "fakehost" "$(snap_field "$snap" host)" "host column set mid-spawn so peek routes to the server"
    local marker="$RUN_DIR/snap/marker.snap"
    assert_file_exists "$marker" "spawning marker existed mid-spawn"
    assert_contains "$(cat "$marker")" "pid=" "marker records the pid"
    assert_contains "$(cat "$marker")" "started=" "marker records the start time"
    assert_contains "$(cat "$marker")" "prev_status=pending" "marker records the previous status"
    assert_equals "started" "$(roster_field WS01 status)" "started after the banner"
}

test_spawn_host_failure_restores_status_and_host() {
    log_step "GIVEN the spawn fails after marking, THEN status and host return to their previous values"
    make_fixture restore
    export STUB_SSH_RC=255
    run_spawn WS01 --host fakehost
    unset STUB_SSH_RC
    assert_equals "66" "$FLEET_RC" "unreachable exits 66"
    assert_equals "pending" "$(roster_field WS01 status)" "status restored to pending"
    assert_equals "" "$(roster_field WS01 host)" "host restored to empty"
    assert_success "marker cleared" test ! -e "$RUN_DIR/.spawning/WS01"

    make_fixture restore-blocked
    awk -F'\t' -v OFS='\t' 'NR>1 && $1=="WS01" { $4="blocked" } { print }' "$RUN_DIR/roster.tsv" > "$RUN_DIR/r.tmp" && mv "$RUN_DIR/r.tmp" "$RUN_DIR/roster.tsv"
    export STUB_SSH_RC=255
    run_spawn WS01 --host fakehost
    unset STUB_SSH_RC
    assert_equals "blocked" "$(roster_field WS01 status)" "a respawn of a blocked row restores blocked, not pending"
}

test_spawn_refuses_second_spawn_while_first_alive() {
    log_step "GIVEN a live spawning marker, THEN a second spawn exits 66 naming the pid and touches nothing"
    make_fixture second
    sleep 30 &
    local live=$!
    mkdir -p "$RUN_DIR/.spawning"
    printf 'pid=%s\nstarted=%s\nprev_status=pending\nprev_host=\n' "$live" "$(( $(date +%s) - 42 ))" > "$RUN_DIR/.spawning/WS01"
    awk -F'\t' -v OFS='\t' 'NR>1 && $1=="WS01" { $4="spawning" } { print }' "$RUN_DIR/roster.tsv" > "$RUN_DIR/r.tmp" && mv "$RUN_DIR/r.tmp" "$RUN_DIR/roster.tsv"
    run_spawn WS01 --host fakehost
    kill "$live" 2>/dev/null || true
    wait "$live" 2>/dev/null || true
    assert_equals "66" "$FLEET_RC" "second spawn exits 66"
    assert_contains "$FLEET_OUT" "WS01 is already spawning (pid $live, started " "message names the pid and age"
    assert_contains "$FLEET_OUT" "wait or kill it" "message says what to do"
    assert_equals "0" "$(ssh_calls)" "no ssh call"
    assert_equals "spawning" "$(roster_field WS01 status)" "row left spawning for the first spawn"
    assert_success "first spawn's marker kept" test -e "$RUN_DIR/.spawning/WS01"
}

test_spawn_clears_stale_marker_with_warning() {
    log_step "GIVEN a marker whose pid is gone, THEN WARN, clear it and spawn"
    make_fixture stale
    ( exit 0 ) & local dead=$!
    wait "$dead" 2>/dev/null || true
    mkdir -p "$RUN_DIR/.spawning"
    printf 'pid=%s\nstarted=%s\nprev_status=pending\nprev_host=\n' "$dead" "$(( $(date +%s) - 900 ))" > "$RUN_DIR/.spawning/WS01"
    awk -F'\t' -v OFS='\t' 'NR>1 && $1=="WS01" { $4="spawning" } { print }' "$RUN_DIR/roster.tsv" > "$RUN_DIR/r.tmp" && mv "$RUN_DIR/r.tmp" "$RUN_DIR/roster.tsv"
    capture_script 1 "Sonnet 5 with high effort | Claude Team"
    run_spawn WS01 --host fakehost
    assert_equals "0" "$FLEET_RC" "stale marker does not block the spawn"
    assert_contains "$FLEET_OUT" "WARN spawn: stale spawning marker for WS01 (pid $dead is gone)" "WARN names the dead pid"
    assert_equals "started" "$(roster_field WS01 status)" "spawn proceeded to started"
    assert_success "marker cleared" test ! -e "$RUN_DIR/.spawning/WS01"

    make_fixture stale-fail
    mkdir -p "$RUN_DIR/.spawning"
    printf 'pid=%s\nstarted=%s\nprev_status=pending\nprev_host=\n' "$dead" "$(( $(date +%s) - 900 ))" > "$RUN_DIR/.spawning/WS01"
    awk -F'\t' -v OFS='\t' 'NR>1 && $1=="WS01" { $4="spawning" } { print }' "$RUN_DIR/roster.tsv" > "$RUN_DIR/r.tmp" && mv "$RUN_DIR/r.tmp" "$RUN_DIR/roster.tsv"
    export STUB_SSH_RC=255
    run_spawn WS01 --host fakehost
    unset STUB_SSH_RC
    assert_equals "pending" "$(roster_field WS01 status)" "a failed spawn after a stale marker restores the marker's previous status, not spawning"
}

test_pane_wait_honours_seconds_over_slow_ssh() {
    log_step "GIVEN each pane read takes 1s (ssh round trip), THEN a 2s wait ends in seconds, not timeout*5 reads"
    # Live-run bug (MDTWII smoke test, 2026-10-13): spawn --host printed
    # "spawned" then hung for minutes. _fleet_pane_wait counted timeout*5
    # loop rounds; over ssh each round is a slow capture, so the 12s auth
    # check ran for 60+ ssh round trips.
    local d start elapsed
    d=$(mktemp -d "${TMPDIR:-/tmp}/panewait.XXXXXX")
    printf '#!/bin/sh\nsleep 1\necho nothing here\n' > "$d/tmux"; chmod +x "$d/tmux"
    start=$(date +%s)
    ( PATH="$d:$PATH"
      source "$SKILL_DIR/lib/common.sh"
      source "$SKILL_DIR/lib/cmd-spawn.sh"
      _fleet_pane_wait sock sess 'never-matches' 2 >/dev/null ) && :
    elapsed=$(( $(date +%s) - start ))
    rm -rf "$d"
    if [ "$elapsed" -le 5 ]; then
        log_success "slow-read wait ended in ${elapsed}s"; TEST_PASSED=$((TEST_PASSED + 1))
    else
        log_error "slow-read wait took ${elapsed}s for a 2s timeout"; TEST_FAILED=$((TEST_FAILED + 1))
    fi
    TEST_TOTAL=$((TEST_TOTAL + 1))
}


# settings_json LAUNCH_FILE -> the --settings JSON the launch script passes.
settings_json() {
    python3 -c 'import re,sys; m=re.search(r"--settings \x27([^\x27]*)\x27", open(sys.argv[1]).read()); print(m.group(1) if m else "")' "$1"
}

# json_q JSON EXPR -> python expression over d (the parsed JSON), printed.
json_q() {
    python3 -c 'import json,sys; d=json.loads(sys.argv[1]); v=eval(sys.argv[2]); print(json.dumps(v) if isinstance(v,(dict,list,bool)) or v is None else v)' "$1" "$2"
}

# set_diff JSON EXPR WANT_LINES -> "missing=[...] unexpected=[...]" for a list
# in the JSON against the wanted set (one item per line). Empty lists both
# ways means equal.
set_diff() {
    python3 -c '
import json,sys
d=json.loads(sys.argv[1]); have=set(eval(sys.argv[2])); want=set(l for l in sys.argv[3].splitlines() if l)
print("missing=%s unexpected=%s" % (sorted(want-have), sorted(have-want)))' "$1" "$2" "$3"
}

test_spawn_host_launch_passes_sandbox_settings() {
    log_step "PLAN_fleet-host-sandbox step 1: sandbox on, no escape, writes fenced, deny list as Edit rules"
    make_fixture sandbox
    capture_script 1 "Sonnet 5 with high effort | Claude Team"
    run_spawn WS01 --host fakehost
    assert_equals "0" "$FLEET_RC" "sandboxed host spawn exits 0"
    local ob="$SRV/fleet-runs/proj/fleet-main/WS01" wt="$SRV/fleet-repos/proj-wt/ws01" clone="$SRV/fleet-repos/proj"
    local js
    js=$(settings_json "$ob/.launch-ws01")
    assert_success "launch carries valid settings JSON" python3 -c 'import json,sys; json.loads(sys.argv[1])' "$js"
    assert_equals "true" "$(json_q "$js" 'd["sandbox"]["enabled"]')" "sandbox.enabled"
    assert_equals "false" "$(json_q "$js" 'd["sandbox"]["allowUnsandboxedCommands"]')" "no unsandboxed escape"
    assert_equals "true" "$(json_q "$js" 'd["sandbox"]["failIfUnavailable"]')" "a broken sandbox stops claude instead of running unconfined"
    assert_equals "false" "$(json_q "$js" 'd["sandbox"]["network"]["allowAllUnixSockets"]')" "unix sockets stay blocked (docker.sock)"
    assert_equals "missing=[] unexpected=[]" \
        "$(set_diff "$js" 'd["sandbox"]["filesystem"]["allowWrite"]' "$wt"$'\n'"$clone"$'\n'"$ob")" \
        "allowWrite is exactly worktree, fleet clone, outbox"
    local deny_want
    deny_want=$(printf '%s\n' \
        "$ob/brief.md" "$ob/claims.txt" "$ob/outbox.env" "$ob/remote-worker.sh" \
        "$clone/.git/config" "$clone/.git/hooks" "$wt/.git")
    assert_equals "missing=[]" \
        "$(set_diff "$js" 'd["sandbox"]["filesystem"]["denyWrite"]' "$deny_want" | sed 's/ unexpected=.*//')" \
        "denyWrite covers the outbox kit, the clone's git config and hooks, and the worktree's .git pointer"
    local rules_want
    rules_want=$(printf 'Edit(/%s)\n' \
        "$SRV/Projects/**" "$SRV/git/**" \
        "/tmp/gate-*" "/tmp/gate-*/**" "/tmp/cand-*" "/tmp/cand-*/**" "/tmp/mdtwii-*" "/tmp/mdtwii-*/**" \
        "$SRV/.cache/mdtwii-target-*" "$SRV/.cache/mdtwii-target-*/**" "$SRV/.cache/cfn-vps/**" \
        "$SRV/.claude/**" "$SRV/.ssh/**" "$SRV/.config/gh/**" "$SRV/opt/**" \
        "$ob/brief.md" "$ob/claims.txt" "$ob/outbox.env" "$ob/remote-worker.sh" \
        "$clone/.git/config" "$clone/.git/hooks/**" "$wt/.git")
    assert_equals "missing=[] unexpected=[]" \
        "$(set_diff "$js" 'd["permissions"]["deny"]' "$rules_want")" \
        "permissions.deny is exactly the server deny list as Edit rules"
    assert_equals "[]" "$(json_q "$js" '[r for r in d["permissions"]["deny"] if r.startswith("Read(")]')" "reads stay allowed"
    assert_success "settings JSON has no single quote (it is single-quoted in the launch)" \
        test -z "$(printf '%s' "$js" | tr -cd "'")"
    assert_contains "$(cat "$STUB_LOG")" "bwrap --ro-bind / / true" "preflight ran the bwrap smoke test on the host"
}

test_spawn_host_limits_knobs() {
    log_step "PLAN_fleet-host-sandbox step 2: FLEET_REMOTE_MEM / FLEET_REMOTE_CPU set the scope caps; bad values refused"
    make_fixture limits
    printf 'FLEET_REMOTE_MEM=8G\nFLEET_REMOTE_CPU=200%%\n' >> "$RUN_DIR/fleet.env"
    capture_script 1 "Sonnet 5 with high effort | Claude Team"
    run_spawn WS01 --host fakehost
    assert_equals "0" "$FLEET_RC" "spawn with limit knobs exits 0"
    assert_contains "$(cat "$SRV/fleet-runs/proj/fleet-main/WS01/.launch-ws01")" \
        "systemd-run --user --scope --quiet -p MemoryMax=8G -p CPUQuota=200% -- claude" "knob values reach the scope"

    make_fixture limits-bad
    printf 'FLEET_REMOTE_MEM=8G; rm -rf x\n' >> "$RUN_DIR/fleet.env"
    run_spawn WS01 --host fakehost
    assert_equals "64" "$FLEET_RC" "unsafe FLEET_REMOTE_MEM refused with 64"
    assert_contains "$FLEET_OUT" "FLEET_REMOTE_MEM" "refusal names the knob"
    assert_equals "0" "$(ssh_calls)" "no ssh call for a bad knob"
    assert_equals "pending" "$(roster_field WS01 status)" "row stays pending"
}

test_spawn_host_preflight_refuses_without_sandbox_or_scope() {
    log_step "PLAN_fleet-host-sandbox step 4: no bwrap, no socat or no systemd --user => 66 with the fix, nothing made"
    local which rc_var want
    for which in bwrap socat systemd; do
        make_fixture "nosbx-$which"
        case "$which" in
            bwrap)   export STUB_BWRAP_RC=1;   want="apparmor" ;;
            socat)   export STUB_SOCAT_RC=1;   want="apt install" ;;
            systemd) export STUB_SYSTEMD_RC=1; want="enable-linger" ;;
        esac
        capture_script 1 "Sonnet 5 with high effort | Claude Team"
        run_spawn WS01 --host fakehost
        unset STUB_BWRAP_RC STUB_SOCAT_RC STUB_SYSTEMD_RC
        assert_equals "66" "$FLEET_RC" "missing $which exits 66"
        assert_contains "$FLEET_OUT" "$want" "missing $which refusal gives the fix ($want)"
        assert_contains "$FLEET_OUT" "FLEET_REMOTE_UNSANDBOXED=1" "refusal names the override"
        assert_failure "nothing pushed when $which is missing" \
            git --git-dir="$SRV/git/proj.git" rev-parse --verify --quiet refs/heads/fleet-base/WS01
        assert_success "no worktree when $which is missing" test ! -e "$SRV/fleet-repos/proj-wt/ws01"
        assert_equals "pending" "$(roster_field WS01 status)" "row stays pending without $which"
    done
}

test_spawn_host_unsandboxed_override() {
    log_step "GIVEN FLEET_REMOTE_UNSANDBOXED=1 and no sandbox, THEN WARN, sandbox off, deny list kept"
    make_fixture unsbx
    export STUB_BWRAP_RC=1 FLEET_REMOTE_UNSANDBOXED=1
    capture_script 1 "Sonnet 5 with high effort | Claude Team"
    run_spawn WS01 --host fakehost
    unset STUB_BWRAP_RC FLEET_REMOTE_UNSANDBOXED
    assert_equals "0" "$FLEET_RC" "override spawns anyway"
    assert_contains "$FLEET_OUT" "WARN spawn: running WS01 on fakehost WITHOUT the Bash sandbox" "override warns loudly"
    local js
    js=$(settings_json "$SRV/fleet-runs/proj/fleet-main/WS01/.launch-ws01")
    assert_equals "false" "$(json_q "$js" 'd["sandbox"]["enabled"]')" "sandbox off under the override"
    assert_contains "$(json_q "$js" 'd["permissions"]["deny"]')" "Edit(/$SRV/git/**)" "deny list kept under the override"
    assert_contains "$(cat "$SRV/fleet-runs/proj/fleet-main/WS01/.launch-ws01")" "exec systemd-run" "scope caps kept when systemd works"

    make_fixture unsbx-nosystemd
    export STUB_SYSTEMD_RC=1 FLEET_REMOTE_UNSANDBOXED=1
    capture_script 1 "Sonnet 5 with high effort | Claude Team"
    run_spawn WS01 --host fakehost
    unset STUB_SYSTEMD_RC FLEET_REMOTE_UNSANDBOXED
    assert_equals "0" "$FLEET_RC" "override spawns without systemd --user"
    assert_contains "$FLEET_OUT" "without CPU/memory caps" "missing caps warned about"
    local lb
    lb=$(cat "$SRV/fleet-runs/proj/fleet-main/WS01/.launch-ws01")
    assert_not_contains "$lb" "systemd-run" "no scope wrapper when systemd --user is unusable"
    assert_contains "$lb" "exec claude --model sonnet" "engine execs directly"
    assert_equals "true" "$(json_q "$(settings_json "$SRV/fleet-runs/proj/fleet-main/WS01/.launch-ws01")" 'd["sandbox"]["enabled"]')" "sandbox still on when only systemd is missing"
}

test_spawn_host_excludes_sandbox_placeholders() {
    log_step "Sandbox placeholder files: clone exclude gets anchored protected names, idempotently"
    make_fixture excl
    capture_script 1 "Sonnet 5 with high effort | Claude Team"
    run_spawn WS01 --host fakehost
    assert_equals "0" "$FLEET_RC" "spawn exits 0"
    local ex="$SRV/fleet-repos/proj/.git/info/exclude" n
    for n in /.bashrc /.zshrc /.gitconfig /.mcp.json /.ripgreprc /.vscode /.idea /.claude/agents /.claude/commands /.claude/hooks /.claude/launch.json /.claude/loop.md /.claude/output-styles /.claude/routines /.claude/scheduled_tasks.json /.claude/settings.json /.claude/settings.local.json /.claude/workflows; do
        assert_success "exclude has $n" grep -qxF -- "$n" "$ex"
    done
    assert_failure "no broad /.claude/* exclude" grep -qxF -- '/.claude/*' "$ex"
    assert_failure "no trailing-slash /.vscode/ left" grep -qxF -- '/.vscode/' "$ex"
    local wt="$SRV/fleet-repos/proj-wt/ws01"
    touch "$wt/.bashrc" "$wt/.vscode" "$wt/.idea"; mkdir -p "$wt/.claude"
    touch "$wt/.claude/settings.json" "$wt/.claude/hooks" "$wt/.claude/commands" "$wt/.claude/launch.json" "$wt/.claude/workflows"
    assert_equals "" "$(git -C "$wt" status --porcelain)" "placeholder EMPTY FILES do not dirty the worktree"
    # old trailing-slash variants from the previous release are removed on respawn
    printf '/.vscode/\n/.idea/\n/.claude/commands/\n/.claude/agents/\n' >> "$ex"
    # a respawn (new generation, same clone) must not duplicate lines
    capture_script 1 "Sonnet 5 with high effort | Claude Team"
    run_spawn WS01 --host fakehost
    assert_equals "1" "$(grep -cxF -- '/.bashrc' "$ex")" "no duplicate /.bashrc after respawn"
    assert_equals "1" "$(grep -cxF -- '/.vscode' "$ex")" "no duplicate /.vscode after respawn"
    assert_equals "0" "$(grep -cE '^/.*/$' "$ex")" "old trailing-slash variants removed on respawn"
}

test_spawn_host_prints_preflight_ok_line() {
    log_step "Preflight visibility: one ok line with the limits"
    make_fixture pfline
    capture_script 1 "Sonnet 5 with high effort | Claude Team"
    run_spawn WS01 --host fakehost
    assert_contains "$FLEET_OUT" "preflight fakehost: sandbox ok, limits MemoryMax=12G CPUQuota=400%" "ok line printed"
}

test_spawn_host_survives_clone_config_lock() {
    # MDTWII WS365: the first spawn failed with "unable to write upstream branch
    # configuration" because another lane held the shared clone's config lock at
    # that moment. Lanes never push, so the new branch must not need a config
    # write at all.
    log_step "Spawn works while another lane holds the clone's .git/config lock"
    make_fixture cfglock
    capture_script 1 "Sonnet 5 with high effort | Claude Team"
    : > "$SRV/fleet-repos/proj/.git/config.lock"
    run_spawn WS01 --host fakehost
    rm -f "$SRV/fleet-repos/proj/.git/config.lock"
    assert_equals "0" "$FLEET_RC" "spawn exits 0 despite the config lock"
    assert_dir_exists "$SRV/fleet-repos/proj-wt/ws01" "remote worktree created"
    assert_equals "" "$(git -C "$SRV/fleet-repos/proj" config --get branch.fleet/WS01.remote || true)" "no upstream written for the lane branch"
}

run_all_tests() {
    TEST_LOG="${TMPDIR:-/tmp}/cfn-fleet-spawn-host-$(date +%s).log"
    export TEST_LOG
    export TEST_TOTAL=0 TEST_PASSED=0 TEST_FAILED=0
    annotate "Test Suite: cfn-fleet-spawn-host"

    test_spawn_host_refuses_glm_and_codex
    test_spawn_host_dry_run_plan
    test_spawn_host_preflight_refuses_missing_clone_github_remote_and_low_disk
    test_spawn_host_unreachable_stays_pending
    test_spawn_host_refuses_row_without_claims
    test_spawn_host_ssh_sequence
    test_spawn_host_new_generation_each_spawn
    test_spawn_host_banner_timeout_cleans_remote_worktree
    test_spawn_host_scp_failure_cleans_remote_worktree
    test_spawn_host_git_remote_knob
    test_spawn_host_refuses_live_session_name
    test_spawn_host_roster_host_column_routes_respawn
    test_spawn_host_warns_on_cfn_commit_drift
    test_spawn_host_row_is_spawning_while_launch_runs
    test_spawn_host_failure_restores_status_and_host
    test_spawn_refuses_second_spawn_while_first_alive
    test_spawn_clears_stale_marker_with_warning
    test_pane_wait_honours_seconds_over_slow_ssh
    test_spawn_host_launch_passes_sandbox_settings
    test_spawn_host_limits_knobs
    test_spawn_host_preflight_refuses_without_sandbox_or_scope
    test_spawn_host_unsandboxed_override
    test_spawn_host_excludes_sandbox_placeholders
    test_spawn_host_prints_preflight_ok_line
    test_spawn_host_survives_clone_config_lock

    print_test_summary
}

run_all_tests
