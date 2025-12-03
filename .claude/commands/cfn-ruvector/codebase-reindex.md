---
description: Update codebase index using git-detected changes (auto mode, incremental)
---

# Codebase Reindex Command

**Default mode: Auto-detection** - Indexes only changed files detected from git status (fast, incremental).

**Use when:**
- After committing code changes (recommended workflow)
- Regular updates after development work
- Need to refresh index for recently modified files

**Process (--auto mode):**
1. Detects staged and modified files via `git diff`
2. Filters for indexable extensions (TypeScript, Python, etc.)
3. Incrementally updates RuVector database
4. Only re-indexes changed files

**Estimated time:** 5-30 seconds (depends on number of changed files)

---

**For full rebuild (only when needed):**
Add `--full` flag if you need to rebuild the entire index from scratch:
- First-time setup
- Major codebase restructuring
- Index corrupted or missing
- After config changes (extensions, ignore patterns)

```bash
# Default: Auto-detect changed files (fast)
./.claude/skills/cfn-ruvector-codebase-index/index.sh --auto

# Full rebuild (only when explicitly needed)
./.claude/skills/cfn-ruvector-codebase-index/index.sh --full
```
