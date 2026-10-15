#!/usr/bin/env bash
# Work mode CLI: on / off / status / queue / doctor.
#
# Usage:
#   work-mode.sh on                 turn night mode off first (its report prints), then set the flag
#   work-mode.sh off                remove the flag, print the queue of refused visual commands
#   work-mode.sh status
#   work-mode.sh queue [--clear]    list refused commands (cwd + command); --clear empties the list
#   work-mode.sh doctor [--install]
#
# State (unless overridden): $HOME/.claude/
#   .work-mode-active     ISO UTC start ts (the flag)
#   .work-mode-queue.log  one line per refused command: <iso>\t<project>\t<cwd>\t<command>
#
# Env overrides: CFN_WORK_MODE_DIR, CFN_WORK_SETTINGS, CFN_NIGHT_MODE_DIR (passed through to night-mode.sh).
set -uo pipefail

SKILL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOKS_DIR="$(cd "$SKILL_ROOT/../.." && pwd)/hooks"
WORK_DIR="${CFN_WORK_MODE_DIR:-$HOME/.claude}"
SETTINGS_FILE="${CFN_WORK_SETTINGS:-$HOME/.claude/settings.local.json}"
NIGHT_SH="$SKILL_ROOT/../cfn-night-mode/night-mode.sh"
NIGHT_FLAG="${CFN_NIGHT_MODE_DIR:-$HOME/.claude}/.night-mode-active"
GUARD_SH="$HOOKS_DIR/cfn-work-mode-guard.sh"
INJECT_SH="$HOOKS_DIR/cfn-work-mode-inject.sh"
PATTERNS="$SKILL_ROOT/patterns.conf"

FLAG="$WORK_DIR/.work-mode-active"
QUEUE="$WORK_DIR/.work-mode-queue.log"

MISSING=""
iso_now(){ date -u +%Y-%m-%dT%H:%M:%SZ; }

chk(){ # chk <name> <rc>
    if [ "$2" = "0" ]; then echo "ok: $1"; else echo "FAIL: $1"; MISSING="$MISSING $1"; fi
}

reg_present(){ # reg_present <event> <needle>
    local hit
    [ -f "$SETTINGS_FILE" ] || return 1
    hit=$(jq -r --arg ev "$1" --arg n "$2" \
        '[(.hooks[$ev][]?.hooks[]?.command // "")] | any(contains($n))' "$SETTINGS_FILE" 2>/dev/null) || return 1
    [ "$hit" = "true" ]
}

doctor_checks(){
    MISSING=""
    command -v jq >/dev/null 2>&1; chk "dependency jq" $?
    [ -f "$GUARD_SH" ]; chk "guard script present ($GUARD_SH)" $?
    [ -f "$INJECT_SH" ]; chk "inject script present ($INJECT_SH)" $?
    [ -f "$PATTERNS" ]; chk "patterns file present ($PATTERNS)" $?
    if command -v jq >/dev/null 2>&1; then
        reg_present PreToolUse "cfn-work-mode-guard"; chk "registration PreToolUse matcher Bash (cfn-work-mode-guard)" $?
        reg_present SessionStart "cfn-work-mode-inject"; chk "registration SessionStart (cfn-work-mode-inject)" $?
        reg_present UserPromptSubmit "cfn-work-mode-inject"; chk "registration UserPromptSubmit (cfn-work-mode-inject)" $?
    fi
    [ -z "$MISSING" ]
}

REG_GUARD='{"matcher":"Bash","hooks":[{"type":"command","command":"bash $HOME/.claude/hooks/cfn-work-mode-guard.sh","timeout":5}]}'
REG_SESSION='{"hooks":[{"type":"command","command":"bash $HOME/.claude/hooks/cfn-work-mode-inject.sh","timeout":5}]}'
REG_PROMPT='{"matcher":"","hooks":[{"type":"command","command":"bash $HOME/.claude/hooks/cfn-work-mode-inject.sh","timeout":5}]}'

ensure_event(){ # ensure_event <event> <needle> <entry-json> <work-file>
    local hit
    hit=$(jq -r --arg ev "$1" --arg n "$2" \
        '[(.hooks[$ev][]?.hooks[]?.command // "")] | any(contains($n))' "$4" 2>/dev/null)
    [ "$hit" = "true" ] && return 0
    jq --arg ev "$1" --argjson e "$3" \
        '(.hooks //= {}) | (.hooks[$ev] //= []) | .hooks[$ev] += [$e]' "$4" > "$4.new" && mv -f "$4.new" "$4"
}

