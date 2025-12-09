---
description: "Update RuVector search index automatically"
---

# /update-search-index - Refresh Search Index

Updates the RuVector semantic search index with recent code changes.

## What it does

- Automatically detects changed files since last update
- Updates only what's needed (incremental update)
- Makes new code searchable via `/search`

## When to use

- After large code changes
- If `/search` isn't finding recent code
- Before starting a new feature

## Advanced Options

For full rebuild:
```bash
/codebase-reindex
```

To check index status:
```bash
ls -la data/codebase_index.db
```