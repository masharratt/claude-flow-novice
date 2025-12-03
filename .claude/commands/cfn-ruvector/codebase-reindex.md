---
description: Rebuild codebase index from scratch using RuVector semantic search
---

# Codebase Reindex Command

Rebuild the entire codebase index from scratch. This clears the existing RuVector database and re-indexes all source files.

**Use when:**
- First-time setup of codebase indexing
- Major codebase restructuring
- Index appears corrupted or outdated
- After changing indexing configuration

**Process:**
1. Clears existing RuVector codebase_index database
2. Scans project for all indexable files (TypeScript, Python, Rust, etc.)
3. Parses each file for metadata (exports, dependencies, purpose)
4. Generates embeddings using OpenAI/Z.ai
5. Stores in RuVector for semantic search

**Estimated time:** 2-5 minutes for typical codebase (1000 files)

---

Run the full reindex script:

```bash
./.claude/skills/cfn-ruvector-codebase-index/index.sh --full
```