install_registrations(){
    if [ ! -f "$SETTINGS_FILE" ]; then
        printf '{}\n' > "$SETTINGS_FILE"
    elif ! jq -e . "$SETTINGS_FILE" >/dev/null 2>&1; then
        echo "doctor --install: $SETTINGS_FILE is not valid JSON; refusing to edit it" >&2
        return 1
    fi
    local backup work
    backup="$SETTINGS_FILE.bak.$(date +%Y%m%d-%H%M%S)"
    cp -p "$SETTINGS_FILE" "$backup" && echo "backup: $backup"
    work=$(mktemp "$(dirname "$SETTINGS_FILE")/.wm-settings.XXXXXX")
    cp -p "$SETTINGS_FILE" "$work"
    ensure_event PreToolUse "cfn-work-mode-guard" "$REG_GUARD" "$work"
    ensure_event SessionStart "cfn-work-mode-inject" "$REG_SESSION" "$work"
    ensure_event UserPromptSubmit "cfn-work-mode-inject" "$REG_PROMPT" "$work"
    jq -e . "$work" >/dev/null 2>&1 || { echo "doctor --install: produced invalid JSON; left $SETTINGS_FILE untouched" >&2; rm -f "$work"; return 1; }
    mv -f "$work" "$SETTINGS_FILE"
    doctor_checks
}

print_queue(){
    if [ ! -s "$QUEUE" ]; then
        echo "queue: empty (no visual commands were refused)."
        return 0
    fi
    echo "== Refused while in work mode: run these when the screen is yours =="
    awk -F'\t' '!seen[$3 FS $4]++ { printf "[%s] %s\n   cd %s && %s\n", $1, $2, $3, $4 }' "$QUEUE"
    echo "clear with: bash \$HOME/.claude/skills/cfn-work-mode/work-mode.sh queue --clear"
}

cmd_on(){
    if [ -f "$NIGHT_FLAG" ]; then
        echo "night mode is on: turning it off first (its report follows)."
        bash "$NIGHT_SH" off
        echo ""
    fi
    mkdir -p "$WORK_DIR"
    if [ -f "$FLAG" ]; then
        echo "work mode already ON (keeping original start ts)."
    else
        printf '%s\n' "$(iso_now)" > "$FLAG.tmp.$$" && mv -f "$FLAG.tmp.$$" "$FLAG"
    fi
    echo "== Work mode ON (since $(cat "$FLAG"))"
    echo "no visible windows: open, osascript, GUI apps, player builds, headed browsers, Unity without"
    echo "-nographics and Blender without -b are refused and queued. Questions allowed, never waited on."
    doctor_checks >/dev/null || echo "doctor: missing:$MISSING -> fix with: bash \$HOME/.claude/skills/cfn-work-mode/work-mode.sh doctor --install"
    return 0
}

cmd_off(){
    if [ ! -f "$FLAG" ]; then
        echo "work mode is not on (no flag). Nothing to turn off."
    else
        rm -f "$FLAG"
        echo "== Work mode OFF"
    fi
    print_queue
}

cmd_status(){
    if [ -f "$FLAG" ]; then echo "work mode: on (since $(cat "$FLAG"))"; else echo "work mode: off"; fi
    if [ -f "$NIGHT_FLAG" ]; then echo "night mode: on (since $(cat "$NIGHT_FLAG"))"; else echo "night mode: off"; fi
    local n=0
    [ -f "$QUEUE" ] && n=$(wc -l < "$QUEUE" | tr -d ' ')
    echo "queued refused commands: $n"
    if doctor_checks >/dev/null; then echo "registrations: all present"
    else echo "registrations MISSING:$MISSING"; echo "fix with: bash \$HOME/.claude/skills/cfn-work-mode/work-mode.sh doctor --install"; fi
}

usage(){
    echo "usage: work-mode.sh {on|off|status|queue [--clear]|doctor [--install]}" >&2
}

CMD="${1:-}"; [ $# -gt 0 ] && shift
case "$CMD" in
    on) cmd_on ;;
    off) cmd_off ;;
    status) cmd_status ;;
    queue)
        if [ "${1:-}" = "--clear" ]; then [ -f "$QUEUE" ] && : > "$QUEUE"; echo "queue cleared."
        else print_queue; fi ;;
    doctor)
        if [ "${1:-}" = "--install" ]; then install_registrations; exit $?; fi
        if doctor_checks; then echo "doctor: all checks green."; else exit 1; fi ;;
    -h|--help) usage ;;
    *) usage; exit 2 ;;
esac
