# Skill Content Storage Standards

**Version:** 1.0.0
**Status:** Active
**Owner:** CFN Team
**Last Updated:** 2025-11-16

## Overview

This document defines the standardized storage, organization, and versioning requirements for all CFN Loop skills. Consistent skill management enables reliable discovery, version tracking, and automated migration.

## Table of Contents

- [Directory Structure](#directory-structure)
- [Required Files](#required-files)
- [Frontmatter Schema](#frontmatter-schema)
- [Git Integration](#git-integration)
- [Version Management](#version-management)
- [Migration Guide](#migration-guide)
- [API Reference](#api-reference)
- [Best Practices](#best-practices)

---

## Directory Structure

### Standard Layout

All skills MUST follow this directory structure:

```
.claude/skills/
├── {skill-name}/
│   ├── SKILL.md              # Required: Skill documentation with frontmatter
│   ├── execute.sh            # Required: Main execution script (executable)
│   ├── test.sh               # Required: Test suite (executable)
│   ├── validate.sh           # Required: Validation script (executable)
│   ├── package.json          # Required: Skill metadata
│   ├── README.md             # Optional: Additional documentation
│   └── lib/                  # Optional: Supporting libraries
```

### Naming Conventions

- **Skill Directory Names:** Use lowercase with hyphens (e.g., `cfn-coordination`)
- **Prefixing:** CFN-specific skills SHOULD use `cfn-` prefix
- **Descriptive:** Names should clearly indicate skill purpose

### Examples

```
.claude/skills/
├── cfn-coordination/
├── cfn-agent-spawning/
├── cfn-loop-orchestration/
├── agent-lifecycle/
└── pre-edit-backup/
```

---

## Required Files

### SKILL.md

**Purpose:** Primary skill documentation with YAML frontmatter metadata

**Requirements:**
- MUST start with YAML frontmatter block (enclosed in `---`)
- MUST include all required frontmatter fields
- SHOULD include comprehensive usage examples
- SHOULD document dependencies and prerequisites

**Template:**
```markdown
---
name: skill-name
version: 1.0.0
tags: [category, feature]
status: deployed
author: CFN Team
description: Brief description of skill purpose
dependencies: [redis, postgres]
created: 2025-01-15
updated: 2025-11-16
---

# Skill Name

## Overview

Detailed description of what this skill does...

## Usage

```bash
./.claude/skills/skill-name/execute.sh
```

## Dependencies

- Redis coordination layer
- PostgreSQL database

## Configuration

...
```

### execute.sh

**Purpose:** Main skill execution script

**Requirements:**
- MUST be executable (`chmod +x execute.sh`)
- MUST include shebang (`#!/bin/bash`)
- SHOULD use strict mode (`set -euo pipefail`)
- SHOULD include usage documentation in comments

**Template:**
```bash
#!/bin/bash
# Skill Name - Execution Script
# Version: 1.0.0
# Description: Brief description

set -euo pipefail

# Configuration
SKILL_NAME="skill-name"
SKILL_VERSION="1.0.0"

# Main execution
main() {
    echo "Executing ${SKILL_NAME}..."
    # Implementation here
}

main "$@"
```

### test.sh

**Purpose:** Automated test suite for skill validation

**Requirements:**
- MUST be executable
- SHOULD cover all critical functionality
- SHOULD use standard test patterns
- MUST exit with code 0 on success, non-zero on failure

**Template:**
```bash
#!/bin/bash
# Skill Name - Test Suite
# Version: 1.0.0

set -euo pipefail

TESTS_PASSED=0
TESTS_FAILED=0

# Test helper
assert_equals() {
    local expected="$1"
    local actual="$2"
    local message="${3:-Assertion failed}"

    if [ "$expected" = "$actual" ]; then
        ((TESTS_PASSED++))
        echo "✓ ${message}"
    else
        ((TESTS_FAILED++))
        echo "✗ ${message}: expected '${expected}', got '${actual}'"
    fi
}

# Test cases
test_basic_functionality() {
    echo "Testing basic functionality..."
    # Test implementation
}

# Run tests
main() {
    echo "Running tests for ${SKILL_NAME}..."
    test_basic_functionality

    echo ""
    echo "Results: ${TESTS_PASSED} passed, ${TESTS_FAILED} failed"

    [ $TESTS_FAILED -eq 0 ]
}

main "$@"
```

### validate.sh

**Purpose:** Skill configuration and dependency validation

**Requirements:**
- MUST be executable
- SHOULD validate all dependencies
- SHOULD check configuration requirements
- MUST provide clear error messages

**Template:**
```bash
#!/bin/bash
# Skill Name - Validation Script
# Version: 1.0.0

set -euo pipefail

VALIDATION_ERRORS=0

# Validation helper
validate_command() {
    local cmd="$1"
    local message="${2:-Command not found}"

    if command -v "$cmd" &> /dev/null; then
        echo "✓ ${cmd} available"
    else
        echo "✗ ${message}"
        ((VALIDATION_ERRORS++))
    fi
}

# Validation checks
validate_dependencies() {
    echo "Validating dependencies..."
    validate_command "redis-cli" "Redis CLI not found"
    validate_command "jq" "jq not found"
}

validate_configuration() {
    echo "Validating configuration..."
    # Config checks
}

# Run validation
main() {
    echo "Validating ${SKILL_NAME}..."
    validate_dependencies
    validate_configuration

    if [ $VALIDATION_ERRORS -eq 0 ]; then
        echo "✓ All validations passed"
        exit 0
    else
        echo "✗ ${VALIDATION_ERRORS} validation errors found"
        exit 1
    fi
}

main "$@"
```

### package.json

**Purpose:** NPM-compatible metadata for skill

**Requirements:**
- MUST be valid JSON
- SHOULD match SKILL.md frontmatter version
- SHOULD define standard scripts

**Template:**
```json
{
  "name": "skill-name",
  "version": "1.0.0",
  "description": "Brief description",
  "scripts": {
    "execute": "./execute.sh",
    "test": "./test.sh",
    "validate": "./validate.sh"
  },
  "keywords": ["cfn", "skill", "coordination"],
  "author": "CFN Team",
  "license": "MIT"
}
```

---

## Frontmatter Schema

### Required Fields

| Field | Type | Description | Validation |
|-------|------|-------------|------------|
| `name` | string | Skill name (must match directory) | Required, non-empty |
| `version` | string | Semantic version | Required, semver format (e.g., 1.0.0) |
| `tags` | array[string] | Categorization tags | Required, at least 1 tag |
| `status` | enum | Lifecycle status | Required, one of: draft, approved, staging, deployed, deprecated |
| `author` | string | Primary author/team | Required, non-empty |
| `description` | string | Brief skill description | Required, min 10 characters |

### Optional Fields

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| `dependencies` | array[string] | Skill/service dependencies | `[]` |
| `created` | string | Creation date (ISO format) | Auto-generated from git |
| `updated` | string | Last update date (ISO format) | Auto-updated on change |
| `complexity` | enum | Complexity level: Low, Medium, High | - |
| `keywords` | array[string] | Search keywords | `[]` |
| `triggers` | array[string] | When to use this skill | `[]` |
| `performance_targets` | object | Performance benchmarks | `{}` |

### Status Lifecycle

```
draft → approved → staging → deployed → deprecated
   ↓        ↓         ↓          ↓
  (review) (test)  (prod)    (archive)
```

**Status Definitions:**
- **draft:** Initial development, not reviewed
- **approved:** Reviewed and approved for testing
- **staging:** Deployed to staging environment
- **deployed:** Active in production
- **deprecated:** Marked for removal, use alternative

### Example Frontmatter

```yaml
---
name: cfn-coordination
version: 1.2.0
tags: [coordination, redis, cfn-loop]
status: deployed
author: CFN Team
description: Coordination protocols for CFN Loop execution with Redis backend
dependencies: [redis, cfn-loop-orchestration-v2]
created: 2025-01-15
updated: 2025-11-16
complexity: High
keywords: [agent-coordination, message-passing, consensus]
triggers: [multi-agent-workflow, distributed-execution]
performance_targets:
  signal_latency_ms: 50
  wait_timeout_ms: 30000
  success_rate: 99.9
---
```

---

## Git Integration

### Version Tracking

All skills are version-tracked using Git with:

- **Commit Metadata:** Author, date, message for each change
- **Content Hashing:** SHA256 hash for integrity verification
- **Version History:** Full commit history accessible
- **Atomic Updates:** Changes committed as atomic operations

### Content Hash

Each skill's content is hashed using SHA256:

```typescript
import { calculateFileHash } from '@/lib/skill-git-integration';

const hash = await calculateFileHash('./.claude/skills/my-skill/SKILL.md');
// hash: "a1b2c3d4e5f6..." (64 character hex string)
```

### Version History

Retrieve complete version history:

```typescript
import { getVersionHistory } from '@/lib/skill-git-integration';

const history = await getVersionHistory(
  './.claude/skills/my-skill/SKILL.md',
  10 // limit
);

// history: [
//   {
//     version: "1.2.0",
//     commit: { hash, author, date, message },
//     contentHash: "a1b2c3d4...",
//     timestamp: "2025-11-16T10:30:00Z"
//   },
//   ...
// ]
```

### Atomic Updates

Updates are committed atomically with rollback support:

```typescript
import { updateSkillFrontmatter } from '@/lib/skill-content-manager';

await updateSkillFrontmatter(
  './.claude/skills/my-skill',
  { version: '1.3.0', status: 'deployed' },
  {
    autoCommit: true,
    commitMessage: 'Release v1.3.0 to production'
  }
);
```

---

## Version Management

### Semantic Versioning

All skills MUST use [semantic versioning](https://semver.org/):

- **MAJOR:** Breaking changes (e.g., 1.0.0 → 2.0.0)
- **MINOR:** New features, backward compatible (e.g., 1.0.0 → 1.1.0)
- **PATCH:** Bug fixes, backward compatible (e.g., 1.0.0 → 1.0.1)

### Version Comparison

```typescript
import { compareVersions } from '@/lib/skill-frontmatter-parser';

compareVersions('1.0.0', '1.0.0'); // 0 (equal)
compareVersions('1.1.0', '1.0.0'); // 1 (greater)
compareVersions('1.0.0', '1.1.0'); // -1 (less)
```

### Version Update Workflow

1. **Make Changes:** Edit skill files
2. **Update Frontmatter:** Increment version in SKILL.md
3. **Update package.json:** Sync version with frontmatter
4. **Test:** Run `./test.sh` to verify
5. **Validate:** Run `./validate.sh` to check dependencies
6. **Commit:** Use atomic commit with descriptive message
7. **Tag:** Create git tag for major releases

```bash
# Example workflow
vim ./.claude/skills/my-skill/SKILL.md
# Update version: 1.0.0 → 1.1.0

vim ./.claude/skills/my-skill/package.json
# Sync version

./.claude/skills/my-skill/test.sh
./.claude/skills/my-skill/validate.sh

git add ./.claude/skills/my-skill/
git commit -m "feat(my-skill): Add new feature X - v1.1.0"
git tag my-skill-v1.1.0
```

---

## Migration Guide

### Automated Migration

Use the migration utility to standardize existing skills:

```bash
# Dry run (preview changes)
tsx scripts/migrate-skills.ts --dry-run --verbose

# Live migration (make changes)
tsx scripts/migrate-skills.ts

# Validate only (no changes)
tsx scripts/migrate-skills.ts --validate-only

# Custom skills directory
tsx scripts/migrate-skills.ts /path/to/skills --verbose

# Auto-commit changes
tsx scripts/migrate-skills.ts --auto-commit
```

### Migration Options

| Option | Description |
|--------|-------------|
| `--dry-run` | Preview changes without writing |
| `--validate-only` | Only validate structure, no fixes |
| `--no-fix-permissions` | Skip permission fixes |
| `--no-frontmatter` | Skip frontmatter updates |
| `--auto-commit` | Automatically commit changes |
| `--verbose`, `-v` | Show detailed output |
| `--report <path>` | Save report to custom path |

### Migration Report

The migration utility generates a JSON report:

```json
{
  "timestamp": "2025-11-16T10:30:00Z",
  "skillsScanned": 45,
  "skillsMigrated": 40,
  "skillsPartial": 3,
  "skillsFailed": 2,
  "entries": [
    {
      "skillName": "cfn-coordination",
      "skillPath": "./.claude/skills/cfn-coordination",
      "status": "success",
      "actions": ["Fixed permissions: execute.sh, test.sh"],
      "errors": [],
      "warnings": []
    }
  ]
}
```

### Manual Migration Steps

For skills requiring manual intervention:

1. **Create Directory Structure:**
   ```bash
   mkdir -p ./.claude/skills/my-skill
   ```

2. **Add Required Files:**
   - Copy templates from `.claude/skills/SKILL_TEMPLATE.md`
   - Ensure all required files present

3. **Add Frontmatter:**
   - Extract existing metadata
   - Format as YAML frontmatter
   - Validate against schema

4. **Fix Permissions:**
   ```bash
   chmod +x ./.claude/skills/my-skill/*.sh
   ```

5. **Validate:**
   ```bash
   ./.claude/skills/my-skill/validate.sh
   ./.claude/skills/my-skill/test.sh
   ```

6. **Commit:**
   ```bash
   git add ./.claude/skills/my-skill
   git commit -m "chore: Migrate my-skill to standard structure"
   ```

---

## API Reference

### Skill Content Manager

#### `validateSkillStructure(skillPath: string)`

Validate complete skill directory structure.

**Returns:** `SkillStructureValidation`

```typescript
const validation = await validateSkillStructure('./.claude/skills/my-skill');

if (!validation.valid) {
  console.error('Validation errors:', validation.errors);
}
```

#### `loadSkillMetadata(skillPath: string, includeHistory?: boolean)`

Load complete skill metadata with git integration.

**Returns:** `SkillMetadata`

```typescript
const metadata = await loadSkillMetadata('./.claude/skills/my-skill', true);

console.log(metadata.name, metadata.version);
console.log('Git commit:', metadata.gitMetadata?.hash);
console.log('Version history:', metadata.versionHistory);
```

#### `createSkill(parentDir, skillName, frontmatter, content)`

Create new skill with standard structure.

**Returns:** `SkillMetadata`

```typescript
const metadata = await createSkill(
  './.claude/skills',
  'new-skill',
  {
    name: 'new-skill',
    version: '1.0.0',
    tags: ['new'],
    status: 'draft',
    author: 'CFN Team',
    description: 'New skill description'
  },
  '# New Skill\n\nContent here'
);
```

#### `scanSkills(skillsDir: string)`

Scan directory for all valid skills.

**Returns:** `string[]` (array of skill paths)

```typescript
const skills = await scanSkills('./.claude/skills');
console.log(`Found ${skills.length} skills`);
```

### Frontmatter Parser

#### `parseAndValidate(content: string)`

Parse and validate SKILL.md content in one step.

**Returns:** `ParsedSkillDocument`

**Throws:** `FrontmatterValidationError` if invalid

```typescript
const content = readFileSync('SKILL.md', 'utf-8');
const parsed = parseAndValidate(content);

console.log(parsed.frontmatter.name);
console.log(parsed.content); // Markdown content
```

#### `updateFrontmatter(content, updates)`

Update frontmatter fields in SKILL.md content.

**Returns:** Updated content string

```typescript
const updated = updateFrontmatter(originalContent, {
  version: '1.1.0',
  status: 'deployed'
});
```

### Git Integration

#### `getVersionHistory(filePath, limit)`

Get version history for skill file.

**Returns:** `VersionHistoryEntry[]`

```typescript
const history = await getVersionHistory('SKILL.md', 10);

history.forEach(entry => {
  console.log(`v${entry.version}: ${entry.commit.message}`);
});
```

#### `calculateFileHash(filePath)`

Calculate SHA256 hash of file content.

**Returns:** 64-character hex string

```typescript
const hash = await calculateFileHash('SKILL.md');
console.log('Content hash:', hash);
```

---

## Best Practices

### Skill Development

1. **Start with Template:** Use `.claude/skills/SKILL_TEMPLATE.md`
2. **Test First:** Write tests before implementation
3. **Document Dependencies:** List all external requirements
4. **Version Incrementally:** Use semantic versioning properly
5. **Atomic Commits:** One logical change per commit

### Frontmatter Management

1. **Keep Updated:** Set `updated` field on every change
2. **Descriptive Tags:** Use specific, searchable tags
3. **Clear Status:** Update status as skill progresses
4. **Track Dependencies:** List all skill/service dependencies
5. **Performance Targets:** Define measurable benchmarks

### File Organization

1. **Keep It Simple:** Minimize file count where possible
2. **Use Subdirectories:** Organize complex skills with `/lib`
3. **Consistent Naming:** Follow naming conventions
4. **Executable Scripts:** Always set +x on .sh files
5. **README for Details:** Use README.md for extended docs

### Git Hygiene

1. **Descriptive Commits:** Clear, concise commit messages
2. **Small Commits:** One logical change per commit
3. **Tag Releases:** Tag major/minor version releases
4. **Review History:** Check version history before major changes
5. **Verify Integrity:** Use content hashes to verify changes

### Testing

1. **Comprehensive Coverage:** Test all critical paths
2. **Automated Tests:** Run tests in CI/CD pipeline
3. **Validation Scripts:** Always validate before deployment
4. **Error Scenarios:** Test failure cases
5. **Performance Tests:** Benchmark against targets

### Migration

1. **Dry Run First:** Always test migration with `--dry-run`
2. **Review Report:** Check migration report for issues
3. **Fix Manually:** Handle failed migrations manually
4. **Validate After:** Run validation after migration
5. **Commit Changes:** Commit migration changes with clear message

---

## Troubleshooting

### Common Issues

**Issue:** Frontmatter validation fails
**Solution:** Check YAML syntax, ensure all required fields present

**Issue:** Permission denied on execute.sh
**Solution:** Run `chmod +x execute.sh` or use `fixSkillPermissions()`

**Issue:** Git metadata not available
**Solution:** Ensure skill is in git repository with commit history

**Issue:** Content hash mismatch
**Solution:** File may have been modified outside git, review changes

**Issue:** Migration fails for specific skill
**Solution:** Check migration report, manually fix issues, re-run

### Validation Checklist

- [ ] All required files present
- [ ] Shell scripts are executable
- [ ] Frontmatter is valid YAML
- [ ] All required fields present
- [ ] Version is valid semver
- [ ] Status is valid enum value
- [ ] Tags array is non-empty
- [ ] Description is descriptive (>10 chars)
- [ ] package.json version matches frontmatter
- [ ] Tests pass (`./test.sh`)
- [ ] Validation passes (`./validate.sh`)

---

## Related Documentation

- [CFN System Expert](../cfn-system-expert.md) - CFN Loop methodology
- [Agent Output Standards](./AGENT_OUTPUT_STANDARDS.md) - Output guidelines
- [Skill Development Guide](../.claude/skills/SKILL_TEMPLATE.md) - Template
- [Git Integration](../docs/GIT_INTEGRATION.md) - Git workflows

---

**Changelog:**

- **1.0.0** (2025-11-16): Initial release with standardized structure, frontmatter schema, git integration, migration utility
