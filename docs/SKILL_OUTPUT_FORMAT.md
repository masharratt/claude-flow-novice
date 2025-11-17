# Skill Output Format Specification

**Task 5.4: Eliminate Bash Output Parsing**

This document specifies the structured JSON output format for all CFN Loop skills, replacing fragile bash output parsing with reliable JSON parsing.

## Overview

### Problem Statement

Legacy skills used unstructured text output:
```bash
echo "SUCCESS"
echo "Confidence: 0.92"
echo "Created: src/file.ts"
```

This approach was fragile and error-prone:
- ❌ Brittle regex parsing
- ❌ Inconsistent formats across skills
- ❌ No schema validation
- ❌ Difficult to extend

### Solution

All skills now output structured JSON:
```json
{
  "success": true,
  "confidence": 0.92,
  "deliverables": ["src/file.ts"],
  "metrics": { "execution_time_ms": 1234 },
  "errors": []
}
```

This approach provides:
- ✅ Reliable parsing with validation
- ✅ Consistent format across all skills
- ✅ Strong typing and schema validation
- ✅ Easy to extend with custom metrics

## JSON Schema

### Complete Schema

```json
{
  "success": true,
  "confidence": 0.92,
  "deliverables": ["src/file.ts", "tests/file.test.ts"],
  "metrics": {
    "execution_time_ms": 1234,
    "files_modified": 2,
    "custom_metric": 42
  },
  "errors": [
    {
      "code": "VALIDATION_FAILED",
      "message": "Schema validation failed",
      "context": { "field": "confidence" }
    }
  ]
}
```

### Required Fields

#### `success` (boolean)

Whether skill execution succeeded.

**Examples:**
```json
{ "success": true }   // Skill completed successfully
{ "success": false }  // Skill failed
```

**Validation:**
- Must be boolean type
- Required in all outputs

#### `confidence` (number)

Confidence score indicating execution quality (0.0-1.0).

**Examples:**
```json
{ "confidence": 0.95 }  // Very confident
{ "confidence": 0.85 }  // Moderately confident
{ "confidence": 0.60 }  // Low confidence
```

**Validation:**
- Must be number type
- Must be >= 0.0 and <= 1.0
- Required in all outputs

**Guidelines:**
- `0.90-1.00`: Excellent - All checks passed, high quality
- `0.75-0.89`: Good - Minor issues, acceptable quality
- `0.60-0.74`: Fair - Some concerns, may need review
- `0.00-0.59`: Poor - Significant issues, needs attention

#### `deliverables` (array)

Files created or modified during execution.

**Examples:**
```json
{
  "deliverables": [
    "src/auth.ts",
    "tests/auth.test.ts",
    "docs/API.md"
  ]
}
```

**Validation:**
- Must be array type
- Each element must be string (file path)
- Can be empty array `[]`
- Paths can be absolute or relative

**Guidelines:**
- Use relative paths from project root when possible
- Include all files created or modified
- Order doesn't matter

#### `metrics` (object)

Execution metrics (extensible).

**Standard Metrics:**
```json
{
  "metrics": {
    "execution_time_ms": 1234,
    "files_modified": 2
  }
}
```

**Custom Metrics:**
```json
{
  "metrics": {
    "execution_time_ms": 1234,
    "files_modified": 2,
    "lines_of_code": 450,
    "test_coverage": 0.92,
    "validation_score": 0.88
  }
}
```

**Validation:**
- Must be object type
- Can be empty object `{}`
- All values must be numeric (integer or float)
- Custom metrics are allowed

**Standard Metric Names:**
- `execution_time_ms` - Execution time in milliseconds
- `files_modified` - Number of files modified
- `files_created` - Number of files created
- `files_deleted` - Number of files deleted

#### `errors` (array)

Errors encountered during execution.

**Examples:**
```json
{
  "errors": [
    {
      "code": "VALIDATION_FAILED",
      "message": "Schema validation failed",
      "context": {
        "field": "confidence",
        "expected": "number",
        "received": "string"
      }
    },
    {
      "code": "FILE_NOT_FOUND",
      "message": "Configuration file not found",
      "context": {
        "path": "./config.json"
      }
    }
  ]
}
```

**Validation:**
- Must be array type
- Can be empty array `[]`
- Each error must have `code` and `message` (strings)
- Optional fields: `stack`, `context`

**Error Codes:**
- Use UPPER_SNAKE_CASE
- Be specific and descriptive
- Examples: `VALIDATION_FAILED`, `FILE_NOT_FOUND`, `TIMEOUT`, `PARSE_ERROR`

