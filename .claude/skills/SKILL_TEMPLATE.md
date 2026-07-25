---
name: skill-template
version: 1.0.0
tags: [template, example]
status: draft
author: CFN Team
description: Template for creating new CFN Loop skills with standardized structure
dependencies: []
created: 2025-11-16
updated: 2025-11-16
complexity: Low
keywords: [template, skill-creation, standard-structure]
triggers: [new-skill-creation, skill-standardization]
performance_targets:
  execution_time_ms: 1000
  success_rate: 99.5
---

# Skill Template

**Use this template to create new CFN Loop skills with standardized structure.**

## Overview

This template provides a complete starting point for creating new skills that conform to CFN Loop skill content standards. It includes:

- Proper YAML frontmatter with all required fields
- Standard directory structure
- Executable scripts (execute.sh, test.sh, validate.sh)
- Package.json configuration
- Documentation guidelines

## Quick Start

### 1. Copy Template

```bash
# Create new skill from template
SKILL_NAME="my-new-skill"
cp -r ./.claude/skills/SKILL_TEMPLATE.md ./.claude/skills/${SKILL_NAME}/SKILL.md

# Or use the TypeScript API
tsx -e "
import { createSkill } from './src/lib/skill-content-manager';

await createSkill(
  './.claude/skills',
  'my-new-skill',
  {
    name: 'my-new-skill',
    version: '1.0.0',
    tags: ['category', 'feature'],
    status: 'draft',
    author: 'Your Name',
    description: 'Brief description of what this skill does'
  },
  '# My New Skill\n\n## Overview\n\nSkill content here...'
);
"
```

### 2. Update Frontmatter

Edit the frontmatter block to match your skill:

```yaml
---
name: my-new-skill                    # Match directory name
version: 1.0.0                        # Start at 1.0.0
tags: [your, tags, here]             # Descriptive tags
status: draft                         # Start as draft
author: Your Name                     # Your name or team
description: What this skill does     # Clear description
dependencies: [redis, postgres]       # External dependencies
---
```

### 3. Implement Scripts

Update the provided script templates:

- **execute.sh** - Main skill execution logic
- **test.sh** - Comprehensive test suite
- **validate.sh** - Dependency and config validation

### 4. Test and Validate

```bash
# Fix permissions
chmod +x ./.claude/skills/my-new-skill/*.sh

# Run tests
./.claude/skills/my-new-skill/test.sh

# Validate dependencies
./.claude/skills/my-new-skill/validate.sh

# Execute skill
./.claude/skills/my-new-skill/execute.sh
```

## Frontmatter Fields

### Required Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `name` | string | Skill name (match directory) | `my-new-skill` |
| `version` | string | Semantic version | `1.0.0` |
| `tags` | array | Categorization tags | `[coordination, redis]` |
| `status` | enum | Lifecycle status | `draft` |
| `author` | string | Author or team name | `CFN Team` |
| `description` | string | Brief description (>10 chars) | `Handles coordination...` |

### Optional Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `dependencies` | array | External dependencies | `[redis, postgres]` |
| `created` | string | Creation date (ISO) | `2025-11-16` |
| `updated` | string | Last update (ISO) | `2025-11-16` |
| `complexity` | enum | Low, Medium, High | `High` |
| `keywords` | array | Search keywords | `[agent, coordination]` |
| `triggers` | array | When to use | `[multi-agent-workflow]` |
| `performance_targets` | object | Benchmarks | `{ latency_ms: 50 }` |

### Status Values

- `draft` - Initial development
- `approved` - Reviewed, ready for testing
- `staging` - Deployed to staging
- `deployed` - Active in production
- `deprecated` - Marked for removal

## Directory Structure

Your skill directory should contain:

```
my-new-skill/
├── SKILL.md              # This file (documentation + frontmatter)
├── execute.sh            # Main execution script
├── test.sh               # Test suite
├── validate.sh           # Validation script
├── package.json          # NPM metadata
├── README.md             # (Optional) Extended docs
└── lib/                  # (Optional) Supporting code
    └── helpers.sh
```

## Output Format (REQUIRED)

**Task 5.4: All skills MUST output structured JSON for reliable parsing.**

### JSON Output Schema

Your skill's execute.sh MUST output JSON in this format:

