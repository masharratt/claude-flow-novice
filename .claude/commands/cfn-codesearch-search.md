---
description: "Semantic code search with CodeSearch (400x faster than grep)"
argument-hint: "<query>"
---

# CodeSearch Search

Quick semantic search through your indexed codebase.

## Usage

```
/cfn-codesearch-search "authentication middleware"
/cfn-codesearch-search "error handling pattern"
```

## What it does

- Queries pre-built SQLite index (not filesystem scan)
- Returns file paths with line numbers
- 400x faster than grep for indexed projects

## Prerequisites

- Project must be indexed first
- Run: `./local-codesearch index --path . --force`

---

Execute search:

```bash
CODESEARCH_BIN="${HOME}/.local/bin/local-codesearch"
[ ! -f "$CODESEARCH_BIN" ] && CODESEARCH_BIN="./.claude/skills/cfn-codesearch/target/release/local-codesearch"
"$CODESEARCH_BIN" query "$ARGUMENTS" --max-results 10
```
