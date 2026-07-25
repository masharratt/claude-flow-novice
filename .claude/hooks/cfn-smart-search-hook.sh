#!/bin/bash
set -uo pipefail

# Claude Code surfaces STDERR (not stdout) as the reason for a blocking exit 2.
# This hook used to do `exec 2>/tmp/...log`, sending the process's real stderr to
# a file, so a block had no reachable channel to explain itself at all. Keep the
# debug-noise redirect, but stash the ORIGINAL stderr on fd 3 first so the block
# reason can still be written to the stream the harness reads.
CS_HOOK_LOG="${CS_HOOK_LOG:-/tmp/codesearch-search-hook.log}"
exec 3>&2
exec 2>>"$CS_HOOK_LOG"   # append, not truncate: log() also appends to this file

# Structured logging
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HOOK_DIR/cfn-codesearch-logger.sh"

# Self-enforced deadline. This hook is registered with "timeout": 5, but its own
# per-step guards summed to 13s (3 stdin + 2 git + 3 sqlite + 5 semantic). When a
# slow dependency burned that budget the harness SIGKILLed the hook at 5s, losing
# the block decision and possibly tearing a half-written telemetry record. Bound
# the total instead of raising the registered timeout, which would only move the
# cliff further out.
# See cfn-hook-budget.sh for why `timeout N cmd | pipeline` does not bound a step.
source "$HOOK_DIR/cfn-hook-budget.sh"
cfn_budget_init

CFN_TMP=$(mktemp -d "${TMPDIR:-/tmp}/cfn-smart-hook-XXXXXX")
trap 'rm -rf "$CFN_TMP"' EXIT

if STDIN_T=$(cfn_budget 2000); then
    cfn_run_bounded "$STDIN_T" "$CFN_TMP/stdin.json" cat
    INPUT=$(cat "$CFN_TMP/stdin.json" 2>/dev/null || true)
    [ -n "$INPUT" ] || INPUT="{}"
else
    INPUT="{}"
fi

# Parse JSON without jq (may not be installed)
if command -v jq >/dev/null 2>&1; then
    TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
    PATTERN=$(echo "$INPUT" | jq -r '.tool_input.pattern // empty')
