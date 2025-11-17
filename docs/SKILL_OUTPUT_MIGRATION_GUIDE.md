# Skill Output Migration Guide

**Task 5.4: Eliminate Bash Output Parsing**

This guide helps you migrate existing bash skills from legacy text output to structured JSON output.

## Quick Start

### Automated Migration

```bash
# Migrate all skills (dry run first)
./scripts/migrate-skill-outputs.ts --dry-run --skill-dir .claude/skills/

# Review changes, then run actual migration
./scripts/migrate-skill-outputs.ts --verbose --skill-dir .claude/skills/

# Migrate single skill
./scripts/migrate-skill-outputs.ts --skill-path .claude/skills/my-skill/execute.sh
```

### Manual Migration

For more control or complex skills, follow the step-by-step guide below.

## Step-by-Step Migration

### Step 1: Identify Legacy Patterns

**Common legacy output patterns:**

```bash
# Pattern 1: Success/Error messages
echo "SUCCESS"
echo "COMPLETE"
echo "ERROR: Something failed"

# Pattern 2: Confidence reporting
echo "Confidence: 0.92"
echo "Score: 85%"

# Pattern 3: File reporting
echo "Created: src/file.ts"
echo "Modified: tests/file.test.ts"

# Pattern 4: Metrics reporting
echo "Execution time: 1234ms"
echo "Files modified: 3"
```

**Find legacy patterns in your skill:**

```bash
# Search for legacy patterns
grep -E "echo.*SUCCESS|echo.*COMPLETE|echo.*Confidence" .claude/skills/*/execute.sh

# Or use the migration tool's detection
./scripts/migrate-skill-outputs.ts --dry-run --skill-path .claude/skills/my-skill/execute.sh
```

### Step 2: Create Backup

**Always backup before modifying:**

```bash
# Manual backup
cp .claude/skills/my-skill/execute.sh .claude/skills/my-skill/execute.sh.backup

# Migration tool creates backups automatically
# Backups are saved as: execute.sh.backup
```

### Step 3: Comment Out Legacy Output

**Don't delete legacy output immediately - comment it out:**

```bash
# Before:
echo "SUCCESS"
echo "Confidence: 0.92"
echo "Created: src/file.ts"

# After:
# LEGACY (replaced with JSON): echo "SUCCESS"
# LEGACY (replaced with JSON): echo "Confidence: 0.92"
# LEGACY (replaced with JSON): echo "Created: src/file.ts"
```

**Why comment instead of delete?**
- Keep reference for debugging
- Easy to revert if needed
- Document what was changed

### Step 4: Add JSON Output

**Add JSON output block at the end of execute.sh:**

```bash
#!/bin/bash
set -euo pipefail

# ... existing skill logic ...

# LEGACY (replaced with JSON): echo "SUCCESS"
# LEGACY (replaced with JSON): echo "Confidence: 0.92"

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

**Important placement:**
- Add JSON output at the **very end** of the script
- After all other logic completes
- Before any `exit` statements (or move exit before JSON output)

### Step 5: Extract Dynamic Values

**Convert from static to dynamic JSON:**

**Before (static):**
```bash
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

**After (dynamic):**
```bash
#!/bin/bash
set -euo pipefail

# Track execution time
START_TIME=$(date +%s%3N)

# Track deliverables
DELIVERABLES=()

# Track errors
ERRORS=()
SUCCESS=true

# Skill logic
if create_file "src/file.ts"; then
    DELIVERABLES+=("src/file.ts")
else
    SUCCESS=false
    ERRORS+=('{"code":"FILE_CREATE_FAILED","message":"Failed to create file"}')
fi

# Calculate metrics
END_TIME=$(date +%s%3N)
EXECUTION_TIME=$((END_TIME - START_TIME))

# Build JSON arrays
if [ ${#DELIVERABLES[@]} -eq 0 ]; then
    DELIVERABLES_JSON="[]"
else
    DELIVERABLES_JSON=$(printf '%s\n' "${DELIVERABLES[@]}" | jq -R . | jq -s .)
fi

if [ ${#ERRORS[@]} -eq 0 ]; then
    ERRORS_JSON="[]"
else
    ERRORS_JSON=$(printf '%s\n' "${ERRORS[@]}" | jq -s .)
fi

# Output structured JSON (no quotes around EOF for variable expansion)
cat << EOF
{
  "success": ${SUCCESS},
  "confidence": $([ "$SUCCESS" = true ] && echo "0.92" || echo "0.5"),
  "deliverables": ${DELIVERABLES_JSON},
  "metrics": {
    "execution_time_ms": ${EXECUTION_TIME},
    "files_modified": ${#DELIVERABLES[@]}
  },
  "errors": ${ERRORS_JSON}
}
EOF
```

