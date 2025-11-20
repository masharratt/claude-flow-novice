# Post-Edit Validation Skill

Validates files after modifications with syntax, formatting, and linting checks.

## Overview

The Post-Edit Validation Skill ensures code quality and correctness after edit operations by running configurable validation pipelines. It detects syntax errors, formatting issues, and code quality problems with real-time feedback.

## Features

- **Multi-Format Support**: TypeScript, JavaScript, JSON, Bash, Markdown, Python
- **Syntax Validation**: Detects syntax errors in JSON and type errors in TypeScript
- **Formatting Checks**: Detects trailing whitespace, mixed line endings, mixed indentation
- **Code Quality**: Detects duplication, complexity patterns, and best practice violations
- **Configurable Pipeline**: Enable/disable checks per file type
- **Blocking Mode**: Optional enforcement of validation rules
- **Non-Blocking Feedback**: Warnings and suggestions without blocking workflow

## Architecture

### Validation Pipeline

```
File Input
    ↓
Type Detection (.ts, .js, .json, .sh, etc.)
    ↓
Type-Specific Validation (syntax, type checking)
    ↓
Common Checks (formatting, duplication)
    ↓
Result Aggregation (errors, warnings, suggestions)
    ↓
Feedback Generation
```

### Configuration

Default config: `.claude/hooks/cfn-post-edit.config.json`

```json
{
  "enabled": true,
  "blocking": false,
  "validation": {
    "typescript": {
      "enabled": true,
      "noEmit": true,
      "skipLibCheck": true
    },
    "bash": {
      "enabled": true,
      "validators": ["pipe-safety", "dependency-checker", "line-endings"],
      "timeout": 5000
    }
  },
  "feedback": {
    "provideSuggestions": true,
    "autoFixable": ["LINT_ISSUES"],
    "nonBlocking": ["TYPE_WARNING", "LINT_ISSUES", "BASH_VALIDATOR_WARNING"],
    "blocking": ["SYNTAX_ERROR", "BASH_VALIDATOR_ERROR"]
  }
}
```

## TypeScript API

### PostEditValidator Class

```typescript
import { PostEditValidator, ValidationResult } from '@/hooks/post-edit-validator';

const validator = new PostEditValidator(projectRoot);

// Load configuration
const config = await validator.loadConfig();

// Validate a file
const result: ValidationResult = await validator.validateFile(filePath, agentId);
// Result: {
//   passed: true,
//   errors: [],
//   warnings: ["Mixed tabs and spaces detected"],
//   suggestions: ["1 lines have trailing whitespace"],
//   timestamp: "2024-11-20T10:30:45.123Z",
//   filePath: "/project/src/file.ts",
//   executionTime: 145
// }

// Run custom validation pipeline
const customResult = await validator.runValidationPipeline(filePath);

// Get human-readable summary
const summary = validator.getValidationSummary(result);
console.log(summary);
// Output:
// ✅ Validation passed
// Warnings (1):
//   - Mixed tabs and spaces detected
// Suggestions (1):
//   - 1 lines have trailing whitespace
// Execution time: 145ms
```

### ValidationResult Interface

```typescript
interface ValidationResult {
  passed: boolean;              // Overall validation status
  errors: string[];             // Blocking issues
  warnings: string[];           // Non-blocking concerns
  suggestions: string[];        // Improvement recommendations
  timestamp: string;            // ISO 8601 timestamp
  filePath: string;             // Validated file path
  executionTime: number;        // Milliseconds
}
```

## CLI Interface

### Post-Edit Hook CLI

Validates file after modification:

```bash
# TypeScript compiled version
node dist/cli/post-edit-hook.js /path/to/file.ts

# With agent ID
node dist/cli/post-edit-hook.js /path/to/file.ts --agent-id agent-123

# Blocking mode (exit 1 on failure)
node dist/cli/post-edit-hook.js /path/to/file.ts --blocking

# Output
# {
#   "passed": true,
#   "errors": [],
#   "warnings": [],
#   "suggestions": [],
#   "timestamp": "2024-11-20T10:30:45.123Z",
#   "filePath": "/path/to/file.ts",
#   "executionTime": 145
# }
```

### Bash Wrapper

For agent compatibility:

