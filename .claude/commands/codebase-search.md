---
description: "Search codebase using CodeSearch index (SQL + semantic). Alias for /cfn-codesearch-search."
argument-hint: "<query>"
---

# /codebase-search - CodeSearch Query

Alias for `/cfn-codesearch-search`. SQL-first (no API key needed), with optional semantic fallback.

## Usage

```
/codebase-search "authentication middleware"
/codebase-search "pipeline orchestrator"
```

---

```bash
QUERY="$ARGUMENTS"
DB_PATH="$HOME/.local/share/codesearch/index_v2.db"
PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# SQL first (no API key needed)
if [ -f "$DB_PATH" ]; then
    SAFE_Q=$(echo "$QUERY" | sed "s/'/''/g")
    SAFE_ROOT=$(echo "$PROJECT_ROOT" | sed "s/'/''/g")
    SQL_RESULTS=$(sqlite3 -separator ' | ' "$DB_PATH" \
        "SELECT REPLACE(file_path, '$SAFE_ROOT/', ''), line_number, kind, name FROM entities WHERE project_root = '$SAFE_ROOT' AND (name LIKE '%${SAFE_Q}%' OR file_path LIKE '%${SAFE_Q}%') LIMIT 10" 2>/dev/null || true)
    if [ -n "$SQL_RESULTS" ]; then
        echo "=== CodeSearch SQL Results ==="
        echo "$SQL_RESULTS"
        echo ""
    fi
fi

# Semantic fallback
CODESEARCH_BIN="${HOME}/.local/bin/local-codesearch"
[ ! -f "$CODESEARCH_BIN" ] && CODESEARCH_BIN="./.claude/skills/cfn-codesearch/target/release/local-codesearch"
if [ -x "$CODESEARCH_BIN" ]; then
    if [[ "${OPENAI_API_KEY:-}" != sk-* ]] && [[ -f ".env" ]]; then
        export OPENAI_API_KEY=$(grep "^OPENAI_API_KEY=" .env 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
    fi
    if [[ "${OPENAI_API_KEY:-}" == sk-* ]]; then
        echo "=== CodeSearch Semantic Results ==="
        "$CODESEARCH_BIN" query "$QUERY" --max-results 10 --threshold 0.1 2>/dev/null || true
    fi
fi

[ -z "${SQL_RESULTS:-}" ] && [ -z "${OPENAI_API_KEY:-}" ] && echo "No results. Run /cfn-codebase-reindex to index this project."
```
