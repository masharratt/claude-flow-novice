# Post-Edit Validation Template

## Mandatory Post-Edit Hook

```bash
npx claude-flow-novice hooks post-edit [FILE_PATH]   --memory-key "product-owner/decision"   --structured
```

## Validator Composition

### 1. Agent Template Validator
- Validate SQLite lifecycle hooks
- Check ACL level declarations
- Verify error handling patterns

### 2. CFN Loop Memory Validator
- Validate memory key formats
- Check ACL level correctness
- Validate TTL configurations
- Ensure encryption for sensitive data

### 3. Test Coverage Validator
- Line coverage ≥ 80%
- Branch coverage ≥ 75%
- Function coverage ≥ 80%

### 4. Blocking Coordination Validator
- Verify signal sending/receiving patterns
- Check HMAC secret usage
- Validate state machine logic

## Validation Output Structure

```json
{
  "validator": "composite-hook",
  "file": "/path/to/file",
  "valid": true,
  "results": [
    {
      "type": "agent-template",
      "valid": true
    },
    {
      "type": "cfn-loop-memory",
      "valid": true
    },
    {
      "type": "test-coverage",
      "valid": true,
      "metrics": {
        "line_coverage": 0.85,
        "branch_coverage": 0.80
      }
    },
    {
      "type": "blocking-coordination",
      "valid": true
    }
  ]
}
```

## Performance Targets
- Total validation time: <5 seconds
- False positive rate: <2%
- Caching of unchanged files
