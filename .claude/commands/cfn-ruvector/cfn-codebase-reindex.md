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

**Log file:** `/tmp/ruvector-index.log` - tail this for progress monitoring.

---

Execute reindex:

```bash
# --- FAIL-FAST: Validate OpenAI API Key ---
# Load from .env if not set
if [[ -z "$OPENAI_API_KEY" ]] && [[ -f ".env" ]]; then
    export OPENAI_API_KEY=$(grep "^OPENAI_API_KEY=" .env | cut -d'=' -f2- | tr -d '"')
fi

# Validate key exists and format
if [[ -z "$OPENAI_API_KEY" ]]; then
    echo "❌ FATAL: OPENAI_API_KEY not set. Embeddings require a valid key." >&2
    echo "   Set in .env or export OPENAI_API_KEY=sk-..." >&2
    exit 1
fi

if [[ ! "$OPENAI_API_KEY" =~ ^sk- ]]; then
    echo "❌ FATAL: OPENAI_API_KEY invalid (must start with 'sk-'). Current: ${OPENAI_API_KEY:0:20}..." >&2
    exit 1
fi

echo "✅ OpenAI key validated: ${OPENAI_API_KEY:0:10}..."

# --- Setup ---
RUVECTOR_BIN="${HOME}/.local/bin/local-ruvector"
[ ! -f "$RUVECTOR_BIN" ] && RUVECTOR_BIN="./.claude/skills/cfn-local-ruvector-accelerator/target/release/local-ruvector"
LOG_FILE="/tmp/ruvector-index.log"

echo "📝 Logging to: $LOG_FILE"
echo "   Monitor with: tail -f $LOG_FILE"

# Incremental (default - only changed files)
"$RUVECTOR_BIN" index --path . --types rs,ts,js,py,sh,md 2>&1 | tee "$LOG_FILE"

# Full rebuild (when needed)
# "$RUVECTOR_BIN" index --path . --types rs,ts,js,py,sh,md --force 2>&1 | tee "$LOG_FILE"
```
