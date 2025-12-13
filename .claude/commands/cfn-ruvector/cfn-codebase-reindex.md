---
description: Update codebase index (default incremental, --force for full rebuild)
---

# Codebase Reindex Command

**Default mode:** Incremental - only re-indexes files with changed hashes (fast).

**Use when:**
- After code changes
- Regular development workflow
- Need to refresh index

**For full rebuild:**
Add `--force` flag for complete reindex:
- First-time setup
- Major restructuring
- Index issues

**Prerequisites:**
- OPENAI_API_KEY must be set: `export OPENAI_API_KEY="sk-..."`

---

Execute reindex:

```bash
# Incremental (default - only changed files)
./.claude/skills/cfn-local-ruvector-accelerator/target/release/local-ruvector index --path . --types rs,ts,js,py,sh,md

# Full rebuild (when needed)
# ./.claude/skills/cfn-local-ruvector-accelerator/target/release/local-ruvector index --path . --types rs,ts,js,py,sh,md --force
```
