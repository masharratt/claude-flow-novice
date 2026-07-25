#!/usr/bin/env bash
# Regression tests for .claude/hooks/cfn-subagent-start.sh and cfn-subagent-stop.sh.
#
# These hooks are NOT registered in any settings file. Before they can be, they
# have to survive contact with the real agent-lifecycle database. Two defects
# blocked that:
#
#   1. Forked schema. The hooks hand-rolled their own `agents` CREATE TABLE that
#      omitted name/output/updated_at. `CREATE TABLE IF NOT EXISTS` is a no-op
#      against the real DB (owned by
#      .claude/skills/cfn-agent-lifecycle/lib/audit/execute-lifecycle-hook.sh),
#      so the INSERT then hit:
#        Runtime error near line 1: NOT NULL constraint failed: agents.name (19)
#      and the hook exited 1 on every subagent spawn.
#
#   2. Wrong input channel. Claude Code delivers SubagentStart/SubagentStop
#      payloads as JSON on stdin (agent_id, agent_type, agent_transcript_path,
#      session_id). The hooks read environment variables that Claude Code never
#      sets, so every row would have been recorded as "unknown".
#
# All DB work happens in a throwaway mktemp dir. Nothing here touches
# data/agent-lifecycle.db. Agent ids are synthetic. There are no DELETEs.
#
# Run: bash tests/test-subagent-hooks.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
START_HOOK="$REPO_ROOT/.claude/hooks/cfn-subagent-start.sh"
STOP_HOOK="$REPO_ROOT/.claude/hooks/cfn-subagent-stop.sh"
CANONICAL="$REPO_ROOT/.claude/skills/cfn-agent-lifecycle/lib/audit/execute-lifecycle-hook.sh"

SCRATCH=$(mktemp -d /tmp/subagent-hooks-test-XXXXXX)
trap 'rm -rf "$SCRATCH"' EXIT

PASS=0
FAIL=0

ok()    { printf '  \033[32mPASS\033[0m %s\n' "$1"; PASS=$((PASS + 1)); }
bad()   { printf '  \033[31mFAIL\033[0m %s\n' "$1"; FAIL=$((FAIL + 1)); }
head_() { printf '\n%s\n' "$1"; }

# Synthetic identifiers only. Never a real agent id.
SYN_ID="synthetic-agent-$$"
SYN_TYPE="synthetic-tester"
SYN_SESSION="synthetic-session-$$"

# Build a database carrying the CANONICAL schema, by asking the canonical owner
# to create it. Registers one throwaway agent that the tests ignore.
make_canonical_db() {
    local db="$1"
    AGENT_LIFECYCLE_DB="$db" bash "$CANONICAL" spawn \
        --agent-id "synthetic-seed-$$" --agent-type "$SYN_TYPE" >/dev/null 2>&1
    [ -f "$db" ]
}

# Run a hook the way Claude Code does: JSON on stdin, no CFN env vars, and from
# a cwd outside any git repo so the hook's PROJECT_ROOT/log writes stay in
# SCRATCH. HOME is redirected so the stop hook cannot reach the real
# CodeSearch ingestion script.
run_hook() {
    local hook="$1" db="$2" payload="$3"
    ( cd "$SCRATCH" && printf '%s' "$payload" \
        | env -u AGENT_ID -u AGENT_TYPE -u TASK_ID -u AGENT_TRANSCRIPT_PATH \
              AGENT_LIFECYCLE_DB="$db" HOME="$SCRATCH" \
              bash "$hook" ) >"$SCRATCH/hook.out" 2>&1
}

start_payload() {
    printf '{"session_id":"%s","transcript_path":"%s/main.jsonl","cwd":"%s","hook_event_name":"SubagentStart","agent_id":"%s","agent_type":"%s"}' \
        "$SYN_SESSION" "$SCRATCH" "$SCRATCH" "$SYN_ID" "$SYN_TYPE"
}

stop_payload() {
    printf '{"session_id":"%s","transcript_path":"%s/main.jsonl","cwd":"%s","hook_event_name":"SubagentStop","stop_hook_active":false,"agent_id":"%s","agent_type":"%s","agent_transcript_path":"%s"}' \
        "$SYN_SESSION" "$SCRATCH" "$SCRATCH" "$SYN_ID" "$SYN_TYPE" "${1:-}"
}

