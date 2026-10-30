---
description: "Search code with the CodeSearch index: names, files mentioning them, and semantic matches"
argument-hint: "<query> [--top N]"
---

# CodeSearch Search

Runs `.claude/skills/cfn-codesearch/search.sh` (one script behind all three search commands):

- **Names:** identifiers in the question (`reap_kill`, `link-runtime-dirs.sh`) matched against indexed names and paths.
- **Files mentioning:** every file that names those identifiers literally, for "who uses X" questions.
- **Semantic:** local embedding model for concept questions; no API key needed.

Add `--top N` for more results (default 5).

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
