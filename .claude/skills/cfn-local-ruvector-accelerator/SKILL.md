# RuVector Local Semantic Code Search

## WHEN TO USE THIS SKILL

**USE RuVector V2 SQL for ALL indexed projects (400x FASTER than grep):**
```bash
# Exact name lookup - 0.002s vs grep's 0.8s
sqlite3 ~/.local/share/ruvector/index_v2.db "SELECT file_path, line_number FROM entities WHERE name = 'MyFunction';"

# Fuzzy search - 0.004s
sqlite3 ~/.local/share/ruvector/index_v2.db "SELECT file_path, line_number FROM entities WHERE name LIKE '%Store%' LIMIT 10;"
```

**USE grep/rg ONLY when:**
- Project is NOT indexed yet
- Searching for strings that aren't code entities (error messages, comments, config values)
- Quick one-off search in small directory

**USE RuVector semantic search when:**
- "Where is authentication implemented?" (conceptual search)
- Finding similar patterns you can't name exactly
- Discovering how a feature is built

## Quick Commands

### Semantic Search (V1 - Embeddings)
```bash
# Natural language search
/codebase-search "authentication middleware pattern"
/cfn-ruvector-search "error handling in API routes"

# CLI direct (note: query text is positional, use --max-results not --limit)
./.claude/skills/cfn-local-ruvector-accelerator/target/release/local-ruvector query "user login flow" --max-results 5
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

## Prerequisites

**OPENAI_API_KEY is REQUIRED for indexing.** Indexing will fail without a valid key.

```bash
# Option 1: Export before running
export OPENAI_API_KEY="sk-..."

# Option 2: Add to shell profile (~/.bashrc or ~/.zshrc)
echo 'export OPENAI_API_KEY="sk-..."' >> ~/.bashrc
source ~/.bashrc

# Option 3: Inline with command
OPENAI_API_KEY="sk-..." ./local-ruvector index --path /project
```

**Verify key is set:**
```bash
echo $OPENAI_API_KEY  # Should show your key (not empty)
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
# Find similar patterns (slash command uses --top, CLI uses --max-results)
/codebase-search "relevant search terms" --top 5
# Or via CLI:
./local-ruvector query "relevant search terms" --max-results 5

# Query past errors
./.claude/skills/cfn-ruvector-codebase-index/query-error-patterns.sh --task-description "description"

# Query learnings
./.claude/skills/cfn-ruvector-codebase-index/query-learnings.sh --task-description "description" --category PATTERN
```

This prevents duplicated work and leverages existing solutions.