for dep in sqlite3 jq; do
    command -v "$dep" >/dev/null 2>&1 || { echo "missing dependency: $dep"; exit 1; }
done

# --- T1: start hook against the REAL (canonical) schema --------------------
# This is the reported crash. CREATE TABLE IF NOT EXISTS silently does nothing,
# then the INSERT omits the NOT NULL columns name and updated_at.
head_ "T1  SubagentStart against canonical schema"

DB1="$SCRATCH/canonical.db"
make_canonical_db "$DB1" || bad "T1 could not build canonical DB via $CANONICAL"

if [ -f "$DB1" ]; then
    run_hook "$START_HOOK" "$DB1" "$(start_payload)"
    RC=$?
    if [ "$RC" -eq 0 ]; then
        ok "start hook exits 0 (rc=$RC)"
    else
        bad "start hook exits $RC: $(head -n1 "$SCRATCH/hook.out")"
    fi

    ROW=$(sqlite3 -separator '|' "$DB1" \
        "SELECT id, name, type, status, spawned_at, updated_at FROM agents WHERE id='$SYN_ID';" 2>/dev/null)
    if [ -z "$ROW" ]; then
        bad "no row inserted for $SYN_ID"
    else
        ok "row inserted for $SYN_ID"
        IFS='|' read -r r_id r_name r_type r_status r_spawned r_updated <<<"$ROW"
        [ "$r_id" = "$SYN_ID" ]      && ok "id = $SYN_ID"            || bad "id = '$r_id' (want $SYN_ID)"
        [ -n "$r_name" ]             && ok "name populated ($r_name)" || bad "name is empty (NOT NULL column left unset)"
        [ "$r_type" = "$SYN_TYPE" ]  && ok "type = $SYN_TYPE"        || bad "type = '$r_type' (want $SYN_TYPE, 'unknown' means stdin was not parsed)"
        [ "$r_status" = "spawned" ]  && ok "status = spawned"        || bad "status = '$r_status'"
        [ -n "$r_spawned" ]          && ok "spawned_at populated"    || bad "spawned_at is empty"
        [ -n "$r_updated" ]          && ok "updated_at populated"    || bad "updated_at is empty (NOT NULL column left unset)"
    fi

    # session_id is the only task-correlation id Claude Code supplies.
    META=$(sqlite3 "$DB1" "SELECT metadata FROM agents WHERE id='$SYN_ID';" 2>/dev/null)
    if printf '%s' "$META" | jq -e '.task_id != null and .task_id != "unknown"' >/dev/null 2>&1; then
        ok "metadata carries a real task_id ($(printf '%s' "$META" | jq -r .task_id))"
    else
        bad "metadata task_id missing or 'unknown': $META"
    fi
fi

# --- T2: stop hook completes the row ---------------------------------------
head_ "T2  SubagentStop marks the agent completed"

if [ -f "$DB1" ]; then
    run_hook "$STOP_HOOK" "$DB1" "$(stop_payload)"
    RC=$?
    [ "$RC" -eq 0 ] && ok "stop hook exits 0" \
                    || bad "stop hook exits $RC: $(head -n1 "$SCRATCH/hook.out")"

    ROW=$(sqlite3 -separator '|' "$DB1" \
        "SELECT status, completed_at, updated_at FROM agents WHERE id='$SYN_ID';" 2>/dev/null)
    IFS='|' read -r s_status s_completed s_updated <<<"$ROW"
    [ "$s_status" = "completed" ] && ok "status = completed"      || bad "status = '$s_status' (want completed)"
    [ -n "$s_completed" ]         && ok "completed_at populated"  || bad "completed_at is empty"
    [ -n "$s_updated" ]           && ok "updated_at populated"    || bad "updated_at is empty"
fi

# --- T3: stop hook with a transcript ---------------------------------------
# Exercises the json_set metadata path and the confidence read, which sees NULL
# confidence on a freshly spawned agent.
head_ "T3  SubagentStop with a transcript attached"

