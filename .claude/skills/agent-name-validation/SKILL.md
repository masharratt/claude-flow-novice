# Agent Name Validation Skill

**Version:** 1.0.0
**Last Updated:** 2025-11-04
**Owner:** agent-builder
**Status:** Production

## Overview

Validates that agent filenames match their frontmatter `name:` field to ensure consistency and prevent discovery issues.

## Purpose

- Ensures agent files can be discovered correctly by the agent spawning system
- Prevents mismatches between filename and agent identity
- Maintains naming consistency across the codebase
- Runs automatically after agent creation/updates

## Usage

### Basic Validation

```bash
./.claude/skills/agent-name-validation/validate-agent-names.sh
```

### Output Format

```
Validating agent filenames match frontmatter names...
==============================================
❌ MISMATCH: /path/to/backend-dev.md
   Filename:    backend-dev
   Frontmatter: backend-developer

⚠️  WARNING: No frontmatter name found in /path/to/README.md
==============================================
✅ All agent files have matching names!
```

## Integration with Agent Builder

The agent-builder agent automatically runs this validation after:

1. Creating new agent files
2. Updating agent frontmatter
3. Renaming agent files

### Post-Creation Validation

```bash
# After creating/updating an agent
./.claude/skills/agent-name-validation/validate-agent-names.sh

# Check exit code
if [ $? -ne 0 ]; then
    echo "⚠️  Agent name validation failed - please review mismatches"
fi
```

## Validation Rules

### ✅ Valid Patterns

- Filename: `backend-developer.md` → Frontmatter: `name: backend-developer`
- Filename: `api-tester.md` → Frontmatter: `name: api-tester`

### ❌ Invalid Patterns

- Filename: `backend-dev.md` → Frontmatter: `name: backend-developer` (mismatch)
- Filename: `APITester.md` → Frontmatter: `name: api-tester` (case mismatch)

### Ignored Files

- `CLAUDE.md` - Documentation file, not an agent
- Files without frontmatter (templates, READMEs)

## Exit Codes

- `0` - All agent files validated successfully
- `1` - One or more mismatches found

## Configuration

### Excluded Files

Edit the validation script to exclude additional files:

```bash
# Skip specific files
if [ "$filename" = "CLAUDE" ] || [ "$filename" = "README" ]; then
    continue
fi
```

## Examples

### Example 1: Successful Validation

```bash
$ ./.claude/skills/agent-name-validation/validate-agent-names.sh
Validating agent filenames match frontmatter names...
==============================================
✅ All agent files have matching names!
```

### Example 2: Mismatch Detected

```bash
$ ./.claude/skills/agent-name-validation/validate-agent-names.sh
Validating agent filenames match frontmatter names...
==============================================
❌ MISMATCH: .claude/agents/cfn-dev-team/developers/backend-dev.md
   Filename:    backend-dev
   Frontmatter: backend-developer
==============================================
❌ Found 1 mismatch(es)
```

## Troubleshooting

### Issue: False Positives

**Symptom:** Valid agent files reported as mismatches

**Solution:** Verify frontmatter format:
```yaml
---
name: agent-name  # Must be on line 2, no extra spaces
---
```

### Issue: AWK Parsing Errors

**Symptom:** No frontmatter names detected

**Solution:** Check for:
- Windows line endings (run `dos2unix` on files)
- Missing `---` delimiters
- Malformed YAML

## Related Skills

- **Agent Creation** (`.claude/skills/agent-creation/`) - Creates new agents
- **Template Validation** (`.claude/skills/template-validation/`) - Validates agent structure
- **Pre-Edit Backup** (`.claude/skills/pre-edit-backup/`) - Backup system for file changes

## Maintenance

### Adding New Validations

To add additional validation rules, modify `validate-agent-names.sh`:

```bash
# Example: Validate agent type matches directory structure
if [[ "$agent_file" == *"/testers/"* ]]; then
    expected_type="validator"
    actual_type=$(awk 'BEGIN{in_fm=0} /^---$/{in_fm++; next} in_fm==1 && /^type:/{print $2; exit}' "$agent_file")

    if [ "$actual_type" != "$expected_type" ]; then
        echo "⚠️  Type mismatch in $agent_file"
    fi
fi
```

## Version History

- **1.0.0** (2025-11-04) - Initial release with filename validation
