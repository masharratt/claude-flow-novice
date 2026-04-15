#!/bin/bash
set -uo pipefail
exec 2>/tmp/codesearch-search-hook.log

# Structured logging
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HOOK_DIR/cfn-codesearch-logger.sh"

INPUT=$(timeout 3 cat || echo "{}")

# Parse JSON without jq (may not be installed)
if command -v jq >/dev/null 2>&1; then
    TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
    PATTERN=$(echo "$INPUT" | jq -r '.tool_input.pattern // empty')
else
    TOOL_NAME=$(echo "$INPUT" | sed -n 's/.*"tool_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
    PATTERN=$(echo "$INPUT" | sed -n 's/.*"pattern"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
fi

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> /tmp/codesearch-search-hook.log
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
if command -v git >/dev/null 2>&1; then
    UNCOMMITTED=$(timeout 2 git diff --name-only HEAD 2>/dev/null | grep -i "$PATTERN" || true)
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
if [[ -f "$DB_PATH" ]]; then
    log "Querying CodeSearch SQL for: $PATTERN (project: $PROJECT_ROOT)"
    # Strip regex metacharacters and escape for SQL LIKE
    SAFE_PATTERN=$(echo "$PATTERN" | sed 's/\\[swdSWDbBnrt+]//g' | sed 's/[.*+?^${}()|\\]//g; s/\[//g; s/\]//g; s/  */ /g; s/^ *//; s/ *$//' | sed "s/'/''/g")
    if [[ ${#SAFE_PATTERN} -lt 2 ]]; then
        log "Pattern too short after stripping regex, skipping SQL"
        CODESEARCH_RESULTS=""
    else
        SAFE_ROOT=$(echo "$PROJECT_ROOT" | sed "s/'/''/g")
        CODESEARCH_RESULTS=$(timeout 3 sqlite3 -separator ':' "$DB_PATH" \
            "SELECT REPLACE(file_path, '$SAFE_ROOT/', ''), line_number, name FROM entities WHERE project_root = '$SAFE_ROOT' AND (name LIKE '%${SAFE_PATTERN}%' OR file_path LIKE '%${SAFE_PATTERN}%') LIMIT 8" 2>/dev/null | head -10 || true)
        if [[ -n "$CODESEARCH_RESULTS" ]]; then
            local result_count
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
if [[ -z "$CODESEARCH_RESULTS" ]] && command -v local-codesearch >/dev/null 2>&1; then
    if load_api_key; then
        log "SQL returned nothing, trying semantic search for: $PATTERN"
        # Strip ANSI codes from output
        SEMANTIC_RESULTS=$(timeout 5 local-codesearch query "$PATTERN" --max-results 5 --threshold 0.3 2>/dev/null | sed 's/\x1b\[[0-9;]*m//g' | grep -v "^$" | grep -v "INFO\|ERROR\|WARN" | head -8 || true)
        if [[ -n "$SEMANTIC_RESULTS" ]]; then
            local sem_count
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
    echo "BLOCKED: CodeSearch found $TOTAL_RESULTS indexed matches for functions/classes/files. Use Read on these files.
For literal strings, error messages, comments, or config values: prefix with ! (e.g., pattern: \"!$PATTERN\")

$CONTEXT"
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