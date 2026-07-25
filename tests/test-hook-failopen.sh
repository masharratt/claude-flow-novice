#!/usr/bin/env bash
# Regression tests for the 2026-07-25 "hook fails open" audit.
#
# Companion to tests/test-hook-security.sh. That suite covers hooks that never
# ran. This one covers hooks that DO run and still have no effect: output the
# harness cannot parse, a block reason written to a stream nobody reads, and a
# script that dies on an unbound variable before producing anything.
#
# Every hook invocation is wrapped in `timeout 20` so a regression cannot hang.
# All fixtures are synthetic and live under $SCRATCH -- no real .env is read,
# no real CodeSearch index is touched, no real repo is used.
#
# Run: bash tests/test-hook-failopen.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOKS="$REPO_ROOT/.claude/hooks"
SCRATCH=$(mktemp -d /tmp/hook-failopen-XXXXXX)
trap 'rm -rf "$SCRATCH"' EXIT

PASS=0
FAIL=0

ok()    { printf '  \033[32mPASS\033[0m %s\n' "$1"; PASS=$((PASS + 1)); }
bad()   { printf '  \033[31mFAIL\033[0m %s\n' "$1"; FAIL=$((FAIL + 1)); }
head_() { printf '\n%s\n' "$1"; }

BASH_HOOK="$HOOKS/cfn-bash-search-hook.sh"
SMART_HOOK="$HOOKS/cfn-smart-search-hook.sh"
PRECOMPACT_HOOK="$HOOKS/cfn-precompact-enhanced.sh"

# --- synthetic environment -------------------------------------------------
# A throwaway $HOME carrying a throwaway CodeSearch index, and a throwaway
# project dir. Both search hooks read $HOME/.local/share/codesearch/index_v2.db
# and ${CLAUDE_PROJECT_DIR}/.env, so redirecting both keeps this suite off the
# real index and away from any real credential file.
FAKE_HOME="$SCRATCH/home"
FAKE_PROJ="$SCRATCH/proj"
FAKE_DB="$FAKE_HOME/.local/share/codesearch/index_v2.db"
mkdir -p "$FAKE_HOME/.local/share/codesearch" "$FAKE_PROJ/src"

# Rows deliberately carry JSON-hostile characters (a double quote, a backslash)
# so a hand-rolled string-concatenation encoder cannot pass by luck.
sqlite3 "$FAKE_DB" <<SQL
CREATE TABLE entities (file_path TEXT, line_number INTEGER, name TEXT, project_root TEXT);
INSERT INTO entities VALUES
  ('$FAKE_PROJ/src/widget_a.ts', 10, 'widgetFactory',   '$FAKE_PROJ'),
  ('$FAKE_PROJ/src/widget_b.ts', 20, 'widget"quoted',   '$FAKE_PROJ'),
  ('$FAKE_PROJ/src/widget_c.ts', 30, 'widget\\back',    '$FAKE_PROJ'),
  ('$FAKE_PROJ/src/widget_d.ts', 40, 'widgetHandler',   '$FAKE_PROJ');
SQL

# Registered PreToolUse timeout for both search hooks, from settings.
# A hook that outruns this is killed mid-run -- possibly mid-write.
REGISTERED_TIMEOUT_MS=5000

# run_hook <script> <stdin-file> <stdout-file> <stderr-file> [extra env pairs...]
# Exports the synthetic HOME/project and a synthetic API key so load_api_key
# never falls through to reading a .env on disk.
run_hook() {
    local script="$1" stdin_f="$2" out_f="$3" err_f="$4"; shift 4
    env HOME="$FAKE_HOME" \
        CLAUDE_PROJECT_DIR="$FAKE_PROJ" \
        OPENAI_API_KEY="sk-synthetic-not-a-real-key" \
        CS_HOOK_LOG="$SCRATCH/smart-hook.log" \
        "$@" \
        timeout 20 bash "$script" < "$stdin_f" > "$out_f" 2> "$err_f"
}

