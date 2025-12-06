# Security Remediation Guide: PHASE-3 Sprint 3.1 Math Skills

**Document Version:** 1.0
**Status:** BLOCKING - Critical vulnerabilities require immediate remediation
**Estimated Remediation Time:** 8-16 hours
**Target Confidence:** 0.85 (Standard mode)

---

## Quick Reference - Critical Fixes

### Fix #1: Temporary File Security (CVE-1.1)

**File:** `equation-solver/solve.sh` (Line 124)

**Current (VULNERABLE):**
```bash
TEMP_SCRIPT="/tmp/equation-solver-$$.js"
cat > "${TEMP_SCRIPT}" <<'NODEJS'
...
NODEJS
```

**Fixed:**
```bash
# Create secure temporary file with mktemp
TEMP_SCRIPT=$(mktemp /tmp/equation-solver-XXXXXX.js)
if [[ $? -ne 0 ]]; then
    error "Failed to create temporary file"
fi

# Set restrictive permissions
chmod 600 "$TEMP_SCRIPT"

# Write content
cat > "${TEMP_SCRIPT}" <<'NODEJS'
...
NODEJS

# Ensure cleanup
cleanup_temp() {
    if [[ -f "${TEMP_SCRIPT}" ]]; then
        rm -f "${TEMP_SCRIPT}"
    fi
}
trap cleanup_temp EXIT INT TERM
```

**Why:** mktemp generates cryptographically random filenames, preventing predictable race conditions. chmod 600 prevents other users from reading/executing the script.

---

### Fix #2: Input Validation for All Skills

**File:** All three skills require this pattern

**Create a shared validation module:**
```bash
# File: .claude/skills/shared/math-input-validation.sh

#!/bin/bash
# Shared input validation functions for math skills

# Validate mathematical expression
validate_math_expression() {
    local expr="$1"
    local max_length="${2:-10000}"

    # Check if empty
    if [[ -z "$expr" ]]; then
        return 1
    fi

    # Check length
    if [[ ${#expr} -gt $max_length ]]; then
        return 1
    fi

    # Whitelist approach: only allow specific characters
    # Allows: a-z, A-Z, 0-9, and math operators
    if [[ ! "$expr" =~ ^[a-zA-Z0-9+\-*/%()^.,\s]+$ ]]; then
        return 1
    fi

    # Check nesting depth (prevent exponential complexity)
    local max_nesting=50
    local nesting=$(echo "$expr" | tr -cd '(' | wc -c)
    if [[ $nesting -gt $max_nesting ]]; then
        return 1
    fi

    return 0
}

# Validate LaTeX string
validate_latex_string() {
    local latex="$1"
    local max_length="${2:-50000}"

    if [[ -z "$latex" ]]; then
        return 1
    fi

    if [[ ${#latex} -gt $max_length ]]; then
        return 1
    fi

    # Block dangerous LaTeX commands
    if [[ "$latex" =~ \\(write|openout|immediate|special|def|let|message) ]]; then
        return 1
    fi

    return 0
}

# Validate bounds for definite integrals
validate_bounds() {
    local bounds="$1"

    # Must be two comma-separated numbers
    if [[ ! "$bounds" =~ ^-?[0-9]+\.?[0-9]*,-?[0-9]+\.?[0-9]*$ ]]; then
        return 1
    fi

    return 0
}

# Validate variable name
validate_variable() {
    local var="$1"

    # Must be single letter or word
    if [[ ! "$var" =~ ^[a-zA-Z][a-zA-Z0-9]*$ ]]; then
        return 1
    fi

    # Max 20 characters
    if [[ ${#var} -gt 20 ]]; then
        return 1
    fi

    return 0
}
```

**Usage in equation-solver/solve.sh:**
```bash
# Source validation functions
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../shared" && pwd)/math-input-validation.sh"

# In argument parsing section:
if ! validate_math_expression "$EQUATION"; then
    error "Invalid equation format or length"
fi
```

---

### Fix #3: Replace sed-based Processing (CVE-3.1, CVE-3.4)

**File:** `latex-formatter/format.sh` (Lines 41-77)

**Current (VULNERABLE):**
```bash
to_latex() {
    local input="$1"
    local output=""
    output="$input"

    # Fractions: a/b -> \frac{a}{b}
    output=$(echo "$output" | sed -E 's/([0-9a-zA-Z]+)\/([0-9a-zA-Z]+)/\\frac{\1}{\2}/g')

    # Exponents: x^2 -> x^{2}
    output=$(echo "$output" | sed -E 's/\^([0-9a-zA-Z]+)/^{\1}/g')
    # ... more sed calls ...
}
```

