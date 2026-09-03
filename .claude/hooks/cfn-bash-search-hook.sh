#!/usr/bin/env bash
# cfn-selftest: not-a-hook unwired 2026-09-03: CodeSearch nudge enforced by CLAUDE.md rule alone; script kept for tests + manual use
set -uo pipefail

# Structured logging
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HOOK_DIR/cfn-codesearch-logger.sh"

# Self-enforced deadline. This hook is registered with "timeout": 5, but its own
# per-step guards used to sum to 11s (3 stdin + 3 sqlite + 5 semantic). When a
# slow dependency burned that budget the harness SIGKILLed the hook at 5s and the
# context injection was lost silently. Cap total work below the registered limit
# rather than raising it -- a kill can land mid-write to the telemetry log.
# See cfn-hook-budget.sh for why `timeout N cmd | pipeline` does not bound a step.
source "$HOOK_DIR/cfn-hook-budget.sh"
cfn_budget_init

CFN_TMP=$(mktemp -d "${TMPDIR:-/tmp}/cfn-bash-hook-XXXXXX")
trap 'rm -rf "$CFN_TMP"' EXIT

if STDIN_T=$(cfn_budget 2000); then
    cfn_run_bounded "$STDIN_T" "$CFN_TMP/stdin.json" cat
    INPUT=$(cat "$CFN_TMP/stdin.json" 2>/dev/null || true)
    [ -n "$INPUT" ] || INPUT="{}"
else
    INPUT="{}"
fi
if command -v jq >/dev/null 2>&1; then
    CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
else
    CMD=$(echo "$INPUT" | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
fi

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

if [ -z "$PATTERN" ] || [ ${#PATTERN} -lt 2 ] || [[ "$PATTERN" == -* ]]; then
  exit 0
fi

DB_PATH="$HOME/.local/share/codesearch/index_v2.db"
PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"

CONTEXT=""

# Try SQL first (fast, no API key)
if [ -f "$DB_PATH" ] && SQL_T=$(cfn_budget 2000); then
  SAFE_PATTERN=$(echo "$PATTERN" | sed "s/'/''/g")
  SAFE_ROOT=$(echo "$PROJECT_ROOT" | sed "s/'/''/g")

  cfn_run_bounded "$SQL_T" "$CFN_TMP/sql.txt" sqlite3 -separator ':' "$DB_PATH" \
    "SELECT REPLACE(file_path, '$SAFE_ROOT/', ''), line_number, name FROM entities WHERE project_root = '$SAFE_ROOT' AND (name LIKE '%${SAFE_PATTERN}%' OR file_path LIKE '%${SAFE_PATTERN}%') LIMIT 6"
  RESULTS=$(cat "$CFN_TMP/sql.txt" 2>/dev/null || true)

  if [ -n "$RESULTS" ]; then
    result_count=$(echo "$RESULTS" | wc -l)
    # Real newline, not a literal \n: the payload is JSON-encoded below, so the
    # encoder is what escapes it. Splicing "\n" here produced a string that only
    # looked escaped while the embedded query output stayed raw.
    CONTEXT="CodeSearch indexed matches for '$PATTERN':
$RESULTS"
    log "SQL context injected for: $PATTERN"
    cs_log "search:hit" "$PATTERN" "$result_count" "bash-hook" "sql"
  fi
fi

# Fallback to semantic search if SQL found nothing
if [ -z "$CONTEXT" ] && command -v local-codesearch >/dev/null 2>&1 && SEM_T=$(cfn_budget 3000); then
  if load_api_key; then
    log "SQL returned nothing, trying semantic search for: $PATTERN"
    # Captured to a file, then filtered. Piping local-codesearch straight into
    # sed/grep let a straggler holding its stdout block the read past the limit.
    cfn_run_bounded "$SEM_T" "$CFN_TMP/sem.txt" \
      local-codesearch query "$PATTERN" --max-results 5 --threshold 0.3
    SEMANTIC=$(sed 's/\x1b\[[0-9;]*m//g' "$CFN_TMP/sem.txt" 2>/dev/null | grep -v "^$" | grep -v "INFO\|ERROR\|WARN" | head -6 || true)
    if [ -n "$SEMANTIC" ]; then
      sem_count=$(echo "$SEMANTIC" | wc -l)
      CONTEXT="CodeSearch semantic matches for '$PATTERN':
$SEMANTIC"
      log "Semantic context injected for: $PATTERN"
      cs_log "search:hit" "$PATTERN" "$sem_count" "bash-hook" "semantic"
    else
      cs_log "search:miss" "$PATTERN" 0 "bash-hook" "sql+semantic empty"
    fi
  else
    cs_log "search:miss" "$PATTERN" 0 "bash-hook" "sql empty, no api key"
  fi
elif [ -z "$CONTEXT" ]; then
  cs_log "search:miss" "$PATTERN" 0 "bash-hook" "sql empty, no semantic binary"
fi

# Emit the PreToolUse response.
#
# This used to be `echo "{\"additionalContext\":\"$CONTEXT\"}"`, which spliced raw
# sqlite3 output into a JSON string literal. Query output contains real newlines,
# and indexed symbol names contain quotes and backslashes, so the result was not
# valid JSON. Claude Code discards an unparseable hook response without surfacing
# an error, so the hook logged hits and injected nothing. Encode with jq (which
# escapes control characters correctly) and fall back to an explicit escaper.
#
# The payload also has to sit under hookSpecificOutput: a bare top-level
# additionalContext key parses fine and is still ignored for PreToolUse.
if [ -n "$CONTEXT" ]; then
  if command -v jq >/dev/null 2>&1; then
    jq -cn --arg ctx "$CONTEXT" \
      '{hookSpecificOutput: {hookEventName: "PreToolUse", additionalContext: $ctx}}'
  else
    # Escape backslash and quote, drop remaining control characters, then join
    # lines with a literal \n escape sequence.
    ESCAPED=$(printf '%s' "$CONTEXT" \
      | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' \
      | tr -d '\000-\010\013\014\016-\037' \
      | awk 'BEGIN{ORS=""} NR>1{printf "\\n"} {print}')
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"%s"}}\n' "$ESCAPED"
  fi
fi

exit 0