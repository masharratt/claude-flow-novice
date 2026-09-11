#!/usr/bin/env bash
# tests/test-cfn-fleet-spawn-watch.sh
# Phase CLI :: cfn-fleet agent C contract tests — spawn/land/handoff/db/watch
# (SPEC-cfn-fleet.md, section "C — spawn/land/handoff/db/watch"). Priority 1.
# Real-run origin: spares = compaction-restart sessions; db = junk rehearsal-DB
# class; watch replaces the hand-rolled 16h master monitor (run e59a7826).
# Engine rewrite origin: per-workstream engines (planning/HANDOFF_cfn-fleet-
# engines.md, handoff test cases 2,3,5,6,7,8,9 live here; cases 1,4,10 belong
# to tests/test-cfn-fleet-engines.sh).
#
# Engine spawn tests use NO real tmux server and NO real engines: stub tmux/
# claude/codex binaries on a fixture PATH log their argv to files, and
# capture-pane output is scripted per test (Nth capture call replays N.txt).
# db lifecycle test skips unless `docker info` works and postgres:16-alpine
# is present. watch exercised via --once against hand-built fixture rosters.
# Worktree paths exercised with a real git worktree on a fixture repo.
#
# Run dirs are hand-built per the SPEC layout (roster.tsv, fleet.env, briefs/,
# handoffs/, .roster.lock) because `fleet init` belongs to agent A. lib/common.sh
# is sourced from the skill if the parallel agent has landed it; otherwise a
# SPEC-signature stub is generated so this suite runs standalone. Same pattern
# for lib/engines.sh (agent D): real file once landed, handoff-table stub until
# then. TDD note: tests were written first and confirmed failing before the cmd
# files existed.

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

SKILL_DIR="$PROJECT_ROOT/.claude/skills/cfn-fleet"

TMP_DIR=$(mktemp -d -t cfn-fleet-agentc.XXXXXX)
DOCKER_CONTAINERS=()
cleanup() {
    local c
    for c in "${DOCKER_CONTAINERS[@]}"; do
        [[ -n $c ]] && docker rm -f "$c" >/dev/null 2>&1 || true
    done
    cleanup_temp_dir "$TMP_DIR"
}
trap cleanup EXIT

# ----------------------------------------------------------------------------
# common.sh resolution: real file once agent A lands it, SPEC-signature stub
# until then.
# ----------------------------------------------------------------------------
if [[ -f $SKILL_DIR/lib/common.sh ]]; then
    COMMON_SH="$SKILL_DIR/lib/common.sh"
else
    COMMON_SH="$TMP_DIR/stub-common.sh"
    cat > "$COMMON_SH" <<'STUB'
# SPEC-signature stub (lib/common.sh contract in SPEC-cfn-fleet.md).
# Replaced automatically by the real file once it exists.
fleet_run_dir() {
    [[ -n ${FLEET_RUN_DIR:-} ]] || { echo "no fleet run dir (fleet init first)" >&2; exit 64; }
    echo "$FLEET_RUN_DIR"
}
fleet_env_get() {
    local key="$1" val=""
    if [[ -f $FLEET_RUN_DIR/fleet.env ]]; then
        val=$(grep -E "^${key}=" "$FLEET_RUN_DIR/fleet.env" | tail -1 | cut -d= -f2-)
    fi
    case "$key" in
        FLEET_WORKTREE) echo "${val:-off}" ;;
        FLEET_DB)       echo "${val:-none}" ;;
        *)              echo "$val" ;;
    esac
}
fleet_roster_file() { echo "$FLEET_RUN_DIR/roster.tsv"; }
_roster_field_idx() {
    head -1 "$FLEET_RUN_DIR/roster.tsv" | tr '\t' '\037' | tr '\037' '\n' | grep -nx -F "$1" | cut -d: -f1
}
roster_exists() {
    awk -F'\t' -v ws="$1" 'NR>1 && $1==ws { f=1 } END { exit f ? 0 : 1 }' "$FLEET_RUN_DIR/roster.tsv"
}
roster_get() {
    local idx row
    idx=$(_roster_field_idx "$2")
    [[ -n $idx ]] || { echo "roster: unknown field '$2'" >&2; exit 65; }
    row=$(awk -F'\t' -v ws="$1" 'NR>1 && $1==ws { print; exit }' "$FLEET_RUN_DIR/roster.tsv")
    [[ -n $row ]] || { echo "roster: unknown workstream '$1'" >&2; exit 65; }
    printf '%s' "$row" | cut -f"$idx"
}
roster_set() {
    local ws="$1" field="$2" val="$3" idx
    idx=$(_roster_field_idx "$field")
    [[ -n $idx ]] || { echo "roster: unknown field '$field'" >&2; exit 65; }
    {
        flock 9
        awk -F'\t' -v OFS='\t' -v ws="$ws" -v idx="$idx" -v val="$val" '
            NR == 1 { print; next }
            $1 == ws { $idx = val }
            { print }' "$FLEET_RUN_DIR/roster.tsv" > "$FLEET_RUN_DIR/roster.tsv.tmp" \
            && mv "$FLEET_RUN_DIR/roster.tsv.tmp" "$FLEET_RUN_DIR/roster.tsv"
    } 9>"$FLEET_RUN_DIR/.roster.lock"
}
roster_rows() { tail -n +2 "$FLEET_RUN_DIR/roster.tsv"; }
fleet_die() { local code="$1"; shift; echo "$*" >&2; exit "$code"; }
STUB
fi

# ----------------------------------------------------------------------------
# engines.sh resolution: agent D's real file once landed, handoff-table stub
# until then. The stub always exists at $TMP_DIR/stub-engines.sh so tests that
# need a mutated registry (codex without its OPENAI_API_KEY unset) can patch a
# copy regardless of which implementation is in use.
# ----------------------------------------------------------------------------
cat > "$TMP_DIR/stub-engines.sh" <<'STUB'
# SPEC-signature stub (engines contract, planning/HANDOFF_cfn-fleet-engines.md
# section "Design to implement 1"). Replaced by the real lib/engines.sh once
# agent D lands it; the registry values are the handoff table verbatim.
fleet_engine_list() { printf '%s\n' claude-sub glm codex; }

_fleet_engine_field() { # FIELD ENGINE
    case "$2" in
    claude-sub)
        case "$1" in
            bin)          printf '%s' 'claude' ;;
            args)         printf '%s' '--model sonnet --permission-mode bypassPermissions' ;;
            set)          : ;;
            unset)        printf '%s' 'ANTHROPIC_AUTH_TOKEN,ANTHROPIC_API_KEY,ANTHROPIC_BASE_URL,ANTHROPIC_DEFAULT_SONNET_MODEL,ANTHROPIC_DEFAULT_OPUS_MODEL,ANTHROPIC_DEFAULT_HAIKU_MODEL,ANTHROPIC_DEFAULT_FABLE_MODEL' ;;
            trust_keys)   printf '%s' 'Down,Enter' ;;
            banner_regex) printf '%s' 'Claude Team|Claude Max|Claude Pro' ;;
        esac ;;
    glm)
        case "$1" in
            bin)          printf '%s' 'claude' ;;
            args)         printf '%s' '--model glm-5.3-flash --permission-mode bypassPermissions' ;;
            set)          printf '%s' 'ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic,ANTHROPIC_AUTH_TOKEN=$FLEET_ZAI_TOKEN,CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT=1' ;;
            unset)        printf '%s' 'ANTHROPIC_API_KEY,ANTHROPIC_DEFAULT_SONNET_MODEL,ANTHROPIC_DEFAULT_OPUS_MODEL,ANTHROPIC_DEFAULT_HAIKU_MODEL,ANTHROPIC_DEFAULT_FABLE_MODEL' ;;
            trust_keys)   printf '%s' 'Down,Enter' ;;
            banner_regex) printf '%s' 'glm-5.3-flash' ;;
        esac ;;
    codex)
        case "$1" in
            bin)          printf '%s' 'codex' ;;
            args)         printf '%s' '--sandbox workspace-write --ask-for-approval never' ;;
            set)          : ;;
            unset)        printf '%s\n' 'OPENAI_API_KEY' ;;
            trust_keys)   printf '%s' 'Enter' ;;
            banner_regex) printf '%s' 'provider: openai|OpenAI Codex' ;;
        esac ;;
    esac
}
fleet_engine_get() { _fleet_engine_field "$1" "$2"; }

fleet_engine_resolve_set() { # ENGINE -> one NAME=VALUE per line; 66 on missing $SOURCE_VAR
    local raw item name src var val
    raw=$(_fleet_engine_field set "$1")
    [ -n "$raw" ] || return 0
    local IFS=','
    for item in $raw; do
        [ -n "$item" ] || continue
        name="${item%%=*}"
        src="${item#*=}"
        if [[ $src == \$* ]]; then
            var="${src#\$}"
            val="${!var:-}"
            if [[ -z $val ]]; then
                echo "fleet: engine '$1' needs \$$var set in the master shell (export $var=<value> before spawn)" >&2
                exit 66
            fi
        else
            val="$src"
        fi
        printf '%s=%s\n' "$name" "$val"
    done
}

fleet_engine_default() { # FLEET_DEFAULT_ENGINE (env > fleet.env) > claude-sub
    local d="${FLEET_DEFAULT_ENGINE:-}"
    [ -n "$d" ] || d=$(fleet_env_get FLEET_DEFAULT_ENGINE)
    printf '%s\n' "${d:-claude-sub}"
}