**Fixed (using awk):**
```bash
to_latex() {
    local input="$1"

    # Use awk for safe pattern matching without shell metacharacter risks
    output=$(awk 'BEGIN {
        input = ARGV[1]

        # Fractions: a/b -> \frac{a}{b}
        gsub(/([a-zA-Z0-9]+)\/([a-zA-Z0-9]+)/, "\\\\frac{\\1}{\\2}", input)

        # Exponents: x^2 -> x^{2}
        gsub(/\^([a-zA-Z0-9]+)/, "^{\\1}", input)

        # Subscripts: x_1 -> x_{1}
        gsub(/_([a-zA-Z0-9]+)/, "_{\\1}", input)

        # Greek letters
        gsub(/alpha/, "\\\\alpha", input)
        gsub(/beta/, "\\\\beta", input)
        gsub(/gamma/, "\\\\gamma", input)
        gsub(/delta/, "\\\\delta", input)
        gsub(/theta/, "\\\\theta", input)
        gsub(/lambda/, "\\\\lambda", input)
        gsub(/mu/, "\\\\mu", input)
        gsub(/pi/, "\\\\pi", input)
        gsub(/sigma/, "\\\\sigma", input)
        gsub(/omega/, "\\\\omega", input)

        # Special functions
        gsub(/sqrt\(([^)]+)\)/, "\\\\sqrt{\\1}", input)
        gsub(/sin/, "\\\\sin", input)
        gsub(/cos/, "\\\\cos", input)
        gsub(/tan/, "\\\\tan", input)
        gsub(/log/, "\\\\log", input)
        gsub(/ln/, "\\\\ln", input)
        gsub(/int/, "\\\\int", input)
        gsub(/sum/, "\\\\sum", input)
        gsub(/lim/, "\\\\lim", input)

        # Wrap in inline math delimiters
        print "\\(" input "\\)"
    }' "$input")

    echo "$output"
}
```

**Why:** awk handles variable substitution safely without interpreting sed metacharacters. Each pattern uses awk's built-in gsub() function, not shell sed.

---

### Fix #4: Protect Nerdamer Template Injection (CVE-2.4, CVE-1.3)

**File:** `symbolic-computation/compute-engine.cjs` (Lines 56-100)

**Current (VULNERABLE):**
```javascript
computed = nerdamer(`diff(${expression}, ${variable})`);
```

**Fixed:**
```javascript
// Validate inputs against strict whitelist
const validExprRegex = /^[a-zA-Z0-9+\-*/%()^.,\s]+$/;

function validateInput(input, fieldName) {
    if (!input || typeof input !== 'string') {
        throw new Error(`Invalid ${fieldName}: must be non-empty string`);
    }

    if (input.length > 10000) {
        throw new Error(`${fieldName} exceeds maximum length (10000)`);
    }

    if (!validExprRegex.test(input)) {
        throw new Error(`${fieldName} contains invalid characters`);
    }

    return true;
}

// Usage in switch statement
switch (operation) {
    case 'differentiate':
        validateInput(expression, 'expression');
        validateInput(variable, 'variable');

        // Use the validated strings - they are now safe
        computed = nerdamer(`diff(${expression}, ${variable})`);
        result.result = computed.toString();
        result.latex = computed.toTeX();
        break;

    case 'integrate':
        validateInput(expression, 'expression');
        validateInput(variable, 'variable');

        if (bounds) {
            // Validate and parse bounds
            const boundsMatch = bounds.match(/^(-?\d+\.?\d*),(-?\d+\.?\d*)$/);
            if (!boundsMatch) {
                throw new Error('Bounds must be numeric values separated by comma');
            }

            const lower = parseFloat(boundsMatch[1]);
            const upper = parseFloat(boundsMatch[2]);

            // Now use numeric values, not string interpolation
            computed = nerdamer.defint(expression, variable, lower, upper);
        } else {
            computed = nerdamer(`integrate(${expression}, ${variable})`);
        }
        result.result = computed.toString();
        result.latex = computed.toTeX();
        break;

    // ... other cases follow same pattern ...
}
```

**Why:** Validation ensures only safe characters exist, preventing template injection. Numeric bounds use function parameters instead of template string concatenation.