```bash
# Primary wrapper (tries TypeScript, falls back to bash)
./.claude/hooks/cfn-invoke-post-edit-ts.sh /path/to/file.ts

# With agent ID
./.claude/hooks/cfn-invoke-post-edit-ts.sh /path/to/file.ts --agent-id agent-123

# Blocking mode
./.claude/hooks/cfn-invoke-post-edit-ts.sh /path/to/file.ts --blocking

# Legacy bash-only wrapper
./.claude/hooks/cfn-invoke-post-edit.sh /path/to/file.ts
```

## Validators by File Type

### TypeScript/JavaScript

```typescript
// Checks:
// - Type errors (via tsc --noEmit)
// - Syntax errors
// - Import/export correctness
// - Undefined symbols

const result = await validator.validateFile('src/component.ts');
if (!result.passed) {
  result.errors.forEach(err => console.error(err));
}
```

### JSON

```typescript
// Checks:
// - JSON syntax validity
// - Schema structure
// - Special character handling

const result = await validator.validateFile('config.json');
// Detects: { invalid json }
```

### Bash Scripts

```typescript
// Checks:
// - Unquoted variable usage
// - Pipe-to-while-read patterns
// - Missing strict mode (set -euo pipefail)
// - Line endings (LF vs CRLF)

const result = await validator.validateFile('script.sh');
// Warnings: "unquoted variables", "pipe-to-while-read", "missing strict mode"
```

### Formatting Checks (All Types)

```typescript
// Checks run on all file types:
// - Trailing whitespace
// - Mixed line endings (CRLF + LF)
// - Mixed indentation (tabs + spaces)

const result = await validator.validateFile('any-file.ts');
if (result.warnings.some(w => w.includes('trailing'))) {
  // Fix trailing whitespace
}
```

### Duplication Detection

When enabled:

```typescript
// Checks:
// - Identical consecutive lines (>20 chars)
// - Copy-paste patterns
// - Duplicate functions/methods

const result = await validator.validateFile('file.ts');
result.suggestions.forEach(s => {
  if (s.includes('Duplicate')) {
    // Consider refactoring duplicated code
  }
});
```

## Integration

### In Agent Workflows

Post-edit validation is automatically called via hooks after Edit/Write operations:

```bash
# After Edit or Write operation
./.claude/hooks/cfn-invoke-post-edit-ts.sh "$FILE_PATH" --agent-id "$AGENT_ID"

# In blocking mode (fails the workflow if validation fails)
./.claude/hooks/cfn-invoke-post-edit-ts.sh "$FILE_PATH" --agent-id "$AGENT_ID" --blocking
```

### Redis Publishing

When enabled, validation results are published to Redis:

```json
{
  "channel": "swarm:hooks:post-edit",
  "message": {
    "file": "/path/to/file.ts",
    "agentId": "agent-123",
    "exitCode": 0,
    "timestamp": "1700000000"
  }
}
```

## Use Cases

### 1. Type Safety

```typescript
// Catch type errors immediately
const result = await validator.validateFile('app.ts');

if (!result.passed) {
  console.error('Type errors detected:');
  result.errors.forEach(e => console.error(`  - ${e}`));
  process.exit(1);
}
```

### 2. Code Quality Gates

```typescript
// Enforce formatting standards
const result = await validator.validateFile('src/utils.ts');

if (result.warnings.length > 0) {
  console.warn('Code quality issues found:');
  result.warnings.forEach(w => console.warn(`  - ${w}`));
}
```

### 3. Pre-Commit Validation

```bash
#!/bin/bash
# Pre-commit hook

FILES=$(git diff --cached --name-only --diff-filter=ACM)

for file in $FILES; do
  result=$(./.claude/hooks/cfn-invoke-post-edit-ts.sh "$file" --blocking)
  if [ $? -ne 0 ]; then
    echo "Validation failed for $file"
    exit 1
  fi
done
```

### 4. Agent Feedback Loop

```typescript
// Provide actionable feedback to agents
const result = await validator.validateFile(filePath, agentId);
const summary = validator.getValidationSummary(result);

console.log('Validation Report:');
console.log(summary);
console.log('\nNext Steps:');

if (result.errors.length > 0) {
  console.log('Fix errors above before proceeding');
} else if (result.suggestions.length > 0) {
  console.log('Consider addressing suggestions for better code quality');
}
```

## Configuration

### Enable/Disable Checks

```bash
# Disable TypeScript checking
export TS_VALIDATION_ENABLED=false

# Enable formatting checks only
export CHECK_FORMATTING=true
export CHECK_SYNTAX=false

# Strict mode (all checks blocking)
export BLOCKING_VALIDATION=true
```

### Custom Pipeline