else
    TOOL_NAME=$(echo "$INPUT" | sed -n 's/.*"tool_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
    PATTERN=$(echo "$INPUT" | sed -n 's/.*"pattern"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
fi

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$CS_HOOK_LOG"
}

# Load API key from .env if not set
load_api_key() {
    if [[ -n "${OPENAI_API_KEY:-}" ]] && [[ "${OPENAI_API_KEY:-}" != "your_"* ]]; then
        return 0
    fi
    local env_file="${CLAUDE_PROJECT_DIR:-.}/.env"
    if [[ -f "$env_file" ]]; then
        local key=$(grep "^OPENAI_API_KEY=" "$env_file" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'" || true)
        if [[ -n "$key" ]] && [[ "$key" != "your_"* ]]; then
            export OPENAI_API_KEY="$key"
            log "Loaded OPENAI_API_KEY from .env"
            return 0
        fi
    fi
    return 1
}

log "Hook triggered: tool=$TOOL_NAME pattern='$PATTERN'"

# Skip if no pattern or tool not Grep/Glob
if [[ -z "$PATTERN" || -z "$TOOL_NAME" ]]; then
    log "Missing pattern or tool name, exiting"
    exit 0
fi

# Bypass flag: prefix pattern with ! to force raw grep (escape hatch)
if [[ "$PATTERN" == "!"* ]]; then
    log "Bypass flag (!) detected, skipping CodeSearch"
    cs_log "search:skip" "$PATTERN" 0 "smart-hook" "bypass flag"
    exit 0
fi

# Skip conditions
if [[ ${#PATTERN} -lt 2 ]]; then
    log "Pattern too short (< 2 chars), skipping"
    cs_log "search:skip" "$PATTERN" 0 "smart-hook" "too short (${#PATTERN} chars)"
    exit 0
fi

# For Glob tool: skip glob patterns (file discovery, not semantic search)
# For Grep tool: regex chars like *, ?, [] are valid search patterns - don't skip
if [[ "$TOOL_NAME" == "Glob" ]]; then
    log "Glob tool uses file patterns, skipping CodeSearch"
    cs_log "search:skip" "$PATTERN" 0 "smart-hook" "glob tool"
    exit 0
fi

# Skip only full absolute paths (not partial path fragments used as search terms)
if [[ "$PATTERN" == /* ]] && [[ -e "$PATTERN" ]]; then
    log "Pattern is an existing absolute path, skipping"
    cs_log "search:skip" "$PATTERN" 0 "smart-hook" "absolute path"
    exit 0
fi

CONTEXT=""
UNCOMMITTED=""

# Check uncommitted files
if command -v git >/dev/null 2>&1 && GIT_T=$(cfn_budget 2000); then
    cfn_run_bounded "$GIT_T" "$CFN_TMP/git.txt" git diff --name-only HEAD
    UNCOMMITTED=$(grep -i "$PATTERN" "$CFN_TMP/git.txt" 2>/dev/null || true)
    if [[ -n "$UNCOMMITTED" ]]; then
        log "Found uncommitted matches"
        CONTEXT="Uncommitted files matching pattern:
$UNCOMMITTED

"
    fi
fi

# Query CodeSearch V2 SQL first (no API key needed)
CODESEARCH_RESULTS=""
DB_PATH="$HOME/.local/share/codesearch/index_v2.db"
PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
if [[ -f "$DB_PATH" ]] && SQL_T=$(cfn_budget 2000); then
    log "Querying CodeSearch SQL for: $PATTERN (project: $PROJECT_ROOT)"
    # Strip regex metacharacters and escape for SQL LIKE
    SAFE_PATTERN=$(echo "$PATTERN" | sed 's/\\[swdSWDbBnrt+]//g' | sed 's/[.*+?^${}()|\\]//g; s/\[//g; s/\]//g; s/  */ /g; s/^ *//; s/ *$//' | sed "s/'/''/g")
    if [[ ${#SAFE_PATTERN} -lt 2 ]]; then
        log "Pattern too short after stripping regex, skipping SQL"
        CODESEARCH_RESULTS=""
    else
        SAFE_ROOT=$(echo "$PROJECT_ROOT" | sed "s/'/''/g")
        cfn_run_bounded "$SQL_T" "$CFN_TMP/sql.txt" sqlite3 -separator ':' "$DB_PATH" \
            "SELECT REPLACE(file_path, '$SAFE_ROOT/', ''), line_number, name FROM entities WHERE project_root = '$SAFE_ROOT' AND (name LIKE '%${SAFE_PATTERN}%' OR file_path LIKE '%${SAFE_PATTERN}%') LIMIT 8"
        CODESEARCH_RESULTS=$(head -10 "$CFN_TMP/sql.txt" 2>/dev/null || true)
        if [[ -n "$CODESEARCH_RESULTS" ]]; then
            # `local` outside a function is a bash error; it printed
            # "local: can only be used in a function" on every SQL hit.
            result_count=$(echo "$CODESEARCH_RESULTS" | wc -l)
            log "CodeSearch SQL returned results"
            cs_log "search:hit" "$PATTERN" "$result_count" "smart-hook" "sql"
            CONTEXT="${CONTEXT}CodeSearch indexed matches for '$PATTERN':
$CODESEARCH_RESULTS

"
        fi
    fi
else
    log "CodeSearch index not found at $DB_PATH"
fi

# Fallback to semantic search if SQL found nothing and API key available
if [[ -z "$CODESEARCH_RESULTS" ]] && command -v local-codesearch >/dev/null 2>&1 && SEM_T=$(cfn_budget 3000); then
    if load_api_key; then
        log "SQL returned nothing, trying semantic search for: $PATTERN"
        # Captured to a file, then filtered. Piping local-codesearch straight into
        # sed/grep let a straggler holding its stdout block the read past the limit.
        cfn_run_bounded "$SEM_T" "$CFN_TMP/sem.txt" \
            local-codesearch query "$PATTERN" --max-results 5 --threshold 0.3
        SEMANTIC_RESULTS=$(sed 's/\x1b\[[0-9;]*m//g' "$CFN_TMP/sem.txt" 2>/dev/null | grep -v "^$" | grep -v "INFO\|ERROR\|WARN" | head -8 || true)
        if [[ -n "$SEMANTIC_RESULTS" ]]; then
            # `local` outside a function is a bash error (see above).
            sem_count=$(echo "$SEMANTIC_RESULTS" | wc -l)
            log "Semantic search returned results"
            cs_log "search:hit" "$PATTERN" "$sem_count" "smart-hook" "semantic"
            CONTEXT="${CONTEXT}CodeSearch semantic matches for '$PATTERN':
$SEMANTIC_RESULTS

"
        else
            log "Semantic search returned no results"
            cs_log "search:miss" "$PATTERN" 0 "smart-hook" "sql+semantic empty"
        fi
    else
        log "No API key available for semantic search"
        cs_log "search:miss" "$PATTERN" 0 "smart-hook" "sql empty, no api key"
    fi
elif [[ -z "$CODESEARCH_RESULTS" ]]; then
    cs_log "search:miss" "$PATTERN" 0 "smart-hook" "sql empty, no semantic binary"
fi

# Count total results
TOTAL_RESULTS=0
if [[ -n "$CODESEARCH_RESULTS" ]]; then
    TOTAL_RESULTS=$(echo "$CODESEARCH_RESULTS" | wc -l)
elif [[ -n "${SEMANTIC_RESULTS:-}" ]]; then
    TOTAL_RESULTS=$(echo "$SEMANTIC_RESULTS" | wc -l)
fi

# Block mode: if CodeSearch found >=3 results, block Grep and return indexed results
# This forces agents to use Read on specific files instead of scanning with grep.
# Escape hatch: prefix pattern with ! to bypass (e.g., grep "!error message")
if [[ "$TOTAL_RESULTS" -ge 3 ]] && [[ -n "$CONTEXT" ]]; then
    log "BLOCK MODE: $TOTAL_RESULTS results, blocking Grep for pattern: $PATTERN"
    cs_log "search:block" "$PATTERN" "$TOTAL_RESULTS" "smart-hook" "blocked grep, >=3 results"
    # STDERR (fd 3 = the harness's real stderr), not stdout. Claude Code shows
    # stderr for a blocking exit 2 and ignores stdout, so writing the reason to
    # stdout produced a block with no explanation and no escape-hatch hint.
    printf '%s\n' "BLOCKED: CodeSearch found $TOTAL_RESULTS indexed matches for functions/classes/files. Use Read on these files.
For literal strings, error messages, comments, or config values: prefix with ! (e.g., pattern: \"!$PATTERN\")

$CONTEXT" >&3
    exit 2
fi

# Passthrough mode: <3 results, let Grep run and inject context alongside
if [[ -n "$CONTEXT" ]]; then
    echo "$CONTEXT"
    log "Context injected (passthrough, $TOTAL_RESULTS results)"
else
    log "No additional context found"
fi

exit 0