---

### Fix #5: Refactor Input Validation in compute.sh

**File:** `symbolic-computation/compute.sh` (Lines 110-114)

**Current (VULNERABLE):**
```bash
if [[ "$expression" =~ [\;\&\|\`\$] ]]; then
    log_error "Expression contains invalid characters"
    return 1
fi
```

**Fixed:**
```bash
# Use whitelist instead of blacklist
validate_expression() {
    local expression="$1"

    # Only allow letters, numbers, and specific math operators
    if [[ ! "$expression" =~ ^[a-zA-Z0-9+\-*/%()^.,\s]+$ ]]; then
        log_error "Expression contains invalid characters"
        return 1
    fi

    # Check length
    if [[ ${#expression} -gt 10000 ]]; then
        log_error "Expression exceeds maximum length"
        return 1
    fi

    # Check nesting depth
    local paren_count=$(echo "$expression" | tr -cd '(' | wc -c)
    if [[ $paren_count -gt 50 ]]; then
        log_error "Expression nesting exceeds maximum depth"
        return 1
    fi

    return 0
}

# Usage (call early in main):
if ! validate_expression "$expression"; then
    log_error "Validation failed"
    return 1
fi
```

---

### Fix #6: Quote All Variables in Commands

**File:** `equation-solver/solve.sh` (Lines 146-148 and similar)

**Current (VULNERABLE):**
```bash
NODE_PATH="${PROJECT_ROOT}/node_modules" node "${TEMP_SCRIPT}" "${EQUATION}" "${SHOW_STEPS}"
```

**Already Correct in Reviewed Code** - The slashes are properly quoted. However, verify ALL variable expansions:

```bash
# WRONG:
cd $PROJECT_ROOT  # Can split on spaces

# CORRECT:
cd "$PROJECT_ROOT"  # Quoted, safe

# Check all instances with grep:
grep -n 'cd [^"]' equation-solver/solve.sh  # Should return nothing
```

---

### Fix #7: LaTeX Input Validation (CVE-3.3)

**File:** `latex-formatter/format.sh` (Prepend to main())

**Add Before Processing:**
```bash
main() {
    local mode=""
    local format="html"
    local input=""

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --to-latex)
                mode="to-latex"
                shift
                ;;
            --from-latex)
                mode="from-latex"
                shift
                ;;
            --validate)
                mode="validate"
                shift
                ;;
            --format)
                format="$2"
                shift 2
                ;;
            -h|--help)
                usage
                ;;
            *)
                input="$1"
                shift
                ;;
        esac
    done

    # Validate input BEFORE processing
    if [[ -z "$mode" ]]; then
        echo "ERROR: Mode not specified. Use --to-latex, --from-latex, or --validate" >&2
        exit 1
    fi

    if [[ -z "$input" ]]; then
        echo "ERROR: Input required" >&2
        exit 1
    fi

    # NEW: Add validation
    if ! validate_latex_input "$input"; then
        echo "ERROR: LaTeX input validation failed" >&2
        exit 1
    fi

    # Execute mode
    case "$mode" in
        # ... existing code ...
    esac
}

# Add validation function
validate_latex_input() {
    local input="$1"
    local max_length=50000

    # Check length
    if [[ ${#input} -gt $max_length ]]; then
        return 1
    fi

    # Block dangerous LaTeX commands
    if [[ "$input" =~ \\(write|openout|immediate|special|def|let) ]]; then
        return 1
    fi

    # Check for unbalanced delimiters (basic check)
    local open_braces=$(echo "$input" | tr -cd '{' | wc -c)
    local close_braces=$(echo "$input" | tr -cd '}' | wc -c)
    if [[ $open_braces -ne $close_braces ]]; then
        return 1
    fi

    return 0
}
```

---

### Fix #8: Sanitize Error Messages (CVE-1.5, CVE-3.6)

**File:** All three skills

**Pattern:**
```bash
# WRONG: Exposing raw errors
RESULT=$(command 2>&1)
echo "$RESULT"  # Raw error, might leak info

# CORRECT: Sanitized errors
RESULT=$(command 2>&1)
if [[ $? -ne 0 ]]; then
    # Log detailed error server-side
    log_error "Command failed: $RESULT"

    # Return generic message to client
    echo "ERROR: Operation failed. Please check input format." >&2
    exit 1
fi
```