```typescript
// Create custom validator with specific rules
const validator = new PostEditValidator(projectRoot);
validator.config = {
  checkSyntax: true,
  checkFormatting: true,
  checkDuplication: true,
  blockingValidation: false,
  typescript: { enabled: true, noEmit: true, skipLibCheck: true },
  bash: { enabled: true, validators: ['pipe-safety'], timeout: 5000 },
};

const result = await validator.runValidationPipeline(filePath);
```

## Testing

Run tests with Jest:

```bash
npm test tests/post-edit-validator.test.ts

# With coverage
npm test tests/post-edit-validator.test.ts -- --coverage

# Specific test suite
npm test tests/post-edit-validator.test.ts -t "validateJSON"
```

Test coverage includes:
- JSON syntax validation
- Bash script validation
- Formatting checks (whitespace, line endings, indentation)
- Duplication detection
- File type detection
- Configuration loading
- Result aggregation
- Error handling
- Edge cases (empty files, large files, special characters)

## Performance

- **JSON Validation**: <5ms
- **Bash Validation**: <20ms
- **TypeScript Check**: 100-500ms (depends on project size)
- **Formatting Checks**: <10ms
- **Full Pipeline**: <600ms typical

## Troubleshooting

### TypeScript Check Fails

```bash
# Verify TypeScript is installed
npm ls typescript

# Check tsconfig.json
cat tsconfig.json

# Run tsc directly
npx tsc --noEmit
```

### JSON Validation Issues

```bash
# Validate JSON syntax with jq
jq . < file.json

# Pretty-print and check
jq '.' < file.json > /tmp/formatted.json
```

### Bash Validation Warnings

```bash
# Check bash syntax directly
bash -n script.sh

# Verify strict mode
grep 'set -euo pipefail' script.sh

# Fix unquoted variables
sed -i 's/\$\([a-zA-Z_][a-zA-Z0-9_]*\)/"$\1"/g' script.sh
```

## Configuration Reference

### cfn-post-edit.config.json

```json
{
  "enabled": true,
  "version": "2.0.0",
  "blocking": false,
  "validation": {
    "typescript": {
      "enabled": true,
      "noEmit": true,
      "skipLibCheck": true
    },
    "bash": {
      "enabled": true,
      "validators": ["pipe-safety", "dependency-checker", "line-endings"],
      "timeout": 5000
    }
  },
  "feedback": {
    "provideSuggestions": true,
    "autoFixable": ["LINT_ISSUES"],
    "nonBlocking": ["TYPE_WARNING", "LINT_ISSUES"],
    "blocking": ["SYNTAX_ERROR", "BASH_VALIDATOR_ERROR"]
  }
}
```

## References

- **Configuration**: `.claude/hooks/cfn-post-edit.config.json`
- **Tests**: `tests/post-edit-validator.test.ts`
- **CLI Entry**: `src/cli/post-edit-hook.ts`
- **Hook Wrappers**: `.claude/hooks/cfn-invoke-post-edit*.sh`
- **Pre-Edit Backup**: `.claude/skills/pre-edit-backup/SKILL.md`

---

## ⚠️ Bash Deprecation Notice

**The bash implementation of this skill is deprecated as of 2025-11-20.**

**Deprecation Date:** 2025-11-20  
**Removal Date:** 2026-02-20 (90 days)  
**TypeScript Implementation:** dist/cli/pre-edit-hook.js and dist/cli/post-edit-hook.js  
**Migration Guide:** src/hooks/README.md  

### Why Migrate to TypeScript?

- **Type Safety:** Zero runtime type errors with compile-time validation
- **Better Performance:** 5-10ms faster execution, optimized Redis operations
- **Comprehensive Testing:** 90%+ test coverage with unit, integration, and E2E tests
- **Modern Tooling:** Full IDE support, autocomplete, and inline documentation
- **Maintainability:** Single source of truth, easier debugging

### Automatic Migration

Set environment variable to automatically use TypeScript:

```bash
export USE_TYPESCRIPT=true
```

All coordinators and orchestrators will automatically prefer TypeScript implementations.

### Rollback

If issues arise:

```bash
export USE_TYPESCRIPT=false
```

Bash scripts will continue working for the 90-day deprecation period.

### See Also

- **Complete Deprecation List:** [docs/BASH_DEPRECATION_NOTICE.md](../../../docs/BASH_DEPRECATION_NOTICE.md)
- **TypeScript Benefits:** See individual migration guides
- **Test Coverage:** Run `npm test` to verify TypeScript implementation

---