fleet_ws_engine() { # WS -> roster engine column, else fleet_engine_default
    local eng=""
    eng=$(roster_get "$1" engine 2>/dev/null) || eng=""
    [ -n "$eng" ] || eng=$(fleet_engine_default)
    printf '%s\n' "$eng"
}
STUB
if [[ -f $SKILL_DIR/lib/engines.sh ]]; then
    ENGINES_SH="$SKILL_DIR/lib/engines.sh"
else
    ENGINES_SH="$TMP_DIR/stub-engines.sh"
fi

# ----------------------------------------------------------------------------
# Stub engine binaries: if spawn ever EXECUTES an engine locally instead of
# send-keys-ing the pane command into tmux, these log the attempt (argv + the
# credential env they would have seen) and exit. Engine tests also assert the
# stubs were never invoked. The tmux stub records every invocation and scripts
# capture-pane output from $FLEET_CAPTURE_DIR (Nth call replays N.txt; calls
# past the last scripted file keep replaying the highest one).
# ----------------------------------------------------------------------------
mkdir -p "$TMP_DIR/bin"
cat > "$TMP_DIR/bin/tmux" <<'STUB'
#!/usr/bin/env bash
# test stub for tmux: log argv, script capture-pane / show-environment
set -u
printf 'tmux %s\n' "$*" >> "${FLEET_TMUX_LOG:-/dev/null}"
cmd=""
while [ $# -gt 0 ]; do
    case "$1" in
        -L|-S|-f|-c) shift 2 ;;
        -*) shift ;;
        *) cmd="$1"; break ;;
    esac
done
case "$cmd" in
    capture-pane)
        d="${FLEET_CAPTURE_DIR:-}"
        if [[ -n $d && -d $d ]]; then
            cf="$d/.count"
            n=$(( $(cat "$cf" 2>/dev/null || printf 0) + 1 ))
            printf '%s' "$n" > "$cf"
            f="$d/$n.txt"
            if [[ ! -f $f ]]; then
                f=$(ls "$d" 2>/dev/null | grep -E '^[0-9]+\.txt$' | sort -n | tail -1)
                [[ -n $f ]] && f="$d/$f"
            fi
            [[ -n $f && -f $f ]] && cat "$f"
        fi
        ;;
    show-environment)
        f="${FLEET_TMUX_SERVER_ENV_FILE:-}"
        [[ -n $f && -f $f ]] && cat "$f"
        ;;
    has-session)
        # Scripted by watch-pane tests: FLEET_TMUX_HASSESSION_RC (default 0 =
        # session alive) and FLEET_TMUX_HASSESSION_STDERR (mirrors real tmux's
        # "can't find session" vs "no server running" distinction).
        [[ -n ${FLEET_TMUX_HASSESSION_STDERR:-} ]] && printf '%s\n' "$FLEET_TMUX_HASSESSION_STDERR" >&2
        exit "${FLEET_TMUX_HASSESSION_RC:-0}"
        ;;
esac
exit 0
STUB
cat > "$TMP_DIR/bin/claude" <<'STUB'
#!/usr/bin/env bash
# test stub: claude must be reached via tmux send-keys, never executed here
printf 'ENGINE-STUB claude %s\n' "$*" >> "${FLEET_ENGINE_LOG:-/dev/null}"
env | grep -E '^(ANTHROPIC|CLAUDE_CODE_)' >> "${FLEET_ENGINE_LOG:-/dev/null}" || true
exit 0
STUB
cat > "$TMP_DIR/bin/codex" <<'STUB'
#!/usr/bin/env bash
# test stub: codex must be reached via tmux send-keys, never executed here
printf 'ENGINE-STUB codex %s\n' "$*" >> "${FLEET_ENGINE_LOG:-/dev/null}"
env | grep -E '^OPENAI_' >> "${FLEET_ENGINE_LOG:-/dev/null}" || true
exit 0
STUB
chmod +x "$TMP_DIR/bin/tmux" "$TMP_DIR/bin/claude" "$TMP_DIR/bin/codex"

# ----------------------------------------------------------------------------
# Invocation: mirrors the router contract — source common.sh, then the cmd
# file, then call main with the subcommand's args. Runs in a command
# substitution subshell so fleet_die's exit is captured, not fatal.
# ----------------------------------------------------------------------------
FLEET_OUT=""
FLEET_RC=0
PROJ=""
RUN_DIR=""
TMUX_LOG="$TMP_DIR/tmux-calls.log"
ENGINE_LOG="$TMP_DIR/engine-stub.log"
CAPTURE_DIR=""

run_fleet() { # $1 = cmd file stem, rest = args (subcommand already stripped)
    local sub="$1"; shift
    local out rc=0
    out=$(
        {
            cd "$PROJ"
            export FLEET_RUN_DIR="$RUN_DIR"
            export PATH="$TMP_DIR/bin:$PATH"
            export FLEET_TMUX_LOG="$TMUX_LOG" FLEET_ENGINE_LOG="$ENGINE_LOG"
            if [[ -n ${FLEET_TEST_HOME:-} ]]; then
                export HOME="$FLEET_TEST_HOME"
            fi
            # shellcheck disable=SC1090
            source "$COMMON_SH"
            local engines="${FLEET_TEST_ENGINES_SH:-$ENGINES_SH}"
            if [[ -n $engines && -f $engines ]]; then
                # shellcheck disable=SC1090
                source "$engines"
            fi
            # shellcheck disable=SC1090
            source "$SKILL_DIR/lib/cmd-$sub.sh"
            main "$@"
        } 2>&1
    ) || rc=$?
    FLEET_OUT=$out
    FLEET_RC=$rc
}

# ----------------------------------------------------------------------------
# Fixtures: hand-built project repo + fleet run dir per SPEC layout.
# ----------------------------------------------------------------------------
make_project() { # $1 = slug [$2 = legacy]: sets PROJ and RUN_DIR. Legacy keeps
    # the pre-engine 10-column header; default rosters carry the engine column
    # appended last per HANDOFF_cfn-fleet-engines.md section 2.
    local slug="$1" legacy="${2:-}"
    PROJ="$TMP_DIR/proj-$slug"
    RUN_DIR="$PROJ/planning/fleet-$slug"
    mkdir -p "$PROJ/src" "$PROJ/docs" "$RUN_DIR/briefs" "$RUN_DIR/handoffs"
    git -C "$PROJ" init -q -b main
    git -C "$PROJ" config user.email fleet@test.local
    git -C "$PROJ" config user.name fleet
    echo a > "$PROJ/src/a.md"
    echo r > "$PROJ/README.md"
    git -C "$PROJ" add -A
    git -C "$PROJ" commit -qm "init $slug"
    if [[ -n $legacy ]]; then
        printf 'ws_id\tname\ttask\tstatus\tclaims\tlanded_sha\tmigration_num\tscratch_db\theartbeat\tnotes\n' > "$RUN_DIR/roster.tsv"
    else
        printf 'ws_id\tname\ttask\tstatus\tclaims\tlanded_sha\tmigration_num\tscratch_db\theartbeat\tnotes\tengine\n' > "$RUN_DIR/roster.tsv"
    fi
    printf 'FLEET_WORKTREE=off\nFLEET_DB=none\n' > "$RUN_DIR/fleet.env"
    touch "$RUN_DIR/.roster.lock"
}

add_ws() { # ws name task status claims [sha] [mig] [db] [hb] [notes] [engine]
    local ws="$1" name="$2" task="$3" status="$4" claims="$5"
    local sha="${6:-}" mig="${7:-}" db="${8:-}" hb="${9:-0}" notes="${10:-}" engine="${11:-}"
    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
        "$ws" "$name" "$task" "$status" "$claims" "$sha" "$mig" "$db" "$hb" "$notes" "$engine" \
        >> "$RUN_DIR/roster.tsv"
}

fixture_set() { # ws field value — direct fixture edit (bypasses roster_set)
    awk -F'\t' -v OFS='\t' -v ws="$1" -v field="$2" -v val="$3" '
        NR == 1 { for (i = 1; i <= NF; i++) if ($i == field) idx = i; print; next }
        $1 == ws { $idx = val }
        { print }' "$RUN_DIR/roster.tsv" > "$RUN_DIR/roster.tsv.new"
    mv "$RUN_DIR/roster.tsv.new" "$RUN_DIR/roster.tsv"
}

roster_field() { # ws field -> value (fixture read)
    awk -F'\t' -v ws="$1" -v field="$2" '
        NR == 1 { for (i = 1; i <= NF; i++) if ($i == field) idx = i; next }
        $1 == ws { print $idx; exit }' "$RUN_DIR/roster.tsv"
}

# --- engine-spawn fixtures (HANDOFF_cfn-fleet-engines.md cases 2,3,5-9) -----

make_engine_project() { # $1 = slug — fast polls, scripted capture, clean
    # fixture HOME (so the codex auth.json check never reads the real one)
    local slug="$1"
    make_project "$slug"
    printf 'codex=true\n' > "$PROJ/CLAUDE.md"
    printf 'FLEET_TRUST_TIMEOUT=1\nFLEET_BANNER_TIMEOUT=1\n' >> "$RUN_DIR/fleet.env"
    : > "$TMUX_LOG"
    : > "$ENGINE_LOG"
    CAPTURE_DIR="$TMP_DIR/capture-$slug"
    rm -rf "$CAPTURE_DIR"
    mkdir -p "$CAPTURE_DIR"
    : > "$CAPTURE_DIR/server.env"
    mkdir -p "$TMP_DIR/home/.codex"
    printf '{"auth_mode":"chatgpt","OPENAI_API_KEY":null}\n' > "$TMP_DIR/home/.codex/auth.json"
    export FLEET_TEST_HOME="$TMP_DIR/home"
    export FLEET_CAPTURE_DIR="$CAPTURE_DIR"
    export FLEET_TMUX_SERVER_ENV_FILE="$CAPTURE_DIR/server.env"
}

