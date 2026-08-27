#!/usr/bin/env bash
# Night mode CLI: on / off / status / report / doctor.
#
# Usage:
#   night-mode.sh on
#   night-mode.sh off
#   night-mode.sh status
#   night-mode.sh report [--ack] [--since YYYY-MM-DD] [--project P]
#   night-mode.sh doctor [--install]
#
# State (unless overridden): $HOME/.claude/
#   .night-mode-active          ISO UTC start ts (the flag)
#   .night-mode-pending-review  window start ts; written by off, cleared by report --ack
#   .night-mode-events.log      one line per guard deny: <iso> <tool> <title>
#
# Env overrides: CFN_NIGHT_MODE_DIR, CFN_NIGHT_SETTINGS, DB_PATH (inherited by record.sh).
set -uo pipefail

SKILL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOKS_DIR="$(cd "$SKILL_ROOT/../.." && pwd)/hooks"
NIGHT_DIR="${CFN_NIGHT_MODE_DIR:-$HOME/.claude}"
SETTINGS_FILE="${CFN_NIGHT_SETTINGS:-$HOME/.claude/settings.local.json}"
DB_PATH="${DB_PATH:-$HOME/.claude/decision-log/decisions.db}"
RECORD_SH="$SKILL_ROOT/../decision-log/record.sh"
GUARD_SH="$HOOKS_DIR/cfn-night-mode-guard.sh"
INJECT_SH="$HOOKS_DIR/cfn-night-mode-inject.sh"

FLAG="$NIGHT_DIR/.night-mode-active"
PENDING="$NIGHT_DIR/.night-mode-pending-review"
EVENTS="$NIGHT_DIR/.night-mode-events.log"

MAX_DAYS=3660   # cfn: crude bound on flag-left-on-for-months walk, revisit if a real run exceeds a decade

ACK_CMD="bash $HOME/.claude/skills/cfn-night-mode/night-mode.sh report --ack"

MISSING=""

iso_now(){ date -u +%Y-%m-%dT%H:%M:%SZ; }

DOC_QUIET=0
chk(){ # chk <name> <condition-result(0=pass)>
    if [ "$2" = "0" ]; then
        [ "$DOC_QUIET" = "1" ] || echo "ok: $1"
    else
        echo "FAIL: $1"
        MISSING="$MISSING $1"
    fi
}

quiet_doctor(){ # returns 0 green; fills MISSING without printing pass lines
    DOC_QUIET=1; doctor_checks >/dev/null 2>&1; local rc=$?; DOC_QUIET=0; return $rc
}

reg_present(){ # reg_present <event> <needle> -> 0 when registered
    local ev=$1 needle=$2 hit=""
    [ -f "$SETTINGS_FILE" ] || return 1
    hit=$(jq -r --arg ev "$ev" --arg n "$needle" \
        '[(.hooks[$ev][]?.hooks[]?.command // "")] | any(contains($n))' \
        "$SETTINGS_FILE" 2>/dev/null) || return 1
    [ "$hit" = "true" ]
}

doctor_checks(){
    MISSING=""
    command -v jq >/dev/null 2>&1; chk "dependency jq" $?
    command -v sqlite3 >/dev/null 2>&1; chk "dependency sqlite3" $?
    date -u +%s >/dev/null 2>&1; chk "dependency GNU date" $?
    [ -x "$GUARD_SH" ]; chk "guard script executable ($GUARD_SH)" $?
    [ -x "$INJECT_SH" ]; chk "inject script executable ($INJECT_SH)" $?
    [ -x "$RECORD_SH" ]; chk "decision-log record.sh reachable ($RECORD_SH)" $?
    if command -v jq >/dev/null 2>&1; then
        reg_present PreToolUse "cfn-night-mode-guard"
        chk "registration PreToolUse matcher AskUserQuestion|EnterPlanMode|ExitPlanMode (cfn-night-mode-guard)" $?
        reg_present SessionStart "cfn-night-mode-inject"
        chk "registration SessionStart (cfn-night-mode-inject)" $?
        reg_present UserPromptSubmit "cfn-night-mode-inject"
        chk "registration UserPromptSubmit (cfn-night-mode-inject)" $?
    fi
    [ -z "$MISSING" ]
}