**Key differences:**
- Use `<< EOF` (no quotes) for variable expansion
- Use `<< 'EOF_JSON'` (with quotes) for static JSON
- Build arrays using jq
- Calculate confidence based on success/failure

### Step 6: Test JSON Output

**Validate JSON syntax:**

```bash
# Test JSON is valid
./execute.sh | jq .

# Should output:
# {
#   "success": true,
#   "confidence": 0.92,
#   ...
# }
```

**Validate required fields:**

```bash
# Check all required fields present
./execute.sh | jq -e '.success, .confidence, .deliverables, .metrics, .errors'

# Should exit with code 0 if all fields present
echo $?  # Output: 0
```

**Validate field types:**

```bash
# Validate success is boolean
./execute.sh | jq -e '.success | type == "boolean"'

# Validate confidence is number in range
./execute.sh | jq -e '.confidence >= 0.0 and .confidence <= 1.0'

# Validate deliverables is array
./execute.sh | jq -e '.deliverables | type == "array"'

# Validate metrics is object
./execute.sh | jq -e '.metrics | type == "object"'

# Validate errors is array
./execute.sh | jq -e '.errors | type == "array"'
```

**Test with parser:**

```bash
# Test with SkillOutputParser
node -e "
const { SkillOutputParser } = require('./src/lib/skill-output-parser');
const { execSync } = require('child_process');

const parser = new SkillOutputParser();
const output = execSync('./.claude/skills/my-skill/execute.sh').toString();
const result = parser.parse(output);

console.log('Parse method:', result.parseMethod);
console.log('Success:', result.success);
console.log('Confidence:', result.output.confidence);

if (result.parseMethod !== 'json') {
    console.error('ERROR: Not using JSON output!');
    process.exit(1);
}
"
```

### Step 7: Update Documentation

**Update skill's SKILL.md:**

```markdown
## Output Format

This skill outputs structured JSON:

\`\`\`json
{
  "success": true,
  "confidence": 0.92,
  "deliverables": ["src/file.ts"],
  "metrics": {
    "execution_time_ms": 1234,
    "files_modified": 1
  },
  "errors": []
}
\`\`\`

See [Skill Output Format](../../docs/SKILL_OUTPUT_FORMAT.md) for specification.
```

**Update package.json version:**

```json
{
  "name": "my-skill",
  "version": "1.1.0",  // Increment minor version
  "description": "Updated to use JSON output (Task 5.4)"
}
```

### Step 8: Test Integration

**Test skill in CFN Loop context:**

```bash
# Test single execution
./.claude/skills/my-skill/execute.sh

# Test in batch
for i in {1..10}; do
    ./.claude/skills/my-skill/execute.sh | jq -c .
done

# Test with different scenarios (success/failure)
# Test error handling
# Test edge cases
```

### Step 9: Remove Backup

**After confirming migration successful:**

```bash
# Remove backup after successful migration and testing
rm .claude/skills/my-skill/execute.sh.backup
```

**Keep backup if:**
- Still testing the migration
- Not confident in the changes
- Want to compare old vs new behavior

## Migration Patterns

### Pattern 1: Simple Success/Failure

**Before:**
```bash
if validate_config; then
    echo "SUCCESS"
    echo "Confidence: 0.95"
else
    echo "ERROR: Validation failed"
    echo "Confidence: 0.0"
fi
```

**After:**
```bash
if validate_config; then
    SUCCESS=true
    CONFIDENCE=0.95
    ERRORS_JSON="[]"
else
    SUCCESS=false
    CONFIDENCE=0.0
    ERRORS_JSON='[{"code":"VALIDATION_FAILED","message":"Validation failed"}]'
fi

cat << EOF
{
  "success": ${SUCCESS},
  "confidence": ${CONFIDENCE},
  "deliverables": [],
  "metrics": {},
  "errors": ${ERRORS_JSON}
}
EOF
```

### Pattern 2: File Creation Tracking

**Before:**
```bash
create_file "src/auth.ts"
echo "Created: src/auth.ts"

create_file "tests/auth.test.ts"
echo "Created: tests/auth.test.ts"

echo "Files created: 2"
```