capture_script() { # file-number content — script the Nth capture-pane replay
    printf '%s\n' "$2" > "$CAPTURE_DIR/$1.txt"
}

tmux_calls() { # [pattern] — recorded stub-tmux invocation lines
    grep -a "$1" "$TMUX_LOG" || true
}

_wt_fixture() { # slug — project in worktree mode with a spawned worker that has one commit
    local slug="$1"
    make_project "$slug"
    printf 'FLEET_WORKTREE=on\nFLEET_DB=none\n' > "$RUN_DIR/fleet.env"
    echo "Isolated brief" > "$RUN_DIR/briefs/WS01.md"
    add_ws WS01 ws01 "Isolated work" pending "src/a.md"
    run_fleet spawn WS01 --no-tmux
    echo "worker output" > "$PROJ/.claude/worktrees/ws01/feature.md"
    git -C "$PROJ/.claude/worktrees/ws01" add -A
    git -C "$PROJ/.claude/worktrees/ws01" commit -qm "worker work"
}

assert_dir_absent() {
    TEST_TOTAL=$((TEST_TOTAL + 1))
    local path="$1"
    local name="${2:-directory absent: $path}"
    if [[ ! -d $path ]]; then
        TEST_PASSED=$((TEST_PASSED + 1))
        log_success "PASS: $name"
    else
        TEST_FAILED=$((TEST_FAILED + 1))
        log_error "FAIL: $name"
        log_error "Directory unexpectedly present: $path"
        return 1
    fi
}

DOCKER_OK=0
if command -v docker >/dev/null 2>&1 && timeout 15 docker info >/dev/null 2>&1; then
    DOCKER_OK=1
fi

# ============================================================================
# spawn
# ============================================================================
test_spawn_missing_brief_dies_65() {
    log_step "GIVEN a roster row with no brief file"
    make_project brief-missing
    add_ws WS01 ws01 "Do a thing" pending "src/a.md"

    # WHEN spawn runs
    run_fleet spawn WS01

    # THEN it refuses with the data-error code
    assert_equals "65" "$FLEET_RC" "spawn without brief exits 65"
    assert_contains "$FLEET_OUT" "brief" "error names the missing brief"
}

test_spawn_dry_run_main_mode() {
    log_step "GIVEN a brief and pending row, WHEN spawn --dry-run in main mode"
    make_project spawn-dry
    echo "Do the login form" > "$RUN_DIR/briefs/WS01.md"
    add_ws WS01 ws01 "Build login form" pending "src/a.md"
    run_fleet spawn WS01 --dry-run

    assert_equals "0" "$FLEET_RC" "dry-run exits 0"
    assert_contains "$FLEET_OUT" "PLAN spawn WS01 name=ws01" "plan names the session"
    assert_contains "$FLEET_OUT" "cwd=$PROJ" "main-mode session cwd is repo root"
    assert_contains "$FLEET_OUT" "brief=$RUN_DIR/briefs/WS01.md" "plan points at the brief"
    assert_dir_absent "$PROJ/.claude/worktrees/ws01" "dry-run creates no worktree"
    assert_equals "pending" "$(roster_field WS01 status)" "dry-run leaves status untouched"
    assert_equals "0" "$(roster_field WS01 heartbeat)" "dry-run leaves heartbeat untouched"
}

test_spawn_dry_run_worktree_mode() {
    log_step "GIVEN FLEET_WORKTREE=on, WHEN spawn --dry-run"
    make_project spawn-dry-wt
    printf 'FLEET_WORKTREE=on\nFLEET_DB=none\n' > "$RUN_DIR/fleet.env"
    echo "Worktree brief" > "$RUN_DIR/briefs/WS01.md"
    add_ws WS01 ws01 "Isolated work" pending "src/a.md"
    run_fleet spawn WS01 --dry-run

    assert_equals "0" "$FLEET_RC" "worktree dry-run exits 0"
    assert_contains "$FLEET_OUT" "branch=fleet/WS01" "plan names the worktree branch"
    assert_contains "$FLEET_OUT" "path=$PROJ/.claude/worktrees/ws01" "plan names the worktree path"
    assert_contains "$FLEET_OUT" "cwd=$PROJ/.claude/worktrees/ws01" "session cwd planned as the worktree"
    assert_dir_absent "$PROJ/.claude/worktrees/ws01" "dry-run did not create the worktree"
}

test_spawn_no_tmux_main_marks_started() {
    log_step "GIVEN main mode, WHEN spawn --no-tmux"
    make_project spawn-main
    echo "Main brief" > "$RUN_DIR/briefs/WS01.md"
    add_ws WS01 ws01 "In-place work" pending "src/a.md"
    run_fleet spawn WS01 --no-tmux

    assert_equals "0" "$FLEET_RC" "no-tmux spawn exits 0"
    # Dedicated socket per run (handoff decision): every tmux line carries -L
    # fleet-<slug>, so the launch command substring now sits behind the -L flag.
    assert_contains "$FLEET_OUT" "-L fleet-spawn-main new-session -d -s ws01 -c $PROJ" "echoes copy-paste launch command on the run's socket"
    assert_contains "$FLEET_OUT" "send-keys -t ws01" "echoes brief delivery command"
    assert_equals "started" "$(roster_field WS01 status)" "status set to started"
    local hb
    hb=$(roster_field WS01 heartbeat)
    assert_success "heartbeat stamped to now" test "$hb" -gt 0
}

test_spawn_spares_named_without_brief() {
    log_step "GIVEN --spares 2, WHEN spawn --no-tmux"
    make_project spawn-xtras
    echo "Spare brief" > "$RUN_DIR/briefs/WS01.md"
    add_ws WS01 ws01 "Work" pending "src/a.md"
    run_fleet spawn WS01 --spares 2 --no-tmux

    assert_equals "0" "$FLEET_RC" "spawn with spares exits 0"
    local spare_out
    spare_out=$(grep -F -- '-spare' <<<"$FLEET_OUT" || true)
    assert_contains "$spare_out" "ws01-spare1" "first spare named <name>-spare1"
    assert_contains "$spare_out" "ws01-spare2" "second spare named <name>-spare2"
    # Spares are launched to the banner (pane command via send-keys) but never
    # get the thin prompt; the prompt is the only line carrying the brief path.
    assert_not_contains "$spare_out" "and start" "spares get no thin prompt (no brief text)"
}

test_spawn_worktree_no_tmux_creates_worktree() {
    log_step "GIVEN FLEET_WORKTREE=on, WHEN spawn --no-tmux (real git)"
    make_project spawn-wt
    printf 'FLEET_WORKTREE=on\nFLEET_DB=none\n' > "$RUN_DIR/fleet.env"
    echo "Worktree brief" > "$RUN_DIR/briefs/WS01.md"
    add_ws WS01 ws01 "Isolated work" pending "src/a.md"
    run_fleet spawn WS01 --no-tmux

    assert_equals "0" "$FLEET_RC" "worktree spawn exits 0"
    assert_dir_exists "$PROJ/.claude/worktrees/ws01" "worktree created at .claude/worktrees/<ws-lower>"
    assert_success "branch fleet/WS01 exists" git -C "$PROJ" rev-parse --verify --quiet refs/heads/fleet/WS01
    assert_contains "$FLEET_OUT" "-L fleet-spawn-wt new-session -d -s ws01 -c $PROJ/.claude/worktrees/ws01" "session cwd is the worktree"
    assert_equals "started" "$(roster_field WS01 status)" "status set to started"
}

# ============================================================================
# spawn :: engines (planning/HANDOFF_cfn-fleet-engines.md, cases 2,3,5,6,7,8,9)
# ============================================================================

