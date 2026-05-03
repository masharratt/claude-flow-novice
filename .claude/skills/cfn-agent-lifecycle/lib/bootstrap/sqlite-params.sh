#!/bin/bash
set -euo pipefail

_sqlite_escape() {
    local value="$1"
    echo "${value//\'/\'\'}"
}

_sqlite_build_params() {
    local query="$1"
    shift
    local result="$query"
    local idx=1
    for param in "$@"; do
        local escaped
        escaped=$(_sqlite_escape "$param")
        result="${result//\?${idx}/\'${escaped}\'}"
        idx=$((idx + 1))
    done
    echo "$result"
}

sqlite_upsert() {
    local db_path="$1"
    local query="$2"
    shift 2
    local final_query
    final_query=$(_sqlite_build_params "$query" "$@")
    sqlite3 "$db_path" "$final_query"
}

sqlite_insert() {
    local db_path="$1"
    local query="$2"
    shift 2
    local final_query
    final_query=$(_sqlite_build_params "$query" "$@")
    sqlite3 "$db_path" "$final_query"
}

sqlite_update() {
    local db_path="$1"
    local query="$2"
    shift 2
    local final_query
    final_query=$(_sqlite_build_params "$query" "$@")
    sqlite3 "$db_path" "$final_query"
}

sqlite_select() {
    local db_path="$1"
    local query="$2"
    shift 2
    local final_query
    final_query=$(_sqlite_build_params "$query" "$@")
    sqlite3 "$db_path" "$final_query"
}