# Monotonic milliseconds. `date` is CLOCK_REALTIME and jumps backwards on this
# host after a stall -- measuring with it produced an elapsed time of -1533ms.
now_ms() {
    local up
    read -r up _ < /proc/uptime
    echo $(( ${up%.*} * 1000 + 10#${up#*.} * 10 ))
}
elapsed_ms() { echo $(( $2 - $1 )); }

# host_stalled -- returns 0 when the MACHINE, not the code under test, is slow.
#
# This host intermittently freezes an arbitrary process for ~3.3s: a bare
# `sleep 2` with no timeout, no stub and no hook involved measured 5336ms on
# 2 of 30 runs at load average 5.68. No userspace deadline can bound wall time
# through that, and the harness's own 5s timeout is subject to the same stall.
# So an over-budget reading must be told apart from a host stall before it can
# be called a regression.
#
# This is a measurement-validity control, NOT a relaxed bound. Every assertion
# below still compares against REGISTERED_TIMEOUT_MS, an over-budget run on a
# healthy host fails immediately, and exhausting the retries is also a failure.
host_stalled() {
    local cs cend
    cs=$(now_ms); sleep 0.4; cend=$(now_ms)
    [ "$(elapsed_ms "$cs" "$cend")" -gt 1200 ]
}

# --- T1: bash search hook emits parseable JSON ----------------------------
# cfn-bash-search-hook.sh built its PreToolUse response by splicing raw
# sqlite3 output straight into a JSON string literal:
#     echo "{\"additionalContext\":\"$CONTEXT\"}"
# $CONTEXT holds multi-row query output, so the string carried literal newlines
# (U+000A) plus any quote or backslash present in an indexed symbol name. That
# is not valid JSON. Claude Code discards a hook response it cannot parse and
# reports nothing, so the hook ran, logged a hit, and injected no context.
head_ "T1  cfn-bash-search-hook.sh emits valid JSON"

printf '%s' '{"tool_name":"Bash","tool_input":{"command":"grep -rn \"widget\" src/"}}' \
    > "$SCRATCH/t1-in.json"

run_hook "$BASH_HOOK" "$SCRATCH/t1-in.json" "$SCRATCH/t1-out.txt" "$SCRATCH/t1-err.txt"
T1_RC=$?

if [ "$T1_RC" -eq 124 ]; then
    bad "hook timed out (20s)"
elif [ ! -s "$SCRATCH/t1-out.txt" ]; then
    bad "hook produced no stdout -- synthetic index did not produce a hit"
else
    if jq empty < "$SCRATCH/t1-out.txt" 2>"$SCRATCH/t1-jq.txt"; then
        ok "stdout parses as JSON"
    else
        bad "stdout is NOT valid JSON: $(tr -d '\n' < "$SCRATCH/t1-jq.txt")"
    fi

    # The payload has to survive the round trip, not just parse.
    INJECTED=$(jq -r '.hookSpecificOutput.additionalContext // .additionalContext // empty' \
        < "$SCRATCH/t1-out.txt" 2>/dev/null)
    if [ -n "$INJECTED" ]; then
        ok "additionalContext is present and non-empty"
    else
        bad "additionalContext missing or empty after parse"
    fi

    case "$INJECTED" in
        *'widget"quoted'*) ok "a symbol containing a double quote survives encoding" ;;
        *)                 bad "symbol containing a double quote was lost or mangled" ;;
    esac

    case "$INJECTED" in
        *'widget\back'*) ok "a symbol containing a backslash survives encoding" ;;
        *)               bad "symbol containing a backslash was lost or mangled" ;;
    esac

    # PreToolUse context injection is read from hookSpecificOutput. A bare
    # top-level key parses fine and is still ignored -- valid JSON alone is
    # not enough for the hook to have an effect.
    if jq -e '.hookSpecificOutput.hookEventName == "PreToolUse"' \
            < "$SCRATCH/t1-out.txt" >/dev/null 2>&1; then
        ok "response uses the hookSpecificOutput PreToolUse shape"
    else
        bad "response is not in hookSpecificOutput form (harness will ignore it)"
    fi
fi

# A miss must stay silent rather than emit a stray token.
printf '%s' '{"tool_name":"Bash","tool_input":{"command":"grep -rn \"zzznomatchzzz\" src/"}}' \
    > "$SCRATCH/t1b-in.json"
run_hook "$BASH_HOOK" "$SCRATCH/t1b-in.json" "$SCRATCH/t1b-out.txt" "$SCRATCH/t1b-err.txt"
if [ -s "$SCRATCH/t1b-out.txt" ]; then
    jq empty < "$SCRATCH/t1b-out.txt" 2>/dev/null \
        && ok "no-match run emits valid JSON" \
        || bad "no-match run emits unparseable stdout"
else
    ok "no-match run emits nothing (silent passthrough)"
fi