**After:**
```bash
DELIVERABLES=()

if create_file "src/auth.ts"; then
    DELIVERABLES+=("src/auth.ts")
fi

if create_file "tests/auth.test.ts"; then
    DELIVERABLES+=("tests/auth.test.ts")
fi

DELIVERABLES_JSON=$(printf '%s\n' "${DELIVERABLES[@]}" | jq -R . | jq -s .)

cat << EOF
{
  "success": true,
  "confidence": 0.92,
  "deliverables": ${DELIVERABLES_JSON},
  "metrics": {
    "files_created": ${#DELIVERABLES[@]}
  },
  "errors": []
}
EOF
```

### Pattern 3: Execution Time Tracking

**Before:**
```bash
START=$(date +%s%3N)

# Do work...

END=$(date +%s%3N)
ELAPSED=$((END - START))

echo "Execution time: ${ELAPSED}ms"
```

**After:**
```bash
START_TIME=$(date +%s%3N)

# Do work...

END_TIME=$(date +%s%3N)
EXECUTION_TIME=$((END_TIME - START_TIME))

cat << EOF
{
  "success": true,
  "confidence": 0.92,
  "deliverables": [],
  "metrics": {
    "execution_time_ms": ${EXECUTION_TIME}
  },
  "errors": []
}
EOF
```

### Pattern 4: Error Collection

**Before:**
```bash
if ! validate_file "config.json"; then
    echo "ERROR: config.json validation failed"
fi

if ! validate_file "package.json"; then
    echo "ERROR: package.json validation failed"
fi
```

**After:**
```bash
ERRORS=()
SUCCESS=true

if ! validate_file "config.json"; then
    SUCCESS=false
    ERRORS+=('{"code":"VALIDATION_FAILED","message":"config.json validation failed","context":{"file":"config.json"}}')
fi

if ! validate_file "package.json"; then
    SUCCESS=false
    ERRORS+=('{"code":"VALIDATION_FAILED","message":"package.json validation failed","context":{"file":"package.json"}}')
fi

ERRORS_JSON=$([ ${#ERRORS[@]} -eq 0 ] && echo '[]' || printf '%s\n' "${ERRORS[@]}" | jq -s .)

cat << EOF
{
  "success": ${SUCCESS},
  "confidence": $([ "$SUCCESS" = true ] && echo "0.95" || echo "0.5"),
  "deliverables": [],
  "metrics": {},
  "errors": ${ERRORS_JSON}
}
EOF
```

## Troubleshooting

### Issue: jq command not found

**Solution:**

```bash
# Install jq
# Ubuntu/Debian:
sudo apt-get install jq

# macOS:
brew install jq

# Or handle arrays without jq:
DELIVERABLES_JSON="["
for file in "${DELIVERABLES[@]}"; do
    DELIVERABLES_JSON="${DELIVERABLES_JSON}\"${file}\","
done
DELIVERABLES_JSON="${DELIVERABLES_JSON%,}]"  # Remove trailing comma
```

### Issue: Variable not expanding in JSON

**Cause:** Using single quotes in heredoc

**Solution:**

```bash
# Wrong (no variable expansion):
cat << 'EOF'
{
  "success": ${SUCCESS}
}
EOF

# Correct (variable expansion):
cat << EOF
{
  "success": ${SUCCESS}
}
EOF
```

### Issue: JSON syntax error

**Cause:** Missing quotes, trailing commas, or invalid escaping

**Solution:**

```bash
# Test JSON syntax before outputting
cat << EOF | jq .
{
  "success": ${SUCCESS},
  "confidence": ${CONFIDENCE}
}
EOF

# Common issues:
# - Trailing comma: "errors": []  ← no comma after last field
# - Missing quotes: "deliverables": [src/file.ts]  ← should be ["src/file.ts"]
# - Unescaped quotes: "message": "File "config.json" not found"  ← escape or use single quotes
```

### Issue: Parser falls back to legacy mode

**Cause:** JSON not on stdout or invalid JSON

**Solution:**

```bash
# Ensure JSON goes to stdout (not stderr)
echo "Processing..." >&2  # Log to stderr
cat << EOF                # JSON to stdout
{
  "success": true,
  ...
}
EOF

# Test that JSON is on stdout
./execute.sh 2>/dev/null | jq .
```

### Issue: Empty arrays causing errors

**Solution:**

