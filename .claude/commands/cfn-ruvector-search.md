---
description: "Semantic code search with RuVector (400x faster than grep)"
argument-hint: "<query>"
---

# RuVector Search

Quick semantic search through your indexed codebase.

## Usage

```
/cfn-ruvector-search "authentication middleware"
/cfn-ruvector-search "error handling pattern"
```

## What it does

- Queries pre-built SQLite index (not filesystem scan)
- Returns file paths with line numbers
- 400x faster than grep for indexed projects

## Prerequisites

- Project must be indexed first
- Run: `./local-ruvector index --path . --force`

---

Execute search:

```bash
RUVECTOR_BIN="${HOME}/.local/bin/local-ruvector"
[ ! -f "$RUVECTOR_BIN" ] && RUVECTOR_BIN="./.claude/skills/cfn-local-ruvector-accelerator/target/release/local-ruvector"
"$RUVECTOR_BIN" query "$ARGUMENTS" --max-results 10
```