```json
{
  "success": true,
  "confidence": 0.92,
  "deliverables": ["src/file.ts", "tests/file.test.ts"],
  "metrics": {
    "execution_time_ms": 1234,
    "files_modified": 2
  },
  "errors": []
}
```

### Required Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `success` | boolean | Whether execution succeeded | `true` |
| `confidence` | number | Confidence score (0.0-1.0) | `0.92` |
| `deliverables` | array | Files created/modified | `["src/auth.ts"]` |
| `metrics` | object | Execution metrics | `{ "execution_time_ms": 1234 }` |
| `errors` | array | Errors encountered | `[]` |

### JSON Output Implementation

Use heredoc for clean JSON output at the end of execute.sh:

```bash
# Output structured JSON
cat << 'EOF_JSON'
{
  "success": true,
  "confidence": 0.92,
  "deliverables": ["src/file.ts", "tests/file.test.ts"],
  "metrics": {
    "execution_time_ms": 1234,
    "files_modified": 2
  },
  "errors": []
}
EOF_JSON
```

See `docs/SKILL_OUTPUT_FORMAT.md` for complete documentation.

## Script Templates

### execute.sh Template

```bash
#!/bin/bash
# My New Skill - Execution Script
# Version: 1.0.0
# Description: Brief description of what this script does

set -euo pipefail

# Configuration
SKILL_NAME="my-new-skill"
SKILL_VERSION="1.0.0"

# Usage information
usage() {
    cat <<EOF
Usage: $0 [OPTIONS]

Options:
    -h, --help          Show this help message
    -v, --verbose       Enable verbose output
    -c, --config PATH   Configuration file path

Examples:
    $0
    $0 --verbose
    $0 --config ./config.json
EOF
}

# Parse arguments
VERBOSE=false
CONFIG_PATH=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            usage
            exit 0
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -c|--config)
            CONFIG_PATH="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Main execution logic
main() {
    echo "Executing ${SKILL_NAME} v${SKILL_VERSION}..."

    # Add your implementation here
    if [ "$VERBOSE" = true ]; then
        echo "Verbose mode enabled"
    fi

    if [ -n "$CONFIG_PATH" ]; then
        echo "Using config: $CONFIG_PATH"
        # Load configuration
    fi

    # Your skill logic here
    echo "Skill execution complete"
}

# Run main function
main "$@"
```

### test.sh Template

```bash
#!/bin/bash
# My New Skill - Test Suite
# Version: 1.0.0

set -euo pipefail

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test assertion helpers
assert_equals() {
    local expected="$1"
    local actual="$2"
    local message="${3:-Assertion failed}"

    ((TESTS_TOTAL++))

    if [ "$expected" = "$actual" ]; then
        ((TESTS_PASSED++))
        echo -e "${GREEN}✓${NC} ${message}"
        return 0
    else
        ((TESTS_FAILED++))
        echo -e "${RED}✗${NC} ${message}"
        echo "  Expected: '${expected}'"
        echo "  Actual:   '${actual}'"
        return 1
    fi
}

assert_not_empty() {
    local value="$1"
    local message="${2:-Value should not be empty}"

    ((TESTS_TOTAL++))

    if [ -n "$value" ]; then
        ((TESTS_PASSED++))
        echo -e "${GREEN}✓${NC} ${message}"
        return 0
    else
        ((TESTS_FAILED++))
        echo -e "${RED}✗${NC} ${message}"
        echo "  Value was empty"
        return 1
    fi
}

assert_file_exists() {
    local file_path="$1"
    local message="${2:-File should exist}"

    ((TESTS_TOTAL++))

    if [ -f "$file_path" ]; then
        ((TESTS_PASSED++))
        echo -e "${GREEN}✓${NC} ${message}"
        return 0
    else
        ((TESTS_FAILED++))
        echo -e "${RED}✗${NC} ${message}"
        echo "  File not found: ${file_path}"
        return 1
    fi
}

# Test suites
test_basic_functionality() {
    echo ""
    echo "Testing basic functionality..."

    # Example tests
    assert_equals "expected" "expected" "Basic equality test"
    assert_not_empty "value" "Non-empty value test"

    # Add your tests here
}

test_error_handling() {
    echo ""
    echo "Testing error handling..."

    # Add error handling tests
}

test_edge_cases() {
    echo ""
    echo "Testing edge cases..."

    # Add edge case tests
}

# Test runner
run_tests() {
    echo "========================================"
    echo "Running tests for my-new-skill"
    echo "========================================"

    test_basic_functionality
    test_error_handling
    test_edge_cases

    echo ""
    echo "========================================"
    echo "Test Results"
    echo "========================================"
    echo "Total:  ${TESTS_TOTAL}"
    echo -e "Passed: ${GREEN}${TESTS_PASSED}${NC}"

    if [ $TESTS_FAILED -gt 0 ]; then
        echo -e "Failed: ${RED}${TESTS_FAILED}${NC}"
        exit 1
    else
        echo -e "Failed: ${TESTS_FAILED}"
        echo ""
        echo -e "${GREEN}All tests passed!${NC}"
        exit 0
    fi
}

# Run all tests
run_tests
```