```bash
# Handle empty arrays properly
if [ ${#DELIVERABLES[@]} -eq 0 ]; then
    DELIVERABLES_JSON="[]"
else
    DELIVERABLES_JSON=$(printf '%s\n' "${DELIVERABLES[@]}" | jq -R . | jq -s .)
fi

# Or use default value
DELIVERABLES_JSON="${DELIVERABLES_JSON:-[]}"
```

## Validation Checklist

After migration, verify:

- [ ] **Backup created** (execute.sh.backup exists)
- [ ] **JSON syntax valid** (`./execute.sh | jq .` succeeds)
- [ ] **All required fields present** (success, confidence, deliverables, metrics, errors)
- [ ] **Confidence in range** (0.0 <= confidence <= 1.0)
- [ ] **Field types correct** (success is boolean, confidence is number, etc.)
- [ ] **Parser uses JSON method** (not legacy fallback)
- [ ] **Deliverables tracked correctly** (all created/modified files listed)
- [ ] **Errors tracked correctly** (failures produce error objects)
- [ ] **Metrics calculated** (execution_time_ms, files_modified, etc.)
- [ ] **Integration tests pass** (skill works in CFN Loop context)
- [ ] **Documentation updated** (SKILL.md, package.json version)
- [ ] **Legacy patterns commented** (not deleted, for reference)

## Rollback Procedure

If migration causes issues:

```bash
# 1. Stop using migrated skill
# 2. Restore from backup
cp .claude/skills/my-skill/execute.sh.backup .claude/skills/my-skill/execute.sh

# 3. Verify restored version works
./.claude/skills/my-skill/execute.sh

# 4. Debug migration issues
# 5. Attempt migration again
```

## Best Practices

### DO:
- ✅ **Test JSON output** before deployment
- ✅ **Use dynamic values** (calculate confidence, track files)
- ✅ **Track execution metrics** (time, files modified)
- ✅ **Collect errors** properly with code and message
- ✅ **Update documentation** after migration
- ✅ **Keep backups** until confident in migration
- ✅ **Use jq** for JSON array building

### DON'T:
- ❌ **Delete legacy patterns immediately** (comment them out)
- ❌ **Use static JSON** (make it dynamic)
- ❌ **Mix stdout and JSON** (JSON only on stdout)
- ❌ **Forget error handling** (track failures in errors array)
- ❌ **Skip validation** (always test JSON syntax)
- ❌ **Ignore warnings** from migration tool

## Migration Progress Tracking

Track migration across all skills:

```bash
# Count total skills
TOTAL=$(find .claude/skills -name "execute.sh" | wc -l)

# Count migrated skills (have JSON output)
MIGRATED=$(grep -l "EOF_JSON" .claude/skills/*/execute.sh | wc -l)

# Count legacy skills
LEGACY=$((TOTAL - MIGRATED))

echo "Total skills: $TOTAL"
echo "Migrated: $MIGRATED ($(($MIGRATED * 100 / $TOTAL))%)"
echo "Legacy: $LEGACY ($(($LEGACY * 100 / $TOTAL))%)"

# List unmigrated skills
echo ""
echo "Unmigrated skills:"
find .claude/skills -name "execute.sh" -exec grep -L "EOF_JSON" {} \;
```

## Getting Help

### Resources
- **Specification:** `docs/SKILL_OUTPUT_FORMAT.md`
- **Schema:** `schemas/skill-output-v1.schema.json`
- **Parser:** `src/lib/skill-output-parser.ts`
- **Tests:** `tests/skill-output-parser.test.ts`
- **Template:** `.claude/skills/SKILL_TEMPLATE.md`

### Common Questions

**Q: Do I need to migrate all skills at once?**
A: No, migrate incrementally. Parser supports both JSON and legacy output.

**Q: What if my skill is complex?**
A: Migrate manually following this guide. Automated tool is for simple cases.

**Q: Can I keep legacy output for debugging?**
A: Yes, comment it out. Don't output both JSON and legacy simultaneously.

**Q: How do I handle skill-specific metrics?**
A: Add custom metrics to metrics object (all values must be numeric).

**Q: What confidence should I use?**
A: 0.90-1.00 for excellent, 0.75-0.89 for good, 0.60-0.74 for fair, <0.60 for poor.

---

**Version:** 1.0.0
**Author:** CFN Team
**Last Updated:** 2025-11-16
**Task:** 5.4 - Eliminate Bash Output Parsing
