# CodeSearch Usage

Load when: the CodeSearch index is missing, a reindex fails, or a query returns zero results. The always-loaded rule is in `~/.claude/CLAUDE.md` §CodeSearch.

## Rule (full text)

Query CodeSearch BEFORE grep/glob/find — 400x faster:

```bash
/codebase-search "query" --top 5
```

- If index missing: run `/cfn-codesearch:cfn-codebase-reindex` first
- If reindex fails or CodeSearch returns zero: use grep (not find — less resource intensive in WSL2)