REG_GUARD='{"matcher":"AskUserQuestion|EnterPlanMode|ExitPlanMode","hooks":[{"type":"command","command":"bash $HOME/.claude/hooks/cfn-night-mode-guard.sh","timeout":5}]}'
REG_SESSION='{"hooks":[{"type":"command","command":"bash $HOME/.claude/hooks/cfn-night-mode-inject.sh","timeout":5}]}'
REG_PROMPT='{"matcher":"","hooks":[{"type":"command","command":"bash $HOME/.claude/hooks/cfn-night-mode-inject.sh","timeout":5}]}'

ensure_event(){ # ensure_event <event> <needle> <entry-json> <work-file>
    local ev=$1 needle=$2 entry=$3 work=$4 hit
    hit=$(jq -r --arg ev "$ev" --arg n "$needle" \
        '[(.hooks[$ev][]?.hooks[]?.command // "")] | any(contains($n))' "$work" 2>/dev/null)
    [ "$hit" = "true" ] && return 0
    jq --arg ev "$ev" --argjson e "$entry" \
        '(.hooks //= {}) | (.hooks[$ev] //= []) | .hooks[$ev] += [$e]' \
        "$work" > "$work.new" && mv -f "$work.new" "$work"
}

install_registrations(){
    if [ ! -f "$SETTINGS_FILE" ]; then
        printf '{}\n' > "$SETTINGS_FILE"
    elif ! jq -e . "$SETTINGS_FILE" >/dev/null 2>&1; then
        echo "doctor --install: $SETTINGS_FILE is not valid JSON; refusing to edit it" >&2
        return 1
    fi

    local backup orig_mode work
    backup="$SETTINGS_FILE.bak.$(date +%Y%m%d-%H%M%S)"
    cp -p "$SETTINGS_FILE" "$backup"
    echo "backup: $backup"

    orig_mode=$(stat -c %a "$SETTINGS_FILE" 2>/dev/null || echo 644)
    work=$(mktemp "$(dirname "$SETTINGS_FILE")/.nm-settings.XXXXXX")
    cp "$SETTINGS_FILE" "$work"

    ensure_event PreToolUse "cfn-night-mode-guard" "$REG_GUARD" "$work"
    ensure_event SessionStart "cfn-night-mode-inject" "$REG_SESSION" "$work"
    ensure_event UserPromptSubmit "cfn-night-mode-inject" "$REG_PROMPT" "$work"

    mv -f "$work" "$SETTINGS_FILE"
    chmod "$orig_mode" "$SETTINGS_FILE"

    if quiet_doctor; then
        echo "installed: all three registrations present in $SETTINGS_FILE"
        return 0
    fi
    doctor_checks || true   # loud detail for whatever is still failing
    echo "doctor --install: checks still failing after install" >&2
    return 1
}

build_slug_list(){ # build_slug_list <since-YYYY-MM-DD> -> stdout: 'night-d1','night-d2',...
    local d=$1 today out="" guard=0
    today=$(date +%F)
    while : ; do
        out+="'night-$d',"
        [ "$d" = "$today" ] && break
        d=$(date -I -d "$d + 1 day" 2>/dev/null) || break
        guard=$((guard+1)); [ "$guard" -gt "$MAX_DAYS" ] && break
    done
    [ -n "$out" ] && printf '%s' "${out%,}"
}

events_in_window(){ # events_in_window <since-date> -> count on stdout
    local since=$1
    local lb="${since}T00:00:00Z"
    local n=0
    [ -f "$EVENTS" ] || { echo 0; return; }
    n=$(awk -v lb="$lb" '$1 >= lb' "$EVENTS" | wc -l)
    echo "$n"
}

REP_TXT=""
HAS_EVENTS=0
DEC_COUNT=0

