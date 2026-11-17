#!/usr/bin/env bash
# cfn-tooling-idea -- record a tooling idea (repeated manual work worth a tool).
#
# Usage:
#   cfn-tooling-idea.sh add "<idea>" [--saves "<estimate>"] [--evidence "<what repeated>"]
#   cfn-tooling-idea.sh list [--all]
#
# Ideas live in one markdown table at <main checkout>/.claude/tooling-ideas.md.
# Main checkout = parent of git's common dir, so worktree lanes share one file.
# Outside git the file lives under $PWD/.claude. An open row with the same idea
# text (case-insensitive, whitespace-trimmed) is not added twice.
#
# Exit codes: 0 ok (including "already recorded" and an empty list),
#             1 internal error (cannot write the file), 2 usage error.
set -uo pipefail

FILE_NAME="tooling-ideas.md"
HEADER_ROW='| Date | Session | Idea | Saves | Evidence | Status |'
USAGE='usage: cfn-tooling-idea.sh add "<idea>" [--saves "<est>"] [--evidence "<what repeated>"] | list [--all]'

die_usage() { echo "cfn-tooling-idea: $1" >&2; echo "$USAGE" >&2; exit 2; }

main_root() {
    local common
    if common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) && [ -n "$common" ]; then
        if [ "$(basename "$common")" = ".git" ]; then dirname "$common"; else printf '%s' "$common"; fi
    else
        pwd
    fi
}

# clean <text>: one line, trimmed, pipes escaped.
clean() {
    local t="$1"
    t=$(printf '%s' "$t" | tr '\n\r\t' '   ' | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//; s/[[:space:]]+/ /g; s/\|/\\|/g')
    printf '%s' "$t"
}

# open_ideas <file>: print the lowercased idea column of every open row.
open_ideas() {
    awk -F'|' '/^\| [0-9]{4}-/ {
        line=$0; gsub(/\\\|/, "\001", line); n=split(line, c, "|")
        idea=c[4]; status=c[n-1]
        gsub(/^[ ]+|[ ]+$/, "", idea); gsub(/^[ ]+|[ ]+$/, "", status)
        if (status == "open") { gsub(/\001/, "\\|", idea); print tolower(idea) }
    }' "$1"
}

cmd_add() {
    local idea="" saves="" evidence="" file root session
    [ $# -ge 1 ] || die_usage "add needs an idea"
    idea="$1"; shift
    while [ $# -gt 0 ]; do
        case "$1" in
            --saves) [ $# -ge 2 ] || die_usage "--saves needs a value"; saves="$2"; shift 2 ;;
            --evidence) [ $# -ge 2 ] || die_usage "--evidence needs a value"; evidence="$2"; shift 2 ;;
            *) die_usage "unknown option: $1" ;;
        esac
    done
    idea=$(clean "$idea"); saves=$(clean "$saves"); evidence=$(clean "$evidence")
    [ -n "$idea" ] || die_usage "idea is empty"
    [ -n "$saves" ] || saves="-"
    [ -n "$evidence" ] || evidence="-"

    root=$(main_root); file="$root/.claude/$FILE_NAME"
    if [ -f "$file" ] && open_ideas "$file" | grep -qxF -- "$(printf '%s' "$idea" | tr '[:upper:]' '[:lower:]')"; then
        echo "already recorded: $idea"
        return 0
    fi
    if [ ! -f "$file" ]; then
        mkdir -p "$root/.claude" || { echo "cfn-tooling-idea: cannot create $root/.claude" >&2; return 1; }
        printf '# Tooling ideas\n\nRepeated manual work worth a tool. Add with cfn-tooling-idea.sh; set Status to done or dropped when handled.\n\n%s\n|------|---------|------|-------|----------|--------|\n' \
            "$HEADER_ROW" > "$file" || { echo "cfn-tooling-idea: cannot write $file" >&2; return 1; }
    fi
    session="-"
    if [ -n "${CLAUDE_CODE_SESSION_ID:-}" ]; then session="${CLAUDE_CODE_SESSION_ID:0:8}"
    elif [ -n "${MAILBOX_SESSION:-}" ]; then session=$(clean "$MAILBOX_SESSION"); fi
    printf '| %s | %s | %s | %s | %s | open |\n' "$(date +%F)" "$session" "$idea" "$saves" "$evidence" >> "$file" \
        || { echo "cfn-tooling-idea: cannot write $file" >&2; return 1; }
    echo "recorded: $idea ($file)"
}

cmd_list() {
    local all=0 file
    case "${1:-}" in
        "") ;;
        --all) all=1 ;;
        *) die_usage "unknown option: $1" ;;
    esac
    file="$(main_root)/.claude/$FILE_NAME"
    if [ ! -f "$file" ]; then echo "no tooling ideas recorded"; return 0; fi
    if [ "$all" -eq 1 ]; then
        grep -E '^\| (Date|-)|^\| [0-9]{4}-' "$file"
    else
        { grep -E '^\| Date ' "$file"; grep -E '^\| [0-9]{4}-.*\| open \|$' "$file"; } || true
    fi
}

case "${1:-}" in
    add) shift; cmd_add "$@" ;;
    list) shift; cmd_list "$@" ;;
    "") die_usage "missing subcommand" ;;
    *) die_usage "unknown subcommand: $1" ;;
esac