## Implementation Guide

### Basic Implementation

```bash
#!/bin/bash
set -euo pipefail

# Skill logic here
echo "Executing skill..." >&2  # Log to stderr

# Output JSON to stdout
cat << 'EOF_JSON'
{
  "success": true,
  "confidence": 0.85,
  "deliverables": [],
  "metrics": {
    "execution_time_ms": 0
  },
  "errors": []
}
EOF_JSON
```

### Advanced Implementation with Variables

```bash
#!/bin/bash
set -euo pipefail

# Track execution time
START_TIME=$(date +%s%3N)

# Initialize variables
SUCCESS=true
CONFIDENCE=0.92
DELIVERABLES=()
ERRORS=()

# Skill logic
if create_file "src/auth.ts"; then
    DELIVERABLES+=("src/auth.ts")
else
    SUCCESS=false
    CONFIDENCE=0.5
    ERRORS+=('{"code":"FILE_WRITE_FAILED","message":"Failed to create auth.ts"}')
fi

# Calculate execution time
END_TIME=$(date +%s%3N)
EXECUTION_TIME=$((END_TIME - START_TIME))

# Build deliverables array (JSON format)
if [ ${#DELIVERABLES[@]} -eq 0 ]; then
    DELIVERABLES_JSON="[]"
else
    DELIVERABLES_JSON=$(printf '%s\n' "${DELIVERABLES[@]}" | jq -R . | jq -s .)
fi

# Build errors array
if [ ${#ERRORS[@]} -eq 0 ]; then
    ERRORS_JSON="[]"
else
    ERRORS_JSON=$(printf '%s\n' "${ERRORS[@]}" | jq -s .)
fi

# Output structured JSON
cat << EOF
{
  "success": ${SUCCESS},
  "confidence": ${CONFIDENCE},
  "deliverables": ${DELIVERABLES_JSON},
  "metrics": {
    "execution_time_ms": ${EXECUTION_TIME},
    "files_modified": ${#DELIVERABLES[@]}
  },
  "errors": ${ERRORS_JSON}
}
EOF
```

### TypeScript/Node.js Implementation

```typescript
import { SkillOutput } from '@/lib/skill-output-parser';

async function executeSkill(): Promise<void> {
  const startTime = Date.now();
  const deliverables: string[] = [];
  const errors: any[] = [];
  let success = true;

  try {
    // Skill logic here
    await createFile('src/auth.ts');
    deliverables.push('src/auth.ts');
  } catch (error) {
    success = false;
    errors.push({
      code: 'FILE_WRITE_FAILED',
      message: error.message,
    });
  }

  const output: SkillOutput = {
    success,
    confidence: success ? 0.92 : 0.5,
    deliverables,
    metrics: {
      execution_time_ms: Date.now() - startTime,
      files_modified: deliverables.length,
    },
    errors,
  };

  // Output JSON to stdout
  console.log(JSON.stringify(output, null, 2));
}

executeSkill();
```

## Parsing

### Using SkillOutputParser

```typescript
import { SkillOutputParser } from '@/lib/skill-output-parser';

const parser = new SkillOutputParser();

// Parse skill output
const output = execSync('./execute.sh').toString();
const result = parser.parse(output);

if (result.success) {
  console.log('Parse successful');
  console.log(`Confidence: ${result.output.confidence}`);
  console.log(`Deliverables: ${result.output.deliverables.join(', ')}`);
  console.log(`Parse method: ${result.parseMethod}`); // 'json' or 'legacy'
} else {
  console.error('Parse failed:', result.errors);
}
```

### Parser Configuration

```typescript
const parser = new SkillOutputParser({
  enableLegacyParsing: false,  // Disable fallback to legacy parsing
  defaultConfidence: 0.5,       // Default for legacy outputs
  strictValidation: true,       // Enable strict schema validation
});
```

### Batch Parsing

```typescript
const outputs = [
  execSync('./skill1/execute.sh').toString(),
  execSync('./skill2/execute.sh').toString(),
  execSync('./skill3/execute.sh').toString(),
];

const results = parser.parseBatch(outputs);

for (const result of results) {
  console.log(`Parse method: ${result.parseMethod}`);
  console.log(`Confidence: ${result.output.confidence}`);
}
```

## Migration

### Migration Tool

Migrate existing skills to JSON output:

