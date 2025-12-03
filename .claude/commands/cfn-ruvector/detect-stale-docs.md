---
description: Detect stale and legacy documentation using RuVector semantic analysis
---

# Detect Stale Documentation

Analyzes all `.md` files in the codebase to detect legacy/outdated documentation by:

- **Cross-referencing code**: Checks if files/functions mentioned in docs still exist
- **Age analysis**: Older docs more likely to be stale
- **Orphan detection**: Finds docs with no code references
- **Deprecated keywords**: Flags docs mentioning "legacy", "deprecated", "obsolete"

**Output:**
- Staleness score (0-100+)
- Age in days
- Missing file/code references
- Specific findings for each doc

**Use cases:**
- Identify documentation to archive
- Find docs needing updates
- Clean up legacy documentation
- Maintain documentation hygiene

**Scoring:**
- Score >= 10: **STALE** (strong candidate for archival)
- Score 5-9: **LIKELY STALE** (needs review)
- Score 2-4: **POSSIBLY STALE** (minor issues)

**Prerequisites:**
- Codebase must be indexed first (`/codebase-reindex`)
- ZAI_API_KEY must be set (for semantic search)

---

Run the stale documentation detector:

```bash
./.claude/skills/cfn-ruvector-codebase-index/detect-stale-docs.sh
```
