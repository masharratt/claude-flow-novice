---
description: Search codebase using CodeSearch semantic index (400x faster than grep)
arguments:
  query:
    description: Natural language search query
    required: true
  --top:
    description: Number of results to return (default 10)
    required: false
---

# Codebase Search Command

Search your indexed codebase using CodeSearch. Uses SQLite index for fast lookups.

**Examples:**
- `/cfn-codesearch:cfn-codebase-search authentication logic`
- `/cfn-codesearch:cfn-codebase-search React components --top 20`
- `/cfn-codesearch:cfn-codebase-search database migration`

**Prerequisites:**
- Codebase must be indexed: `/cfn-codebase-reindex`
- OPENAI_API_KEY optional (SQL search works without it, semantic search needs it)

---

Execute the search:

```bash
QUERY="{{query}}"
MAX_RESULTS={{#if top}}{{top}}{{else}}10{{/if}}
DB_PATH="$HOME/.local/share/codesearch/index_v2.db"
PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Try SQL first (no API key needed, fastest path)
if [ -f "$DB_PATH" ]; then
    SAFE_Q=$(echo "$QUERY" | sed "s/'/''/g")
    SAFE_ROOT=$(echo "$PROJECT_ROOT" | sed "s/'/''/g")
    SQL_RESULTS=$(sqlite3 -separator ' | ' "$DB_PATH" \
        "SELECT REPLACE(file_path, '$SAFE_ROOT/', ''), line_number, kind, name FROM entities WHERE project_root = '$SAFE_ROOT' AND (name LIKE '%${SAFE_Q}%' OR file_path LIKE '%${SAFE_Q}%') LIMIT $MAX_RESULTS" 2>/dev/null || true)
    if [ -n "$SQL_RESULTS" ]; then
        echo "=== CodeSearch SQL Results ==="
        echo "$SQL_RESULTS"
        echo ""
    fi
fi

# Try semantic search if API key available
if [[ "${OPENAI_API_KEY:-}" != sk-* ]] && [[ -f ".env" ]]; then
    export OPENAI_API_KEY=$(grep "^OPENAI_API_KEY=" .env 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
fi

if [[ "${OPENAI_API_KEY:-}" == sk-* ]]; then
    CODESEARCH_BIN="${HOME}/.local/bin/local-codesearch"
    [ ! -f "$CODESEARCH_BIN" ] && CODESEARCH_BIN="./.claude/skills/cfn-codesearch/target/release/local-codesearch"
    if [ -x "$CODESEARCH_BIN" ]; then
        echo "=== CodeSearch Semantic Results ==="
        "$CODESEARCH_BIN" query "$QUERY" --max-results "$MAX_RESULTS" --threshold 0.1 2>/dev/null || true
    fi
elif [ -z "${SQL_RESULTS:-}" ]; then
    echo "No results. Index may be missing for this project. Run: /cfn-codebase-reindex"
fi
```
