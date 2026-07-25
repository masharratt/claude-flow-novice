# Skill Markdown Standards

**Version:** 1.0.0
**Status:** Active
**Last Updated:** 2025-11-16

## Overview

This document defines the standardized structure and validation requirements for all SKILL.md files in the Claude Flow Novice project. Consistent skill documentation ensures maintainability, discoverability, and quality across the codebase.

## Quick Reference

```bash
# Validate all skills
tsx scripts/lint-skill-markdown.ts

# Validate specific skill
tsx scripts/lint-skill-markdown.ts --skill=cfn-coordination

# Migrate existing skills to new format
tsx scripts/migrate-skill-markdown.ts --all --dry-run
tsx scripts/migrate-skill-markdown.ts --all

# Create new skill from template
cp .claude/skills/SKILL_TEMPLATE.md .claude/skills/my-new-skill/SKILL.md
```

## Required Structure

All SKILL.md files MUST follow this structure:

```markdown
---
name: skill-name
version: 1.0.0
tags: [category, feature]
status: draft
author: Author Name
description: Brief description of what this skill does
created: 2025-11-16
---

# Skill Name

## Overview

Overview section content.

## Usage

Usage section content.

## Examples

Examples section content.

## Implementation

Implementation section content.

## Tests

Tests section content.
```

### Required Sections (in order)

1. **Frontmatter** - YAML metadata block
2. **Overview** - Purpose and key features
3. **Usage** - How to use the skill
4. **Examples** - Concrete usage examples
5. **Implementation** - Implementation details
6. **Tests** - Test documentation

### Optional Sections

May appear after required sections:

- **API Reference** - Detailed API documentation
- **Configuration** - Configuration options
- **Related Skills** - Links to related skills
- **References** - External references
- **Troubleshooting** - Common issues and solutions
- **Performance** - Performance characteristics
- **Security** - Security considerations
- **Quick Start** - Getting started guide

## Frontmatter Schema

### Required Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `name` | string | Skill name (lowercase, hyphens) | `cfn-coordination` |
| `version` | string | Semantic version | `1.0.0` |
| `tags` | array | Categorization tags | `[coordination, redis]` |
| `status` | enum | Lifecycle status | `draft` |
| `author` | string | Author or team name | `CFN Team` |
| `description` | string | Brief description (10-256 chars) | `Handles agent coordination` |

### Optional Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `dependencies` | array | External dependencies | `[redis, jq]` |
| `created` | string | Creation date (ISO 8601) | `2025-11-16` |
| `updated` | string | Last update date (ISO 8601) | `2025-11-16` |
| `complexity` | enum | Low, Medium, High | `High` |
| `keywords` | array | Search keywords | `[agent, swarm]` |
| `triggers` | array | Usage triggers | `[multi-agent-workflow]` |
| `performance_targets` | object | Benchmarks | `{ latency_ms: 50 }` |

### Status Values

- `draft` - Initial development
- `approved` - Reviewed, ready for testing
- `staging` - Deployed to staging
- `deployed` - Active in production
- `deprecated` - Marked for removal

### Frontmatter Example

```yaml
---
name: cfn-coordination
version: 2.1.0
tags: [coordination, redis, multi-agent]
status: deployed
author: CFN Team
description: Provides agent coordination primitives via Redis pub/sub and key-value storage
dependencies: [redis-cli, jq]
created: 2025-01-15
updated: 2025-11-16
complexity: High
keywords: [coordination, agent, swarm, redis, pub-sub]
triggers: [multi-agent-workflow, consensus-required, broadcast-message]
performance_targets:
  signal_latency_ms: 50
  broadcast_latency_ms: 100
  success_rate: 99.9
---
```

## Content Validation

### Section Requirements

Each required section MUST:

- Appear in the correct order
- Contain at least 50 characters of content
- Include relevant documentation

### Code Blocks

All code blocks MUST:

- Specify a language for syntax highlighting
- Use supported languages (see below)
- Contain non-empty content

**Supported Languages:**

```
bash, sh, typescript, javascript, json, yaml, yml,
markdown, md, python, sql, html, css, dockerfile,
plaintext, text
```

**Example:**

````markdown
```bash
#!/bin/bash
set -euo pipefail
echo "Valid script"
```

```typescript
const result = await executeSkill('test-skill');
console.log(result);
```
````

### Internal Links

Internal links MUST:

- Point to existing files (relative paths)
- Reference existing sections (anchor links)
- Use correct markdown syntax

**Example:**

```markdown
[Link to section](#usage)
[Link to file](./related-file.md)
[Link to docs](../../docs/GUIDE.md)
```

## Validation

### Command Line Validation

```bash
# Lint all skills
tsx scripts/lint-skill-markdown.ts

# Lint specific skill
tsx scripts/lint-skill-markdown.ts --skill=cfn-coordination

# Strict mode (warnings as errors)
tsx scripts/lint-skill-markdown.ts --strict

# Verbose output
tsx scripts/lint-skill-markdown.ts --verbose
```

### Programmatic Validation

```typescript
import { validateSkillMarkdown } from '@/lib/skill-markdown-validator';

const content = fs.readFileSync('./.claude/skills/my-skill/SKILL.md', 'utf-8');
const basePath = './.claude/skills/my-skill';

const result = validateSkillMarkdown(content, basePath);

if (!result.valid) {
  console.error('Validation failed:');
  result.errors.forEach(error => console.error(`  - ${error}`));
}
```

### Build Integration

Add to `package.json`:

