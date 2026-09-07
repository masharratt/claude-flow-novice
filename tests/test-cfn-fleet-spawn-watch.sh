#!/usr/bin/env bash
# tests/test-cfn-fleet-spawn-watch.sh
# Phase CLI :: cfn-fleet agent C contract tests — spawn/land/handoff/db/watch
# (SPEC-cfn-fleet.md, section "C — spawn/land/handoff/db/watch"). Priority 1.
# Real-run origin: spares = compaction-restart sessions; db = junk rehearsal-DB
# class; watch replaces the hand-rolled 16h master monitor (run e59a7826).
#
# No tmux required: spawn exercised via --dry-run and --no-tmux. db lifecycle
# test skips unless `docker info` works and postgres:16-alpine is present.
# watch exercised via --once against hand-built fixture rosters. Worktree paths
# exercised with a real git worktree on a fixture repo (fast, no network).
#
# Run dirs are hand-built per the SPEC layout (roster.tsv, fleet.env, briefs/,
# handoffs/, .roster.lock) because `fleet init` belongs to agent A. lib/common.sh
# is sourced from the skill if the parallel agent has landed it; otherwise a
# SPEC-signature stub is generated so this suite runs standalone. TDD note:
# tests were written first and confirmed failing before the cmd files existed.

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
# Invocation: mirrors the router contract — source common.sh, then the cmd
# file, then call main with the subcommand's args. Runs in a command
# substitution subshell so fleet_die's exit is captured, not fatal.
# ----------------------------------------------------------------------------
FLEET_OUT=""
FLEET_RC=0
PROJ=""
RUN_DIR=""

run_fleet() { # $1 = cmd file stem, rest = args (subcommand already stripped)
    local sub="$1"; shift
    local out rc=0
    out=$(
        {
            cd "$PROJ"
            export FLEET_RUN_DIR="$RUN_DIR"
            # shellcheck disable=SC1090
            source "$COMMON_SH"
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
make_project() { # $1 = slug; sets PROJ and RUN_DIR
    local slug="$1"
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
    printf 'ws_id\tname\ttask\tstatus\tclaims\tlanded_sha\tmigration_num\tscratch_db\theartbeat\tnotes\n' > "$RUN_DIR/roster.tsv"
    printf 'FLEET_WORKTREE=off\nFLEET_DB=none\n' > "$RUN_DIR/fleet.env"
    touch "$RUN_DIR/.roster.lock"
}

add_ws() { # ws name task status claims [sha] [mig] [db] [hb] [notes]
    local ws="$1" name="$2" task="$3" status="$4" claims="$5"
    local sha="${6:-}" mig="${7:-}" db="${8:-}" hb="${9:-0}" notes="${10:-}"
    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
        "$ws" "$name" "$task" "$status" "$claims" "$sha" "$mig" "$db" "$hb" "$notes" \
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
    assert_contains "$FLEET_OUT" "tmux new-session -d -s ws01 -c $PROJ" "echoes copy-paste launch command"
    assert_contains "$FLEET_OUT" "tmux send-keys -t ws01" "echoes brief delivery command"
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
    assert_not_contains "$spare_out" "send-keys" "spares get no brief text"
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
    assert_contains "$FLEET_OUT" "tmux new-session -d -s ws01 -c $PROJ/.claude/worktrees/ws01" "session cwd is the worktree"
    assert_equals "started" "$(roster_field WS01 status)" "status set to started"
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
    test_usage_and_data_errors

    print_test_summary
}

run_all_tests
