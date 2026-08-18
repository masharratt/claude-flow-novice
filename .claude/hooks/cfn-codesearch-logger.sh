#!/usr/bin/env bash
# Structured logging for CodeSearch indexing and search operations.
# All hooks source this file for unified, persistent, queryable logs.
#
# Log format: TSV (tab-separated) for easy analysis with awk/sqlite
# Fields: timestamp \t project \t event \t pattern \t result_count \t source \t details
#
# Events:
#   search:hit     - CodeSearch returned results
#   search:miss    - CodeSearch found nothing
#   search:skip    - Pattern filtered out before query
#   index:file     - File indexed
#   index:delete   - File removed from index
#   index:complete - Indexing batch finished


# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true
LOG_DIR="${HOME}/.local/share/codesearch/logs"
mkdir -p "$LOG_DIR"

# Rotate monthly: codesearch-2026-04.tsv
_CS_LOG_FILE="${LOG_DIR}/codesearch-$(date '+%Y-%m').tsv"

# Write header if new file
if [[ ! -f "$_CS_LOG_FILE" ]]; then
    printf 'timestamp\tproject\tevent\tpattern\tresult_count\tsource\tdetails\n' > "$_CS_LOG_FILE"
fi

# cs_log <event> <pattern> <result_count> <source> <details>
# source: smart-hook, bash-hook, post-commit, manual
cs_log() {
    local event="${1:-unknown}"
    local pattern="${2:-}"
    local result_count="${3:-0}"
    local source="${4:-unknown}"
    local details="${5:-}"
    local project
    project=$(basename "${CLAUDE_PROJECT_DIR:-${PWD:-unknown}}")

    # Sanitize tabs/newlines from fields
    pattern=$(echo "$pattern" | tr '\t\n' '  ')
    details=$(echo "$details" | tr '\t\n' '  ')

    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
        "$(date '+%Y-%m-%d %H:%M:%S')" \
        "$project" \
        "$event" \
        "$pattern" \
        "$result_count" \
        "$source" \
        "$details" \
        >> "$_CS_LOG_FILE"
}

# cs_report [--project <name>] [--days <n>] [--raw]
# Quick usage stats from the log
cs_report() {
    local project="" days=7 raw=false
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --project) project="$2"; shift 2 ;;
            --days) days="$2"; shift 2 ;;
            --raw) raw=true; shift ;;
            *) shift ;;
        esac
    done

    local cutoff
    cutoff=$(date -d "$days days ago" '+%Y-%m-%d' 2>/dev/null || date -v-${days}d '+%Y-%m-%d' 2>/dev/null || echo "2000-01-01")

    # Collect all log files that could contain data in range
    local log_files
    log_files=$(ls "$LOG_DIR"/codesearch-*.tsv 2>/dev/null)
    [[ -z "$log_files" ]] && { echo "No logs found."; return; }

    local filter_cmd="cat"
    if [[ -n "$project" ]]; then
        # grep -P is GNU-only (BSD grep has no PCRE). Build the literal tabs
        # here instead, and match them fixed-string.
        local tab; tab=$(printf '\t')
        filter_cmd="grep -F -- \"${tab}${project}${tab}\""
    fi

    if $raw; then
        tail -n +2 $log_files | awk -F'\t' -v cutoff="$cutoff" '$1 >= cutoff' | eval "$filter_cmd"
        return
    fi

    echo "=== CodeSearch Usage Report (last ${days} days) ==="
    echo ""

    # Total events by type
    echo "--- Events by Type ---"
    tail -n +2 $log_files | awk -F'\t' -v cutoff="$cutoff" '
        $1 >= cutoff { counts[$3]++ }
        END { for (e in counts) printf "  %-20s %d\n", e, counts[e] }
    ' | sort -t' ' -k2 -rn

    echo ""
    echo "--- Events by Project ---"
    tail -n +2 $log_files | awk -F'\t' -v cutoff="$cutoff" '
        $1 >= cutoff {
            projects[$2]++
            hits[$2] += ($3 == "search:hit" ? 1 : 0)
            misses[$2] += ($3 == "search:miss" ? 1 : 0)
            skips[$2] += ($3 == "search:skip" ? 1 : 0)
            indexed[$2] += ($3 == "index:file" ? 1 : 0)
        }
        END {
            printf "  %-30s %6s %6s %6s %6s %6s\n", "PROJECT", "TOTAL", "HITS", "MISS", "SKIP", "INDEX"
            for (p in projects)
                printf "  %-30s %6d %6d %6d %6d %6d\n", p, projects[p], hits[p], misses[p], skips[p], indexed[p]
        }
    ' | sort -t' ' -k2 -rn

    echo ""
    echo "--- Top 10 Searched Patterns ---"
    tail -n +2 $log_files | awk -F'\t' -v cutoff="$cutoff" '
        $1 >= cutoff && $3 ~ /^search:/ { patterns[$4]++ }
        END { for (p in patterns) printf "  %4d  %s\n", patterns[p], p }
    ' | sort -rn | head -10

    echo ""
    echo "--- Hit Rate ---"
    tail -n +2 $log_files | awk -F'\t' -v cutoff="$cutoff" '
        $1 >= cutoff && $3 == "search:hit" { hits++ }
        $1 >= cutoff && $3 == "search:miss" { misses++ }
        $1 >= cutoff && $3 == "search:skip" { skips++ }
        END {
            total = hits + misses
            if (total > 0) printf "  Queries: %d | Hits: %d (%.0f%%) | Misses: %d | Skipped: %d\n", total, hits, (hits/total)*100, misses, skips
            else print "  No search queries recorded."
        }
    '

    echo ""
    echo "--- Files Indexed (last ${days} days) ---"
    tail -n +2 $log_files | awk -F'\t' -v cutoff="$cutoff" '
        $1 >= cutoff && $3 == "index:file" { count++ }
        $1 >= cutoff && $3 == "index:complete" { batches++ }
        END { printf "  Files: %d | Batches: %d\n", count+0, batches+0 }
    '
}
