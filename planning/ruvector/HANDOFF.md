# RuVector Handoff Documentation

**Date**: 2025-12-12
**Last Session**: Non-destructive indexing fixes
**Status**: Operational with V2 schema

---

## Quick Start

```bash
# Initialize (creates centralized database)
./.claude/skills/cfn-local-ruvector-accelerator/target/release/local-ruvector init

# Index a directory (with OpenAI API key for real embeddings)
export OPENAI_API_KEY="your-key-here"
./.claude/skills/cfn-local-ruvector-accelerator/target/release/local-ruvector index --path . --types rs,ts,js,json,md,sh

# Query entities
./.claude/skills/cfn-local-ruvector-accelerator/target/release/local-ruvector query "search term"

# Check stats
./.claude/skills/cfn-local-ruvector-accelerator/target/release/local-ruvector stats
```

---

## Architecture Overview

### Binary Location
```
.claude/skills/cfn-local-ruvector-accelerator/target/release/local-ruvector
```

### Centralized Database
```
~/.local/share/ruvector/index_v2.db
```

All projects share this database with isolation via `project_root` column.

### Key Source Files

| File | Purpose |
|------|---------|
| `src/cli/index.rs` | Main indexing command |
| `src/cli/query.rs` | Query command |
| `src/cli/init.rs` | Initialization |
| `src/schema_v2.rs` | Database schema |
| `src/store_v2.rs` | Database operations |
| `src/paths.rs` | Centralized path logic |
| `src/embeddings.rs` | OpenAI embedding generation |
| `src/extractors/` | AST extractors (Rust, TypeScript, text) |

---

## Database Schema (V2)

### Tables

**entities** - Code entities (functions, classes, etc.)
```sql
id, kind, name, signature, visibility, parent_id, file_path,
line_number, column_number, doc_comment, attributes, metadata,
project_root, created_at, updated_at
```

**files** - Indexed files with stats
```sql
path (PK), hash, last_indexed, patterns_count
```

**file_hashes** - For incremental indexing
```sql
file_path (PK), file_hash, indexed_at
```

**entity_embeddings** - Vector embeddings
```sql
entity_id (PK), embedding (BLOB), embedding_model, created_at
```

**refs** - Cross-references between entities
```sql
id, source_entity_id, target_entity_id, target_name, ref_kind,
file_path, line_number, column_number, context, created_at
```

---

## Recent Fixes (2025-12-12)

### Issues Addressed

1. **Database overwrite during indexing** - FIXED
   - Added `is_file_in_index()` check before deleting existing entities
   - Only cleans up entities for files that were previously indexed
   - New files are added without affecting existing data

2. **Files table not populated** - FIXED
   - `mark_file_indexed()` now updates both `file_hashes` AND `files` tables
   - Both tables now have consistent data

3. **Missing project_root column** - FIXED
   - Added `project_root` column to entities table in schema
   - Added indexes for multi-project isolation queries

### Code Changes

**src/cli/index.rs**:
- Added `is_file_in_index()` helper method
- Modified `process_file()` for non-destructive updates
- Updated `mark_file_indexed()` to populate both tables

**src/schema_v2.rs**:
- Added `project_root TEXT NOT NULL DEFAULT ''` to entities table
- Added `files` table with path, hash, last_indexed, patterns_count
- Added indexes: `idx_entities_project_root`, `idx_entities_project_file`

---

## Verification Commands

```bash
# Check database table counts
sqlite3 ~/.local/share/ruvector/index_v2.db \
  "SELECT 'entities:' || COUNT(*) FROM entities;
   SELECT 'files:' || COUNT(*) FROM files;
   SELECT 'file_hashes:' || COUNT(*) FROM file_hashes;
   SELECT 'entity_embeddings:' || COUNT(*) FROM entity_embeddings;"

# Sample entities
sqlite3 ~/.local/share/ruvector/index_v2.db \
  "SELECT kind, name, file_path FROM entities LIMIT 10;"

# Check files table
sqlite3 ~/.local/share/ruvector/index_v2.db \
  "SELECT path, patterns_count FROM files LIMIT 10;"
```

---

## Rebuild Binary

```bash
cd .claude/skills/cfn-local-ruvector-accelerator
cargo build --release
```

Binary will be at: `target/release/local-ruvector`

---

## Environment Requirements

- **Rust toolchain**: For building binary
- **OpenAI API Key**: Set `OPENAI_API_KEY` for real embeddings (falls back to dummy embeddings if not set)
- **SQLite3**: For database inspection

---

## Excluded Patterns

### Directories (57 patterns)
- Build: `target`, `dist`, `build`, `out`, `.next`, `.nuxt`
- Dependencies: `node_modules`, `vendor`, `.pnpm`, `.yarn`
- VCS: `.git`, `.svn`, `.hg`
- Cache: `.cache`, `__pycache__`, `.pytest_cache`
- IDE: `.idea`, `.vscode`, `.vs`

### Files (47 patterns)
- Secrets: `.env*`, `credentials.json`, `secrets.json`
- Lock files: `package-lock.json`, `yarn.lock`, `Cargo.lock`
- Generated: `*.min.js`, `*.d.ts`, `*.js.map`
- Binary: `*.wasm`, `*.db`, `*.sqlite`

---

## Multi-Project Isolation

Each project is isolated via `project_root` column:
- Index command captures `project_dir` from current working directory
- Queries filter by `project_root` to return only relevant results
- Centralized database supports multiple projects simultaneously

---

## Known Limitations

1. **Dummy embeddings without API key**: Without `OPENAI_API_KEY`, uses random dummy embeddings (1536 dimensions) which won't provide semantic search capability

2. **No automatic reindexing**: Files must be explicitly re-indexed after changes

3. **Incremental only with same hash**: Files with changed content get re-indexed, but deleted files are not automatically removed from index

---

## Next Steps / Backlog

- [ ] Add `--watch` mode for automatic reindexing
- [ ] Add `cleanup` command to remove stale entries
- [ ] Add export/import for index portability
- [ ] Support for additional languages (Python, Go, Java)
- [ ] Integration with IDE extensions

---

## Contact / Resources

- **Binary Source**: `.claude/skills/cfn-local-ruvector-accelerator/`
- **Skill Documentation**: `.claude/skills/cfn-local-ruvector-accelerator/SKILL.md`
- **CLAUDE.md Section**: Search for "RuVector" in project CLAUDE.md
