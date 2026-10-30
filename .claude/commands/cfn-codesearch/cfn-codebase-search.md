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

- **Files:** word search over every indexed file (path, names, content), docs ranked lower; a file named after an identifier in the question comes first.
- **Files mentioning:** every file that names those identifiers literally, for "who uses X" questions.
- **Semantic:** local embedding model, only when the first two find nothing or with `--semantic` (adds ~2 s).

Add `--top N` for more results (default 5), `--semantic` to always include meaning-based matches.

**Prerequisite:** the project is indexed (`/cfn-codebase-reindex`).

---

```bash
bash "$HOME/.claude/skills/cfn-codesearch/search.sh" "{{query}}" --top "{{#if top}}{{top}}{{else}}5{{/if}}"
```