if [ -f "$DB1" ]; then
    TRANSCRIPT="$SCRATCH/agent.jsonl"
    printf '{"type":"tool_use","name":"Read"}\n{"type":"text","text":"done"}\n' >"$TRANSCRIPT"

    run_hook "$STOP_HOOK" "$DB1" "$(stop_payload "$TRANSCRIPT")"
    RC=$?
    [ "$RC" -eq 0 ] && ok "stop hook exits 0 with transcript" \
                    || bad "stop hook exits $RC: $(head -n1 "$SCRATCH/hook.out")"

    grep -q 'awk:' "$SCRATCH/hook.out" \
        && bad "awk error on NULL confidence: $(grep -m1 'awk:' "$SCRATCH/hook.out")" \
        || ok "no awk error on NULL confidence"

    META=$(sqlite3 "$DB1" "SELECT metadata FROM agents WHERE id='$SYN_ID';" 2>/dev/null)
    printf '%s' "$META" | jq -e '.transcript_path != null' >/dev/null 2>&1 \
        && ok "metadata.transcript_path recorded" || bad "metadata.transcript_path missing: $META"
    printf '%s' "$META" | jq -e '.tool_calls == 1' >/dev/null 2>&1 \
        && ok "metadata.tool_calls = 1" || bad "metadata.tool_calls wrong: $META"
fi

# --- T4: fresh DB gets the canonical schema, not a fork --------------------
# The hook must not be able to create a divergent `agents` table. If it runs
# first in a fresh project, the table it makes has to be the one the lifecycle
# skill expects.
head_ "T4  fresh-database schema matches the canonical owner"

DB_REF="$SCRATCH/reference.db"
DB_HOOK="$SCRATCH/hook-created.db"
make_canonical_db "$DB_REF" >/dev/null 2>&1

run_hook "$START_HOOK" "$DB_HOOK" "$(start_payload)"
RC=$?
[ "$RC" -eq 0 ] && ok "start hook exits 0 on a fresh DB" \
                || bad "start hook exits $RC on a fresh DB: $(head -n1 "$SCRATCH/hook.out")"

cols() { sqlite3 "$1" "SELECT name || ':' || type || ':' || \"notnull\" FROM pragma_table_info('agents') ORDER BY name;" 2>/dev/null; }
REF_COLS=$(cols "$DB_REF")
HOOK_COLS=$(cols "$DB_HOOK")

if [ -z "$HOOK_COLS" ]; then
    bad "hook created no agents table"
elif [ "$REF_COLS" = "$HOOK_COLS" ]; then
    ok "agents schema identical to $CANONICAL"
else
    bad "agents schema diverges from the canonical owner"
    diff <(printf '%s\n' "$REF_COLS") <(printf '%s\n' "$HOOK_COLS") | sed 's/^/      /'
fi

# lifecycle_events is part of the same canonical schema; a hook-created DB that
# lacks it cannot be handed back to the lifecycle skill.
sqlite3 "$DB_HOOK" "SELECT 1 FROM sqlite_master WHERE type='table' AND name='lifecycle_events';" 2>/dev/null | grep -q 1 \
    && ok "lifecycle_events table present" || bad "lifecycle_events table missing on hook-created DB"

# --- T5: hooks are not registered anywhere ---------------------------------
# Registration is a separate, reviewed step. This guards against it slipping in
# before the tests above pass.
head_ "T5  hooks remain unregistered (registration is a separate gated step)"

REGISTERED=$(grep -rl "cfn-subagent-start.sh\|cfn-subagent-stop.sh" \
    "$REPO_ROOT/.claude/settings.json" \
    "$REPO_ROOT/.claude/settings.local.json" \
    "$HOME/.claude/settings.json" \
    "$HOME/.claude/settings.local.json" 2>/dev/null)
[ -z "$REGISTERED" ] && ok "not registered in any settings file" \
                     || bad "registered in: $REGISTERED"

# --- Summary ---------------------------------------------------------------
printf '\n%s\n' "-----------------------------------------"
printf 'passed: %d   failed: %d\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