test_spawn_dry_run_engine_plan() {
    # Case 2: PLAN engine carries set/unset NAME lists, never values.
    log_step "GIVEN each engine, WHEN spawn --dry-run"
    make_engine_project dry-eng
    echo "b" > "$RUN_DIR/briefs/WS01.md"
    add_ws WS01 ws01 "Work" pending "src/a.md"

    run_fleet spawn WS01 --dry-run --engine glm
    assert_equals "0" "$FLEET_RC" "dry-run with --engine glm exits 0"
    assert_contains "$FLEET_OUT" "PLAN engine WS01 engine=glm bin=claude " "engine plan names ws and bin"
    assert_contains "$FLEET_OUT" \
        "set=ANTHROPIC_BASE_URL,ANTHROPIC_AUTH_TOKEN,CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT unset=" \
        "glm set list is NAMES only"
    assert_contains "$FLEET_OUT" \
        "unset=ANTHROPIC_API_KEY,ANTHROPIC_DEFAULT_SONNET_MODEL,ANTHROPIC_DEFAULT_OPUS_MODEL,ANTHROPIC_DEFAULT_HAIKU_MODEL,ANTHROPIC_DEFAULT_FABLE_MODEL" \
        "glm unset list is NAMES only"
    assert_not_contains "$FLEET_OUT" "api.z.ai" "no endpoint value on the plan"
    assert_not_contains "$FLEET_OUT" "FLEET_ZAI_TOKEN" "no source var name or value on the plan"
    assert_not_contains "$FLEET_OUT" "ENFORCEMENT=1" "no set value on the plan"
    assert_contains "$FLEET_OUT" "PLAN spawn WS01 name=ws01" "existing PLAN spawn line kept"

    run_fleet spawn WS01 --dry-run --engine claude-sub
    assert_equals "0" "$FLEET_RC" "dry-run with --engine claude-sub exits 0"
    assert_contains "$FLEET_OUT" \
        "PLAN engine WS01 engine=claude-sub bin=claude set= unset=ANTHROPIC_AUTH_TOKEN,ANTHROPIC_API_KEY,ANTHROPIC_BASE_URL,ANTHROPIC_DEFAULT_SONNET_MODEL,ANTHROPIC_DEFAULT_OPUS_MODEL,ANTHROPIC_DEFAULT_HAIKU_MODEL,ANTHROPIC_DEFAULT_FABLE_MODEL" \
        "claude-sub plan: nothing set, every relay var unset"

    run_fleet spawn WS01 --dry-run --engine codex
    assert_equals "0" "$FLEET_RC" "dry-run with --engine codex exits 0"
    assert_contains "$FLEET_OUT" "PLAN engine WS01 engine=codex bin=codex set= unset=OPENAI_API_KEY" \
        "codex plan unsets the API key"

    # Precedence: roster column > FLEET_DEFAULT_ENGINE when no --engine flag.
    fixture_set WS01 engine codex
    run_fleet spawn WS01 --dry-run
    assert_contains "$FLEET_OUT" "PLAN engine WS01 engine=codex" "roster engine column drives the plan"
    fixture_set WS01 engine ""
    printf 'FLEET_DEFAULT_ENGINE=glm\n' >> "$RUN_DIR/fleet.env"
    run_fleet spawn WS01 --dry-run
    assert_contains "$FLEET_OUT" "PLAN engine WS01 engine=glm" "FLEET_DEFAULT_ENGINE fills the empty column"

    run_fleet spawn WS01 --engine nope --dry-run
    assert_equals "65" "$FLEET_RC" "unknown engine exits 65"
    assert_contains "$FLEET_OUT" "nope" "refusal names the engine"
}

test_spawn_roster_without_engine_column_uses_default() {
    # Pre-engine rosters (10 columns) must read as claude-sub, not crash.
    log_step "GIVEN a legacy roster without the engine column, WHEN spawn --dry-run"
    make_project legacy-dry 1
    echo "b" > "$RUN_DIR/briefs/WS01.md"
    printf 'WS01\tws01\tWork\tpending\tsrc/a.md\t\t\t\t0\t\n' >> "$RUN_DIR/roster.tsv"

    run_fleet spawn WS01 --dry-run
    assert_equals "0" "$FLEET_RC" "legacy roster spawns (dry) without error"
    assert_contains "$FLEET_OUT" "PLAN engine WS01 engine=claude-sub" "missing engine column reads claude-sub"
}

test_spawn_real_tmux_engine_env_and_pane_command() {
    # Case 3: stub tmux receives -e K=V for every set-var (resolved values, via
    # argv) and the pane command carries the unset list and exec.
    log_step "GIVEN FLEET_ZAI_TOKEN in the master shell, WHEN spawn --engine glm"
    make_engine_project eng-glm
    echo "Glm brief" > "$RUN_DIR/briefs/WS01.md"
    add_ws WS01 ws01 "Glm work" pending "src/a.md"
    capture_script 1 "glm-5.3-flash with high effort | API Usage Billing"

    export FLEET_ZAI_TOKEN=ztok_secret123
    run_fleet spawn WS01 --engine glm
    unset FLEET_ZAI_TOKEN

    assert_equals "0" "$FLEET_RC" "glm spawn via stub tmux exits 0"
    assert_contains "$FLEET_OUT" 'spawned WS01 engine=glm banner="glm-5.3-flash with high effort | API Usage Billing"' \
        "banner verified and reported"
    local ns
    ns=$(tmux_calls "new-session")
    assert_contains "$ns" "-L fleet-eng-glm new-session -d -s ws01 -c $PROJ" "launch runs on the run's dedicated socket"
    assert_contains "$ns" "-e ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic" "endpoint passed via -e"
    assert_contains "$ns" "-e ANTHROPIC_AUTH_TOKEN=ztok_secret123" "token passed via -e, resolved from master env"
    assert_contains "$ns" "-e CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT=1" "flag set-var passed via -e"
    local sk
    sk=$(tmux_calls "send-keys -t ws01 -l")
    assert_contains "$sk" "export FLEET_RUN_DIR=$RUN_DIR" "pane command exports FLEET_RUN_DIR"
    assert_contains "$sk" \
        "unset ANTHROPIC_API_KEY ANTHROPIC_DEFAULT_SONNET_MODEL ANTHROPIC_DEFAULT_OPUS_MODEL ANTHROPIC_DEFAULT_HAIKU_MODEL ANTHROPIC_DEFAULT_FABLE_MODEL" \
        "pane command unsets every relay var"
    assert_contains "$sk" "exec claude --model glm-5.3-flash --permission-mode bypassPermissions" \
        "pane command execs the engine with its args"
    assert_contains "$sk" "read $RUN_DIR/briefs/WS01.md and start; coordinate only via roster files" \
        "thin prompt sent after the banner, never the brief body"
    assert_equals "1" "$(grep -ac 'and start' "$TMUX_LOG")" "thin prompt sent exactly once"
    assert_not_contains "$(tmux_calls)" "Down" "no trust keys when no trust prompt appeared"
    assert_equals "started" "$(roster_field WS01 status)" "banner match sets started"
    assert_success "heartbeat stamped to now" test "$(roster_field WS01 heartbeat)" -gt 0
    assert_equals "glm" "$(roster_field WS01 engine)" "resolved engine written to the roster column"
    assert_equals "0" "$(wc -l < "$ENGINE_LOG")" "engine stubs never executed locally"
    assert_equals "" "$(grep -rl ztok_secret123 "$RUN_DIR" 2>/dev/null || true)" "token never lands on disk in the run dir"
}

test_spawn_banner_timeout_stays_pending() {
    # Case 5: bash prompt forever -> 66, pending, pane lines printed, no prompt.
    log_step "GIVEN a pane that never shows the engine banner, WHEN spawn"
    make_engine_project eng-timeout
    echo "b" > "$RUN_DIR/briefs/WS01.md"
    add_ws WS01 ws01 "Work" pending "src/a.md"
    capture_script 1 "worker@fixture:~\$ "

    run_fleet spawn WS01
    assert_equals "66" "$FLEET_RC" "banner timeout exits 66"
    assert_contains "$FLEET_OUT" "worker@fixture" "last pane lines printed on timeout"
    assert_contains "$FLEET_OUT" "pending" "refusal says the row was left pending"
    assert_equals "pending" "$(roster_field WS01 status)" "status stays pending"
    assert_equals "0" "$(roster_field WS01 heartbeat)" "heartbeat untouched"
    assert_equals "" "$(roster_field WS01 engine)" "engine column left empty"
    assert_equals "0" "$(grep -ac 'and start' "$TMUX_LOG")" "no thin prompt before a verified banner"
    assert_equals "1" "$(grep -ac 'send-keys -t ws01 Enter' "$TMUX_LOG")" "only the pane-command Enter was sent"
}

test_spawn_banner_match_prompt_once_spares_silent() {
    # Case 6: banner match -> started + heartbeat, thin prompt exactly once,
    # spares launched to the banner but never prompted.
    log_step "GIVEN a clean claude-sub banner and --spares 1, WHEN spawn"
    make_engine_project eng-sub
    echo "b" > "$RUN_DIR/briefs/WS01.md"
    add_ws WS01 ws01 "Work" pending "src/a.md"
    capture_script 1 "Sonnet 5 with high effort | Claude Team"

    run_fleet spawn WS01 --spares 1
    assert_equals "0" "$FLEET_RC" "claude-sub spawn exits 0"
    assert_contains "$FLEET_OUT" 'spawned WS01 engine=claude-sub banner="Sonnet 5 with high effort | Claude Team"' \
        "banner line reported"
    assert_not_contains "$FLEET_OUT" "WARN tmux" "clean server env stays silent"
    assert_equals "started" "$(roster_field WS01 status)" "banner match sets started"
    assert_success "heartbeat stamped to now" test "$(roster_field WS01 heartbeat)" -gt 0
    assert_equals "1" "$(grep -ac 'and start' "$TMUX_LOG")" "thin prompt sent exactly once (main only)"
    local spare_lines
    spare_lines=$(tmux_calls "ws01-spare1")
    assert_contains "$spare_lines" "new-session -d -s ws01-spare1" "spare session launched"
    assert_contains "$spare_lines" "exec claude --model sonnet" "spare gets the same engine launch"
    assert_contains "$spare_lines" "unset ANTHROPIC_AUTH_TOKEN" "spare gets the same env hygiene"
    assert_not_contains "$spare_lines" "and start" "spare gets no prompt"
}

test_spawn_trust_prompt_claude() {
    # Case 7 (claude): trust text -> Down Enter sent; banner still verified.
    log_step "GIVEN claude's folder-trust prompt followed by the banner, WHEN spawn"
    make_engine_project eng-trust-claude
    echo "b" > "$RUN_DIR/briefs/WS01.md"
    add_ws WS01 ws01 "Work" pending "src/a.md"
    capture_script 1 "  Do you trust the files in this folder? No, exit"
    capture_script 2 "Sonnet 5 with high effort | Claude Team"

    run_fleet spawn WS01
    assert_equals "0" "$FLEET_RC" "spawn through the trust prompt exits 0"
    assert_contains "$(tmux_calls 'send-keys -t ws01 Down Enter')" "Down Enter" "claude trust keys sent once"
    assert_equals "2" "$(grep -ac 'send-keys -t ws01 Enter' "$TMUX_LOG")" \
        "Enters: pane command + thin prompt (trust rides the Down Enter line)"
    assert_equals "1" "$(grep -ac 'and start' "$TMUX_LOG")" "thin prompt still sent after trust handling"
    assert_equals "started" "$(roster_field WS01 status)" "banner verified after the trust keys"
}

