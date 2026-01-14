#!/bin/bash
set -euo pipefail

INPUT=$(timeout 1 cat || echo "{}")
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

log() { echo "[$(date '+%H:%M:%S')] $*" >> /tmp/codesearch-bash-hook.log; }

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
            return 0
        fi
    fi
    return 1
}

log "Bash hook: $CMD"

if echo "$CMD" | grep -qE "find\s+/mnt/c"; then
  echo "🔴 BLOCKED: find on /mnt/c forbidden (memory leak). Use Glob tool instead." >&2
  exit 2
fi

if ! echo "$CMD" | grep -qiE "^\s*(grep|rg|find)\s|[|&;]\s*(grep|rg|find)\s"; then
  exit 0
fi

PATTERN=""

PATTERN=$(echo "$CMD" | grep -oE '(grep|rg)\s+[^|]+' | grep -oE '"[^"]+"' | head -1 | tr -d '"' || true)

if [ -z "$PATTERN" ]; then
  PATTERN=$(echo "$CMD" | grep -oE "(grep|rg)\s+(-[a-zA-Z]+\s+)*([a-zA-Z_][a-zA-Z0-9_]*)" | awk '{print $NF}' || true)
fi

if [ -z "$PATTERN" ]; then
  PATTERN=$(echo "$CMD" | grep -oE '\-name\s+"[^"]+"' | sed 's/-name\s*"//' | tr -d '"' || true)
fi

if [ -z "$PATTERN" ] || [ ${#PATTERN} -lt 3 ] || [[ "$PATTERN" == -* ]]; then
  exit 0
fi

DB_PATH="$HOME/.local/share/codesearch/index_v2.db"
PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"

CONTEXT=""

# Try SQL first (fast, no API key)
if [ -f "$DB_PATH" ]; then
  SAFE_PATTERN=$(echo "$PATTERN" | sed "s/'/''/g")
  SAFE_ROOT=$(echo "$PROJECT_ROOT" | sed "s/'/''/g")

  RESULTS=$(timeout 3 sqlite3 -separator ':' "$DB_PATH" \
    "SELECT REPLACE(file_path, '$SAFE_ROOT/', ''), line_number, name FROM entities WHERE project_root = '$SAFE_ROOT' AND (name LIKE '%${SAFE_PATTERN}%' OR file_path LIKE '%${SAFE_PATTERN}%') LIMIT 6" 2>/dev/null || true)

  if [ -n "$RESULTS" ]; then
    CONTEXT="CodeSearch indexed matches for '$PATTERN':\n$RESULTS"
    log "SQL context injected for: $PATTERN"
  fi
fi

# Fallback to semantic search if SQL found nothing
if [ -z "$CONTEXT" ] && command -v local-codesearch >/dev/null 2>&1; then
  if load_api_key; then
    log "SQL returned nothing, trying semantic search for: $PATTERN"
    SEMANTIC=$(timeout 5 local-codesearch query "$PATTERN" --max-results 5 --threshold 0.3 2>/dev/null | sed 's/\x1b\[[0-9;]*m//g' | grep -v "^$" | grep -v "INFO\|ERROR\|WARN" | head -6 || true)
    if [ -n "$SEMANTIC" ]; then
      CONTEXT="CodeSearch semantic matches for '$PATTERN':\n$SEMANTIC"
      log "Semantic context injected for: $PATTERN"
    fi
  fi
fi

if [ -n "$CONTEXT" ]; then
  echo "{\"additionalContext\":\"$CONTEXT\"}"
fi

exit 0