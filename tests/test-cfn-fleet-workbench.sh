#!/usr/bin/env bash
# tests/test-cfn-fleet-workbench.sh
# Phase CI :: cfn-fleet watch --emit-events workbench bridge (Priority 1)
# Verifies the opt-in cfn-workbench tie-in: run-plan regeneration from the
# roster and the loop_started/lane_spawned/lane_landed/loop_finished event
# mapping. Uses a stub emitter (FLEET_WB_EMIT_EVENT) so the suite never
# touches the real /tmp/cfn-events-*.jsonl feed and does not depend on
# cfn-workbench being installed.
set -euo pipefail
PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

SKILL_LIB="$PROJECT_ROOT/.claude/skills/cfn-fleet/lib"
# shellcheck disable=SC1091
source "$SKILL_LIB/common.sh"
# shellcheck disable=SC1091
source "$SKILL_LIB/cmd-watch.sh"

TEST_TMP=$(mktemp -d -t cfn-fleet-wb.XXXXXX)
EMIT_LOG="$TEST_TMP/emitted.log"
RUN_DIR=""

cleanup() { rm -rf "$TEST_TMP"; }
trap cleanup EXIT

# Stub emit-event.sh: appends slug|event|lane|detail lines to EMIT_LOG.
cat > "$TEST_TMP/emit-stub.sh" <<EOF
#!/usr/bin/env bash
# test stub for cfn-workbench emit-event.sh
slug=""; ev=""; lane=""; detail=""
while [ \$# -gt 0 ]; do
  case "\$1" in
    --slug) slug="\$2"; shift 2 ;;
    --event) ev="\$2"; shift 2 ;;
    --lane) lane="\$2"; shift 2 ;;
    --detail) detail="\$2"; shift 2 ;;
    *) shift ;;
  esac
done
printf '%s|%s|%s|%s\n' "\$slug" "\$ev" "\$lane" "\$detail" >> "\$EMIT_LOG"
exit 0
EOF
chmod +x "$TEST_TMP/emit-stub.sh"
export FLEET_WB_EMIT_EVENT="$TEST_TMP/emit-stub.sh"
export EMIT_LOG

# build_run <name> — fresh run dir with an empty SPEC-shaped roster.
build_run() {
    RUN_DIR="$TEST_TMP/planning/fleet-$1"
    mkdir -p "$RUN_DIR"
    printf 'ws_id\tname\ttask\tstatus\tclaims\tlanded_sha\tmigration_num\tscratch_db\theartbeat\tnotes\n' > "$RUN_DIR/roster.tsv"
    : > "$RUN_DIR/.roster.lock"
    export FLEET_RUN_DIR="$RUN_DIR"
}

# add_ws WSxx name task [status]
add_ws() {
    printf '%s\t%s\t%s\t%s\t\t\t\t\t0\t\n' "$1" "$2" "$3" "${4:-pending}" >> "$RUN_DIR/roster.tsv"
}

# set_status WSxx status — rewrite that row's status cell (fixture-only).
set_status() {
    awk -F'\t' -v OFS='\t' -v ws="$1" -v st="$2" 'NR > 1 && $1 == ws { $4 = st } { print }' \
        "$RUN_DIR/roster.tsv" > "$RUN_DIR/roster.tsv.new" \
        && mv "$RUN_DIR/roster.tsv.new" "$RUN_DIR/roster.tsv"
}

# run_watch — invoke main in a subshell (ALL-DONE exits), capture rc + stdout.
run_watch() {
    RC=0
    WATCH_OUT=$(main "$@" 2>/dev/null) || RC=$?
}

