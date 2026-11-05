#!/usr/bin/env bash
# cfn-repeat-fix-guard -- stop a second blind fix after the first one failed.
#
# Incident MDTWII, night of 2026-11-04/05: three fix rounds used the same
# method with no root cause named. The written rule ("3-strike rule", "root
# cause first") was ignored, so this guard fires at the moment of the mistake.
#
# Events (one script, dispatched on hook_event_name + tool_name):
#   PostToolUse / PostToolUseFailure, matcher Bash
#       Recognise a test run, record pass/fail. If the previous run of the SAME
#       test command failed, files were edited since, and this run still fails,
#       one fix has failed: ARM on those files (additionalContext says so).
#       A passing run disarms. The first failing run never arms (TDD red).
#   PostToolUse, matcher Edit|Write|MultiEdit|NotebookEdit
#       Record the edited file path since the last test run.
#   PreToolUse, matcher Edit|Write|MultiEdit|NotebookEdit
#       Armed and the target is one of the armed files: BLOCK (exit 2).
#
# CLI:
#   cfn-repeat-fix-guard.sh --root-cause "<note>" [--session <scope>]
#       Disarm. Note must be >= MIN_NOTE_CHARS and cite evidence: a file:line
#       (src/a.ts:42) or a quoted log line ("expected 3, got 2", >=10 chars).
#       Appended to <state>/<scope>/audit.log. Without --session: uses
#       $CFN_REPEAT_FIX_SESSION, else the only armed scope.
#   cfn-repeat-fix-guard.sh --classify "<command>"
#       Exit 0 and print the normalised test key if <command> is a test run.
#
# Scope: one state dir per session; a subagent (agent_id in the payload) gets
# its own scope "<session>__<agent_id>" so a helper's fix loop never blocks the
# main chat or vice versa. Night mode: same block, the message notes no user
# is needed (the disarm is self-service).
#
# Test-command recognition: no reusable matcher existed. cfn-test-memory-guard.sh
# had a node-only regex and was deregistered for missing pnpm/yarn and for
# blocking `jest --version`; this one covers those and skips --version/--help.
#
# Fail open: any internal error -> exit 0 with one stderr line.
# Latency: 2 jq calls on a non-test Bash, 3 on a test run, 1 on Edit; no
# network, no subprocess that can hang (well inside cfn-hook-budget.sh 3000ms).
set -uo pipefail

# --- thresholds (env overridable) ---------------------------------------------
MODE="${CFN_REPEAT_FIX_GUARD:-deny}"                 # deny | warn | off
MIN_NOTE_CHARS="${CFN_REPEAT_FIX_MIN_NOTE_CHARS:-40}"
TTL_DAYS="${CFN_REPEAT_FIX_TTL_DAYS:-7}"             # prune scope dirs idle longer
TAIL_BYTES="${CFN_REPEAT_FIX_TAIL_BYTES:-16384}"      # output tail scanned for pass/fail
STATE_ROOT="${CFN_REPEAT_FIX_STATE_ROOT:-${XDG_RUNTIME_DIR:-/tmp}/cfn-guards/repeat-fix}"
NIGHT_FLAG="${CFN_NIGHT_MODE_DIR:-$HOME/.claude}/.night-mode-active"
SELF='$HOME/.claude/hooks/cfn-repeat-fix-guard.sh'

# --- test command recognition ---------------------------------------------------
RE_SHTEST='^(bash|sh)?[[:space:]]*(\./)?([^[:space:]]*/)?tests?/([^[:space:]]*/)?test[-_][^[:space:]]*\.sh([[:space:]]|$)'
RE_PKG='^(npm|pnpm|yarn|bun)[[:space:]]+(run[[:space:]]+)?test([:[:space:]]|$)'
RE_JS='^((npx|bunx|yarn|pnpm([[:space:]]+exec)?)[[:space:]]+)?(vitest|jest|mocha|ava)([[:space:]]|$)'
RE_PW='^((npx|yarn|pnpm([[:space:]]+exec)?)[[:space:]]+)?playwright[[:space:]]+test([[:space:]]|$)'
RE_PY='^(python[0-9.]*[[:space:]]+-m[[:space:]]+)?pytest([[:space:]]|$)'
RE_RS='^cargo[[:space:]]+(test|nextest)([[:space:]]|$)'
RE_GO='^go[[:space:]]+test([[:space:]]|$)'
RE_NODE='^node[[:space:]]+(.*[[:space:]])?--test([[:space:]=]|$)'
RE_NOOP='(^|[[:space:]])(--version|--help|-h|--list|--listTests|--collect-only)([[:space:]]|$)'