test_spawn_trust_prompt_codex() {
    # Case 7 (codex): codex trust text -> Enter only.
    log_step "GIVEN codex's folder-trust prompt followed by the banner, WHEN spawn --engine codex"
    make_engine_project eng-trust-codex
    echo "b" > "$RUN_DIR/briefs/WS01.md"
    add_ws WS01 ws01 "Work" pending "src/a.md"
    capture_script 1 "Allow Codex to work in this folder? Yes/No"
    capture_script 2 "model: gpt-5.6-sol provider: openai"

    run_fleet spawn WS01 --engine codex
    assert_equals "0" "$FLEET_RC" "codex spawn through the trust prompt exits 0"
    assert_not_contains "$(tmux_calls)" "Down" "codex trust wants Enter only, no Down"
    assert_equals "3" "$(grep -ac 'send-keys -t ws01 Enter' "$TMUX_LOG")" \
        "Enters: pane command, trust confirm, thin prompt"
    assert_contains "$FLEET_OUT" 'spawned WS01 engine=codex banner="model: gpt-5.6-sol provider: openai"' \
        "codex banner verified"
}

test_spawn_codex_update_modal() {
    # codex-cli 0.153+ opens an update modal at startup ("Update available
    # ... Press enter to continue"); bare Enter picks "1. Update now" = a
    # surprise npm install -g. Spawn must dismiss with "2" (Skip) then Enter.
    # Live-measured 2026-09-10 on 0.153.4.
    log_step "GIVEN codex's update modal then the banner, WHEN spawn --engine codex"
    make_engine_project eng-codexmodal
    echo "b" > "$RUN_DIR/briefs/WS01.md"
    add_ws WS01 ws01 "Work" pending "src/a.md"
    capture_script 1 "  Update available! 0.153.4 -> 0.154.0"
    capture_script 2 "  2. Skip"
    capture_script 3 "Ask Codex to do anything"

    run_fleet spawn WS01 --engine codex
    assert_equals "0" "$FLEET_RC" "spawn through the update modal exits 0"
    assert_contains "$(tmux_calls 'send-keys -t ws01 -l 2')" "-l 2" "modal dismissed with literal 2 (Skip)"
    assert_contains "$FLEET_OUT" "Ask Codex" "banner verified past the modal"
    assert_equals "started" "$(roster_field WS01 status)" "row started after modal + banner"
}

test_spawn_no_trust_text_sends_no_keys() {
    # Case 7 (negative): no prompt text -> no trust keys at all.
    log_step "GIVEN a pane that goes straight to the banner, WHEN spawn"
    make_engine_project eng-notrust
    echo "b" > "$RUN_DIR/briefs/WS01.md"
    add_ws WS01 ws01 "Work" pending "src/a.md"
    capture_script 1 "Sonnet 5 with high effort | Claude Team"

    run_fleet spawn WS01
    assert_equals "0" "$FLEET_RC" "spawn exits 0"
    assert_not_contains "$(tmux_calls)" "Down" "no trust keys when the prompt never appears"
    assert_equals "2" "$(grep -ac 'send-keys -t ws01 Enter' "$TMUX_LOG")" \
        "only pane-command and thin-prompt Enters"
}

test_spawn_codex_flag_gate() {
    # Codex delegation gate (global CLAUDE.md): the codex engine may only
    # run in projects whose CLAUDE.md carries a literal codex=true line.
    # Applies however the engine was chosen: --engine flag, roster column,
    # or FLEET_DEFAULT_ENGINE (the guard runs after engine resolution).
    log_step "GIVEN a project with no CLAUDE.md, WHEN spawning codex"
    make_engine_project eng-codexflag
    rm -f "$PROJ/CLAUDE.md"
    echo "b" > "$RUN_DIR/briefs/WS01.md"
    add_ws WS01 ws01 "Work" pending "src/a.md"
    capture_script 1 "model: gpt-5.6-sol provider: openai"

    run_fleet spawn WS01 --engine codex
    assert_equals "66" "$FLEET_RC" "codex without codex=true refuses spawn"
    assert_contains "$FLEET_OUT" "codex=true" "refusal names the gate"
    assert_equals "pending" "$(roster_field WS01 status)" "refusal leaves the row pending"
    assert_not_contains "$(tmux_calls)" "new-session" "no session launched on refusal"

    log_step "GIVEN CLAUDE.md with a literal codex=true line, WHEN spawning codex"
    printf '# project\n\ncodex=true\n' > "$PROJ/CLAUDE.md"
    run_fleet spawn WS01 --engine codex
    assert_equals "0" "$FLEET_RC" "codex=true passes the gate"
    assert_contains "$FLEET_OUT" "engine=codex" "spawn proceeds"
}

test_spawn_codex_billing_guard() {
    # Case 8: a set OPENAI_API_KEY silently bills the API. The default codex
    # registry unsets it in the pane (proceeds); an engine whose unset list
    # dropped it must refuse.
    log_step "GIVEN OPENAI_API_KEY set in the master env, WHEN spawning default codex"
    make_engine_project eng-billing
    echo "b" > "$RUN_DIR/briefs/WS01.md"
    add_ws WS01 ws01 "Work" pending "src/a.md"
    capture_script 1 "model: gpt-5.6-sol provider: openai"

    export OPENAI_API_KEY=sk-live-999
    run_fleet spawn WS01 --engine codex
    unset OPENAI_API_KEY
    assert_equals "0" "$FLEET_RC" "key covered by the engine unset list: proceeds"
    assert_contains "$(tmux_calls 'send-keys -t ws01 -l')" "unset OPENAI_API_KEY" "pane command unsets the key"

    log_step "GIVEN a codex engine whose unset list dropped OPENAI_API_KEY, WHEN spawning"
    make_engine_project eng-billing-refuse
    echo "b" > "$RUN_DIR/briefs/WS01.md"
    add_ws WS01 ws01 "Work" pending "src/a.md"
    local noset="$TMP_DIR/stub-engines-codex-nounset.sh"
    {
        cat "$TMP_DIR/stub-engines.sh"
        cat <<'PATCH'

# billing-guard fixture: codex that no longer unsets OPENAI_API_KEY
fleet_engine_get() {
    if [ "$1" = "unset" ] && [ "$2" = "codex" ]; then :; else _fleet_engine_field "$@"; fi
}
PATCH
    } > "$noset"
    export FLEET_TEST_ENGINES_SH="$noset"
    export OPENAI_API_KEY=sk-live-999
    run_fleet spawn WS01 --engine codex
    unset OPENAI_API_KEY FLEET_TEST_ENGINES_SH
    assert_equals "66" "$FLEET_RC" "uncovered API key refuses spawn"
    assert_contains "$FLEET_OUT" "OPENAI_API_KEY" "refusal names the key"
    assert_equals "pending" "$(roster_field WS01 status)" "refusal leaves the row pending"

    log_step "GIVEN ~/.codex/auth.json auth_mode != chatgpt, WHEN spawning codex"
    make_engine_project eng-authwarn
    echo "b" > "$RUN_DIR/briefs/WS01.md"
    add_ws WS01 ws01 "Work" pending "src/a.md"
    capture_script 1 "model: gpt-5.6-sol provider: openai"
    printf '{"auth_mode":"apikey","OPENAI_API_KEY":"x"}\n' > "$TMP_DIR/home/.codex/auth.json"
    run_fleet spawn WS01 --engine codex
    assert_equals "0" "$FLEET_RC" "auth-mode mismatch warns, does not refuse"
    assert_contains "$FLEET_OUT" "auth_mode" "warn names the auth mode problem"
}

test_spawn_claude_sub_warns_on_armed_settings() {
    # claude-sub extra: armed (no _ prefix) ANTHROPIC_* keys in the target
    # repo's settings files apply at startup regardless of the pane env.
    log_step "GIVEN the repo arms ANTHROPIC_BASE_URL in settings.local.json, WHEN spawning claude-sub"
    make_engine_project eng-armed
    echo "b" > "$RUN_DIR/briefs/WS01.md"
    add_ws WS01 ws01 "Work" pending "src/a.md"
    capture_script 1 "Sonnet 5 with high effort | Claude Team"
    mkdir -p "$PROJ/.claude"
    cat > "$PROJ/.claude/settings.local.json" <<'JSON'
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://relay.example"
  }
}
JSON
    run_fleet spawn WS01
    assert_equals "0" "$FLEET_RC" "warn only: spawn proceeds"
    assert_contains "$FLEET_OUT" "ANTHROPIC_BASE_URL" "warn names the armed var"
    assert_contains "$FLEET_OUT" "settings.local.json:3" "warn cites file:line"

    log_step "GIVEN the same key disarmed with a _ prefix, WHEN spawning"
    cat > "$PROJ/.claude/settings.local.json" <<'JSON'
{
  "env": {
    "_ANTHROPIC_BASE_URL": "https://relay.example"
  }
}
JSON
    run_fleet spawn WS01 --engine claude-sub
    assert_equals "0" "$FLEET_RC" "disarmed-key spawn exits 0"
    assert_not_contains "$FLEET_OUT" "WARN claude" "disarmed key does not warn"
}

