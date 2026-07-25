# Skill Markdown Format Specification v1.0

**Version:** 1.0.0
**Status:** Active
**Last Updated:** 2025-11-16
**Schema:** `schemas/skill-markdown-v1.schema.json`

## Table of Contents

- [Overview](#overview)
- [Format Structure](#format-structure)
- [Frontmatter Requirements](#frontmatter-requirements)
- [Required Sections](#required-sections)
- [Code Block Guidelines](#code-block-guidelines)
- [Validation Rules](#validation-rules)
- [Migration Guide](#migration-guide)
- [Examples](#examples)
- [Appendices](#appendices)

---

## Overview

### Purpose

This specification defines the canonical format for CFN (Claude Flow Novice) skill markdown files. Skills are modular, reusable capabilities that agents can leverage to perform specific tasks. A standardized format ensures:

- **Consistency** across all skill documentation
- **Machine readability** for automated validation and tooling
- **Discoverability** through metadata and tagging
- **Maintainability** with version tracking and status indicators
- **Quality** through required sections and validation

### Scope

This specification applies to:
- All skills in `.claude/skills/*/SKILL.md`
- The skill template: `.claude/skills/SKILL_TEMPLATE.md`
- Future skill submissions and modifications

### Audience

- **Skill Authors**: Create new skills following this format
- **Agent Developers**: Understand skill structure for integration
- **Tool Developers**: Build validators and linters
- **Maintainers**: Review and approve skill submissions

---

## Format Structure

A compliant skill markdown file consists of two main parts:

1. **Frontmatter** (YAML): Metadata enclosed in `---` delimiters
2. **Body** (Markdown): Required sections with specific headings

### Complete Structure

```markdown
---
name: skill-name
version: 1.0.0
category: coordination
status: active
author: CFN Team
tags: [redis, coordination, cli]
---

# Skill Name

## Overview
Brief description of skill purpose and functionality

## Usage
Instructions on how to use the skill

## Examples
Code examples demonstrating skill usage

## Implementation
Implementation details and technical specifications

## Testing
Testing procedures and validation steps
```

---

## Frontmatter Requirements

Frontmatter is YAML-formatted metadata at the beginning of the file, enclosed by `---` delimiters.

### Required Fields

#### `name`
- **Type**: `string`
- **Format**: Kebab-case (lowercase with hyphens)
- **Pattern**: `^[a-z0-9-]+$`
- **Length**: 3-64 characters
- **Description**: Unique identifier for the skill
- **Examples**:
  - `cfn-coordination`
  - `agent-spawning`
  - `pre-edit-backup`

#### `version`
- **Type**: `string`
- **Format**: Semantic versioning (SemVer)
- **Pattern**: `^\d+\.\d+\.\d+$`
- **Description**: Version following MAJOR.MINOR.PATCH
- **Examples**:
  - `1.0.0` - Initial stable release
  - `2.15.3` - Patch on minor version 15
  - `0.1.0` - Pre-release version

**Versioning Guidelines**:
- **MAJOR**: Incompatible changes (breaking API)
- **MINOR**: Backward-compatible new features
- **PATCH**: Backward-compatible bug fixes

#### `category`
- **Type**: `string`
- **Length**: 3-64 characters
- **Description**: Skill category for organization
- **Common Categories**:
  - `coordination` - Agent coordination and communication
  - `testing` - Testing and validation
  - `documentation` - Documentation generation
  - `security` - Security and compliance
  - `infrastructure` - Infrastructure and deployment
  - `data` - Data processing and analysis

#### `status`
- **Type**: `string`
- **Enum**: `active | deprecated | experimental`
- **Default**: `active`
- **Description**: Current lifecycle status
- **Values**:
  - `active` - Production-ready, fully supported
  - `deprecated` - Being phased out, use alternative
  - `experimental` - Under development, subject to change

### Optional Fields

#### `author`
- **Type**: `string`
- **Length**: 2-128 characters
- **Description**: Author or maintainer name
- **Examples**:
  - `CFN Team`
  - `John Doe`

#### `tags`
- **Type**: `array` of `string`
- **Item Pattern**: `^[a-z0-9-]+$`
- **Length**: 2-32 characters per tag
- **Max Items**: 10
- **Unique**: Yes
- **Description**: Relevant tags for filtering and search
- **Examples**:
  - `["redis", "coordination", "cli"]`
  - `["testing", "validation"]`
  - `["backup", "safety"]`

#### `dependencies`
- **Type**: `array` of `string`
- **Item Pattern**: `^[a-z0-9-]+$`
- **Unique**: Yes
- **Description**: Other skills this skill depends on
- **Example**: `["cfn-coordination", "agent-spawning"]`

#### `deprecated_by`
- **Type**: `string`
- **Pattern**: `^[a-z0-9-]+$`
- **Description**: Replacement skill (if status is deprecated)
- **Example**: `cfn-coordination-v2`

### Frontmatter Example

```yaml
---
name: cfn-loop-orchestration-v2
version: 2.1.0
category: coordination
status: active
author: CFN Team
tags: [coordination, blocking, pub-sub]
dependencies: [cfn-environment-sanitization]
---
```

### Frontmatter Validation

- **YAML Syntax**: Must be valid YAML
- **Delimiters**: Must start and end with `---` on separate lines
- **Required Fields**: All four required fields must be present
- **Pattern Matching**: `name`, `version`, `tags` must match patterns
- **Enum Values**: `status` must be one of allowed values
- **Unique Tags**: No duplicate tags allowed

---

## Required Sections

All skills MUST include five required sections in this order:

### 1. Overview

**Heading**: `## Overview`

**Purpose**: Brief description of what the skill does and why it exists.

**Content Requirements**:
- Minimum 10 characters
- Maximum 5,000 characters
- Clear, concise explanation
- Problem the skill solves
- High-level functionality

**Example**:
```markdown
## Overview

This skill provides Redis-based coordination for CFN Loop agents. It enables
zero-token communication between coordinator and worker agents using Redis
pub/sub and blocking operations. Agents signal completion via Redis lists,
allowing coordinators to collect confidence scores without polling.
```

### 2. Usage

**Heading**: `## Usage`

**Purpose**: Instructions on how to use the skill.

**Content Requirements**:
- Minimum 10 characters
- Maximum 10,000 characters
- Step-by-step instructions
- Prerequisites (if any)
- Common use cases
- Integration points

**Example**:
```markdown
## Usage

### Prerequisites
- Redis server running on `cfn-redis:6379`
- Task ID and Agent ID environment variables

### Basic Usage

1. Source the coordination functions:
   ```bash
   source ./.claude/skills/cfn-coordination/coordinate.sh
   ```

2. Signal task completion:
   ```bash
   coordinate_signal "task-123" "agent-456" "done"
   ```

3. Wait for signal in coordinator:
   ```bash
   coordinate_wait "task-123" "agent-456" "done" 300
   ```
```

### 3. Examples

**Heading**: `## Examples`

**Purpose**: Code examples demonstrating skill usage.

**Content Requirements**:
- Minimum 10 characters
- Maximum 20,000 characters
- At least one complete example
- All code blocks MUST have language specifiers
- Real-world scenarios
- Expected outputs

**Example**:
```markdown
## Examples

### Example 1: Basic Coordination

```bash
#!/bin/bash

# Load coordination functions
source ./.claude/skills/cfn-coordination/coordinate.sh

# Coordinator waits for agent completion
TASK_ID="cfn-task-123"
AGENT_ID="backend-dev-456"

echo "Waiting for agent ${AGENT_ID} to complete..."
if coordinate_wait "$TASK_ID" "$AGENT_ID" "done" 300; then
  echo "Agent completed successfully"

  # Retrieve confidence score
  CONFIDENCE=$(redis-cli GET "swarm:${TASK_ID}:${AGENT_ID}:confidence")
  echo "Confidence: ${CONFIDENCE}"
else
  echo "Agent timed out"
  exit 1
fi
```

**Expected Output**:
```
Waiting for agent backend-dev-456 to complete...
Agent completed successfully
Confidence: 0.87
```
```

### 4. Implementation

**Heading**: `## Implementation`

**Purpose**: Implementation details and technical specifications.

**Content Requirements**:
- Minimum 10 characters
- Maximum 20,000 characters
- Technical architecture
- Key functions/components
- Data structures
- Performance considerations
- Error handling approach

**Example**:
```markdown
## Implementation

### Architecture

The skill uses Redis as a coordination layer with two primary mechanisms:

1. **Blocking Operations**: `BLPOP` for zero-token waiting
2. **Key-Value Storage**: `HSET`/`HGET` for metadata

### Key Components

**coordinate_signal()**:
```bash
coordinate_signal() {
  local task_id="$1"
  local agent_id="$2"
  local signal="$3"

  redis-cli LPUSH "swarm:${task_id}:${agent_id}:${signal}" "1"
}
```

**coordinate_wait()**:
```bash
coordinate_wait() {
  local task_id="$1"
  local agent_id="$2"
  local signal="$3"
  local timeout="${4:-300}"

  redis-cli BLPOP "swarm:${task_id}:${agent_id}:${signal}" "$timeout"
}
```

### Performance

- Zero token cost during waiting (BLPOP blocks without CPU)
- Sub-millisecond signaling latency
- Supports 1000+ concurrent agents
```

### 5. Testing

**Heading**: `## Testing`

**Purpose**: Testing procedures and validation steps.

**Content Requirements**:
- Minimum 10 characters
- Maximum 10,000 characters
- Test procedures
- Validation criteria
- Test commands
- Expected results

**Example**:
```markdown
## Testing

### Unit Tests

Run skill-specific tests:

```bash
npm test -- cfn-coordination
```

### Integration Tests

Test with live Redis instance:

```bash
# Start Redis
docker run -d --name cfn-redis -p 6379:6379 redis:7-alpine

# Run integration tests
bash ./.claude/skills/cfn-coordination/test-coordination.sh
```

### Validation Criteria

- All signals delivered within 100ms
- BLPOP timeout works correctly
- Handles Redis connection failures gracefully
- Supports 100+ concurrent agents

### Manual Testing

```bash
# Terminal 1 (Coordinator)
source ./.claude/skills/cfn-coordination/coordinate.sh
coordinate_wait "test-task" "test-agent" "done" 60

# Terminal 2 (Agent)
source ./.claude/skills/cfn-coordination/coordinate.sh
coordinate_signal "test-task" "test-agent" "done"
```
```

### Optional Sections

**Troubleshooting**: `## Troubleshooting`
- Common issues and solutions
- Debugging tips
- FAQ

**Migration**: `## Migration`
- For deprecated skills
- Migration path to replacement
- Breaking changes

---

## Code Block Guidelines

All code blocks in skill markdown files MUST follow these rules:

### Language Specifiers Required

**Rule**: Every code block MUST specify a language using triple backticks.

**Valid**:
```markdown
```bash
echo "valid"
\`\`\`
```

**Invalid**:
```markdown
```
echo "invalid - no language"
\`\`\`
```

### Supported Languages

Common language specifiers:
- `bash`, `sh` - Shell scripts
- `typescript`, `ts` - TypeScript code
- `javascript`, `js` - JavaScript code
- `json` - JSON data
- `yaml`, `yml` - YAML data
- `markdown`, `md` - Markdown content
- `python`, `py` - Python code
- `rust`, `rs` - Rust code
- `go` - Go code
- `dockerfile` - Dockerfile content
- `sql` - SQL queries
- `regex` - Regular expressions

### Code Block Best Practices

1. **Include Comments**: Explain complex logic
2. **Show Output**: Include expected output after examples
3. **Complete Examples**: Provide working, runnable code
4. **Error Handling**: Show error cases
5. **Formatting**: Use consistent indentation

**Example**:
```markdown
## Examples

### Example: Error Handling

```bash
#!/bin/bash
set -euo pipefail

# Attempt coordination with timeout
if ! coordinate_wait "task-123" "agent-456" "done" 60; then
  echo "ERROR: Agent timed out after 60 seconds" >&2
  exit 1
fi

echo "SUCCESS: Agent completed"
\`\`\`

**Expected Output** (success):
```
SUCCESS: Agent completed
\`\`\`

**Expected Output** (timeout):
```
ERROR: Agent timed out after 60 seconds
\`\`\`
```

---

## Validation Rules

### Automated Validation

The skill format is validated using:

1. **JSON Schema**: `schemas/skill-markdown-v1.schema.json`
2. **Markdownlint**: `.markdownlint-skill.json`
3. **Custom Validators**: `scripts/validate-all-skills.ts`

### Validation Checklist

- [ ] Frontmatter exists and is valid YAML
- [ ] All required frontmatter fields present
- [ ] `name` follows kebab-case pattern
- [ ] `version` follows semantic versioning
- [ ] `status` is one of: active, deprecated, experimental
- [ ] All five required sections present
- [ ] Each section has minimum 10 characters
- [ ] All code blocks have language specifiers
- [ ] No broken internal links
- [ ] Heading hierarchy is valid (no skipped levels)
- [ ] File named `SKILL.md` (case-sensitive)

### Validation Tools

#### Command Line

```bash
# Validate all skills
npm run validate-skills

# Validate with auto-fix
npm run validate-skills -- --fix

# Generate HTML report
npm run validate-skills -- --report=html
```

#### Programmatic

```typescript
import { validateSkill } from './scripts/validate-all-skills';

const result = await validateSkill('.claude/skills/my-skill/SKILL.md');

if (!result.valid) {
  console.error('Validation errors:', result.errors);
}
```

### CI/CD Integration

Add to `.github/workflows/validate-skills.yml`:

```yaml
name: Validate Skills

on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run validate-skills
```

---

## Migration Guide

### For Existing Skills

If you have skills that don't conform to this specification:

#### Step 1: Add Frontmatter

If your skill lacks frontmatter, add it at the top:

```yaml
---
name: my-existing-skill
version: 1.0.0
category: <appropriate-category>
status: active
---
```

#### Step 2: Add Missing Sections

Check for required sections:

```bash
# Check which sections are missing
npm run validate-skills -- --report=text | grep "missing.*section"
```

Add missing sections with at least 10 characters of content.

#### Step 3: Fix Code Blocks

Find code blocks without language specifiers:

```bash
# Scan for unlabeled code blocks
grep -n '```$' .claude/skills/*/SKILL.md
```

Add language specifiers:

**Before**:
```
\`\`\`
echo "test"
\`\`\`
```

**After**:
```
\`\`\`bash
echo "test"
\`\`\`
```

#### Step 4: Validate

```bash
npm run validate-skills -- --fix
```

Review auto-fixed changes and commit.

### Migration Priority

**High Priority** (Breaks validation):
- Missing frontmatter
- Missing required sections
- Invalid `name` or `version` format

**Medium Priority** (Warnings):
- Code blocks without language specifiers
- Broken internal links
- Invalid heading hierarchy

**Low Priority** (Nice to have):
- Missing optional frontmatter fields (`author`, `tags`)
- Missing optional sections (`Troubleshooting`, `Migration`)

### Bulk Migration Script

For migrating multiple skills:

```bash
#!/bin/bash

# Migrate all skills
for skill_dir in .claude/skills/*/; do
  skill_file="${skill_dir}SKILL.md"

  if [ -f "$skill_file" ]; then
    echo "Migrating: $skill_file"

    # Run auto-fix
    npm run validate-skills -- --fix "$skill_file"

    # Manual review required for complex cases
    if ! npm run validate-skills -- "$skill_file"; then
      echo "  ⚠️  Manual review needed"
    fi
  fi
done
```

---

## Examples

### Complete Valid Skill

```markdown
---
name: example-skill
version: 1.0.0
category: testing
status: active
author: CFN Team
tags: [example, testing, documentation]
---

# Example Skill

## Overview

This is an example skill demonstrating the canonical format. It showcases
all required sections and follows best practices for documentation, code
examples, and validation.

## Usage

### Prerequisites

- Node.js 18+
- Access to skill directory

### Basic Usage

1. Import the skill:
   ```typescript
   import { exampleFunction } from './example-skill';
   ```

2. Call the function:
   ```typescript
   const result = exampleFunction('input');
   console.log(result);
   ```

## Examples

### Example 1: Basic Call

```typescript
import { exampleFunction } from './example-skill';

const result = exampleFunction('hello');
console.log(result); // Output: "HELLO"
```

### Example 2: Error Handling

```typescript
try {
  const result = exampleFunction(null);
} catch (error) {
  console.error('Invalid input:', error.message);
}
```

## Implementation

### Architecture

The skill uses a simple transformation pipeline:

1. Input validation
2. Processing
3. Output formatting

### Key Components

**exampleFunction**:
```typescript
export function exampleFunction(input: string): string {
  if (!input) {
    throw new Error('Input required');
  }

  return input.toUpperCase();
}
```

### Performance

- O(n) time complexity
- O(1) space complexity
- Handles strings up to 10MB

## Testing

### Unit Tests

```bash
npm test -- example-skill
```

### Validation Criteria

- Handles empty strings gracefully
- Preserves Unicode characters
- Throws on null input

### Coverage

Target: >90% code coverage

```bash
npm run test:coverage -- example-skill
```
```

### Deprecated Skill Example

```markdown
---
name: old-coordination
version: 1.5.0
category: coordination
status: deprecated
deprecated_by: cfn-coordination
---

# Old Coordination (Deprecated)

**⚠️ DEPRECATED**: Use `cfn-coordination` instead.

## Overview

This skill provided basic coordination but has been superseded by
`cfn-coordination` which offers better performance and Redis support.

## Migration

See `cfn-coordination` skill for migration guide.

## Usage

(Preserved for reference)

## Examples

(Preserved for reference)

## Implementation

(Preserved for reference)

## Testing

(Preserved for reference)
```

---

## Appendices

### A. JSON Schema Reference

Full schema available at: `schemas/skill-markdown-v1.schema.json`

### B. Validation Error Codes

| Code | Severity | Description |
|------|----------|-------------|
| `missing_frontmatter` | Error | No frontmatter found |
| `invalid_frontmatter` | Error | Frontmatter YAML invalid |
| `missing_section` | Error | Required section missing |
| `section_too_short` | Warning | Section under 10 characters |
| `code_block_no_language` | Warning | Code block without language |
| `broken_link` | Warning | Internal link points to missing file |
| `invalid_heading_hierarchy` | Warning | Heading levels skip (h1 → h3) |
| `invalid_version` | Error | Version doesn't follow SemVer |
| `invalid_name_format` | Error | Name not in kebab-case |

### C. Related Documentation

- Skill Template: `.claude/skills/SKILL_TEMPLATE.md`
- Validation Utility: `scripts/validate-all-skills.ts`
- Linting Config: `.markdownlint-skill.json`
- Task 5.2 Validator: `src/lib/skill-markdown-validator.ts`

### D. Changelog

**v1.0.0** (2025-11-16):
- Initial specification release
- Defined frontmatter requirements
- Specified five required sections
- Added code block guidelines
- Created validation rules
- Documented migration path

---

## Metadata

**Document Version**: 1.0.0
**Schema Version**: 1.0.0
**Last Updated**: 2025-11-16
**Maintained By**: CFN Team
**Status**: Active

**License**: MIT
**Copyright**: © 2025 Claude Flow Novice Contributors
