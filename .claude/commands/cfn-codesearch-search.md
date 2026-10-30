---
description: "Search code with the CodeSearch index: names, files mentioning them, and semantic matches"
argument-hint: "<query> [--top N]"
---

# CodeSearch Search

Runs `.claude/skills/cfn-codesearch/search.sh` (one script behind all three search commands):

- **Files:** word search over every indexed file (path, names, content), docs ranked lower; a file named after an identifier in the question comes first.
- **Files mentioning:** every file that names those identifiers literally, for "who uses X" questions.
- **Semantic:** local embedding model, only when the first two find nothing or with `--semantic` (adds ~2 s).

Add `--top N` for more results (default 5), `--semantic` to always include meaning-based matches.

## Usage

```
/cfn-codesearch-search "Where is reap_kill defined?"
/cfn-codesearch-search "who uses run-with-memory-limit.sh"
/cfn-codesearch-search "what stops orphaned test workers" --top 10
```

---

```bash
bash "$HOME/.claude/skills/cfn-codesearch/search.sh" "$ARGUMENTS"
```