test_baseline_scan_writes_runplan_and_loop_started() {
    log_step "GIVEN fresh run, WHEN first watch --once --emit-events"
    build_run wbr1
    add_ws WS01 ws-auth "build auth" pending
    add_ws WS02 "ws two" "build api" pending
    : > "$EMIT_LOG"

    run_watch --once --emit-events

    assert_equals "0" "$RC" "baseline scan exits 0"
    assert_not_contains "$WATCH_OUT" "CHANGE" "baseline scan emits no CHANGE lines"
    assert_equals "1" "$(wc -l < "$EMIT_LOG")" "exactly one event (loop_started)"
    assert_contains "$(cat "$EMIT_LOG")" "fleet-wbr1|loop_started||fleet run" "loop_started with run-dir slug"

    local plan="$RUN_DIR/run-plan-fleet-wbr1.json"
    [ -f "$plan" ]
    assert_success "run-plan written inside run dir"
    assert_equals "fleet-wbr1" "$(jq -r '.slug' "$plan")" "run-plan slug"
    assert_equals "ws-auth ws_two" "$(jq -r '.lanes[].id' "$plan" | tr '\n' ' ' | sed 's/ $//')" \
        "lane ids: roster names lowercased, spaces folded"
    assert_equals "build auth" "$(jq -r '.lanes[0].name' "$plan")" "lane name carries task text"
}

test_status_transitions_emit_lane_events() {
    log_step "GIVEN roster transitions across scans, WHEN watch --once --emit-events twice"
    build_run wbr2
    add_ws WS01 ws-auth "build auth" pending
    add_ws WS02 ws-api "build api" pending   # stays pending: no ALL-DONE here
    : > "$EMIT_LOG"
    run_watch --once --emit-events   # baseline

    set_status WS01 started
    run_watch --once --emit-events
    assert_contains "$(cat "$EMIT_LOG")" "fleet-wbr2|lane_spawned|ws-auth|" "started -> lane_spawned for roster name"

    set_status WS01 landed
    run_watch --once --emit-events
    assert_contains "$(cat "$EMIT_LOG")" "fleet-wbr2|lane_landed|ws-auth|" "landed -> lane_landed"

    assert_equals "1" "$(grep -c "loop_started" "$EMIT_LOG")" "loop_started emitted once across scans"
    assert_equals "3" "$(wc -l < "$EMIT_LOG")" "exactly loop_started + lane_spawned + lane_landed, nothing else"
}

test_all_done_emits_loop_finished_exits_zero() {
    log_step "GIVEN every workstream landed, WHEN watch --once --emit-events"
    build_run wbr3
    add_ws WS01 ws-auth "build auth" pending
    add_ws WS02 ws-api "build api" pending
    : > "$EMIT_LOG"
    run_watch --once --emit-events   # baseline

    set_status WS01 landed
    set_status WS02 landed
    run_watch --once --emit-events

    assert_equals "0" "$RC" "ALL-DONE exits 0"
    assert_contains "$WATCH_OUT" "ALL-DONE" "ALL-DONE line on stdout"
    assert_contains "$(cat "$EMIT_LOG")" "fleet-wbr3|loop_finished||all workstreams landed/done" \
        "ALL-DONE -> loop_finished"
    assert_contains "$(cat "$EMIT_LOG")" "lane_landed|ws-auth" "both lanes also report landed"
    assert_contains "$(cat "$EMIT_LOG")" "lane_landed|ws-api" "second lane landed event present"
}

test_emit_events_is_opt_in() {
    log_step "GIVEN plain watch (no --emit-events), WHEN scan"
    build_run wbr4
    add_ws WS01 ws-auth "build auth" started
    : > "$EMIT_LOG"

    run_watch --once

    assert_equals "0" "$(wc -l < "$EMIT_LOG")" "no events without the flag"
    [ ! -f "$RUN_DIR/run-plan-fleet-wbr4.json" ]
    assert_success "no run-plan without the flag"
}

test_missing_emitter_never_fails_watch() {
    log_step "GIVEN emitter path pointing nowhere, WHEN watch --once --emit-events"
    build_run wbr5
    add_ws WS01 ws-auth "build auth" started
    : > "$EMIT_LOG"
    FLEET_WB_EMIT_EVENT="$TEST_TMP/does-not-exist.sh" run_watch --once --emit-events

    assert_equals "0" "$RC" "watch survives absent emitter (|| true contract)"
    assert_equals "0" "$(wc -l < "$EMIT_LOG")" "nothing emitted"
}

test_baseline_scan_writes_runplan_and_loop_started
test_status_transitions_emit_lane_events
test_all_done_emits_loop_finished_exits_zero
test_emit_events_is_opt_in
test_missing_emitter_never_fails_watch

print_test_summary
