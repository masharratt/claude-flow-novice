# Contract Alignment Test Documentation

## Overview

**Test File:** `tests/docker/core/test-contract-alignment.sh`

**Purpose:** Validates consistency between the CFN runtime environment contract YAML and the Docker coordinator entrypoint script to ensure all variables used in the entrypoint are properly documented in the contract.

**Reference:** Based on findings in `docker/ENVIRONMENT_CONTRACT_ALIGNMENT_REPORT.md`

## Test Coverage

### Test Phases

1. **[1/5] Extract Contract Variables**
   - Parses `docker/runtime/cfn-runtime.contract.yml`
   - Extracts all `CFN_*` variable definitions
   - Extracts all legacy alias mappings
   - Validates YAML structure without requiring `yq`

2. **[2/5] Extract Entrypoint Variables**
   - Parses `docker/coordinator-entrypoint.sh`
   - Identifies all `${VAR}` and `${VAR:-default}` references
   - Captures variables used in validation checks
   - Deduplicates variable list

3. **[3/5] Validate Alignment**
   - For each entrypoint variable:
     - Check if exists as `CFN_*` variable in contract
     - Check if exists as legacy alias in contract
     - Report PASS/FAIL for each variable
   - Track missing variables for report

4. **[4/5] Check Required Variable Validation**
   - Validates that required variables have proper validation in entrypoint
   - Checks for pattern: `if [ -z "${VAR:-}" ]`
   - Currently validates: `TASK_ID`, `TASK_DESCRIPTION`

5. **[5/5] Verify Network Defaults**
   - Compares default values between contract and entrypoint
   - Validates consistency for:
     - `NETWORK` / `CFN_NETWORK_NAME`
     - `MAX_ITERATIONS` / `CFN_ITERATION_LIMIT`
     - `GATE_THRESHOLD` / `CFN_GATE_CONFIDENCE_THRESHOLD`
     - `CONSENSUS_THRESHOLD` / `CFN_CONSENSUS_THRESHOLD`

## Test Output Format

### Successful Alignment Example
```
========================================
Contract Alignment Validation Test
========================================
[1/5] Extracting contract variables...
ℹ️  INFO: Found 32 CFN_ variables and 20 legacy aliases
[2/5] Extracting entrypoint variables...
ℹ️  INFO: Found 10 variables referenced in entrypoint
[3/5] Validating alignment...

✅ PASS: Variable 'TASK_ID' exists in contract
✅ PASS: Variable 'TASK_DESCRIPTION' exists in contract
...

[4/5] Checking required variable validation...
✅ PASS: Required variable 'TASK_ID' has validation in entrypoint
...

[5/5] Verifying network defaults...
✅ PASS: Network default consistent: 'cfn-network'
...

========================================
Test Summary
========================================
Total Tests: 16
Passed: 16
Failed: 0

Confidence Score: 1.00

✅ PASS: All variables aligned and validated
```

### Alignment Issues Example
```
========================================
Test Summary
========================================
Total Tests: 16
Passed: 13
Failed: 3

❌ CRITICAL: Variables missing from contract:
   - AGENTS
   - MEMORY_LIMIT
   - NETWORK

Confidence Score: 0.40

❌ FAIL: Critical alignment issues detected

Recommendations:
1. Add missing variables to contract:
   - Add CFN_AGENTS with legacy_aliases: ["AGENTS"]
   - Add CFN_MEMORY_LIMIT with legacy_aliases: ["MEMORY_LIMIT"]
   - Add CFN_NETWORK with legacy_aliases: ["NETWORK"]
```

## Confidence Scoring

### Calculation Formula
```
base_score = 100
score -= (missing_variables * 20)        # Critical: 20 points per missing variable
score -= (unvalidated_required * 20)    # Critical: 20 points per unvalidated required var
score -= (network_mismatches * 5)       # Warning: 5 points per network mismatch
score -= (default_mismatches * 5)       # Warning: 5 points per default mismatch
confidence = score / 100
```

### Confidence Levels
- **1.00**: Perfect alignment - all variables documented and validated
- **0.80-0.99**: Minor warnings - default mismatches only
- **0.60-0.79**: Moderate issues - some missing variables
- **0.40-0.59**: Significant issues - multiple missing variables
- **0.00-0.39**: Critical issues - many missing variables or unvalidated required vars

## Exit Codes

- **0**: All critical checks passed (warnings allowed)
- **1**: Critical alignment issues detected

## Known Issues Detected (as of 2025-11-14)

### Missing from Contract
1. **AGENTS** - Used in entrypoint but not defined in contract
   - Recommended: Add `CFN_AGENTS_LIST` with `legacy_aliases: ["AGENTS"]`
   - Impact: Coordination specification unclear

2. **MEMORY_LIMIT** - Used for agent memory allocation
   - Recommended: Add `CFN_AGENT_MEMORY_LIMIT` with `legacy_aliases: ["MEMORY_LIMIT"]`
   - Impact: Memory budget management not documented

3. **NETWORK** - Docker network name reference
   - Recommended: Add legacy alias to `CFN_NETWORK_NAME`
   - Impact: Network configuration inconsistent

