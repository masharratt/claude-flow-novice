#!/usr/bin/env bash
# .claude/cfn-scripts/jev-shadow-lib.sh
# Shared library for the Jev shadow pilots (batch 2, Phase 1). Sourced by
# every pilot script so append/status/envelope behavior exists exactly once.
# Defines three functions and runs nothing itself:
#   jev_append_line FILE JSON   single-line append under flock (many projects
#                               share one inode through the reverse symlinks),
#                               parent dirs created, plain append as fallback
#   jev_status MSG              one stderr line; shadow chatter never hits
#                               stdout
#   jev_envelope TYPE [PAIR...] one-line JSON object with the base fields
#                               {type,ts,project,cwd}; each PAIR adds a
#                               field: KEY=value (string) or KEY:=jsonvalue
#                               (raw JSON, for numbers and objects)
# The set flags match every current caller (they already run strict), so
# sourcing is behavior-neutral for them.
set -euo pipefail

# jev_append_line FILE JSON
# Semantics copied from the batch-1 append_line() in
# .claude/skills/cfn-vote-implement/jev-triage.sh: fd 9 opened on the target
# file, flock 9 while appending. flock is Linux-only: under set -e a missing
# flock binary would abort the locked subshell before the printf, so the lock
# is taken only when the binary exists and a plain append is the explicit
# flock-less path (macOS).
jev_append_line() {
    local file="$1" rec="$2"
    mkdir -p "$(dirname "$file")" 2>/dev/null || true
    if command -v flock >/dev/null 2>&1; then
        (
            flock 9 2>/dev/null || true
            printf '%s\n' "$rec" >&9
        ) 9>>"$file" 2>/dev/null || printf '%s\n' "$rec" >> "$file"
    else
        printf '%s\n' "$rec" >> "$file"
    fi
}

# jev_status MSG: one line on stderr.
jev_status() {
    printf '%s\n' "$1" >&2
}

# jev_envelope TYPE [KEY=value | KEY:=json]...
# Base fields match the batch-1 envelope in jev-triage.sh: ts in UTC, project
# from the enclosing git repo basename (cwd basename outside a repo), cwd as
# the caller's working directory. Keys come from fixed literals in the
# callers; values travel through --arg/--argjson, never string interpolation,
# so no value can alter the jq program.
jev_envelope() {
    if [ $# -lt 1 ]; then
        jev_status "jev-shadow-lib: jev_envelope: need a type argument"
        return 64
    fi
    local type="$1"
    shift
    local -a jq_args=(
        --arg type "$type"
        --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
        --arg project "$(basename "$(git -C "$(pwd)" rev-parse --show-toplevel 2>/dev/null || pwd)")"
        --arg cwd "$(pwd)"
    )
    local prog='{"type":$type,"ts":$ts,"project":$project,"cwd":$cwd}'
    local kv key val i=0
    for kv in "$@"; do
        i=$((i + 1))
        if [[ "$kv" == *":="* ]]; then
            key="${kv%%:=*}"
            val="${kv#*:=}"
            jq_args+=(--arg "k$i" "$key" --argjson "v$i" "$val")
        elif [[ "$kv" == *"="* ]]; then
            key="${kv%%=*}"
            val="${kv#*=}"
            jq_args+=(--arg "k$i" "$key" --arg "v$i" "$val")
        else
            jev_status "jev-shadow-lib: jev_envelope: bad pair (need KEY=value or KEY:=json): $kv"
            return 64
        fi
        prog+=" + {(\$k$i):\$v$i}"
    done
    jq -cn "${jq_args[@]}" "$prog"
}