# --- T2: smart search hook writes its block reason to STDERR ---------------
# The hook blocks Grep with exit 2, but printed "BLOCKED: ..." to STDOUT.
# Claude Code surfaces STDERR for a blocking exit 2 and ignores stdout, so the
# tool call was blocked with no visible reason and no escape-hatch hint.
# Compounding it, line 3 did `exec 2>/tmp/codesearch-search-hook.log`, which
# redirected the process's real stderr into a file -- so even a correct
# `>&2` would have gone to disk instead of to the user.
head_ "T2  cfn-smart-search-hook.sh block reason reaches STDERR"

printf '%s' '{"tool_name":"Grep","tool_input":{"pattern":"widget"}}' > "$SCRATCH/t2-in.json"
run_hook "$SMART_HOOK" "$SCRATCH/t2-in.json" "$SCRATCH/t2-out.txt" "$SCRATCH/t2-err.txt"
T2_RC=$?

if [ "$T2_RC" -eq 2 ]; then
    ok "blocks with exit 2 (4 synthetic matches, threshold is 3)"
else
    bad "expected exit 2 for a >=3 match pattern, got $T2_RC -- block mode did not engage"
fi

if grep -q "BLOCKED" "$SCRATCH/t2-err.txt" 2>/dev/null; then
    ok "block reason present on STDERR"
else
    bad "block reason NOT on STDERR ($(wc -c < "$SCRATCH/t2-err.txt") bytes) -- user sees a bare block"
fi

if grep -q "prefix with !" "$SCRATCH/t2-err.txt" 2>/dev/null; then
    ok "escape-hatch hint reaches STDERR"
else
    bad "escape-hatch hint not on STDERR"
fi

if [ -s "$SCRATCH/t2-out.txt" ]; then
    bad "block reason also written to STDOUT ($(wc -c < "$SCRATCH/t2-out.txt") bytes, ignored on exit 2)"
else
    ok "STDOUT empty on block"
fi

# The hook must not print bash diagnostics of its own.
if grep -q "can only be used in a function" "$SCRATCH/t2-err.txt" 2>/dev/null \
   || grep -q "can only be used in a function" "$SCRATCH/smart-hook.log" 2>/dev/null; then
    bad "'local' used outside a function -- bash error on every block path"
else
    ok "no 'local outside function' bash errors"
fi

# Passthrough (<3 matches) still belongs on stdout, and must exit 0.
printf '%s' '{"tool_name":"Grep","tool_input":{"pattern":"widgetHandler"}}' > "$SCRATCH/t2b-in.json"
run_hook "$SMART_HOOK" "$SCRATCH/t2b-in.json" "$SCRATCH/t2b-out.txt" "$SCRATCH/t2b-err.txt"
T2B_RC=$?
if [ "$T2B_RC" -eq 0 ]; then
    ok "single-match pattern passes through with exit 0 (no false block)"
else
    bad "single-match pattern returned $T2B_RC (expected 0)"
fi

# --- T3: both search hooks finish inside their registered 5s timeout -------
# Both hooks are registered with `"timeout": 5` in ~/.claude/settings.local.json,
# but their own internal guards summed well past that:
#   smart-search: 3s stdin + 2s git + 3s sqlite + 5s semantic = 13s
#   bash-search:  3s stdin + 3s sqlite + 5s semantic          = 11s
# When a slow dependency actually burns that budget the harness SIGKILLs the
# hook at 5s. The block decision and the context injection are both lost, and
# the kill can land mid-write to the TSV telemetry log, leaving a torn record.
# Raising the registered timeout would only move the cliff; the hook has to
# bound its own total work instead.
head_ "T3  search hooks stay inside the registered ${REGISTERED_TIMEOUT_MS}ms timeout"

# Stub out every external dependency the hooks shell out to. These stubs are
# deliberately adversarial, because a naive `sleep` stub passes by luck: dash
# exec's a script's last command, so `timeout` ends up signalling the sleep
# directly. Two behaviours defeat a plain `timeout N`, and each hides the other:
#
#   trap "" TERM       -- ignores SIGTERM, so `timeout N` waits for it forever
#                         (measured 10002ms against a 2s limit). Needs -k.
#   setsid sleep &     -- the grandchild leaves the process group while holding
#                         the inherited stdout, so a pipeline or command
#                         substitution reading it blocks on EOF even after
#                         timeout returns (measured 15336ms against a 2s limit).
#                         Needs capture-to-file; -k alone does NOT fix this.
#
# STUB_SLEEP is a unique marker so cleanup can find these and nothing else.
STUB_SLEEP=191
SLOWBIN="$SCRATCH/slowbin"
mkdir -p "$SLOWBIN"
for stub in git sqlite3 local-codesearch; do
    {
        printf '#!/bin/sh\n'
        printf 'trap "" TERM\n'
        printf 'setsid sleep %s >/dev/null 2>&1 &\n' "$STUB_SLEEP"
        printf 'wait\n'
    } > "$SLOWBIN/$stub"
    chmod +x "$SLOWBIN/$stub"
