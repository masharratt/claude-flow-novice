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
RUVECTOR_BIN="${HOME}/.local/bin/local-ruvector"
[ ! -f "$RUVECTOR_BIN" ] && RUVECTOR_BIN="./.claude/skills/cfn-local-ruvector-accelerator/target/release/local-ruvector"

# Incremental (default - only changed files)
"$RUVECTOR_BIN" index --path . --types rs,ts,js,py,sh,md

# Full rebuild (when needed)
# "$RUVECTOR_BIN" index --path . --types rs,ts,js,py,sh,md --force
```
