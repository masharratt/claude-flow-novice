---
description: Search code with the CodeSearch index (names, files mentioning them, semantic matches)
arguments:
  query:
    description: Question or identifier to search for
    required: true
  --top:
    description: Number of results per step (default 5)
    required: false
---

# Codebase Search Command

Runs `.claude/skills/cfn-codesearch/search.sh` (one script behind all three search commands):

- **Names:** identifiers in the question (`reap_kill`, `link-runtime-dirs.sh`) matched against indexed names and paths.
- **Files mentioning:** every file that names those identifiers literally, for "who uses X" questions.
- **Semantic:** local embedding model for concept questions; no API key needed.

Add `--top N` for more results (default 5).

**Prerequisite:** the project is indexed (`/cfn-codebase-reindex`).

---

```bash
bash "$HOME/.claude/skills/cfn-codesearch/search.sh" "{{query}}" --top "{{#if top}}{{top}}{{else}}5{{/if}}"
```
