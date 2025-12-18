#!/bin/bash
set -euo pipefail
exec 2>/tmp/ruvector-search-hook.log

INPUT=$(timeout 1 cat || echo "{}")
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
PATTERN=$(echo "$INPUT" | jq -r '.tool_input.pattern // empty')

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> /tmp/ruvector-search-hook.log
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

# Skip conditions
if [[ ${#PATTERN} -lt 3 ]]; then
    log "Pattern too short, skipping"
    exit 0
fi

# Skip glob patterns (file discovery, not semantic)
if [[ "$PATTERN" == *"*"* ]] || [[ "$PATTERN" == *"?"* ]] || [[ "$PATTERN" == *"["* ]]; then
    log "Pattern looks like glob, skipping"
    exit 0
fi

# Skip exact paths (contains / and . extension)
if [[ "$PATTERN" == *"/"* ]] && [[ "$PATTERN" == *"."* ]]; then
    log "Pattern looks like exact path, skipping"
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

# Query RuVector V2 SQL first (no API key needed)
RUVECTOR_RESULTS=""
DB_PATH="$HOME/.local/share/ruvector/index_v2.db"
PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
if [[ -f "$DB_PATH" ]]; then
    log "Querying RuVector SQL for: $PATTERN (project: $PROJECT_ROOT)"
    # Escape pattern for SQL LIKE
    SAFE_PATTERN=$(echo "$PATTERN" | sed "s/'/''/g")
    SAFE_ROOT=$(echo "$PROJECT_ROOT" | sed "s/'/''/g")
    RUVECTOR_RESULTS=$(timeout 3 sqlite3 -separator ':' "$DB_PATH" \
        "SELECT REPLACE(file_path, '$SAFE_ROOT/', ''), line_number, name FROM entities WHERE project_root = '$SAFE_ROOT' AND (name LIKE '%${SAFE_PATTERN}%' OR file_path LIKE '%${SAFE_PATTERN}%') LIMIT 8" 2>/dev/null | head -10 || true)
    if [[ -n "$RUVECTOR_RESULTS" ]]; then
        log "RuVector SQL returned results"
        CONTEXT="${CONTEXT}RuVector indexed matches for '$PATTERN':
$RUVECTOR_RESULTS

"
    fi
else
    log "RuVector index not found at $DB_PATH"
fi

# Fallback to semantic search if SQL found nothing and API key available
if [[ -z "$RUVECTOR_RESULTS" ]] && command -v local-ruvector >/dev/null 2>&1; then
    if load_api_key; then
        log "SQL returned nothing, trying semantic search for: $PATTERN"
        # Strip ANSI codes from output
        SEMANTIC_RESULTS=$(timeout 5 local-ruvector query "$PATTERN" --max-results 5 --threshold 0.3 2>/dev/null | sed 's/\x1b\[[0-9;]*m//g' | grep -v "^$" | grep -v "INFO\|ERROR\|WARN" | head -8 || true)
        if [[ -n "$SEMANTIC_RESULTS" ]]; then
            log "Semantic search returned results"
            CONTEXT="${CONTEXT}RuVector semantic matches for '$PATTERN':
$SEMANTIC_RESULTS

"
        else
            log "Semantic search returned no results"
        fi
    else
        log "No API key available for semantic search"
    fi
fi

# Output context if we have any
if [[ -n "$CONTEXT" ]]; then
    # Try JSON output first
    if command -v jq >/dev/null 2>&1; then
        echo "$INPUT" | jq --arg context "$CONTEXT" '. + {additionalContext: $context}'
    else
        # Fallback to plain text
        echo "$CONTEXT"
    fi
    log "Context injected successfully"
else
    log "No additional context found"
fi

exit 0