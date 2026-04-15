#!/usr/bin/env bash
# Generate a briefing for an agent based on its task description
# Called at agent spawn time to inject relevant past decisions

DB_PATH="${DB_PATH:-${HOME}/.claude/decision-log/decisions.db}"

if [ ! -f "$DB_PATH" ]; then
    exit 0
fi

TASK_DESCRIPTION="${1:-}"
MAX_CHARS="${2:-2000}"
PROJECT_FILTER=""

# Parse optional --project flag
shift 2 2>/dev/null || true
while [ $# -gt 0 ]; do
    case "$1" in
        --project)
            PROJECT_FILTER="${2:-}"
            shift 2
            ;;
        *)
            shift
            ;;
    esac
done

if [ -z "$TASK_DESCRIPTION" ]; then
    echo "Usage: briefing.sh <task-description> [max-chars] [--project <name>]" >&2
    exit 1
fi

# Derive project from git if not provided
if [ -z "$PROJECT_FILTER" ]; then
    PROJECT_FILTER=$(basename "$(git rev-parse --show-toplevel 2>/dev/null)" 2>/dev/null || basename "${CLAUDE_PROJECT_DIR:-$(pwd)}")
fi

# Build FTS5 query: extract 2-3 word phrases + individual terms
# Phrases get quoted for exact matching, single words stay as OR
SAFE_DESC=$(echo "$TASK_DESCRIPTION" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9 ]/ /g' | tr -s ' ')

# Extract bigrams/trigrams as phrases (quoted for FTS5 phrase matching)
PHRASES=$(echo "$SAFE_DESC" | awk '{
    for (i=1; i<NF; i++) {
        if (length($i) >= 3 && length($(i+1)) >= 3)
            printf "\"%s %s\" ", $i, $(i+1)
    }
}')

# Also keep individual terms > 3 chars as fallback
TERMS=$(echo "$SAFE_DESC" | grep -oE '[a-z]{4,}' | sort -u | head -10 | tr '\n' ' ')

if [ -z "$PHRASES" ] && [ -z "$TERMS" ]; then
    exit 0
fi

# Combine: phrases first (higher signal), then individual terms
FTS_QUERY=$(echo "$PHRASES $TERMS" | sed 's/  */ OR /g' | sed 's/ OR $//' | sed 's/^ OR //')

# Query: recency-boosted BM25 + project affinity
# rank is negative (more negative = more relevant); multiplying by growing factor for older messages
# adjusts relevance. Same-project results boosted 2x via 0.5 multiplier on negative rank.
SAFE_PROJECT=$(echo "$PROJECT_FILTER" | sed "s/'/''/g")
RESULTS=$(sqlite3 -json "$DB_PATH" \
    "SELECT m.id, m.role, substr(m.content, 1, 300) as content, m.project, m.timestamp FROM messages_fts fts JOIN messages m ON m.id = fts.rowid WHERE messages_fts MATCH '${FTS_QUERY}' ORDER BY (rank * (1.0 + 0.5 * (julianday('now') - julianday(m.timestamp)) / 30.0) * CASE WHEN m.project = '${SAFE_PROJECT}' THEN 0.5 ELSE 1.0 END) LIMIT 8;" 2>/dev/null)

if [ -z "$RESULTS" ] || [ "$RESULTS" = "[]" ]; then
    exit 0
fi

echo "=== PRIOR DECISIONS (from conversation history) ==="
echo ""

echo "$RESULTS" | jq -r --argjson max "$MAX_CHARS" '
    reduce .[] as $row (
        {output: "", chars: 0, done: false};
        if .done then . else
            ($row.content | length) as $len |
            if (.chars + $len + 30) > $max then
                .output += "... (budget exceeded)\n" | .done = true
            else
                .output += "[\($row.timestamp)] (\($row.project)) [id:\($row.id)]\n  \($row.role): \($row.content)\n\n" |
                .chars += $len + 30
            end
        end
    ) | .output
' 2>/dev/null

echo "=== END PRIOR DECISIONS ==="
