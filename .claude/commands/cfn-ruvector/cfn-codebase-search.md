---
description: Search codebase using RuVector semantic index (400x faster than grep)
arguments:
  query:
    description: Natural language search query
    required: true
  --top:
    description: Number of results to return (default 10)
    required: false
---

# Codebase Search Command

Search your indexed codebase using RuVector. Uses SQLite index for fast lookups.

**Examples:**
- `/cfn-ruvector:cfn-codebase-search authentication logic`
- `/cfn-ruvector:cfn-codebase-search React components --top 20`
- `/cfn-ruvector:cfn-codebase-search database migration`

**Prerequisites:**
- Codebase must be indexed: `./local-ruvector index --path . --force`
- OPENAI_API_KEY must be set for indexing

---

Execute the search:

```bash
./.claude/skills/cfn-local-ruvector-accelerator/target/release/local-ruvector query "{{query}}" --max-results {{#if top}}{{top}}{{else}}10{{/if}}
```