test_spawn_warns_on_dirty_tmux_server_env() {
    # Handoff section 4: warn (never fail) when the target server's global env
    # carries inherited ANTHROPIC_*/OPENAI_* vars.
    log_step "GIVEN the tmux server global env carries a relay var, WHEN spawn"
    make_engine_project eng-serverenv
    echo "b" > "$RUN_DIR/briefs/WS01.md"
    add_ws WS01 ws01 "Work" pending "src/a.md"
    capture_script 1 "Sonnet 5 with high effort | Claude Team"
    printf 'ANTHROPIC_AUTH_TOKEN=relay-token\nPATH=/usr/bin\n' > "$CAPTURE_DIR/server.env"

    run_fleet spawn WS01
    assert_equals "0" "$FLEET_RC" "server-env check is warn only"
    assert_contains "$FLEET_OUT" "ANTHROPIC_AUTH_TOKEN" "warn names the inherited var"
    assert_contains "$FLEET_OUT" "set-environment -gu ANTHROPIC_AUTH_TOKEN" "warn suggests the clearing command"

    log_step "GIVEN a clean server env, WHEN spawning again"
    : > "$CAPTURE_DIR/server.env"
    run_fleet spawn WS01
    assert_equals "0" "$FLEET_RC" "clean-server spawn exits 0"
    assert_not_contains "$FLEET_OUT" "WARN tmux" "clean server stays silent"
}

test_spawn_missing_source_var_blocks_before_tmux() {
    # Flow-order guard: resolution (66 on missing $SOURCE_VAR) happens before
    # any tmux call and before worktree creation; the roster stays pending.
    log_step "GIVEN FLEET_ZAI_TOKEN unset, WHEN spawning glm for real"
    make_engine_project eng-novar
    echo "b" > "$RUN_DIR/briefs/WS01.md"
    add_ws WS01 ws01 "Work" pending "src/a.md"
    unset FLEET_ZAI_TOKEN

    run_fleet spawn WS01 --engine glm
    assert_equals "66" "$FLEET_RC" "missing source var exits 66"
    assert_contains "$FLEET_OUT" "FLEET_ZAI_TOKEN" "refusal names the variable"
    assert_equals "pending" "$(roster_field WS01 status)" "roster stays pending"
    assert_equals "0" "$(wc -l < "$TMUX_LOG")" "no tmux call was made"
    assert_dir_absent "$PROJ/.claude/worktrees/ws01" "no worktree created either"
}

test_spawn_no_tmux_prints_var_references() {
    # Case 9: paste-safe output. Values are replaced by $SOURCE_VAR references;
    # the resolved token must not leak into stdout or the run dir.
    log_step "GIVEN FLEET_ZAI_TOKEN in the master shell, WHEN spawn --no-tmux --engine glm"
    make_engine_project eng-notmux
    echo "b" > "$RUN_DIR/briefs/WS01.md"
    add_ws WS01 ws01 "Work" pending "src/a.md"
    export FLEET_ZAI_TOKEN=ztok_secret123
    run_fleet spawn WS01 --no-tmux --engine glm
    unset FLEET_ZAI_TOKEN

    assert_equals "0" "$FLEET_RC" "no-tmux spawn exits 0"
    assert_contains "$FLEET_OUT" '-e "ANTHROPIC_AUTH_TOKEN=$FLEET_ZAI_TOKEN"' "token printed as the source-var reference"
    assert_contains "$FLEET_OUT" '-e "ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic"' "literal values printed as-is"
    assert_contains "$FLEET_OUT" "unset ANTHROPIC_API_KEY" "pane-command line shows the unset list"
    assert_contains "$FLEET_OUT" "read $RUN_DIR/briefs/WS01.md and start" "thin prompt line printed for manual paste"
    assert_not_contains "$FLEET_OUT" "ztok_secret123" "resolved token never printed"
    assert_equals "" "$(grep -rl ztok_secret123 "$RUN_DIR" 2>/dev/null || true)" "resolved token never written to the run dir"
    assert_equals "started" "$(roster_field WS01 status)" "manual launch still marks the row started"
}

test_spawn_socket_default_and_override() {
    # Dedicated-socket decision: FLEET_TMUX_SOCKET=fleet-<slug> default,
    # fleet.env override wins. Every tmux line carries -L.
    log_step "GIVEN no FLEET_TMUX_SOCKET in fleet.env, WHEN spawn --no-tmux"
    make_engine_project eng-sock
    echo "b" > "$RUN_DIR/briefs/WS01.md"
    add_ws WS01 ws01 "Work" pending "src/a.md"

    run_fleet spawn WS01 --no-tmux
    assert_contains "$FLEET_OUT" "tmux -L fleet-eng-sock new-session" "default socket is fleet-<slug>"

    printf 'FLEET_TMUX_SOCKET=fleet-custom\n' >> "$RUN_DIR/fleet.env"
    run_fleet spawn WS01 --no-tmux
    assert_contains "$FLEET_OUT" "tmux -L fleet-custom new-session" "fleet.env socket override wins"
}

# ============================================================================
# land
# ============================================================================
test_land_main_mode_clean() {
    log_step "GIVEN clean repo, WHEN land in main mode"
    make_project land-main
    add_ws WS01 ws01 "Work" working "src/a.md"
    run_fleet land WS01

    assert_equals "0" "$FLEET_RC" "land clean repo exits 0"
    assert_equals "landed" "$(roster_field WS01 status)" "status set to landed"
    local sha
    sha=$(git -C "$PROJ" rev-parse --short HEAD)
    assert_equals "$sha" "$(roster_field WS01 landed_sha)" "landed_sha recorded as HEAD"
    assert_contains "$FLEET_OUT" "$sha" "land echoes the sha"
}

test_land_main_mode_unclaimed_dirty_refused() {
    # Guard class this kills: unclaimed files swept into a workstream's landing
    # (FormField incident, run e59a7826).
    log_step "GIVEN an unclaimed dirty file, WHEN land in main mode"
    make_project land-dirty
    add_ws WS01 ws01 "Work" working "src/a.md"
    echo stray > "$PROJ/stray.txt"
    run_fleet land WS01

    assert_equals "66" "$FLEET_RC" "unclaimed dirty files exit 66"
    assert_contains "$FLEET_OUT" "stray.txt" "refusal lists the offending file"
    assert_equals "working" "$(roster_field WS01 status)" "status untouched on refusal"
}

test_land_main_mode_claimed_dirty_ok() {
    log_step "GIVEN a dirty file inside the WS's exact claim, WHEN land"
    make_project land-claimed
    add_ws WS01 ws01 "Work" working "src/a.md"
    add_ws WS02 ws02 "Docs work" working "docs"
    echo more >> "$PROJ/src/a.md"
    run_fleet land WS01

    assert_equals "0" "$FLEET_RC" "exact-claim dirty file does not block land"
    assert_equals "landed" "$(roster_field WS01 status)" "WS01 landed"
    assert_equals "working" "$(roster_field WS02 status)" "other row untouched"
}

test_land_main_mode_glob_claim() {
    log_step "GIVEN a glob claim (src/*) covering a new dirty file, WHEN land"
    make_project land-glob
    add_ws WS01 ws01 "Glob work" working "src/*"
    echo new > "$PROJ/src/new.md"
    run_fleet land WS01

    assert_equals "0" "$FLEET_RC" "glob claim (src/*) covers new dirty file in tree"
    assert_equals "landed" "$(roster_field WS01 status)" "WS01 landed"
}

test_land_worktree_ff() {
    log_step "GIVEN a worker commit on fleet/WS01 in a worktree, WHEN land (default ff)"
    _wt_fixture land-wt
    local branch_sha
    branch_sha=$(git -C "$PROJ" rev-parse fleet/WS01)
    run_fleet land WS01

    assert_equals "0" "$FLEET_RC" "worktree land exits 0"
    assert_dir_absent "$PROJ/.claude/worktrees/ws01" "worktree removed after land"
    assert_equals "$branch_sha" "$(git -C "$PROJ" rev-parse HEAD)" "ff-only merge moved main to branch tip"
    assert_equals "$(git -C "$PROJ" rev-parse --short HEAD)" "$(roster_field WS01 landed_sha)" "landed_sha recorded"
    assert_equals "landed" "$(roster_field WS01 status)" "status set to landed"
    assert_success "ff merge has a single parent" test "$(git -C "$PROJ" rev-list --parents -n 1 HEAD | wc -w)" -eq 2
}

test_land_worktree_no_ff() {
    log_step "GIVEN --no-ff, WHEN land"
    _wt_fixture land-wt-noff
    run_fleet land WS01 --no-ff

    assert_equals "0" "$FLEET_RC" "no-ff land exits 0"
    assert_success "merge commit has two parents" test "$(git -C "$PROJ" rev-list --parents -n 1 HEAD | wc -w)" -eq 3
    assert_dir_absent "$PROJ/.claude/worktrees/ws01" "worktree removed after no-ff merge"
    assert_equals "landed" "$(roster_field WS01 status)" "status set to landed"
}

test_land_worktree_dirty_refused() {
    log_step "GIVEN an uncommitted file left in the worktree, WHEN land"
    _wt_fixture land-wt-dirty
    echo "half done" > "$PROJ/.claude/worktrees/ws01/wip.md"
    run_fleet land WS01

    assert_equals "66" "$FLEET_RC" "dirty worktree refuses land"
    assert_dir_exists "$PROJ/.claude/worktrees/ws01" "worktree kept on refusal"
    assert_equals "started" "$(roster_field WS01 status)" "status untouched on refusal (spawn set started)"
}

