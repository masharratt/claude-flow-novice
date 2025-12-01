---
description: Search codebase using natural language queries via RuVector semantic index
arguments:
  query:
    description: Natural language search query
    required: true
  --top:
    description: Number of results to return (default 5)
    required: false
---

# Codebase Search Command

Search your indexed codebase using natural language queries. Uses RuVector's semantic search to find relevant files based on meaning, not just keywords.

**Examples:**
- `/codebase-search authentication logic`
- `/codebase-search React components for user profile --top 10`
- `/codebase-search database migration utilities`
- `/codebase-search error handling patterns`

**Returns:**
- File paths ranked by relevance
- File purpose and exports
- Code metrics (lines, complexity)
- Relevance scores

**Prerequisites:**
- Codebase must be indexed first (run `/codebase-reindex`)
- OPENAI_API_KEY or ZAI_API_KEY must be set

---

Execute the search:

```bash
./.claude/skills/ruvector-codebase-index/search.sh "{{query}}" {{#if top}}--top {{top}}{{/if}}
```
