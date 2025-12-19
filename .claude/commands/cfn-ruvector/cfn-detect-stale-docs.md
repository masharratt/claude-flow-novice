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
- Codebase must be indexed first (`/cfn-codebase-reindex`)
- OPENAI_API_KEY must be set (for semantic search)

---

**Note:** This is a planned feature. Currently use these manual queries:

```bash
# Find docs older than 90 days with no recent code references
sqlite3 ~/.local/share/ruvector/index_v2.db "
SELECT e.file_path, e.name,
       datetime(e.created_at, 'unixepoch') as indexed_at
FROM entities e
WHERE e.file_path LIKE '%.md'
  AND e.project_root LIKE '%$(pwd)%'
  AND (e.name LIKE '%legacy%' OR e.name LIKE '%deprecated%' OR e.name LIKE '%old%')
LIMIT 20;"

# Find orphan docs (no references)
sqlite3 ~/.local/share/ruvector/index_v2.db "
SELECT DISTINCT e.file_path
FROM entities e
LEFT JOIN refs r ON e.id = r.source_entity_id OR e.id = r.target_entity_id
WHERE e.file_path LIKE '%.md'
  AND e.project_root LIKE '%$(pwd)%'
  AND r.id IS NULL
LIMIT 20;"
```