```json
{
  "scripts": {
    "lint:skills": "tsx scripts/lint-skill-markdown.ts",
    "lint:skills:strict": "tsx scripts/lint-skill-markdown.ts --strict",
    "migrate:skills": "tsx scripts/migrate-skill-markdown.ts --all"
  }
}
```

Add to CI/CD pipeline:

```yaml
# .github/workflows/ci.yml
- name: Lint Skill Markdown
  run: npm run lint:skills:strict
```

## Migration

### Migrating Existing Skills

```bash
# Dry run (preview changes)
tsx scripts/migrate-skill-markdown.ts --all --dry-run

# Migrate all skills (creates backups)
tsx scripts/migrate-skill-markdown.ts --all

# Migrate specific skill
tsx scripts/migrate-skill-markdown.ts --skill=cfn-coordination

# Force migration (ignore validation errors)
tsx scripts/migrate-skill-markdown.ts --all --force

# Verbose output
tsx scripts/migrate-skill-markdown.ts --all --verbose
```

### What Migration Does

1. **Parses existing frontmatter** - Validates and preserves metadata
2. **Adds missing fields** - Auto-generates `created` and `updated` dates
3. **Validates sections** - Checks for required sections
4. **Adds placeholder sections** - Creates missing required sections
5. **Creates backups** - Stores original files in `.backups/skill-migration/`
6. **Validates result** - Ensures migrated file passes validation

### Backup Location

```
.backups/skill-migration/
├── cfn-coordination/
│   └── 2025-11-16T10-30-45-123Z_SKILL.md
├── skill-template/
│   └── 2025-11-16T10-30-46-456Z_SKILL.md
└── ...
```

## Performance Targets

- **Validation:** <50ms per skill file
- **Migration:** <2s for all existing skills (57 skills as of 2025-11-16)
- **Linting:** <5s for complete codebase

## Best Practices

### Writing Skills

1. **Start with template** - Copy `.claude/skills/SKILL_TEMPLATE.md`
2. **Update frontmatter** - Fill in all required fields
3. **Follow structure** - Use required sections in order
4. **Add examples** - Provide concrete usage examples
5. **Document tests** - Explain how to test the skill
6. **Validate early** - Run linting frequently during development

### Updating Skills

1. **Increment version** - Follow semantic versioning
2. **Update `updated` field** - Set to current date
3. **Validate changes** - Run linting after edits
4. **Test examples** - Ensure all examples still work
5. **Update related docs** - Keep references current

### Code Examples

- **Use real code** - No pseudo-code or placeholders
- **Test examples** - Ensure examples actually work
- **Add context** - Explain what each example demonstrates
- **Show output** - Include expected results when relevant

### Links

- **Prefer relative** - Use relative paths for internal links
- **Check validity** - Ensure all links work
- **Update on move** - Fix links when files move
- **Document external** - Add context for external references

## Error Messages

### Common Validation Errors

**Missing Frontmatter:**
```
No frontmatter block found. SKILL.md must start with YAML frontmatter enclosed in ---
```

**Invalid Version:**
```
Field "version" must be valid semantic version (e.g., 1.0.0), got: v1.0
```

**Missing Section:**
```
Required section "Usage" is missing
```

**Code Block Without Language:**
```
Code block at line 42 missing language specification
```

**Broken Link:**
```
Broken internal link at line 56: "./nonexistent.md"
```

## JSON Schema

The complete JSON schema is available at:

```
schemas/skill-file-v1.schema.json
```

Use with validation tools:

```bash
# Validate frontmatter with ajv
npx ajv validate -s schemas/skill-file-v1.schema.json -d skill-data.json
```

## Integration Points

### Existing Systems

- **Frontmatter Parser** - `src/lib/skill-frontmatter-parser.ts`
- **Error Handling** - `src/lib/errors.ts` (StandardError)
- **Skill Template** - `.claude/skills/SKILL_TEMPLATE.md`
- **Git Hooks** - Pre-commit validation (optional)

### Future Integrations

- **VS Code Extension** - Real-time validation
- **Documentation Generator** - Auto-generate skill index
- **Search Integration** - Index skills by keywords/tags
- **Version Management** - Track skill version history

## Troubleshooting

### Validation Fails on Existing Skill

1. Run migration utility with `--dry-run`
2. Review what changes would be made
3. Run migration without dry run
4. Validate migrated file
5. Fix any remaining issues manually

### Performance Issues

1. Run linting with `--verbose` to see which skills are slow
2. Check for very large skill files (>100KB)
3. Consider splitting large skills into multiple files
4. Profile validation code if needed

### Broken Links After Refactoring

1. Run linting to identify broken links
2. Update links to new file locations
3. Consider using absolute paths for stability
4. Re-validate after fixes

## Version History

- **1.0.0** (2025-11-16) - Initial release
  - Frontmatter schema validation
  - Content structure enforcement
  - Code block validation
  - Link validation
  - Migration utility
  - Linting integration

## References

- [SKILL.md Template](./../.claude/skills/SKILL_TEMPLATE.md)
- [Skill Frontmatter Parser](../src/lib/skill-frontmatter-parser.ts)
- [Skill Markdown Validator](../src/lib/skill-markdown-validator.ts)
- [JSON Schema](../schemas/skill-file-v1.schema.json)
- [Migration Script](../scripts/migrate-skill-markdown.ts)
- [Linting Script](../scripts/lint-skill-markdown.ts)

---

**Questions or Issues?** See `.claude/skills/SKILL_TEMPLATE.md` for complete examples.