```bash
# Migrate single skill
./scripts/migrate-skill-outputs.ts \
  --skill-path .claude/skills/my-skill/execute.sh

# Dry run (preview changes)
./scripts/migrate-skill-outputs.ts \
  --dry-run \
  --skill-dir .claude/skills/

# Migrate all skills with verbose output
./scripts/migrate-skill-outputs.ts \
  --verbose \
  --skill-dir .claude/skills/
```

### Manual Migration

1. **Identify legacy output patterns:**
   ```bash
   echo "SUCCESS"
   echo "Confidence: 0.92"
   echo "Created: src/file.ts"
   ```

2. **Comment out legacy patterns:**
   ```bash
   # LEGACY (replaced with JSON): echo "SUCCESS"
   # LEGACY (replaced with JSON): echo "Confidence: 0.92"
   # LEGACY (replaced with JSON): echo "Created: src/file.ts"
   ```

3. **Add JSON output at the end:**
   ```bash
   # Output structured JSON
   cat << 'EOF_JSON'
   {
     "success": true,
     "confidence": 0.92,
     "deliverables": ["src/file.ts"],
     "metrics": {
       "execution_time_ms": 1234
     },
     "errors": []
   }
   EOF_JSON
   ```

4. **Test JSON output:**
   ```bash
   ./execute.sh | jq .
   ./execute.sh | jq -e '.success, .confidence, .deliverables, .metrics, .errors'
   ```

### Migration Checklist

- [ ] Backup existing skill (migration tool does this automatically)
- [ ] Identify all legacy output patterns
- [ ] Comment out or remove legacy patterns
- [ ] Add JSON output block at end of execute.sh
- [ ] Test JSON output is valid (`./execute.sh | jq .`)
- [ ] Verify all required fields present
- [ ] Validate confidence is in range 0.0-1.0
- [ ] Test with SkillOutputParser
- [ ] Update skill documentation

## Validation

### JSON Validation

```bash
# Validate JSON syntax
./execute.sh | jq .

# Validate required fields exist
./execute.sh | jq -e '.success, .confidence, .deliverables, .metrics, .errors'

# Validate confidence range
./execute.sh | jq -e '.confidence >= 0.0 and .confidence <= 1.0'

# Validate success is boolean
./execute.sh | jq -e '.success | type == "boolean"'

# Validate deliverables is array
./execute.sh | jq -e '.deliverables | type == "array"'
```

### Schema Validation

```bash
# Validate against JSON schema
ajv validate \
  -s schemas/skill-output-v1.schema.json \
  -d <(./execute.sh)
```

### Integration Testing

```bash
# Test skill output parsing
npm test -- tests/skill-output-parser.test.ts

# Test specific skill
./execute.sh | node -e "
const { SkillOutputParser } = require('./src/lib/skill-output-parser');
const parser = new SkillOutputParser();
const input = require('fs').readFileSync(0, 'utf-8');
const result = parser.parse(input);
console.log('Parse method:', result.parseMethod);
console.log('Success:', result.success);
if (!result.success) {
  console.error('Errors:', result.errors);
  process.exit(1);
}
"
```

## Performance

### Performance Targets

- JSON parsing: **< 10ms** (per output)
- Validation: **< 50ms** (per output)
- Batch parsing: **< 100ms** (for 100 outputs)

### Optimization Tips

1. **Use heredoc for JSON output** (faster than echo)
2. **Minimize jq usage** (use native bash when possible)
3. **Cache parser instance** (reuse across multiple parses)
4. **Use batch parsing** (for multiple outputs)

### Performance Testing

```bash
# Test parsing performance
npm test -- tests/skill-output-parser.test.ts -t "Performance"

# Benchmark skill execution
time ./execute.sh | jq .
```

## Examples

### Example 1: Simple Skill

```bash
#!/bin/bash
set -euo pipefail

# Simple validation skill
VALID=true

if [ ! -f "config.json" ]; then
    VALID=false
fi

cat << EOF
{
  "success": ${VALID},
  "confidence": $([ "$VALID" = true ] && echo "0.95" || echo "0.0"),
  "deliverables": [],
  "metrics": {},
  "errors": $([ "$VALID" = false ] && echo '[{"code":"FILE_NOT_FOUND","message":"config.json not found"}]' || echo '[]')
}
EOF
```

### Example 2: File Creation Skill

```bash
#!/bin/bash
set -euo pipefail

# Create authentication module
START_TIME=$(date +%s%3N)

# Create file
cat > src/auth.ts << 'EOF'
export function authenticate() {
  // Implementation here
}
EOF

END_TIME=$(date +%s%3N)

cat << EOF
{
  "success": true,
  "confidence": 0.92,
  "deliverables": ["src/auth.ts"],
  "metrics": {
    "execution_time_ms": $((END_TIME - START_TIME)),
    "files_created": 1,
    "lines_of_code": 4
  },
  "errors": []
}
EOF
```

