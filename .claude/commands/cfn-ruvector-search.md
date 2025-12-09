---
description: "Semantic code search with RuVector"
argument-hint: "<query>"
---

# /search - Semantic Code Search

Quick semantic search through your codebase using RuVector.

## Usage

```bash
/search "authentication middleware"
/search "error handling pattern"
/search "database connection setup"
```

## What it does

- Searches for semantically similar code (not just text matching)
- Returns the most relevant code snippets with similarity scores
- Helps find existing implementations before building new ones

## Examples

Find similar implementations:
```bash
/search "user login flow"
```

Find error patterns:
```bash
/search "timeout error handling"
```

Find API patterns:
```bash
/search "REST API validation"
```

## Advanced Options

For more control, use the full command:
```bash
/codebase-search "query" --top 10 --full
```