**Apply to:**
- `solve.sh` lines 162-180
- `compute.sh` lines 143-157
- `format.sh` lines 76-87, 91-99

---

### Fix #9: Remove Sensitive Input from Logs (CVE-2.7)

**File:** `symbolic-computation/compute.sh`

**Current:**
```bash
log_info "Expression: ${expression}"
log_info "Variable: ${variable}"
```

**Fixed:**
```bash
# Don't log user input at all, or log hashed version
log_info "Symbolic operation: ${operation}"
# REMOVE: log_info "Expression: ${expression}"
# REMOVE: log_info "Variable: ${variable}"
```

---

## Complete Fixed Files

### equation-solver/solve.sh (Key sections)

```bash
#!/bin/bash
set -euo pipefail

# [HEADER UNCHANGED]

# Source validation functions
VALIDATION_SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../shared" && pwd)/math-input-validation.sh"
if [[ -f "$VALIDATION_SCRIPT" ]]; then
    source "$VALIDATION_SCRIPT"
else
    echo "ERROR: Validation library not found" >&2
    exit 1
fi

# ... [usage and arg parsing unchanged] ...

# Validate input BEFORE processing
if [[ -z "${EQUATION}" ]]; then
    error "Equation is required. Use -h for help."
fi

if ! validate_math_expression "${EQUATION}"; then
    error "Invalid equation format, excessive length, or complexity"
fi

log "Solving equation: ${EQUATION}"
log "Output format: ${OUTPUT_FORMAT}"

# Create temporary Node.js solver script (FIXED)
TEMP_SCRIPT=$(mktemp /tmp/equation-solver-XXXXXX.js)
if [[ $? -ne 0 ]]; then
    error "Failed to create temporary file"
fi

# Set restrictive permissions
chmod 600 "$TEMP_SCRIPT"

# Cleanup function for temp script (IMPROVED)
cleanup_temp() {
    if [[ -f "${TEMP_SCRIPT}" ]]; then
        rm -f "${TEMP_SCRIPT}" 2>/dev/null || true
    fi
}
trap cleanup_temp EXIT INT TERM

# Create Node.js script with input validation (FIXED)
cat > "${TEMP_SCRIPT}" <<'NODEJS'
const nerdamer = require('nerdamer');
require('nerdamer/Solve');
require('nerdamer/Algebra');
require('nerdamer/Calculus');

const equation = process.argv[2];
const showSteps = process.argv[3] === 'true';

// Input validation (FIXED - prevents template injection)
const validExprRegex = /^[a-zA-Z0-9+\-*/%()=^.,\s]+$/;
if (!validExprRegex.test(equation)) {
    console.log(JSON.stringify({
        equation: equation,
        solutions: [],
        steps: [],
        type: "unknown",
        status: "error",
        message: "Invalid equation format"
    }, null, 2));
    process.exit(1);
}

// Rest of existing logic...
NODEJS

# Execute Node.js solver (FIXED - proper quoting)
RESULT=$(cd "${PROJECT_ROOT}" && NODE_PATH="${PROJECT_ROOT}/node_modules" \
    node "${TEMP_SCRIPT}" "${EQUATION}" "${SHOW_STEPS}" 2>&1) || {
    ERROR_CODE=$?
    log "Solver execution failed with code ${ERROR_CODE}"

    # Return generic error message (FIXED - no info disclosure)
    jq -n \
        --arg equation "${EQUATION}" \
        '{
            equation: $equation,
            solutions: [],
            steps: [],
            type: "unknown",
            status: "error",
            message: "Equation solving failed. Please verify equation format."
        }'
    exit "${ERROR_CODE}"
}

# ... rest of script ...
```

---

## Testing the Fixes

### Test Script for Injection Vulnerabilities