render_report(){ # render_report <since-date> [<project-filter>]
    local since=$1 proj="${2:-}" today end_iso slugs needs fyia did title chosen status blocking project ts den

    today=$(date +%F)
    end_iso=$(iso_now)
    slugs=$(build_slug_list "$since")

    DEC_COUNT=0
    HAS_EVENTS=0
    needs=""
    fyia=""

    if command -v sqlite3 >/dev/null 2>&1 && [ -f "$DB_PATH" ] && [ -n "$slugs" ]; then
        while IFS=$'\037' read -r did title chosen status blocking project ts; do
            [ -n "$did" ] || continue
            [ "$status" = "superseded" ] && continue
            DEC_COUNT=$((DEC_COUNT+1))
            if [ "$blocking" = "1" ]; then
                needs+="[$did/$project] $title"$'\n'
                needs+="   wanted: $chosen   (status=$status, at $ts)"$'\n'
            elif [ "$status" = "accepted" ]; then
                fyia+="$did [$project at $ts]: $title -> $chosen"$'\n'
            fi

        done < <(sqlite3 -separator $'\037' "$DB_PATH" \
            "SELECT decision_id, replace(title,char(31),' '), replace(chosen,char(31),' '), status, blocking, project, timestamp
             FROM decisions WHERE slug IN ($slugs) ${proj:+AND project='$proj'} ORDER BY timestamp;" 2>/dev/null)
    fi

    den=$(events_in_window "$since")
    HAS_EVENTS=$den

    if [ "$DEC_COUNT" = "0" ] && [ "$den" = "0" ]; then
        REP_TXT="No night-mode decisions or deny events in window ($since .. $today). Nothing to review."$'\n'
        return 0
    fi

    REP_TXT=""
    REP_TXT+="=== NIGHT MODE REPORT ==="$'\n'
    REP_TXT+="window: $since .. $today   |   project filter: ${proj:-all projects}   |   generated: $end_iso"$'\n'

    REP_TXT+=$'\n'"-- NEEDS ACTION (deferred for a human) --"$'\n'
    if [ -n "$needs" ]; then
        REP_TXT+="$needs"
    else
        REP_TXT+="(none)"$'\n'
    fi

    REP_TXT+=$'\n'"-- AUTO-DECIDED FYI --"$'\n'
    if [ -n "${fyia:-}" ]; then
        REP_TXT+="${fyia}"
    else
        REP_TXT+="(none)"$'\n'
    fi

    REP_TXT+=$'\n'"-- Accountability --"$'\n'
    REP_TXT+="deny events in window: $den | decisions recorded: $DEC_COUNT"$'\n'
    if [ "$den" -gt 0 ] && [ "$DEC_COUNT" = "0" ]; then
        REP_TXT+="RED FLAG: $den denies but zero decisions logged: logging was skipped; audit git log --since=$since."$'\n'
    fi

    REP_TXT+=$'\n'"-- Commits (git log evidence) --"$'\n'
    if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        GIT_LOG=$(git log --oneline --no-decorate --since="$since 00:00" 2>/dev/null | head -20)
        if [ -n "$GIT_LOG" ]; then
            REP_TXT+="$GIT_LOG"$'\n'
        else
            REP_TXT+="(no commits in window)"$'\n'
        fi
    else
        REP_TXT+="(not a git repository from here)"$'\n'
    fi

    REP_TXT+=$'\n'"Review, overturn anything wrong, then acknowledge: $ACK_CMD"$'\n'
    return 0
}

cmd_on(){
    mkdir -p "$NIGHT_DIR"
    if [ -f "$FLAG" ]; then
        echo "night mode already ON (keeping original start ts)."
    else
        printf '%s\n' "$(iso_now)" > "$FLAG.tmp.$$" && mv -f "$FLAG.tmp.$$" "$FLAG"
    fi
    START=$(cat "$FLAG")
    echo ""
    echo "== Night mode ON (since $START)"
    echo "contract: no AskUserQuestion, no plan stalls. Choose the most conservative reversible option;"
    echo "never widen scope. Log EVERY decision under slug night-\$(date +%F); commit finished work; NEVER push."
    echo "hard safety floor (defer as blocking proposed decisions, never execute): DB DELETE/DROP/TRUNCATE,"
    echo "deploys, git push, git force/reset/clean, credential changes, new Anthropic provider calls."
    echo ""
    if quiet_doctor; then
        echo "doctor: all checks green."
    else
        echo "doctor: missing -> fix with:"
        echo "  bash \${HOME}/.claude/skills/cfn-night-mode/night-mode.sh doctor --install"
        echo "full detail:"
        DOC_QUIET=0; doctor_checks || true
    fi
    return 0
}

cmd_off(){
    if [ ! -f "$FLAG" ]; then
        echo "night mode is not on (no flag). Nothing to turn off."
        return 0
    fi
    START_ISO=$(cat "$FLAG")
    SINCE="${START_ISO:0:10}"
    rm -f "$FLAG"
    render_report "$SINCE" "$PROJECT_FILTER"
    printf '%s\n' "$REP_TXT"
    if [ "$DEC_COUNT" -gt 0 ] || [ "$HAS_EVENTS" -gt 0 ]; then
        printf '%s\n' "$START_ISO" > "$PENDING"
        echo "pending review marker written ($START_ISO); sessions will nag until: $ACK_CMD"
    fi
    return 0
}

cmd_status(){
    if [ -f "$FLAG" ]; then
        echo "active: on (since $(cat "$FLAG"))"
    else
        echo "active: off"
    fi
    if [ -f "$PENDING" ]; then
        echo "pending review: yes ($(cat "$PENDING"))  clear with: $ACK_CMD"
    else
        echo "pending review: no"
    fi
    if command -v sqlite3 >/dev/null 2>&1 && [ -f "$DB_PATH" ]; then
        TODAY=$(date +%F)
        N=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM decisions WHERE slug='night-$TODAY' ${PROJECT_FILTER:+AND project='$PROJECT_FILTER'};" 2>/dev/null)
        echo "decisions with slug night-$TODAY: ${N:-?}"
    else
        echo "decisions with slug night-$(date +%F): ? (db unavailable)"
    fi
    if quiet_doctor; then
        echo "registrations: all present"
    else
        echo "registrations MISSING:$MISSING"
        echo "fix with: bash \${HOME}/.claude/skills/cfn-night-mode/night-mode.sh doctor --install"
    fi
    return 0
}

cmd_doctor(){
    if [ "$DO_INSTALL" = "1" ]; then
        install_registrations
        return $?
    fi
    if doctor_checks; then
        echo "doctor: all checks green."
        return 0
    fi
    return 1
}

usage(){
    cat >&2 <<EOF
usage: night-mode.sh {on|off|status|report|doctor} [--ack] [--since YYYY-MM-DD] [--project P]
       night-mode.sh doctor [--install]
env overrides: CFN_NIGHT_MODE_DIR CFN_NIGHT_SETTINGS DB_PATH
EOF
}

ARGS_DO_ACK=0 ARGS_SINCE="" PROJECT_FILTER="" CMD="" DO_INSTALL=0
while [ $# -gt 0 ]; do
    case "$1" in
        on|off|status|report|doctor) CMD="${CMD:-$1}"; shift;;
        --ack) ARGS_DO_ACK=1; shift;;
        --since)
            [ $# -ge 2 ] || { usage; exit 2; }
            echo "$2" | grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' || { echo "--since expects YYYY-MM-DD, got: $2" >&2; exit 2; }
            ARGS_SINCE=$2; shift 2;;
        --project)
            [ $# -ge 2 ] || { usage; exit 2; }
            PROJECT_FILTER=$2; shift 2;;
        --install) DO_INSTALL=1; shift;;
        -h|--help) usage; exit 0;;
        *) echo "unknown arg: $1" >&2; usage; exit 2;;
    esac
done

case "$CMD" in
    on) cmd_on ;;
    off) cmd_off ;;
    status) cmd_status ;;
    doctor) cmd_doctor ;;
    report)
        SINCE=""
        if [ -n "$ARGS_SINCE" ]; then
            SINCE=$ARGS_SINCE
        elif [ -f "$PENDING" ]; then
            SINCE="$(cut -c1-10 "$PENDING")"
        elif [ -f "$FLAG" ]; then
            SINCE="$(cut -c1-10 "$FLAG")"
        else
            SINCE=$(date +%F)
        fi
        render_report "$SINCE" "$PROJECT_FILTER"
        printf '%s\n' "$REP_TXT"
        if [ "$ARGS_DO_ACK" = "1" ]; then
            rm -f "$PENDING"
            [ -f "$EVENTS" ] && : > "$EVENTS"
            echo "acked: pending marker removed, events log truncated."
        fi
        ;;
    ""|*) usage; exit 2 ;;
esac