# test_key <command>: print the normalised key of the first test segment.
test_key() {
    local seg
    while IFS= read -r seg; do
        seg=$(printf '%s' "$seg" | sed -E \
            -e 's/^[[:space:]]+//' \
            -e ':e' -e 's/^[A-Za-z_][A-Za-z0-9_]*=("[^"]*"|'"'"'[^'"'"']*'"'"'|[^[:space:]]*)[[:space:]]+//' -e 't e' \
            -e ':w' -e 's/^(time|rtk|command|exec|env|nice|stdbuf -[oe]L)[[:space:]]+//' -e 't w' \
            -e 's/^timeout([[:space:]]+-[^[:space:]]+([[:space:]]+[0-9.]+[smh]?)?)*[[:space:]]+[0-9.]+[smh]?[[:space:]]+//' \
            -e 's/[[:space:]]*[0-9]*>>?&?[[:space:]]*[^[:space:]]+//g' \
            -e 's/[[:space:]]*<[[:space:]]*[^[:space:]]+//g' \
            -e 's/[[:space:]]+/ /g' -e 's/ $//')
        [ -n "$seg" ] || continue
        [[ "$seg" =~ $RE_NOOP ]] && continue
        if [[ "$seg" =~ $RE_SHTEST || "$seg" =~ $RE_PKG || "$seg" =~ $RE_JS || "$seg" =~ $RE_PW \
              || "$seg" =~ $RE_PY || "$seg" =~ $RE_RS || "$seg" =~ $RE_GO || "$seg" =~ $RE_NODE ]]; then
            printf '%s\n' "$seg"
            return 0
        fi
    done < <(printf '%s\n' "$1" | sed -E 's/(&&|\|\||;|\|&?)/\n/g')
    return 1
}

# outcome <text>: print pass | fail | unknown from test output.
outcome() {
    local t="$1"
    if printf '%s\n' "$t" | grep -qE '(^|[^0-9])[1-9][0-9]* (failed|failing|failures?)([^a-z]|$)|^FAIL([: ]|ED)|^not ok|^--- FAIL|test result: FAILED|Exit code [1-9]'; then
        echo fail
    elif printf '%s\n' "$t" | grep -qiE '[0-9]+ passed|test result: ok|^ok[[:space:]]|^PASS|all tests passed'; then
        echo pass
    else
        echo unknown
    fi
}

# --- state helpers -----------------------------------------------------------------
scope_dir() { printf '%s/%s' "$STATE_ROOT" "$1"; }
sanitize() { printf '%s' "$1" | tr -c 'A-Za-z0-9._-' '_'; }
audit() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$2" >> "$1/audit.log"; }
list_csv() { [ -s "$1" ] && paste -sd, "$1" || true; }

ensure_scope() { # ensure_scope <dir>: create, pruning stale siblings on first use
    local d="$1" old
    [ -d "$d" ] && return 0
    mkdir -p "$d" 2>/dev/null || return 1
    # find bounds the delete to direct children of STATE_ROOT (no variable rm target).
    [ -n "$STATE_ROOT" ] && [ "$STATE_ROOT" != / ] && \
        find "$STATE_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +"$TTL_DAYS" -exec rm -rf -- {} + 2>/dev/null || true
    return 0
}

emit_context() { # emit_context <event> <text>
    jq -nc --arg e "$1" --arg m "$2" '{hookSpecificOutput:{hookEventName:$e, additionalContext:$m}}'
}

