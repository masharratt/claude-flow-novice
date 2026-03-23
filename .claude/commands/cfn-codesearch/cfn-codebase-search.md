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
- OPENAI_API_KEY must be set for indexing

---

Execute the search:

```bash
# Load from .env if current key is invalid
if [[ ! "$OPENAI_API_KEY" =~ ^sk- ]] && [[ -f ".env" ]]; then
    export OPENAI_API_KEY=$(grep "^OPENAI_API_KEY=" .env | cut -d'=' -f2- | tr -d '"' | tr -d "'")
fi
[[ ! "$OPENAI_API_KEY" =~ ^sk- ]] && { echo "❌ OPENAI_API_KEY invalid. Add to .env" >&2; exit 1; }

CODESEARCH_BIN="${HOME}/.local/bin/local-codesearch"
[ ! -f "$CODESEARCH_BIN" ] && CODESEARCH_BIN="./.claude/skills/cfn-codesearch/target/release/local-codesearch"

# Use threshold 0.1 for better results (default 0.3 is too strict)
"$CODESEARCH_BIN" query "{{query}}" --max-results {{#if top}}{{top}}{{else}}10{{/if}} --threshold 0.1
```
