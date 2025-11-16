# Docker Coordinator Success Criteria Integration

**Phase 4: Test-Driven Gates - Docker Mode Integration**

## Overview

The Docker coordinator now supports test-driven gates with success criteria that can be loaded from environment variables or files. This enables automated validation of agent work using actual test execution rather than confidence scores.

## Features Implemented

### 1. Success Criteria Loading

The coordinator entrypoint (`docker/coordinator-entrypoint.sh`) now:
- Loads success criteria from `CFN_SUCCESS_CRITERIA` environment variable
- Supports both inline JSON and file path references
- Validates JSON format using `jq`
- Exports criteria to orchestrator environment
- Gracefully handles missing criteria with auto-generation fallback

### 2. Docker Compose Integration

The `docker/docker-compose.yml` now includes:
- `CFN_SUCCESS_CRITERIA` environment variable support
- Optional success criteria file volume mount
- Test-driven gate configuration variables:
  - `CFN_GATE_STRATEGY` (auto|test-driven|confidence)
  - `CFN_TEST_PASS_RATE_GATE` (default: 0.95)
  - `CFN_TEST_PASS_RATE_CONSENSUS` (default: 0.95)

### 3. Runtime Contract

The runtime contract (`docker/runtime/cfn-runtime.contract.yml`) defines:
- `CFN_GATE_STRATEGY`: Gate evaluation strategy
- `CFN_TEST_PASS_RATE_GATE`: Minimum test pass rate for Loop 3 gate
- `CFN_TEST_PASS_RATE_CONSENSUS`: Minimum test pass rate for Loop 2 consensus
- `CFN_SUCCESS_CRITERIA`: Path to success criteria JSON file

## Usage Examples

### Example 1: Inline JSON Success Criteria

```bash
docker-compose up -d

export CFN_SUCCESS_CRITERIA='{
  "test_suites": [{
    "name": "Unit Tests",
    "command": "npm test",
    "required": true,
    "pass_threshold": 0.95
  }],
  "deliverables": ["src/app.ts"]
}'

docker exec cfn-coordinator /docker/coordinator-entrypoint.sh
```

### Example 2: File-Based Success Criteria

Create a success criteria file:

```bash
cat > /tmp/success-criteria.json << 'EOF'
{
  "test_suites": [{
    "name": "Integration Tests",
    "command": "bash tests/integration.sh",
    "required": true,
    "pass_threshold": 1.0
  }],
  "deliverables": [
    "docker/coordinator-entrypoint.sh",
    "docker/docker-compose.yml"
  ]
}
EOF
```

Set environment variable and run:

```bash
export CFN_SUCCESS_CRITERIA=/tmp/success-criteria.json
docker-compose up -d
```

### Example 3: Using Docker Compose Environment File

Create `.env` file:

```env
CFN_TASK_ID=task-12345
CFN_TASK_DESCRIPTION="Implement authentication feature"
CFN_GATE_STRATEGY=test-driven
CFN_TEST_PASS_RATE_GATE=0.95
CFN_SUCCESS_CRITERIA=/etc/cfn/success-criteria.json
WORKSPACE_PATH=/path/to/workspace
```

Run with docker-compose:

```bash
docker-compose --env-file .env up -d
```

### Example 4: Auto-Generation Fallback

If no success criteria is provided, the coordinator will auto-generate:

```bash
# No CFN_SUCCESS_CRITERIA set
unset CFN_SUCCESS_CRITERIA

docker-compose up -d
# Coordinator logs: "⚠️  No success criteria provided - coordinator will auto-generate"
```

## Success Criteria Schema

```json
{
  "test_suites": [
    {
      "name": "Test Suite Name",
      "command": "bash tests/test-suite.sh",
      "required": true,
      "pass_threshold": 0.95
    }
  ],
  "deliverables": [
    "path/to/file1.ts",
    "path/to/file2.sh"
  ]
}
```

**Fields:**
- `test_suites`: Array of test suites to execute
  - `name`: Human-readable test suite name
  - `command`: Shell command to execute tests
  - `required`: Whether test suite must pass (boolean)
  - `pass_threshold`: Minimum pass rate (0.0-1.0)
- `deliverables`: Array of file paths that should be created/modified

## Gate Strategy Options

### Auto (Default)
```bash
CFN_GATE_STRATEGY=auto
```
- Uses test-driven if `CFN_SUCCESS_CRITERIA` is defined
- Falls back to confidence-based if no criteria

### Test-Driven (Recommended)
```bash
CFN_GATE_STRATEGY=test-driven
CFN_TEST_PASS_RATE_GATE=0.95
```
- Executes tests from success criteria
- Gate passes if test pass rate ≥ threshold
- Loop 2 validators verify test pass rate

### Confidence-Based (Legacy)
```bash
CFN_GATE_STRATEGY=confidence
```
- Uses agent confidence scores
- Gate passes if confidence ≥ threshold (default: 0.75)

## Testing

Run the test suite to validate functionality:

```bash
bash tests/docker/test-coordinator-criteria-loading.sh
```

**Expected Output:**
```
✓ Test 1: Load success criteria from inline JSON environment variable
✓ Test 2: Load success criteria from file path
✓ Test 3: Validate JSON format using jq
✓ Test 4: Export SUCCESS_CRITERIA to orchestrator environment
✓ Test 5: Handle missing criteria gracefully
✓ Test 6: Validate contract.yml has test-driven gate configuration
✓ Test 7: Validate docker-compose.yml has success criteria support
✓ Test 8: Full integration test: criteria loading and validation

========================================
Test Results Summary
========================================
Tests Run:    8
Tests Passed: 9
Tests Failed: 0

✓ ALL TESTS PASSED

Pass Rate: 1.00
```