# --- CLI: --root-cause ---------------------------------------------------------------
root_cause() {
    local note="" scope="${CFN_REPEAT_FIX_SESSION:-}" d missing=() n armed_list
    while [ $# -gt 0 ]; do
        case "$1" in
            --root-cause) note="${2:-}"; shift 2 || shift ;;
            --session) scope="${2:-}"; shift 2 || shift ;;
            *) shift ;;
        esac
    done
    if [ -z "$scope" ]; then
        local candidates=()
        while IFS= read -r d; do candidates+=("$(basename "$(dirname "$d")")"); done \
            < <(find "$STATE_ROOT" -mindepth 2 -maxdepth 2 -name armed -size +0 2>/dev/null)
        if [ "${#candidates[@]}" -ne 1 ]; then
            echo "cfn-repeat-fix-guard: pass --session <scope>; armed scopes found=${#candidates[@]} [${candidates[*]:-}]" >&2
            return 3
        fi
        scope="${candidates[0]}"
    fi
    scope=$(sanitize "$scope")
    n=${#note}
    [ "$n" -ge "$MIN_NOTE_CHARS" ] || missing+=("length ${n}<${MIN_NOTE_CHARS} chars")
    if ! [[ "$note" =~ [A-Za-z0-9_./-]+\.[A-Za-z0-9]+:[0-9]+ ]] \
       && ! printf '%s' "$note" | grep -qE "\"[^\"]{10,}\"|'[^']{10,}'|\`[^\`]{10,}\`"; then
        missing+=("evidence: a file:line like src/a.ts:42, or a quoted log line of 10+ chars")
    fi
    if [ "${#missing[@]}" -gt 0 ]; then
        local IFS='; '
        echo "REJECTED root-cause note: missing=[${missing[*]}] unexpected=[]" >&2
        echo "Name the root cause with evidence, then retry. Guard stays armed." >&2
        return 3
    fi
    d=$(scope_dir "$scope")
    ensure_scope "$d" || return 1
    armed_list=$(list_csv "$d/armed")
    audit "$d" "root-cause armed=[${armed_list}] note=$(printf '%s' "$note" | tr '\n\t' '  ')" || return 1
    rm -f -- "$d/armed" "$d/edits"
    echo "cfn-repeat-fix-guard: root cause recorded for scope ${scope}; disarmed (was armed=[${armed_list}])."
    return 0
}