### validate.sh Template

```bash
#!/bin/bash
# My New Skill - Validation Script
# Version: 1.0.0

set -euo pipefail

VALIDATION_ERRORS=0
VALIDATION_WARNINGS=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Validation helpers
validate_command() {
    local cmd="$1"
    local message="${2:-Command '${cmd}' not found}"

    if command -v "$cmd" &> /dev/null; then
        echo -e "${GREEN}✓${NC} ${cmd} available"
        return 0
    else
        echo -e "${RED}✗${NC} ${message}"
        ((VALIDATION_ERRORS++))
        return 1
    fi
}

validate_file() {
    local file_path="$1"
    local message="${2:-File '${file_path}' not found}"

    if [ -f "$file_path" ]; then
        echo -e "${GREEN}✓${NC} ${file_path} exists"
        return 0
    else
        echo -e "${RED}✗${NC} ${message}"
        ((VALIDATION_ERRORS++))
        return 1
    fi
}

validate_env_var() {
    local var_name="$1"
    local message="${2:-Environment variable '${var_name}' not set}"

    if [ -n "${!var_name:-}" ]; then
        echo -e "${GREEN}✓${NC} ${var_name} is set"
        return 0
    else
        echo -e "${YELLOW}!${NC} ${message}"
        ((VALIDATION_WARNINGS++))
        return 1
    fi
}

# Validation checks
validate_dependencies() {
    echo "Validating dependencies..."

    # Check for required commands
    validate_command "bash" "Bash shell required"
    validate_command "jq" "jq (JSON processor) required"

    # Add your dependency checks here
    # validate_command "redis-cli" "Redis CLI required"
    # validate_command "psql" "PostgreSQL client required"
}

validate_configuration() {
    echo ""
    echo "Validating configuration..."

    # Check for required files
    # validate_file "./config.json" "Configuration file required"

    # Check for required environment variables
    # validate_env_var "REDIS_URL" "Redis URL should be configured"

    # Add your config validation here
}

validate_permissions() {
    echo ""
    echo "Validating file permissions..."

    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

    for script in execute.sh test.sh validate.sh; do
        if [ -x "${script_dir}/${script}" ]; then
            echo -e "${GREEN}✓${NC} ${script} is executable"
        else
            echo -e "${RED}✗${NC} ${script} is not executable"
            ((VALIDATION_ERRORS++))
        fi
    done
}

# Main validation
main() {
    echo "========================================"
    echo "Validating my-new-skill"
    echo "========================================"
    echo ""

    validate_dependencies
    validate_configuration
    validate_permissions

    echo ""
    echo "========================================"
    echo "Validation Results"
    echo "========================================"

    if [ $VALIDATION_ERRORS -eq 0 ] && [ $VALIDATION_WARNINGS -eq 0 ]; then
        echo -e "${GREEN}✓ All validations passed${NC}"
        exit 0
    elif [ $VALIDATION_ERRORS -eq 0 ]; then
        echo -e "${YELLOW}! ${VALIDATION_WARNINGS} warnings found${NC}"
        echo "Skill may have configuration issues"
        exit 0
    else
        echo -e "${RED}✗ ${VALIDATION_ERRORS} validation errors found${NC}"
        if [ $VALIDATION_WARNINGS -gt 0 ]; then
            echo -e "${YELLOW}! ${VALIDATION_WARNINGS} warnings found${NC}"
        fi
        exit 1
    fi
}

main "$@"
```

### package.json Template