done
reap_stubs() { pkill -KILL -f "sleep ${STUB_SLEEP}" >/dev/null 2>&1 || true; }
trap 'reap_stubs; rm -rf "$SCRATCH"' EXIT

# Per-step evidence that the cap composes across steps rather than each step
# getting its own full allowance. Runs the real budget helper against the real
# adversarial stub, exactly as the hooks use it.
head_ "T3a  budget composes across steps (per-step timings)"
# shellcheck source=/dev/null
source "$HOOKS/cfn-hook-budget.sh"

T3A_MS=0
STEP_LOG=""
for t3a_attempt in 1 2 3; do
    reap_stubs
    cfn_budget_init
    T3A_START=$(now_ms)
    STEP_LOG=""
    for step_want in 2000 2000 3000; do
        if STEP_T=$(cfn_budget "$step_want"); then
            S_START=$(now_ms)
            cfn_run_bounded "$STEP_T" "$SCRATCH/step.out" "$SLOWBIN/sqlite3"
            S_END=$(now_ms)
            printf '    want %-5s granted %-6s actual %sms\n' \
                "${step_want}ms" "${STEP_T}s" "$(elapsed_ms "$S_START" "$S_END")"
            STEP_LOG="${STEP_LOG}ran "
        else
            printf '    want %-5s granted -      SKIPPED (budget exhausted)\n' "${step_want}ms"
            STEP_LOG="${STEP_LOG}skip "
        fi
    done
    T3A_END=$(now_ms)
    T3A_MS=$(elapsed_ms "$T3A_START" "$T3A_END")
    reap_stubs

    [ "$T3A_MS" -lt "$REGISTERED_TIMEOUT_MS" ] && break
    host_stalled || break
    printf '    attempt %d: %sms, host stall detected -- remeasuring\n' "$t3a_attempt" "$T3A_MS"
done

if [ "$T3A_MS" -lt "$REGISTERED_TIMEOUT_MS" ]; then
    ok "three adversarial steps totalled ${T3A_MS}ms (< ${REGISTERED_TIMEOUT_MS}ms)"
else
    bad "three adversarial steps totalled ${T3A_MS}ms -- cap does not compose"
fi

case "$STEP_LOG" in
    *skip*) ok "budget exhaustion skips a step instead of passing timeout 0 (no limit)" ;;
    *)      bad "no step was skipped -- each step got its own full allowance" ;;
esac

# assert_within_budget <label> <hook> <stdin-file>
# Retries ONLY when a host stall is detected, at most 3 attempts, and never
# passes on a stall -- an exhausted retry budget is still a failure.
assert_within_budget() {
    local label="$1" hook="$2" stdin_f="$3"
    local attempt ms rc
    for attempt in 1 2 3; do
        reap_stubs
        local st en
        st=$(now_ms)
        run_hook "$hook" "$stdin_f" "$SCRATCH/t3-out.txt" "$SCRATCH/t3-err.txt" \
            PATH="$SLOWBIN:$PATH"
        rc=$?
        en=$(now_ms)
        ms=$(elapsed_ms "$st" "$en")
        reap_stubs

        if [ "$rc" -eq 124 ]; then
            bad "$label hit the 20s guard (runaway)"
            return
        fi
        if [ "$ms" -lt "$REGISTERED_TIMEOUT_MS" ]; then
            ok "$label finished in ${ms}ms (< ${REGISTERED_TIMEOUT_MS}ms, attempt $attempt)"
            return
        fi
        if host_stalled; then
            printf '    attempt %d: %sms, host stall detected -- remeasuring\n' "$attempt" "$ms"
            continue
        fi
        bad "$label took ${ms}ms on a healthy host -- exceeds its registered ${REGISTERED_TIMEOUT_MS}ms"
        return
    done
    bad "$label could not be measured: host stalled on all 3 attempts (last ${ms}ms)"
}

# "zzzmiss" cannot hit the index, forcing the full slow chain.
printf '%s' '{"tool_name":"Grep","tool_input":{"pattern":"zzzmisszzz"}}' > "$SCRATCH/t3-in.json"
assert_within_budget "smart-search" "$SMART_HOOK" "$SCRATCH/t3-in.json"

