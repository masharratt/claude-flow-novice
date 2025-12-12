# RuVector Local Semantic Code Search

## WHEN TO USE THIS SKILL

**USE grep/rg when (FASTER for these):**
- You know the exact variable/function name: `rg "myVariableName"`
- Searching for literal strings (error messages, imports)
- Simple pattern matching you've done before

**USE RuVector when (BETTER for these):**
- "Where is authentication implemented?" (semantic search)
- Finding similar patterns across codebase
- Looking for callers/references to a function (V2 SQL)
- Discovering how a feature is built
- You don't know the exact name to search for

## Quick Commands

### Semantic Search (V1 - Embeddings)
```bash
# Natural language search
/codebase-search "authentication middleware pattern"
/cfn-ruvector-search "error handling in API routes"

# CLI direct
./.claude/skills/cfn-local-ruvector-accelerator/target/release/local-ruvector query --pattern "user login flow"
```

### Structural Search (V2 - SQL on AST)
```bash
# Find all callers of a function
sqlite3 ~/.local/share/ruvector/index_v2.db \
  "SELECT * FROM refs WHERE target_name = 'MyFunction';"

# Find all functions in a file
sqlite3 ~/.local/share/ruvector/index_v2.db \
  "SELECT name, line_number FROM entities WHERE file_path LIKE '%myfile.rs' AND kind = 'function';"

# Find entities by project (multi-project isolation)
sqlite3 ~/.local/share/ruvector/index_v2.db \
  "SELECT COUNT(*) FROM entities WHERE project_root = '/path/to/project';"
```

## Index Management

```bash
# Index a project (first time or full rebuild)
./target/release/local-ruvector index --path /path/to/project --types rs,ts,py

# Incremental update (after code changes)
/codebase-reindex

# Check index stats
sqlite3 ~/.local/share/ruvector/index_v2.db "SELECT project_root, COUNT(*) FROM entities GROUP BY project_root;"
```

## Key Features

- **Multi-project isolation**: Index multiple projects in single database without data collision
- **Non-destructive**: Indexing one project never deletes data from other projects
- **Centralized storage**: `~/.local/share/ruvector/index_v2.db`
- **Dual search**: V1 semantic (embeddings) + V2 structural (SQL on AST)
- **Fast**: Rust binary with SQLite backend

## Database Location
```
~/.local/share/ruvector/index_v2.db
```

## For Agents

Before implementing changes, ALWAYS query RuVector first:
```bash
# Find similar patterns
/codebase-search "relevant search terms" --top 5

# Query past errors
./.claude/skills/cfn-ruvector-codebase-index/query-error-patterns.sh --task-description "description"

# Query learnings
./.claude/skills/cfn-ruvector-codebase-index/query-learnings.sh --task-description "description" --category PATTERN
```

This prevents duplicated work and leverages existing solutions.