# ============================================================================
# handoff
# ============================================================================
test_handoff_fills_from_roster_and_git() {
    log_step "GIVEN a fully-populated roster row and dirty files, WHEN handoff"
    make_project handoff
    add_ws WS01 ws01 "Build the export API" working "src/a.md docs" "deadbee" "0042" "" "$(date +%s)" "waiting on schema review"
    echo "half" > "$PROJ/src/wip.txt"
    run_fleet handoff WS01

    assert_equals "0" "$FLEET_RC" "handoff exits 0"
    local f="$RUN_DIR/handoffs/HANDOFF_WS01.md"
    assert_file_exists "$f" "handoff file written to handoffs/HANDOFF_WSxx.md"
    local body
    body=$(<"$f")
    assert_contains "$body" "WS01" "ws id present"
    assert_contains "$body" "Build the export API" "task filled"
    assert_contains "$body" "src/a.md" "claims filled"
    assert_contains "$body" "deadbee" "landed_sha filled"
    assert_contains "$body" "0042" "migration_num filled"
    assert_contains "$body" "waiting on schema review" "notes filled"
    assert_contains "$body" "src/wip.txt" "dirty files listed"
}

# ============================================================================
# db
# ============================================================================
test_db_refuses_when_fleet_db_not_docker() {
    log_step "GIVEN FLEET_DB=none, WHEN db"
    make_project db-guard
    add_ws WS01 ws01 "Needs a db" working "src/a.md"
    run_fleet db WS01

    assert_equals "66" "$FLEET_RC" "db without FLEET_DB=docker exits 66"
    assert_contains "$FLEET_OUT" "FLEET_DB" "hint names the toggle"

    # data-error path is independent of the docker gate
    printf 'FLEET_DB=docker\n' > "$RUN_DIR/fleet.env"
    run_fleet db WS99
    assert_equals "65" "$FLEET_RC" "db for unknown ws exits 65"
}

test_db_docker_lifecycle() {
    if (( ! DOCKER_OK )); then
        log_info "SKIP db lifecycle: docker unavailable"
        return 0
    fi
    if ! docker image inspect postgres:16-alpine >/dev/null 2>&1; then
        log_info "SKIP db lifecycle: postgres:16-alpine image not present"
        return 0
    fi
    log_step "GIVEN FLEET_DB=docker, WHEN db then db-clean"
    make_project dblc
    printf 'FLEET_DB=docker\n' > "$RUN_DIR/fleet.env"
    add_ws WS01 ws01 "Needs a db" working "src/a.md"

    run_fleet db WS01
    assert_equals "0" "$FLEET_RC" "db provisions a container"
    assert_contains "$FLEET_OUT" "DATABASE_URL=postgres://fleet:fleet@127.0.0.1:" "echoes DATABASE_URL"
    local url
    url=$(roster_field WS01 scratch_db)
    assert_contains "$url" "postgres://fleet:fleet@127.0.0.1:" "scratch_db recorded in roster"
    assert_equals "dblc-ws01" "$(docker ps --format '{{.Names}}' --filter label=cfn-fleet=fleet-dblc | head -1)" "container named <slug>-<ws-lower>"
    DOCKER_CONTAINERS+=("$(docker ps -aq --filter label=cfn-fleet=fleet-dblc)")

    run_fleet db WS01
    assert_equals "0" "$FLEET_RC" "second db call exits 0"
    assert_contains "$FLEET_OUT" "DATABASE_URL=$url" "idempotent: echoes existing URL"
    assert_equals "1" "$(docker ps -aq --filter label=cfn-fleet=fleet-dblc | wc -l)" "no duplicate container"

    run_fleet db-clean
    assert_equals "0" "$FLEET_RC" "db-clean exits 0"
    assert_equals "0" "$(docker ps -aq --filter label=cfn-fleet=fleet-dblc | wc -l)" "db-clean removed the run's container"
    DOCKER_CONTAINERS=()

    run_fleet db-clean
    assert_contains "$FLEET_OUT" "no matching containers" "db-clean with nothing to do says so"

    # Regression: cleanup is not gated on the FLEET_DB provision flag (a fleet
    # switched back to FLEET_DB=none must still be able to reap its containers).
    printf 'FLEET_WORKTREE=off\nFLEET_DB=none\n' > "$RUN_DIR/fleet.env"
    run_fleet db-clean
    assert_equals "0" "$FLEET_RC" "db-clean works with FLEET_DB=none"
    assert_contains "$FLEET_OUT" "no matching containers" "db-clean under FLEET_DB=none finds nothing to reap"
}

# ============================================================================
# watch
# ============================================================================
test_watch_once_stale_and_not_stale() {
    log_step "GIVEN one 20-min-stale working row, one fresh started row, one pending, WHEN watch --once"
    make_project watch-stale
    local now
    now=$(date +%s)
    add_ws WS01 ws01 "Slow worker" working "src/a.md" "" "" "" "$((now - 1200))"
    add_ws WS02 ws02 "Fresh worker" started "src/b.md" "" "" "" "$now"
    add_ws WS03 ws03 "Not picked up" pending "src/c.md"
    run_fleet watch --once

    assert_equals "0" "$FLEET_RC" "watch --once exits 0"
    assert_contains "$FLEET_OUT" "STALE WS01 20" "20-min heartbeat flagged STALE at default 15m"
    assert_not_contains "$FLEET_OUT" "STALE WS02" "fresh heartbeat not stale"
    assert_not_contains "$FLEET_OUT" "STALE WS03" "pending row (heartbeat 0) never stale"
    assert_not_contains "$FLEET_OUT" "ALL-DONE" "running fleet emits no ALL-DONE"

    run_fleet watch --once --stale-min 30
    assert_not_contains "$FLEET_OUT" "STALE WS01" "--stale-min 30 hides 20-min heartbeat"
}

test_watch_once_dead() {
    log_step "GIVEN dead rows with fresh and ancient heartbeats, WHEN watch --once"
    make_project watch-dead
    add_ws WS03 ws03 "Crashed fresh" dead "src/a.md" "" "" "" "$(date +%s)"
    add_ws WS04 ws04 "Crashed long ago" dead "src/b.md" "" "" "" "12345"
    run_fleet watch --once

    assert_contains "$FLEET_OUT" "DEAD WS03" "dead row flagged DEAD"
    assert_contains "$FLEET_OUT" "DEAD WS04" "ancient dead row flagged DEAD not STALE"
    assert_not_contains "$FLEET_OUT" "STALE" "dead status never emits STALE"
}

test_watch_once_all_done() {
    log_step "GIVEN every row landed|done, WHEN watch --once"
    make_project watch-done
    add_ws WS01 ws01 "a" landed "src/a.md" "abc1234"
    # shellcheck disable=SC1010  # 'done' is a roster status value, not the keyword
    add_ws WS02 ws02 "b" done "src/b.md"
    run_fleet watch --once

    assert_contains "$FLEET_OUT" "ALL-DONE" "all landed|done emits ALL-DONE"
    assert_equals "0" "$FLEET_RC" "ALL-DONE exits 0"
}

test_watch_change_detection() {
    log_step "GIVEN a roster edited between --once scans, WHEN watch --once twice"
    make_project watch-change
    add_ws WS01 ws01 "Original task" working "src/a.md" "" "" "" "$(date +%s)"

    run_fleet watch --once
    assert_not_contains "$FLEET_OUT" "CHANGE" "baseline scan emits no CHANGE"

    fixture_set WS01 task "Revised task"
    run_fleet watch --once
    assert_contains "$FLEET_OUT" "CHANGE WS01 task" "field-level change reported"
    assert_not_contains "$FLEET_OUT" "CHANGE WS01 claims" "unchanged fields stay silent"

    run_fleet watch --once
    assert_not_contains "$FLEET_OUT" "CHANGE" "no phantom CHANGE on identical roster"
}

# --- watch :: dead-pane detection (engine rewrite: spawn's exec makes the pane
# die with the engine, so a gone tmux session means the worker is gone even
# while its heartbeat looks fresh) -------------------------------------------

test_watch_dead_pane_detected() {
    log_step "GIVEN started+working rows whose tmux sessions are gone, WHEN watch --once"
    make_project watch-panedead
    add_ws WS01 ws01 "Died quietly" started "src/a.md" "" "" "" "$(date +%s)"
    add_ws WS02 ws02 "Died too" working "src/b.md" "" "" "" "$(date +%s)"
    export FLEET_TMUX_HASSESSION_RC=1
    export FLEET_TMUX_HASSESSION_STDERR="can't find session: ws01"
    run_fleet watch --once
    unset FLEET_TMUX_HASSESSION_RC FLEET_TMUX_HASSESSION_STDERR

    assert_equals "0" "$FLEET_RC" "watch --once with dead panes exits 0"
    assert_contains "$FLEET_OUT" "DEAD WS01 (pane exited)" "gone session on a started row flagged DEAD (pane exited)"
    assert_contains "$FLEET_OUT" "DEAD WS02 (pane exited)" "working row probed too"
    assert_contains "$(tmux_calls 'has-session')" "-L fleet-watch-panedead has-session -t ws01" \
        "pane probe runs on the run's dedicated socket"
}

test_watch_alive_pane_emits_no_dead() {
    log_step "GIVEN live panes (stub has-session rc 0), WHEN watch --once"
    make_project watch-panealive
    add_ws WS01 ws01 "Running" started "src/a.md" "" "" "" "$(date +%s)"
    add_ws WS02 "" "No name cell" started "src/b.md" "" "" "" "$(date +%s)"
    : > "$TMUX_LOG"
    run_fleet watch --once

    assert_equals "0" "$FLEET_RC" "watch --once with live panes exits 0"
    assert_not_contains "$FLEET_OUT" "DEAD" "alive pane never flagged DEAD"
    assert_not_contains "$FLEET_OUT" "STALE" "fresh heartbeat stays silent"
    assert_equals "1" "$(grep -ac 'has-session' "$TMUX_LOG")" \
        "only rows with a name cell are probed (empty name skipped)"
}