### Example 3: Multi-Step Skill with Error Handling

```bash
#!/bin/bash
set -euo pipefail

START_TIME=$(date +%s%3N)
DELIVERABLES=()
ERRORS=()
SUCCESS=true

# Step 1: Create directory
if mkdir -p src/api 2>/dev/null; then
    echo "Created directory" >&2
else
    SUCCESS=false
    ERRORS+=('{"code":"MKDIR_FAILED","message":"Failed to create directory"}')
fi

# Step 2: Create files
if [ "$SUCCESS" = true ]; then
    for file in routes.ts controllers.ts middleware.ts; do
        if touch "src/api/$file" 2>/dev/null; then
            DELIVERABLES+=("src/api/$file")
        else
            SUCCESS=false
            ERRORS+=("{\"code\":\"FILE_CREATE_FAILED\",\"message\":\"Failed to create $file\"}")
        fi
    done
fi

# Build JSON arrays
DELIVERABLES_JSON=$(printf '%s\n' "${DELIVERABLES[@]}" | jq -R . | jq -s .)
ERRORS_JSON=$([ ${#ERRORS[@]} -eq 0 ] && echo '[]' || printf '%s\n' "${ERRORS[@]}" | jq -s .)

END_TIME=$(date +%s%3N)

cat << EOF
{
  "success": ${SUCCESS},
  "confidence": $([ "$SUCCESS" = true ] && echo "0.95" || echo "0.5"),
  "deliverables": ${DELIVERABLES_JSON},
  "metrics": {
    "execution_time_ms": $((END_TIME - START_TIME)),
    "files_created": ${#DELIVERABLES[@]}
  },
  "errors": ${ERRORS_JSON}
}
EOF
```

## Troubleshooting

### Common Issues

#### Issue: `SyntaxError: Unexpected token`

**Cause:** Invalid JSON syntax

**Solution:**
```bash
# Test JSON syntax
./execute.sh | jq .

# Common issues:
# - Missing quotes around strings
# - Trailing commas
# - Unescaped quotes in strings
```

#### Issue: `Parse failed: Missing required field: confidence`

**Cause:** JSON missing required fields

**Solution:**
```bash
# Ensure all required fields present:
{
  "success": true,        # Required
  "confidence": 0.85,     # Required
  "deliverables": [],     # Required
  "metrics": {},          # Required
  "errors": []            # Required
}
```

#### Issue: `Confidence must be between 0.0 and 1.0`

**Cause:** Confidence out of valid range

**Solution:**
```bash
# Ensure confidence is 0.0-1.0:
"confidence": 0.92  # ✓ Valid
"confidence": 1.5   # ✗ Invalid (> 1.0)
"confidence": -0.5  # ✗ Invalid (< 0.0)
```

#### Issue: Parser falls back to legacy parsing

**Cause:** JSON not detected or invalid

**Solution:**
```bash
# Ensure JSON is on stdout (not stderr)
cat << 'EOF_JSON'  # ✓ Correct
{
  "success": true,
  ...
}
EOF_JSON

# Don't mix stdout and stderr
echo "Processing..." >&2  # Logs to stderr
cat << 'EOF_JSON'         # JSON to stdout
...
EOF_JSON
```

## References

### Related Files

- **Schema:** `schemas/skill-output-v1.schema.json`
- **Parser:** `src/lib/skill-output-parser.ts`
- **Tests:** `tests/skill-output-parser.test.ts`
- **Migration Tool:** `scripts/migrate-skill-outputs.ts`
- **Template:** `.claude/skills/SKILL_TEMPLATE.md`

### Related Documentation

- **Agent Output Standards:** `docs/AGENT_OUTPUT_STANDARDS.md`
- **Skill Content Standards:** `docs/SKILL_CONTENT_STANDARDS.md`
- **Integration Standardization Plan:** `docs/INTEGRATION_STANDARDIZATION_PLAN.md`

### External References

- [JSON Schema Specification](https://json-schema.org/)
- [jq Manual](https://stedolan.github.io/jq/manual/)
- [Bash Heredoc](https://www.gnu.org/software/bash/manual/html_node/Redirections.html)

---

**Version:** 1.0.0
**Author:** CFN Team
**Last Updated:** 2025-11-16
**Task:** 5.4 - Eliminate Bash Output Parsing
