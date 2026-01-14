# Local CodeSearch Accelerator

Fast local semantic code search with multi-project isolation.

## Quick Start

```bash
# Initialize
./target/release/local-codesearch init

# Index a project
./target/release/local-codesearch index --path . --types rs,ts,js

# Query patterns
./target/release/local-codesearch query "authentication middleware"
```

## Features

- Centralized SQLite database at `~/.local/share/codesearch/index_v2.db`
- Multi-project isolation with secure path validation
- OpenAI embeddings for semantic search
- No Docker or PostgreSQL required

## Security (v1.1.0)

### Multi-Project Isolation

All queries are isolated by project root. Projects cannot access each other's data.

| Security Feature | Implementation |
|------------------|----------------|
| FK Constraints | RESTRICT (prevents cascading deletes) |
| Path Validation | String-based, no filesystem dependency |
| Traversal Prevention | Blocks `..` and null bytes |
| LIKE Escaping | Prevents SQL injection via wildcards |

### Path Validator Module

`src/path_validator.rs` provides:

- `validate_against_root_str()` - string-based validation without filesystem access
- `normalize_path_string()` - safe path normalization
- `prevent_traversal()` - blocks directory traversal attacks

### Database Schema

FK constraints use `ON DELETE RESTRICT` to prevent accidental data loss:

```sql
-- entity_embeddings, entity_references, search_history, entity_definitions
FOREIGN KEY (entity_id) REFERENCES entities_v2(id) ON DELETE RESTRICT
```

## Commands

| Command | Description |
|---------|-------------|
| `init` | Initialize CodeSearch in project |
| `index` | Index code files |
| `query` | Search patterns semantically |
| `find` | Structured entity queries |
| `refs` | Find references to entities |
| `stats` | Show statistics |
| `cleanup` | Remove old data |
| `reset` | Reset all data |

## Architecture

```
~/.local/share/codesearch/
  index_v2.db       # Centralized SQLite database
  embeddings/       # Cached embeddings
  cache/            # Query cache
```

## Tests

```bash
# Run all tests
cargo test

# Path validator tests (10 tests)
cargo test path_validator

# Security tests
cargo test multi_project
```
