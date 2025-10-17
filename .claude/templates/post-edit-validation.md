# Post-Edit Validation Hooks

## Mandatory Validation Pipeline

### Core Validators
1. **Agent Template Validator**
   - Verify SQLite lifecycle hooks
   - Check ACL level declarations
   - Validate error handling patterns
   - Ensure Redis coordination imports

2. **CFN Loop Memory Validator**
   - Validate memory key formats
   - Check ACL levels
   - Verify TTL configurations
   - Ensure encryption for sensitive data

3. **Test Coverage Validator**
   - Line coverage ≥80%
   - Branch coverage ≥75%
   - Function coverage ≥80%
   - Validate lifecycle tests
   - Validate signal ACK tests

4. **Blocking Coordination Validator**
   - Required imports validation
   - HMAC secret environment usage
   - Signal sending/receiving patterns
   - Semantic review for coordinators

## Validation Hook Usage

### Basic Invocation
```bash
npx claude-flow@alpha hooks post-edit [FILE_PATH] \
  --memory-key "agent-name/context" \
  --structured
```

### Validator Configuration
```yaml
validators:
  agent_template:
    enabled: true
    severity: error
    autofix: true

  cfn_loop_memory:
    enabled: true
    severity: warning
    autofix: false

  test_coverage:
    enabled: true
    severity: error
    thresholds:
      line: 80
      branch: 75
      function: 80

  blocking_coordination:
    enabled: true
    severity: critical
    autofix: false
```

## Performance Targets
- Individual validator: <2s execution
- Composite validation: <5s total
- False positive rate: <2%
- Automation: 85-95% depending on validator

## Output Format
```json
{
  "validator": "agent-template-validator",
  "file": "src/agents/coder.md",
  "valid": false,
  "violations": [
    {
      "type": "missing_sqlite_lifecycle",
      "severity": "error",
      "message": "Missing agent spawn registration",
      "recommendation": "Add SQLite lifecycle hooks"
    }
  ],
  "warnings": [
    {
      "type": "error_handling_basic",
      "message": "Basic error handling, consider retry logic"
    }
  ]
}
```

## Best Practices
- Run hooks after every file modification
- Address critical violations immediately
- Use automated fixes when possible
- Maintain a consistent validation approach
- Track validation metrics for continuous improvement