---
description: "Semantic code search with CodeSearch (400x faster than grep)"
argument-hint: "<query>"
---

# CodeSearch Search

Quick semantic search through your indexed codebase. SQL-first (no API key needed), with optional semantic fallback.

## Usage

```
/cfn-codesearch-search "authentication middleware"
/cfn-codesearch-search "error handling pattern"
```

## What it does

- Queries pre-built SQLite index first (no API key, 0.002s)
- Falls back to semantic search if API key available
- Returns file paths with line numbers
- 400x faster than grep for indexed projects

---

Execute search:

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
