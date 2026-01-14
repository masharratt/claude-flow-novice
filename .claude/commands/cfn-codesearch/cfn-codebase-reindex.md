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

**Log file:** `/tmp/codesearch-index.log` - tail this for progress monitoring.

---

Execute reindex:

```bash
# --- FAIL-FAST: Validate OpenAI API Key ---
# Always load from .env if current key is invalid (placeholder or missing)
if [[ ! "$OPENAI_API_KEY" =~ ^sk- ]] && [[ -f ".env" ]]; then
    export OPENAI_API_KEY=$(grep "^OPENAI_API_KEY=" .env | cut -d'=' -f2- | tr -d '"' | tr -d "'")
fi

# Final validation
if [[ ! "$OPENAI_API_KEY" =~ ^sk- ]]; then
    echo "❌ FATAL: Valid OPENAI_API_KEY not found." >&2
    echo "   Add to .env: OPENAI_API_KEY=sk-..." >&2
    exit 1
fi

echo "✅ OpenAI key: ${OPENAI_API_KEY:0:12}..."

# --- Setup ---
RUVECTOR_BIN="${HOME}/.local/bin/local-codesearch"
[ ! -f "$RUVECTOR_BIN" ] && RUVECTOR_BIN="./.claude/skills/cfn-local-codesearch-accelerator/target/release/local-codesearch"
LOG_FILE="/tmp/codesearch-index.log"

echo "📝 Logging to: $LOG_FILE"
echo "   Monitor with: tail -f $LOG_FILE"

# Incremental (default - only changed files)
"$RUVECTOR_BIN" index --path . --types rs,ts,js,py,sh,md 2>&1 | tee "$LOG_FILE"

# Full rebuild (when needed)
# "$RUVECTOR_BIN" index --path . --types rs,ts,js,py,sh,md --force 2>&1 | tee "$LOG_FILE"
```