```bash
#!/bin/bash
# File: tests/test-security-fixes.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Test counters
TESTS_RUN=0
TESTS_PASSED=0

test_case() {
    local name="$1"
    local command="$2"
    local should_fail="${3:-false}"

    TESTS_RUN=$((TESTS_RUN + 1))
    echo -n "Testing: $name ... "

    if eval "$command" 2>/dev/null; then
        if [[ "$should_fail" == "true" ]]; then
            echo "FAIL (should have rejected)"
            return 1
        else
            echo "PASS"
            TESTS_PASSED=$((TESTS_PASSED + 1))
            return 0
        fi
    else
        if [[ "$should_fail" == "true" ]]; then
            echo "PASS (correctly rejected)"
            TESTS_PASSED=$((TESTS_PASSED + 1))
            return 0
        else
            echo "FAIL"
            return 1
        fi
    fi
}

# Equation Solver Tests
echo "=== Equation Solver Security Tests ==="

test_case "Basic equation" \
    "${PROJECT_ROOT}/.claude/skills/equation-solver/solve.sh '2*x + 3 = 7'" \
    false

test_case "Shell injection attempt" \
    "${PROJECT_ROOT}/.claude/skills/equation-solver/solve.sh '\"; rm -rf /tmp; \"'" \
    true

test_case "Deeply nested expression (DoS)" \
    "EXPR='x'; for i in {1..200}; do EXPR=\"sin(\$EXPR)\"; done; \
     timeout 5 ${PROJECT_ROOT}/.claude/skills/equation-solver/solve.sh \"\$EXPR\"" \
    true

test_case "Excessive length expression" \
    "${PROJECT_ROOT}/.claude/skills/equation-solver/solve.sh \"\$(printf 'x%.0s' {1..15000})\"" \
    true

# Symbolic Computation Tests
echo -e "\n=== Symbolic Computation Security Tests ==="

test_case "Valid differentiation" \
    "${PROJECT_ROOT}/.claude/skills/symbolic-computation/compute.sh differentiate 'x^2' x" \
    false

test_case "Command injection via expression" \
    "${PROJECT_ROOT}/.claude/skills/symbolic-computation/compute.sh differentiate 'x|cat' x" \
    true

test_case "Template injection via bounds" \
    "${PROJECT_ROOT}/.claude/skills/symbolic-computation/compute.sh integrate 'x' x '0,eval(1)'" \
    true

# LaTeX Formatter Tests
echo -e "\n=== LaTeX Formatter Security Tests ==="

test_case "Valid LaTeX conversion" \
    "${PROJECT_ROOT}/.claude/skills/latex-formatter/format.sh --to-latex 'x^2 + 2*x'" \
    false

test_case "sed injection via slash" \
    "${PROJECT_ROOT}/.claude/skills/latex-formatter/format.sh --to-latex 'x/y&z'" \
    true

test_case "LaTeX command injection" \
    "${PROJECT_ROOT}/.claude/skills/latex-formatter/format.sh --to-latex '\write'" \
    true

test_case "Excessive LaTeX length" \
    "${PROJECT_ROOT}/.claude/skills/latex-formatter/format.sh --to-latex \"\$(printf 'x%.0s' {1..60000})\"" \
    true

# Summary
echo -e "\n=== Test Summary ==="
echo "Tests run: $TESTS_RUN"
echo "Tests passed: $TESTS_PASSED"
if [[ $TESTS_PASSED -eq $TESTS_RUN ]]; then
    echo "Result: ALL PASSED"
    exit 0
else
    echo "Result: SOME FAILED"
    exit 1
fi
```

---

## Verification Checklist

- [ ] All /tmp file creation uses mktemp
- [ ] All variables in commands are quoted
- [ ] Input validation uses whitelist approach
- [ ] Maximum expression length enforced (10,000 chars)
- [ ] Maximum nesting depth enforced (50 levels)
- [ ] sed replaced with awk or structured parsing
- [ ] LaTeX commands whitelist implemented
- [ ] Error messages sanitized (no raw input in output)
- [ ] Sensitive input not logged
- [ ] Security tests added and passing
- [ ] npm audit shows zero vulnerabilities
- [ ] Code review completed
- [ ] Documentation updated

---

## Deployment Checklist

Before redeploying:
1. [ ] All critical vulnerabilities fixed
2. [ ] Security tests passing (100%)
3. [ ] Code reviewed by security team
4. [ ] Penetration testing completed
5. [ ] Stress testing completed (DoS resistance)
6. [ ] Documentation updated
7. [ ] Team trained on security fixes
8. [ ] Rollback plan documented
9. [ ] Monitoring/alerting configured
10. [ ] Post-deployment audit scheduled

---

## References

- CWE-94: Improper Control of Generation of Code
- CWE-78: Improper Neutralization of Special Elements
- CWE-400: Uncontrolled Resource Consumption
- OWASP: Command Injection
- OWASP: Template Injection
- Bash Strict Mode: http://redsymbol.net/articles/unofficial-bash-strict-mode/

---

**Document Version:** 1.0
**Last Updated:** December 4, 2025
**Status:** BLOCKING - In Progress