```json
{
  "name": "my-new-skill",
  "version": "1.0.0",
  "description": "Brief description of what this skill does",
  "scripts": {
    "execute": "./execute.sh",
    "test": "./test.sh",
    "validate": "./validate.sh"
  },
  "keywords": [
    "cfn",
    "skill",
    "category"
  ],
  "author": "Your Name",
  "license": "MIT",
  "dependencies": {},
  "devDependencies": {}
}
```

## Documentation Guidelines

### Overview Section

Start with a clear overview:

```markdown
## Overview

This skill provides [primary functionality]. It is used when [trigger conditions].

Key features:
- Feature 1
- Feature 2
- Feature 3
```

### Usage Section

Provide clear usage examples:

```markdown
## Usage

Basic usage:

```bash
./.claude/skills/my-new-skill/execute.sh
```

With options:

```bash
./.claude/skills/my-new-skill/execute.sh --verbose --config ./config.json
```

From TypeScript:

```typescript
import { executeSkill } from '@/lib/skill-executor';

await executeSkill('my-new-skill', { verbose: true });
```
```

### API Reference

Document all functions and parameters:

```markdown
## API Reference

### `main(options)`

Main execution function.

**Parameters:**
- `options` (object) - Configuration options
  - `verbose` (boolean) - Enable verbose output
  - `config` (string) - Path to config file

**Returns:** `Promise<void>`

**Example:**
```bash
./execute.sh --verbose
```
```

## Versioning

Follow semantic versioning:

- **1.0.0** - Initial release
- **1.1.0** - New feature (backward compatible)
- **1.0.1** - Bug fix (backward compatible)
- **2.0.0** - Breaking change

Update version in both SKILL.md frontmatter and package.json.

## Testing

Write comprehensive tests covering:

1. **Happy Path:** Normal execution flow
2. **Error Cases:** How errors are handled
3. **Edge Cases:** Boundary conditions
4. **Performance:** Meets performance targets

## Validation

Validate all dependencies and configuration:

1. **Command Availability:** Check required commands exist
2. **File Existence:** Verify required files present
3. **Environment Variables:** Check required env vars set
4. **Permissions:** Ensure scripts are executable

## Skill Markdown Validation

**NEW in v1.0.0:** All SKILL.md files are validated against standardized structure.

### Validate Your Skill

```bash
# Lint specific skill
tsx scripts/lint-skill-markdown.ts --skill=my-new-skill

# Lint all skills
tsx scripts/lint-skill-markdown.ts

# Strict mode (warnings as errors)
tsx scripts/lint-skill-markdown.ts --strict --verbose
```

### Validation Checks

The validator ensures:

1. **Frontmatter Schema** - All required fields present and valid
2. **Section Structure** - Required sections in correct order
3. **Code Blocks** - All code blocks have language specification
4. **Internal Links** - All internal links point to existing files/sections
5. **Content Length** - Each section has minimum content length (50 chars)

### Required Sections

Your SKILL.md MUST include these sections in order:

1. Overview
2. Usage
3. Examples
4. Implementation
5. Tests

Optional sections (API Reference, Configuration, etc.) can appear after required sections.

### Common Validation Errors

**Missing language in code block:**
```markdown
❌ Wrong:
\`\`\`
./script.sh
\`\`\`

✅ Correct:
\`\`\`bash
./script.sh
\`\`\`
```

**Missing required section:**
```
Error: Required section "Usage" is missing
```

**Invalid frontmatter version:**
```
Error: Field "version" must be valid semantic version (e.g., 1.0.0), got: v1.0
```

### Auto-Migration

Migrate existing skills to new format:

```bash
# Dry run (preview changes)
tsx scripts/migrate-skill-markdown.ts --skill=my-skill --dry-run

# Migrate with backup
tsx scripts/migrate-skill-markdown.ts --skill=my-skill
```

See [Skill Markdown Standards](../../docs/SKILL_MARKDOWN_STANDARDS.md) for complete documentation.

## Related Skills

List related skills and how they integrate:

- **skill-1** - Used for X
- **skill-2** - Provides Y
- **skill-3** - Integrated via Z

## References

- [Skill Content Standards](../../docs/SKILL_CONTENT_STANDARDS.md)
- [CFN Loop Documentation](../../cfn-system-expert.md)
- [Agent Output Standards](../../docs/AGENT_OUTPUT_STANDARDS.md)

---

**Ready to create your skill? Start by copying this template and customizing it for your use case!**