test_watch_missing_tmux_skips_silently() {
    # Tooling absence must never read as a dead worker: no tmux binary on PATH
    # -> no DEAD lines, watch still exits 0.
    log_step "GIVEN no tmux binary on PATH, WHEN watch --once"
    make_project watch-notmux
    add_ws WS01 ws01 "No tmux host" started "src/a.md" "" "" "" "$(date +%s)"
    mkdir -p "$TMP_DIR/bin-notmux"
    local b
    for b in awk basename cat date dirname grep head mv sed sort tr; do
        ln -sf "$(command -v "$b")" "$TMP_DIR/bin-notmux/$b"
    done
    mv "$TMP_DIR/bin/tmux" "$TMP_DIR/bin/tmux.hidden"
    # SC2031 here is a false positive: this PATH swap is this function's own
    # scope; the warning stems from run_fleet's unrelated subshell (line 277).
    # shellcheck disable=SC2031
    local saved_path="$PATH"
    # shellcheck disable=SC2031
    export PATH="$TMP_DIR/bin-notmux"
    run_fleet watch --once
    export PATH="$saved_path"
    mv "$TMP_DIR/bin/tmux.hidden" "$TMP_DIR/bin/tmux"

    assert_equals "0" "$FLEET_RC" "missing tmux never fails watch"
    assert_not_contains "$FLEET_OUT" "DEAD" "tooling absence is never a false DEAD"
}

test_watch_tmux_no_server_is_not_a_dead_pane() {
    # Real tmux answers has-session with rc 1 AND "no server running" when the
    # whole socket server is absent: tooling failure, not a dead worker.
    log_step "GIVEN has-session failing with no-server-running, WHEN watch --once"
    make_project watch-noserver
    add_ws WS01 ws01 "Worker" started "src/a.md" "" "" "" "$(date +%s)"
    export FLEET_TMUX_HASSESSION_RC=1
    export FLEET_TMUX_HASSESSION_STDERR="no server running on /tmp/tmux-501/fleet-watch-noserver"
    run_fleet watch --once
    unset FLEET_TMUX_HASSESSION_RC FLEET_TMUX_HASSESSION_STDERR

    assert_equals "0" "$FLEET_RC" "watch --once exits 0"
    assert_not_contains "$FLEET_OUT" "DEAD" "a missing tmux server is tooling, not a dead worker"
}

test_watch_landed_done_dead_rows_never_pane_dead() {
    # Only started|working rows are pane-probed. A status-dead row keeps its
    # original plain DEAD line; landed/done never probe (and still end the loop).
    log_step "GIVEN landed+done rows and a status-dead row with all panes gone, WHEN watch --once"
    make_project watch-pane-landed
    add_ws WS01 ws01 "Landed" landed "src/a.md" "abc1234"
    # shellcheck disable=SC1010  # 'done' is a roster status value, not the keyword
    add_ws WS02 ws02 "Done" done "src/b.md"
    export FLEET_TMUX_HASSESSION_RC=1
    export FLEET_TMUX_HASSESSION_STDERR="can't find session: ws01"
    run_fleet watch --once
    assert_not_contains "$FLEET_OUT" "(pane exited)" "landed/done rows never pane-DEAD"
    assert_contains "$FLEET_OUT" "ALL-DONE" "landed/done only: loop still ends"

    make_project watch-pane-statusdead
    add_ws WS03 ws03 "Crashed" dead "src/a.md"
    run_fleet watch --once
    unset FLEET_TMUX_HASSESSION_RC FLEET_TMUX_HASSESSION_STDERR
    assert_contains "$FLEET_OUT" "DEAD WS03" "status-dead row keeps the plain DEAD line"
    assert_not_contains "$FLEET_OUT" "(pane exited)" "status-dead rows are not pane-probed"
}

test_watch_pane_dead_workbench_bridge_unaffected() {
    # --emit-events still regenerates the run-plan and anchors loop_started on
    # the same scan; the pane-DEAD line stays stdout-only (no workbench type).
    log_step "GIVEN a dead pane with --emit-events, WHEN watch --once"
    make_project watch-pane-bridge
    add_ws WS01 ws01 "Bridged" started "src/a.md" "" "" "" "$(date +%s)"
    local emit_log="$TMP_DIR/emit-watch-pane.log"
    printf '#!/usr/bin/env bash\nprintf "%%s\\n" "$*" >> "%s"\nexit 0\n' "$emit_log" > "$TMP_DIR/emit-watch-pane.sh"
    chmod +x "$TMP_DIR/emit-watch-pane.sh"
    : > "$emit_log"
    export FLEET_WB_EMIT_EVENT="$TMP_DIR/emit-watch-pane.sh"
    export FLEET_TMUX_HASSESSION_RC=1
    export FLEET_TMUX_HASSESSION_STDERR="can't find session: ws01"
    run_fleet watch --once --emit-events
    unset FLEET_TMUX_HASSESSION_RC FLEET_TMUX_HASSESSION_STDERR FLEET_WB_EMIT_EVENT

    assert_equals "0" "$FLEET_RC" "bridge scan exits 0"
    assert_contains "$FLEET_OUT" "DEAD WS01 (pane exited)" "pane-DEAD still on watch stdout"
    assert_file_exists "$RUN_DIR/run-plan-fleet-watch-pane-bridge.json" "run-plan still regenerated"
    assert_contains "$(cat "$emit_log")" "loop_started" "loop_started still anchored"
    assert_not_contains "$(cat "$emit_log")" "lane_spawned" "pane exit has no workbench event type (stdout only)"
}

# ============================================================================
# usage / data errors
# ============================================================================
test_usage_and_data_errors() {
    log_step "GIVEN missing args and unknown ws ids"
    make_project errs
    echo "b" > "$RUN_DIR/briefs/WS01.md"
    add_ws WS01 ws01 "t" pending "src/a.md"

    run_fleet spawn
    assert_equals "64" "$FLEET_RC" "spawn without ws exits 64"

    run_fleet spawn WS01 --engine
    assert_equals "64" "$FLEET_RC" "spawn --engine without a value exits 64"

    run_fleet spawn WS01 --engine nope --dry-run
    assert_equals "65" "$FLEET_RC" "spawn with an unknown engine exits 65"

    run_fleet land WS99
    assert_equals "65" "$FLEET_RC" "land unknown ws exits 65"

    run_fleet handoff WS99
    assert_equals "65" "$FLEET_RC" "handoff unknown ws exits 65"

    run_fleet watch --bogus
    assert_equals "64" "$FLEET_RC" "watch unknown flag exits 64"
}

# ============================================================================
run_all_tests() {
    # setup_test() is skipped on purpose: it hard-fails without a Redis server,
    # which this suite never touches. Initialize the same counters/log it would.
    TEST_LOG="/tmp/cfn-fleet-spawn-watch-$(date +%s).log"
    export TEST_LOG
    export TEST_TOTAL=0 TEST_PASSED=0 TEST_FAILED=0
    annotate "Test Suite: cfn-fleet-spawn-watch"
    log_info "common.sh in use: $COMMON_SH"
    (( DOCKER_OK )) || log_info "docker unavailable: db lifecycle test will skip"

    test_spawn_missing_brief_dies_65
    test_spawn_dry_run_main_mode
    test_spawn_dry_run_worktree_mode
    test_spawn_no_tmux_main_marks_started
    test_spawn_spares_named_without_brief
    test_spawn_worktree_no_tmux_creates_worktree
    test_spawn_dry_run_engine_plan
    test_spawn_roster_without_engine_column_uses_default
    test_spawn_real_tmux_engine_env_and_pane_command
    test_spawn_banner_timeout_stays_pending
    test_spawn_banner_match_prompt_once_spares_silent
    test_spawn_trust_prompt_claude
    test_spawn_trust_prompt_codex
    test_spawn_codex_update_modal
    test_spawn_no_trust_text_sends_no_keys
    test_spawn_codex_flag_gate
    test_spawn_codex_billing_guard
    test_spawn_claude_sub_warns_on_armed_settings
    test_spawn_warns_on_dirty_tmux_server_env
    test_spawn_missing_source_var_blocks_before_tmux
    test_spawn_no_tmux_prints_var_references
    test_spawn_socket_default_and_override
    test_land_main_mode_clean
    test_land_main_mode_unclaimed_dirty_refused
    test_land_main_mode_claimed_dirty_ok
    test_land_main_mode_glob_claim
    test_land_worktree_ff
    test_land_worktree_no_ff
    test_land_worktree_dirty_refused
    test_handoff_fills_from_roster_and_git
    test_db_refuses_when_fleet_db_not_docker
    test_db_docker_lifecycle
    test_watch_once_stale_and_not_stale
    test_watch_once_dead
    test_watch_once_all_done
    test_watch_change_detection
    test_watch_dead_pane_detected
    test_watch_alive_pane_emits_no_dead
    test_watch_missing_tmux_skips_silently
    test_watch_tmux_no_server_is_not_a_dead_pane
    test_watch_landed_done_dead_rows_never_pane_dead
    test_watch_pane_dead_workbench_bridge_unaffected
    test_usage_and_data_errors

    print_test_summary
}

run_all_tests