## Implementation Details

### Entrypoint Logic Flow

```bash
# 1. Check if CFN_SUCCESS_CRITERIA is set
if [[ -n "${CFN_SUCCESS_CRITERIA:-}" ]]; then
    # 2. Determine if it's a file path or inline JSON
    if [[ -f "$CFN_SUCCESS_CRITERIA" ]]; then
        # Load from file
        SUCCESS_CRITERIA=$(cat "$CFN_SUCCESS_CRITERIA")
    else
        # Use inline JSON
        SUCCESS_CRITERIA="$CFN_SUCCESS_CRITERIA"
    fi

    # 3. Validate JSON format
    if ! echo "$SUCCESS_CRITERIA" | jq empty 2>/dev/null; then
        echo "❌ Invalid success criteria JSON format"
        exit 1
    fi
else
    # 4. Fallback to auto-generation
    SUCCESS_CRITERIA=""
fi

# 5. Export for orchestrator
export SUCCESS_CRITERIA
```

### Error Handling

**Invalid JSON:**
```bash
CFN_SUCCESS_CRITERIA='{"invalid": json'
# Output: ❌ Invalid success criteria JSON format
# Exit: 1
```

**File Not Found:**
```bash
CFN_SUCCESS_CRITERIA=/nonexistent/file.json
# Treated as inline JSON, fails validation
# Exit: 1
```

**Missing Criteria:**
```bash
unset CFN_SUCCESS_CRITERIA
# Output: ⚠️  No success criteria provided - coordinator will auto-generate
# Exit: 0 (continues with auto-generation)
```

## Integration with Orchestrator

The orchestrator (`orchestrate.sh`) receives success criteria via the `SUCCESS_CRITERIA` environment variable:

```bash
# Coordinator entrypoint exports
export SUCCESS_CRITERIA

# Orchestrator receives and uses
if [[ -n "$SUCCESS_CRITERIA" ]]; then
    # Parse test suites
    TEST_SUITES=$(echo "$SUCCESS_CRITERIA" | jq -r '.test_suites[]')

    # Execute tests
    for suite in $TEST_SUITES; do
        COMMAND=$(echo "$suite" | jq -r '.command')
        bash -c "$COMMAND"
    done
fi
```

## Migration from Confidence-Based Gates

**Before (Confidence-Based):**
```yaml
environment:
  - GATE_THRESHOLD=0.75
  - CONSENSUS_THRESHOLD=0.90
```

**After (Test-Driven):**
```yaml
environment:
  - CFN_GATE_STRATEGY=test-driven
  - CFN_TEST_PASS_RATE_GATE=0.95
  - CFN_TEST_PASS_RATE_CONSENSUS=0.95
  - CFN_SUCCESS_CRITERIA=/etc/cfn/success-criteria.json
volumes:
  - ./success-criteria.json:/etc/cfn/success-criteria.json:ro
```

## Best Practices

1. **Use File-Based Criteria for Production**
   - Easier version control
   - Cleaner docker-compose.yml
   - Supports complex criteria

2. **Validate JSON Before Deployment**
   ```bash
   jq empty < success-criteria.json
   echo $?  # Should be 0
   ```

3. **Set Realistic Pass Rate Thresholds**
   - MVP mode: 0.80 (80%)
   - Standard mode: 0.95 (95%)
   - Enterprise mode: 0.99 (99%)

4. **Use Auto Strategy for Development**
   ```bash
   CFN_GATE_STRATEGY=auto  # Adapts based on criteria availability
   ```

5. **Include Test Suite Names**
   - Helps with debugging
   - Improves logging clarity
   - Better error messages

## Troubleshooting

### Issue: "Invalid success criteria JSON format"

**Cause:** Malformed JSON in `CFN_SUCCESS_CRITERIA`

**Solution:**
```bash
# Validate JSON
echo "$CFN_SUCCESS_CRITERIA" | jq empty

# Fix formatting
CFN_SUCCESS_CRITERIA=$(echo "$CFN_SUCCESS_CRITERIA" | jq -c .)
```

### Issue: Criteria not loaded from file

**Cause:** File path not mounted or incorrect path

**Solution:**
```bash
# Check file exists in container
docker exec cfn-coordinator ls -l /etc/cfn/success-criteria.json

# Verify volume mount in docker-compose.yml
volumes:
  - ./success-criteria.json:/etc/cfn/success-criteria.json:ro
```

### Issue: Tests not executing

**Cause:** `CFN_GATE_STRATEGY` not set to `test-driven`

**Solution:**
```bash
# Set explicitly
CFN_GATE_STRATEGY=test-driven

# Or use auto (if criteria is provided)
CFN_GATE_STRATEGY=auto
```

## Version History

- **2025-11-16**: Initial implementation (Phase 4)
  - Success criteria loading from env/file
  - JSON validation
  - Docker Compose integration
  - Test suite with 100% pass rate

## See Also

- **Runtime Contract**: `docker/runtime/cfn-runtime.contract.yml`
- **Test Suite**: `tests/docker/test-coordinator-criteria-loading.sh`
- **Coordinator Entrypoint**: `docker/coordinator-entrypoint.sh`
- **Docker Compose**: `docker/docker-compose.yml`
- **Phase 2 TDD Guide**: `docs/guides/PHASE_2_TDD_PROTOCOL.md`