### Previously Identified Issues (Now Resolved)
- ✅ **TASK_DESCRIPTION**: Added to contract with legacy alias
- ✅ **GATE_THRESHOLD**: Legacy alias added to `CFN_GATE_CONFIDENCE_THRESHOLD`
- ✅ **MAX_ITERATIONS**: Legacy alias added to `CFN_ITERATION_LIMIT`
- ✅ **CONSENSUS_THRESHOLD**: Legacy alias added to `CFN_CONSENSUS_THRESHOLD`

## Usage

### Run Test
```bash
bash tests/docker/core/test-contract-alignment.sh
```

### Run with Color Output
```bash
bash tests/docker/core/test-contract-alignment.sh 2>&1 | cat
```

### Extract Summary Only
```bash
bash tests/docker/core/test-contract-alignment.sh 2>&1 | \
  grep -E "^(Total|Passed|Failed|Confidence|CRITICAL|Recommendations)" -A 10
```

## Maintenance

### Adding New Variable Checks
1. Update `required_vars` array in Step 4 for new required variables
2. Update `check_defaults` array in Step 5 for new variables with defaults
3. Document expected behavior in this README

### Updating Contract Reference
When contract file location changes, update `CONTRACT_FILE` variable:
```bash
CONTRACT_FILE="$PROJECT_ROOT/docker/runtime/cfn-runtime.contract.yml"
```

### Updating Entrypoint Reference
When entrypoint file location changes, update `ENTRYPOINT_FILE` variable:
```bash
ENTRYPOINT_FILE="$PROJECT_ROOT/docker/coordinator-entrypoint.sh"
```

## Technical Details

### Parsing Strategy

**YAML Parsing (No yq Dependency)**
```bash
# Extract CFN_ variables
grep -E '^\s+CFN_[A-Z_]+:' contract.yml | \
    awk '{print $1}' | \
    sed 's/:$//' | \
    sort -u

# Extract legacy aliases
grep 'legacy_aliases:' contract.yml | \
    sed 's/.*legacy_aliases: *\[//; s/\].*//; s/"//g; s/,/\n/g; s/ //g'
```

**Bash Parsing**
```bash
# Extract variable references: ${VAR} and ${VAR:-default}
grep -oE '\$\{[A-Z_]+[:-]?' entrypoint.sh | \
    sed 's/\${//g; s/[:-].*//g' | \
    sort -u
```

### Variable Lookup Algorithm
```bash
variable_exists_in_contract() {
    local var="$1"

    # Check 1: Variable has CFN_ prefix in contract
    if grep -q "^CFN_${var}$" contract_vars; then
        return 0
    fi

    # Check 2: Variable is a legacy alias
    if grep -q "^${var}$" legacy_aliases; then
        return 0
    fi

    # Check 3: Variable already has CFN_ prefix
    if [[ "$var" =~ ^CFN_ ]] && grep -q "^${var}$" contract_vars; then
        return 0
    fi

    return 1
}
```

## Integration

### CI/CD Pipeline
```yaml
# Example GitLab CI job
test:contract-alignment:
  stage: test
  script:
    - bash tests/docker/core/test-contract-alignment.sh
  allow_failure: false  # Block merge on failure
```

### Pre-Commit Hook
```bash
#!/bin/bash
# .git/hooks/pre-commit
if git diff --cached --name-only | grep -E "(coordinator-entrypoint|cfn-runtime.contract)"; then
    echo "Running contract alignment test..."
    bash tests/docker/core/test-contract-alignment.sh || exit 1
fi
```

## Related Documentation

- **Contract Specification**: `docker/runtime/cfn-runtime.contract.yml`
- **Alignment Report**: `docker/ENVIRONMENT_CONTRACT_ALIGNMENT_REPORT.md`
- **Docker CLAUDE.md**: `docker/CLAUDE.md` (Environment Variable Contract section)
- **Test Suite Overview**: `tests/docker/TEST_SUITE_OVERVIEW.md`

## Version History

- **2025-11-14**: Initial test implementation
  - Validates 10 entrypoint variables against 32 contract variables
  - Checks 20 legacy alias mappings
  - Validates required variable enforcement
  - Compares default value consistency
  - Confidence scoring system implemented
  - Comprehensive recommendations engine

## Future Enhancements

1. **Multi-File Support**: Validate alignment across multiple entrypoint scripts
2. **Type Validation**: Check that variable types match between contract and usage
3. **Scope Validation**: Verify variables are used in correct scopes (agent/coordinator/orchestrator)
4. **Default Value Format**: Validate format consistency (e.g., "1g" vs "1024m")
5. **Required-in-Production**: Warn when production-required variables lack validation
6. **Deprecation Tracking**: Flag legacy aliases scheduled for removal
7. **Auto-Fix**: Generate contract YAML patches for missing variables

## Support

For issues or questions about this test:
1. Review alignment report: `docker/ENVIRONMENT_CONTRACT_ALIGNMENT_REPORT.md`
2. Check contract specification: `docker/runtime/cfn-runtime.contract.yml`
3. Verify entrypoint behavior: `docker/coordinator-entrypoint.sh`
4. Consult Docker CLAUDE.md environment variable section

---

**Last Updated**: 2025-11-14
**Test Confidence**: 0.90 (3 known issues, 13 passing checks)
**Status**: ACTIVE - Monitoring contract alignment