# --- hook handlers ---------------------------------------------------------------------
on_bash() { # on_bash <raw> <event> <scope> <exitcode> <interrupted>
    local raw="$1" event="$2" scope="$3" code="$4" intr="$5" cmd key text res d last_res="" last_key="" armed_now
    cmd=$(printf '%s' "$raw" | jq -r '.tool_input.command // empty' 2>/dev/null) || return 1
    [ -n "$cmd" ] || return 0
    key=$(test_key "$cmd") || return 0

    if [ "$event" = "PostToolUseFailure" ]; then
        res=fail
    elif [[ "$code" =~ ^-?[0-9]+$ ]]; then
        [ "$code" -eq 0 ] && res=pass || res=fail
    elif [ "$intr" = "true" ]; then
        return 0
    else
        text=$(printf '%s' "$raw" | jq -r '
            ((.tool_response // "") | if type=="object" then ((.stdout // "") + "\n" + (.stderr // "")) else tostring end)
            + "\n" + (.error // "" | tostring)' 2>/dev/null) || return 1
        # ${v: -N} is EMPTY when v is shorter than N, so slice only long output.
        [ "${#text}" -gt "$TAIL_BYTES" ] && text="${text: -$TAIL_BYTES}"
        res=$(outcome "$text")
        [ "$res" = unknown ] && return 0
    fi

    d=$(scope_dir "$scope")
    ensure_scope "$d" || return 1
    if [ -f "$d/last" ]; then IFS=$'\t' read -r last_res last_key < "$d/last"; fi

    if [ "$res" = pass ]; then
        if [ -s "$d/armed" ]; then
            audit "$d" "disarmed-by-pass key=[$key] armed=[$(list_csv "$d/armed")]" || return 1
        fi
        rm -f -- "$d/armed"
    elif [ "$last_res" = fail ] && [ "$last_key" = "$key" ] && [ -s "$d/edits" ]; then
        { cat "$d/edits"; cat "$d/armed" 2>/dev/null || true; } | sort -u > "$d/armed.tmp" && mv -f "$d/armed.tmp" "$d/armed" || return 1
        armed_now=$(list_csv "$d/armed")
        audit "$d" "armed key=[$key] edited=[$(list_csv "$d/edits")]" || return 1
        emit_context "$event" "REPEAT-FIX GUARD ARMED: '$key' failed, files were edited, and the same test still fails. One fix has failed. armed=[${armed_now}]. Edits to these files are now blocked. Before editing again, name the root cause with evidence (a file:line or a quoted log line); never repeat the same method. Disarm: bash ${SELF} --root-cause \"<note>\" --session ${scope}  (or get the test passing)."
    fi
    printf '%s\t%s\n' "$res" "$key" > "$d/last.tmp" && mv -f "$d/last.tmp" "$d/last" || return 1
    rm -f -- "$d/edits"
    return 0
}

on_post_edit() { # on_post_edit <scope> <file>
    local d
    [ -n "$2" ] || return 0
    d=$(scope_dir "$1")
    ensure_scope "$d" || return 1
    grep -qFx -- "$2" "$d/edits" 2>/dev/null || printf '%s\n' "$2" >> "$d/edits" || return 1
    return 0
}

on_pre_edit() { # on_pre_edit <scope> <file>
    local scope="$1" f="$2" d armed_list night=""
    [ -n "$f" ] || return 0
    d=$(scope_dir "$scope")
    [ -s "$d/armed" ] || return 0
    grep -qFx -- "$f" "$d/armed" 2>/dev/null || return 0
    armed_list=$(list_csv "$d/armed")
    [ -f "$NIGHT_FLAG" ] && night=$'\nNight mode: no user is needed. Write the note yourself and continue.'
    local msg="BLOCKED by repeat-fix guard: one fix already failed on these files. armed=[${armed_list}] target=[${f}]
A test failed, files were edited, and the same test still failed (count 2 fails, threshold 2).
Name the root cause with evidence before editing again; never repeat the same method.
  1. Trace the failure: read the failing output and the code path it names.
  2. Record it (>=${MIN_NOTE_CHARS} chars, cite a file:line or a quoted log line):
     bash ${SELF} --root-cause \"<cause, with evidence>\" --session ${scope}
  3. Then edit, using a method that follows from that cause.
A passing test run also disarms. Unrelated files are not blocked.${night}"
    if [ "$MODE" = warn ]; then
        emit_context PreToolUse "$msg"
        return 0
    fi
    printf '%s\n' "$msg" >&2
    return 2
}

main() {
    case "${1:-}" in
        --root-cause) root_cause "$@"; return $? ;;
        --classify) test_key "${2:-}"; return $? ;;
    esac
    [ "$MODE" = off ] && return 0
    command -v jq >/dev/null 2>&1 || return 0

    local raw fields event tool session agent file code intr cwd scope
    raw=$(timeout 2 cat 2>/dev/null || true)
    [ -n "$raw" ] || return 0
    fields=$(printf '%s' "$raw" | jq -r '[
        (.hook_event_name // ""), (.tool_name // ""), (.session_id // ""), (.agent_id // ""),
        (.tool_input.file_path // .tool_input.notebook_path // ""),
        ((.tool_response | if type=="object" then (.exit_code // .exitCode // .returnCode // "") else "" end) | tostring),
        ((.tool_response | if type=="object" then (.interrupted // false) else false end) | tostring),
        (.cwd // "")] | map(tostring | gsub("[\u001f\n]"; " ")) | join("\u001f")' 2>/dev/null) || return 1
    # Unit separator, not tab: tab is IFS whitespace, so read would collapse
    # empty fields (agent_id is empty in the main chat) and shift every column.
    IFS=$'\x1f' read -r event tool session agent file code intr cwd <<< "$fields"
    [ -n "$session" ] || return 0
    scope=$(sanitize "$session")
    [ -n "$agent" ] && scope="${scope}__$(sanitize "$agent")"
    if [ -n "$file" ] && [ "${file#/}" = "$file" ] && [ -n "$cwd" ]; then file="$cwd/$file"; fi

    case "$event:$tool" in
        PostToolUse:Bash|PostToolUseFailure:Bash) on_bash "$raw" "$event" "$scope" "$code" "$intr" ;;
        PostToolUse:Edit|PostToolUse:Write|PostToolUse:MultiEdit|PostToolUse:NotebookEdit) on_post_edit "$scope" "$file" ;;
        PreToolUse:Edit|PreToolUse:Write|PreToolUse:MultiEdit|PreToolUse:NotebookEdit) on_pre_edit "$scope" "$file" ;;
        *) return 0 ;;
    esac
}

main "$@"
rc=$?
case "${1:-}" in
    --root-cause|--classify) [ "$rc" -eq 3 ] && exit 1; exit "$rc" ;;
esac
case "$rc" in
    0|2) exit "$rc" ;;
    *) echo "cfn-repeat-fix-guard: internal error (rc=$rc), allowing the tool call" >&2; exit 0 ;;
esac