printf '%s' '{"tool_name":"Bash","tool_input":{"command":"grep -rn \"zzzmisszzz\" src/"}}' \
    > "$SCRATCH/t3b-in.json"
assert_within_budget "bash-search" "$BASH_HOOK" "$SCRATCH/t3b-in.json"

# --- T4: precompact survives a non-git working directory ------------------
# cfn-precompact-enhanced.sh runs under `set -euo pipefail`. Every git-derived
# variable (MODIFIED_COUNT, STAGED_COUNT, MODIFIED_FILES, GIT_UNCOMMITTED_COUNT,
# ...) was assigned only inside `if git_available; then`. Outside a git repo
# that branch is skipped, and the first unguarded read at line 156
# (`[ "$MODIFIED_COUNT" -gt 0 ]`) tripped `set -u`: the script exited 1 having
# printed nothing at all. Compaction proceeded with zero context preserved.
head_ "T4  cfn-precompact-enhanced.sh runs outside a git repository"

NONGIT="$SCRATCH/nongit"
mkdir -p "$NONGIT"
printf '%s' '{"session_id":"synthetic-session","transcript_path":"/nonexistent/x.jsonl","hook_event_name":"PreCompact","trigger":"manual","custom_instructions":"synthetic"}' \
    > "$SCRATCH/t4-in.json"

( cd "$NONGIT" && env -u CLAUDE_PROJECT_DIR HOME="$FAKE_HOME" \
    timeout 20 bash "$PRECOMPACT_HOOK" ) \
    < "$SCRATCH/t4-in.json" > "$SCRATCH/t4-out.txt" 2> "$SCRATCH/t4-err.txt"
T4_RC=$?

if [ "$T4_RC" -eq 0 ]; then
    ok "exits 0 outside a git repo"
else
    bad "exits $T4_RC outside a git repo (must always be 0, it is non-blocking)"
fi

if grep -q "unbound variable" "$SCRATCH/t4-err.txt" 2>/dev/null; then
    bad "unbound variable under set -u: $(grep -m1 'unbound variable' "$SCRATCH/t4-err.txt")"
else
    ok "no unbound-variable death under set -u"
fi

if grep -q "PRE-COMPACT CONTEXT PRESERVATION" "$SCRATCH/t4-out.txt" 2>/dev/null; then
    ok "emits its context block ($(wc -c < "$SCRATCH/t4-out.txt") bytes)"
else
    bad "emitted no context block ($(wc -c < "$SCRATCH/t4-out.txt") bytes) -- compaction loses everything"
fi

if grep -q "Session Summary" "$SCRATCH/t4-out.txt" 2>/dev/null; then
    ok "reaches the Session Summary section (past the old line-156 death point)"
else
    bad "did not reach Session Summary -- died partway through"
fi

# Positive control: a real (synthetic) git repo must still report git state.
GITREPO="$SCRATCH/gitrepo"
mkdir -p "$GITREPO"
git -C "$GITREPO" init -q
git -C "$GITREPO" config user.email "test@example.com"
git -C "$GITREPO" config user.name "Test"
printf 'const x = 1;\n' > "$GITREPO/app.js"
git -C "$GITREPO" add app.js
git -C "$GITREPO" -c commit.gpgsign=false commit -qm "init" >/dev/null 2>&1
printf 'const x = 2;\n' > "$GITREPO/app.js"

( cd "$GITREPO" && env -u CLAUDE_PROJECT_DIR HOME="$FAKE_HOME" \
    timeout 20 bash "$PRECOMPACT_HOOK" ) \
    < "$SCRATCH/t4-in.json" > "$SCRATCH/t4b-out.txt" 2> "$SCRATCH/t4b-err.txt"
T4B_RC=$?

[ "$T4B_RC" -eq 0 ] && ok "exits 0 inside a git repo" \
                    || bad "exits $T4B_RC inside a git repo"

if grep -q "Git State:" "$SCRATCH/t4b-out.txt" 2>/dev/null; then
    ok "still reports Git State when a repo is present (no regression)"
else
    bad "Git State section missing inside a real repo"
fi

if [ -f "$GITREPO/.artifacts/precompact/"session-*.json ] 2>/dev/null \
   || ls "$GITREPO/.artifacts/precompact/"session-*.json >/dev/null 2>&1; then
    ok "writes its session JSON artifact"
else
    bad "no session-*.json artifact written"
fi

# --- summary --------------------------------------------------------------
printf '\n----------------------------------------\n'
printf 'passed: %d   failed: %d\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
