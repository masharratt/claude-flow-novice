# Skill Distribution Guide

How to distribute CFN skills to other projects without overwriting custom work.

## Manifest System

Each skill has `.cfn-manifest.json`:

```json
{
  "version": "2.18.2",
  "cfn_files": ["search.js", "index.sh", "SKILL.md"],
  "protected_files": ["config.json", "data/*"],
  "standard_paths": {
    "database": "./data",
    "skill_root": ".claude/skills/cfn-ruvector-codebase-index"
  },
  "notes": "Unlisted files are custom, preserved during updates"
}
```

## Standardized Paths (Required)

| Path | Location | Notes |
|------|----------|-------|
| Skill directory | `.claude/skills/cfn-ruvector-codebase-index/` | Fixed location |
| Database | `.ruvector/` (at project root) | Survives CFN init |
| Index file | `.ruvector/codebase_index.db` | Auto-created |
| Node modules | `./node_modules/` (in skill dir) | Skill-local deps |

**Important**:
- `config.json` must set `ruvectorDbPath` to `../../../.ruvector`
- Database stored at project root (`.ruvector/`) to survive `cfn-` prefix cleanup
- Add `.ruvector/` to `.gitignore`

## File Categories

| Category | Behavior | Example |
|----------|----------|---------|
| `cfn_files` | Overwritten on update | `search.js`, `index.sh` |
| `protected_files` | Never touched | `config.json`, `data/*` |
| Unlisted | Custom, preserved | `custom-parser.js` |

## Distribution Steps

### 1. Copy CFN Files Only

```bash
# From CFN source
SRC=".claude/skills/cfn-ruvector-codebase-index"
DEST="/path/to/project/.claude/skills/cfn-ruvector-codebase-index"

# Copy manifest first
cp "$SRC/.cfn-manifest.json" "$DEST/"

# Copy only cfn_files
for file in $(jq -r '.cfn_files[]' "$SRC/.cfn-manifest.json"); do
  cp "$SRC/$file" "$DEST/"
done
```

### 2. Preserve Protected Files

Never copy:
- `config.json` (project-specific settings)
- `data/*` (indexed data)
- `node_modules/`
- `package-lock.json`

### 3. Update Target CLAUDE.md

Add RuVector section:

```markdown
## RuVector Codebase Search
- Index: `./.claude/skills/cfn-ruvector-codebase-index/index.sh --full`
- Search: `./.claude/skills/cfn-ruvector-codebase-index/search.sh "query" --top 5`
- Incremental: `/cfn-ruvector:codebase-reindex`
```

## Version Tracking

Manifest includes version for update detection:

```bash
# Check if update needed
LOCAL=$(jq -r '.version' ".cfn-manifest.json")
REMOTE="2.18.1"  # CFN package version

if [[ "$LOCAL" != "$REMOTE" ]]; then
  echo "Update available: $LOCAL → $REMOTE"
fi
```

## Custom Extensions

Projects can add custom files:

```
cfn-ruvector-codebase-index/
├── search.js          # CFN (updated)
├── custom-filters.js  # Custom (preserved)
└── project-parser.js  # Custom (preserved)
```

Custom files referenced in project code are safe from CFN updates.

## Rollback

If update breaks something:

```bash
# Backups created by pre-edit hook
ls .backups/cfn-ruvector-codebase-index/

# Restore specific file
cp .backups/cfn-ruvector-codebase-index/search.js.bak \
   .claude/skills/cfn-ruvector-codebase-index/search.js
```

## Best Practices

1. **Don't modify cfn_files** - changes will be lost on update
2. **Put customizations in separate files** - import them from cfn_files
3. **Update config.json for project settings** - never tracked by CFN
4. **Run tests after updates** - verify skill still works
