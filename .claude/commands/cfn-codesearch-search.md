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
RUVECTOR_BIN="${HOME}/.local/bin/local-codesearch"
[ ! -f "$RUVECTOR_BIN" ] && RUVECTOR_BIN="./.claude/skills/cfn-local-codesearch-accelerator/target/release/local-codesearch"
"$RUVECTOR_BIN" query "$ARGUMENTS" --max-results 10
```
