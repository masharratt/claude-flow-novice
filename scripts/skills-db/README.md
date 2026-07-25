# Skills Database YAML Export/Import Tools

Human-readable database snapshots for code review and cross-environment deployment.

## Scripts

### 1. export-to-yaml.sh
Export Skills Database to YAML format with approval workflow metadata.

**Usage:**
```bash
./export-to-yaml.sh [OPTIONS]
```

**Options:**
- `--output=<file>` - Output file (default: `.claude/skills-database/snapshot.yaml`)
- `--include-history` - Include approval history table
- `--include-usage` - Include skill usage statistics
- `--filter-category=<cat>` - Export only specific category
- `--filter-status=<status>` - Export only active/deprecated/archived
- `--pretty` - Pretty-print with comments
- `--help` - Show help message

**Examples:**
```bash
# Basic export
./export-to-yaml.sh

# Export with approval history
./export-to-yaml.sh --include-history

# Export only active coordination skills
./export-to-yaml.sh --filter-category=coordination --filter-status=active

# Export to custom location
./export-to-yaml.sh --output=/tmp/skills-backup.yaml
```

**Output Format:**
```yaml
version: "2.0"
exported_at: "2025-11-16T10:30:00Z"
schema_version: 2
database_path: ".claude/skills-database/skills.db"

export_metadata:
  total_skills: 45
  total_mappings: 120
  filter_category: null
  filter_status: active

skills:
  - id: 1
    name: cfn-coordination
    category: coordination
    team: cfn
    content_path: .claude/skills/cfn-coordination/SKILL.md
    content_hash: a3f5b1c2d4e...
    tags: [redis, async, orchestration]
    version: "2.1.0"
    status: active
    approval_level: auto
    last_approved_by: system
    last_approval_date: "2025-11-15T14:22:00Z"
    test_coverage: 0.95
    owner: cfn-core

agent_skill_mappings:
  - agent_type: backend-developer
    skill_id: 1
    priority: 1
    required: true
    tdd_condition: {"phase": ["loop3"]}
    conditions: {"taskContext": ["coordination"]}
```

### 2. import-from-yaml.sh
Import Skills Database from YAML with validation and conflict resolution.

**Usage:**
```bash
./import-from-yaml.sh --input=<file> [OPTIONS]
```

**Options:**
- `--input=<file>` - Input YAML file (required)
- `--mode=<mode>` - Import mode: `merge`|`replace`|`validate-only` (default: merge)
- `--force` - Auto-overwrite conflicts without prompting
- `--skip-conflicts` - Auto-skip conflicts without prompting
- `--dry-run` - Show what would be imported without making changes
- `--verbose` - Detailed logging
- `--help` - Show help message

**Import Modes:**
- `merge` - Update existing skills, insert new ones (default)
- `replace` - Delete all existing data, insert from YAML
- `validate-only` - Check YAML validity without importing

**Examples:**
```bash
# Validate YAML without importing
./import-from-yaml.sh --input=snapshot.yaml --mode=validate-only

# Dry run to see what would change
./import-from-yaml.sh --input=snapshot.yaml --dry-run

# Import with merge (safe, preserves existing)
./import-from-yaml.sh --input=snapshot.yaml --mode=merge

# Import and overwrite conflicts
./import-from-yaml.sh --input=snapshot.yaml --force

# Replace all data (DESTRUCTIVE)
./import-from-yaml.sh --input=snapshot.yaml --mode=replace
```

**Conflict Resolution:**
When a skill exists with a different content_hash:
- Default: Skip and warn
- `--force`: Overwrite without prompting
- `--skip-conflicts`: Skip silently

## Common Workflows

### Code Review Workflow
```bash
# 1. Export current state
./export-to-yaml.sh --output=review-snapshot.yaml

# 2. Review YAML in pull request
# (Human-readable diff shows exactly what changed)

# 3. Import approved changes
./import-from-yaml.sh --input=review-snapshot.yaml --mode=merge
```

### Cross-Environment Deployment
```bash
# On development environment
./export-to-yaml.sh --output=dev-skills.yaml --include-history

# Copy dev-skills.yaml to production

# On production environment
./import-from-yaml.sh --input=dev-skills.yaml --mode=merge --force
```

### Backup and Restore
```bash
# Backup
./export-to-yaml.sh \
  --output=backups/skills-$(date +%Y%m%d).yaml \
  --include-history \
  --include-usage

# Restore
./import-from-yaml.sh \
  --input=backups/skills-20251116.yaml \
  --mode=replace  # WARNING: Deletes existing data
```

### Round-Trip Testing
```bash
# Export → Import → Export → Compare
./export-to-yaml.sh --output=/tmp/export1.yaml
./import-from-yaml.sh --input=/tmp/export1.yaml --force
./export-to-yaml.sh --output=/tmp/export2.yaml
diff /tmp/export1.yaml /tmp/export2.yaml
```

## Features

### Export Features
- ✅ All skills with approval workflow metadata
- ✅ Agent skill mappings with TDD conditions
- ✅ Optional approval history
- ✅ Optional usage statistics
- ✅ Category and status filtering
- ✅ Content hash integrity
- ✅ Human-readable YAML format

### Import Features
- ✅ YAML schema validation
- ✅ Content file verification (warnings only)
- ✅ Conflict detection (content hash comparison)
- ✅ Transaction support (rollback on errors)
- ✅ Three import modes (merge/replace/validate-only)
- ✅ Dry-run mode
- ✅ Foreign key integrity validation
- ✅ Comprehensive error handling
- ✅ Statistics reporting

## Dependencies

- **bash** - Shell script execution
- **sqlite3** - Database operations
- **python3** - YAML processing
- **pyyaml** - YAML parsing (optional but recommended)

Install pyyaml:
```bash
pip install pyyaml
```

## Testing

Run comprehensive test suite:
```bash
bash tests/skills-db/test-yaml-tools.sh
```

Test coverage:
- Export validation (YAML format, completeness)
- Import validation (schema, conflicts, transactions)
- Round-trip testing (data preservation)
- Content hash verification
- Conflict resolution
- Transaction rollback on errors

## File Locations

- Export script: `scripts/skills-db/export-to-yaml.sh`
- Import script: `scripts/skills-db/import-from-yaml.sh`
- Import logic: `scripts/skills-db/import-py-logic.py`
- Test suite: `tests/skills-db/test-yaml-tools.sh`
- Default export: `.claude/skills-database/snapshot.yaml`

## Error Handling

Both scripts implement comprehensive error handling:
- Environment validation (files exist, tools available)
- Database connectivity checks
- YAML syntax validation
- Schema version compatibility
- Required field validation
- Transaction support (atomic imports)
- Foreign key integrity checks
- Graceful error messages

## Security Considerations

- Content hash verification prevents tampering
- Transaction support prevents partial imports
- Foreign key constraints prevent orphaned records
- Dry-run mode allows safe preview
- Validate-only mode for pre-flight checks

## Performance

- Export: ~0.5s for 50 skills
- Import: ~1s for 50 skills (with validation)
- Round-trip: ~2s total
- Scales linearly with skill count

## Troubleshooting

**"pyyaml not installed" warning:**
```bash
pip install pyyaml
```

**"Hash mismatch" on import:**
- Skill content has changed since export
- Use `--force` to overwrite or `--skip-conflicts` to skip

**"Foreign key violations":**
- Referenced skills don't exist
- Import skills before mappings
- Use `replace` mode for clean slate

**Transaction failed:**
- Check database permissions
- Verify database not locked
- Review error messages for specific SQL errors
