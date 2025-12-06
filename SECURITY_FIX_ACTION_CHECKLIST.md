# Security Fix Action Checklist - PHASE-3 Sprint 3.1

**Status:** BLOCKING - All items must be completed before deployment
**Start Date:** December 4, 2025
**Target Completion:** December 6-7, 2025
**Estimated Effort:** 14-25 hours

---

## PHASE 1: Immediate Critical Fixes (2-4 hours)

### CVE-1.1: Predictable Temporary File Creation
- [ ] Replace `TEMP_SCRIPT="/tmp/equation-solver-$$.js"` with mktemp
- [ ] File: `equation-solver/solve.sh` line 124
- [ ] Add: `TEMP_SCRIPT=$(mktemp /tmp/equation-solver-XXXXXX.js)`
- [ ] Add: `chmod 600 "$TEMP_SCRIPT"`
- [ ] Test: Verify file is created with secure permissions
- [ ] Estimated time: 30 minutes

### CVE-3.1: sed Injection via User Input
- [ ] Replace sed-based LaTeX processing with awk
- [ ] File: `latex-formatter/format.sh` lines 41-77
- [ ] Rewrite: `to_latex()` function using awk gsub
- [ ] Test: Verify sed metacharacters don't break patterns
- [ ] Test payloads:
  - `x/y&z` (should not cause sed error)
  - `a\b` (should not cause sed escape error)
  - `x|y` (should not cause pipe injection)
- [ ] Estimated time: 1.5 hours

### CVE-2.4: Nerdamer Template Injection
- [ ] Add input validation in `compute-engine.cjs`
- [ ] File: `symbolic-computation/compute-engine.cjs` lines 50-60
- [ ] Add validation function:
  ```javascript
  const validExprRegex = /^[a-zA-Z0-9+\-*/%()^.,\s]+$/;
  if (!validExprRegex.test(expression)) {
      throw new Error("Invalid expression format");
  }
  ```
- [ ] Apply to all switch cases
- [ ] Test: Verify injection attempts are rejected
- [ ] Test payloads:
  - `x"); console.log("hacked"); nerdamer("`
  - `x" + malicious + "`
- [ ] Estimated time: 1 hour

### CVE-3.2: KaTeX Command Injection
- [ ] Add LaTeX validation before KaTeX
- [ ] File: `latex-formatter/format.sh`
- [ ] Add `validate_latex_input()` function
- [ ] Block dangerous commands: `\write`, `\openout`, etc.
- [ ] Test: Verify dangerous LaTeX is rejected
- [ ] Estimated time: 45 minutes

**Phase 1 Subtotal: 3.75 hours** ✓ Priority

---

## PHASE 2: Remaining Critical Fixes (4-6 hours)

### CVE-1.3: Equation Template Injection
- [ ] Add validation in `solve.sh` equation processing
- [ ] File: `equation-solver/solve.sh` line 140
- [ ] Add equation validation before passing to Node.js
- [ ] Create or source validation function
- [ ] Test: Verify template injection attempts rejected
- [ ] Estimated time: 1 hour

### CVE-2.1: Incomplete Expression Validation
- [ ] Replace blacklist regex with whitelist
- [ ] File: `symbolic-computation/compute.sh` line 110-113
- [ ] Change from: `[[ "$expression" =~ [\;\&\|\`\$] ]]`
- [ ] Change to: `[[ ! "$expression" =~ ^[a-zA-Z0-9+\-*/%()^.,\s]+$ ]]`
- [ ] Test: Verify all unsafe characters are rejected
- [ ] Estimated time: 30 minutes

### CVE-2.3: Unsafe Bounds Parameter Processing
- [ ] Validate bounds are numeric before use
- [ ] File: `symbolic-computation/compute-engine.cjs` lines 62-68
- [ ] Add numeric validation:
  ```javascript
  const boundsMatch = bounds.match(/^(-?\d+\.?\d*),(-?\d+\.?\d*)$/);
  if (!boundsMatch) throw new Error("Invalid bounds");
  const [lower, upper] = boundsMatch.slice(1).map(parseFloat);
  ```
- [ ] Use numeric values in Nerdamer calls
- [ ] Test: Verify template injection in bounds rejected
- [ ] Estimated time: 1 hour

### CVE-3.3: Insufficient LaTeX Input Validation
- [ ] Add input length limits (max 50,000 characters)
- [ ] Add dangerous command blacklist
- [ ] Add delimiter balance checking
- [ ] File: `latex-formatter/format.sh` lines 7-20
- [ ] Add `validate_latex_input()` function
- [ ] Call in main() before processing
- [ ] Test: Verify large LaTeX rejected
- [ ] Test: Verify `\write` and similar rejected
- [ ] Estimated time: 1.5 hours

### CVE-1.4 & CVE-2.5: Input Size and Complexity Limits
- [ ] Add max length checks to all expression parameters
- [ ] File: All three skills
- [ ] Limit equation length: 10,000 characters
- [ ] Limit LaTeX length: 50,000 characters
- [ ] Limit nesting depth: 50 levels
- [ ] Test: Verify DoS attempts are blocked
- [ ] Estimated time: 1 hour

**Phase 2 Subtotal: 5.5 hours** ✓ Critical

---

## PHASE 3: Medium Priority Fixes (4-8 hours)

### CVE-1.2: Variable Quoting in Commands
- [ ] Verify all variables quoted in command context
- [ ] Files: All three skills (equation-solver, symbolic-computation, latex-formatter)
- [ ] Check for patterns: `$var` in commands should be `"$var"`
- [ ] Command: `grep -n '[^"]$[A-Z_]' *.sh`
- [ ] Test: Verify PATH with spaces doesn't cause injection
- [ ] Estimated time: 45 minutes

### CVE-1.5: Error Message Sanitization
- [ ] Remove raw user input from error messages
- [ ] Files: `equation-solver/solve.sh`, `symbolic-computation/compute.sh`
- [ ] Lines: 162-180, 143-157
- [ ] Replace direct error output with generic messages
- [ ] Log detailed errors server-side only
- [ ] Test: Verify sensitive info not disclosed
- [ ] Estimated time: 1 hour

### CVE-1.6: Improved Cleanup Functions
- [ ] Replace manual rm with mktemp auto-cleanup
- [ ] File: `equation-solver/solve.sh`
- [ ] Add: `trap 'rm -f "$TEMP_SCRIPT" 2>/dev/null || true' EXIT INT TERM`
- [ ] Ensure cleanup runs on all exit paths
- [ ] Test: Verify temp files cleaned up
- [ ] Estimated time: 45 minutes

### CVE-2.6: Secure Temporary Directory
- [ ] Replace predictable `TEMP_DIR` with mktemp
- [ ] File: `symbolic-computation/compute.sh` line 50
- [ ] Change: `TEMP_DIR=$(mktemp -d /tmp/symbolic-XXXXXX)`
- [ ] Add cleanup trap
- [ ] Test: Verify directory is secure
- [ ] Estimated time: 30 minutes

### CVE-2.7: Logging Sanitization
- [ ] Remove or sanitize user input in logs
- [ ] File: `symbolic-computation/compute.sh` lines 73-86
- [ ] Remove: `log_info "Expression: ${expression}"`
- [ ] Remove: `log_info "Variable: ${variable}"`
- [ ] Keep: `log_info "Operation: ${operation}"`
- [ ] Test: Verify no user input in logs
- [ ] Estimated time: 30 minutes

### CVE-3.5: KaTeX Output Validation
- [ ] Validate KaTeX output is safe HTML
- [ ] File: `latex-formatter/format.sh` lines 80-90
- [ ] Check output doesn't contain: `<script>`, `javascript:`
- [ ] Sanitize error messages from KaTeX
- [ ] Test: Verify unsafe output rejected
- [ ] Estimated time: 1 hour

### CVE-3.6: Error Message Standardization
- [ ] Use generic error messages for users
- [ ] File: `latex-formatter/format.sh` lines 91-99
- [ ] Replace `validate_latex()` verbose output
- [ ] Log detailed errors server-side only
- [ ] Test: Verify no information disclosure
- [ ] Estimated time: 45 minutes

### CVE-3.7: KaTeX Version Validation
- [ ] Add minimum version check for KaTeX
- [ ] File: `latex-formatter/format.sh` line 33-39
- [ ] Add version comparison logic
- [ ] Require: KaTeX >= 0.16.0
- [ ] Test: Verify old versions rejected
- [ ] Estimated time: 1 hour

**Phase 3 Subtotal: 6.75 hours** ✓ Medium

---

## PHASE 4: Testing and Validation (2-4 hours)

### Security Test Suite
- [ ] Create `tests/test-security-injection.sh`
- [ ] Add test: Shell injection via equation
- [ ] Add test: Template injection via expression
- [ ] Add test: sed injection via LaTeX
- [ ] Add test: KaTeX injection via input
- [ ] Add test: DoS via large expression
- [ ] Add test: DoS via deep nesting
- [ ] Add test: Bounds validation
- [ ] Add test: Error message sanitization
- [ ] Run: `bash tests/test-security-injection.sh`
- [ ] Verify: All tests pass
- [ ] Estimated time: 2 hours

### Functional Regression Testing
- [ ] Run: `bash equation-solver/test-equation-solver.sh`
- [ ] Run: `bash symbolic-computation/test-symbolic-computation.sh`
- [ ] Run: `bash latex-formatter/test-latex-formatter.sh`
- [ ] Verify: No functionality broken
- [ ] Verify: All tests pass
- [ ] Estimated time: 1 hour

### Penetration Testing (Manual)
- [ ] Test each CVE with actual payloads
- [ ] Verify vulnerabilities are fixed
- [ ] Test edge cases
- [ ] Document results
- [ ] Estimated time: 1 hour

**Phase 4 Subtotal: 4 hours** ✓ Validation

---

## PHASE 5: Code Review and Final Audit (2-3 hours)

### Pre-Review Checklist
- [ ] All critical vulnerabilities fixed
- [ ] All medium vulnerabilities fixed
- [ ] All tests passing
- [ ] No new vulnerabilities introduced
- [ ] Code follows security best practices

### Code Review Items
- [ ] Security team reviews all changes
- [ ] Verify input validation whitelists
- [ ] Verify no unescaped variables
- [ ] Verify temp file handling secure
- [ ] Verify error messages sanitized
- [ ] Verify logging sanitized

### Re-Audit for Confidence Score
- [ ] Run security analysis on fixed code
- [ ] Verify all 9 critical vulns fixed
- [ ] Verify all 8 medium vulns fixed
- [ ] Calculate new confidence score
- [ ] Target: >= 0.85 (Standard mode)

### Sign-Off
- [ ] Security team approves fixes
- [ ] Confidence score certified
- [ ] Clearance for deployment granted

**Phase 5 Subtotal: 2.5 hours** ✓ Final

---

## Summary Timeline

| Phase | Task | Hours | Status |
|-------|------|-------|--------|
| 1 | Immediate critical fixes | 3.75 | PRIORITY |
| 2 | Remaining critical fixes | 5.5 | CRITICAL |
| 3 | Medium priority fixes | 6.75 | SHOULD |
| 4 | Testing & validation | 4 | REQUIRED |
| 5 | Code review & audit | 2.5 | REQUIRED |
| **TOTAL** | | **22.5 hours** | |

**Estimated Completion:** 2-3 days (assuming dedicated effort)

---

## Pre-Start Verification

- [ ] All team members notified of critical findings
- [ ] Development environment ready
- [ ] Backup of original code taken
- [ ] Git branch created for fixes
- [ ] Testing environment available
- [ ] Security team assigned for review

---

## File-by-File Checklist

### equation-solver/solve.sh
- [ ] CVE-1.1: Use mktemp for TEMP_SCRIPT
- [ ] CVE-1.2: Verify variables quoted in commands
- [ ] CVE-1.3: Add equation validation whitelist
- [ ] CVE-1.4: Add equation length/complexity limits
- [ ] CVE-1.5: Sanitize error messages
- [ ] CVE-1.6: Improve cleanup function
- [ ] CVE-1.7: Validate JSON output format

### symbolic-computation/compute.sh
- [ ] CVE-2.1: Use whitelist validation regex
- [ ] CVE-2.2: Add expression validation
- [ ] CVE-2.5: Add expression complexity limits
- [ ] CVE-2.6: Use mktemp for TEMP_DIR
- [ ] CVE-2.7: Remove expression/variable from logs
- [ ] CVE-2.8: Call validate_operation earlier

### symbolic-computation/compute-engine.cjs
- [ ] CVE-2.3: Validate bounds are numeric
- [ ] CVE-2.4: Add input validation whitelist
- [ ] Verify no template injection possible

### latex-formatter/format.sh
- [ ] CVE-3.1: Replace sed with awk for processing
- [ ] CVE-3.2: Add LaTeX validation before KaTeX
- [ ] CVE-3.3: Add input length and command limits
- [ ] CVE-3.5: Validate KaTeX output
- [ ] CVE-3.6: Sanitize error messages
- [ ] CVE-3.7: Add KaTeX version check
- [ ] CVE-3.8: Improve Greek letter regex

---

## Shared Validation Library

- [ ] Create: `.claude/skills/shared/math-input-validation.sh`
- [ ] Implement: `validate_math_expression()`
- [ ] Implement: `validate_latex_string()`
- [ ] Implement: `validate_bounds()`
- [ ] Implement: `validate_variable()`
- [ ] Source in all skills
- [ ] Test: Verify all validation functions work

---

## Testing Payloads

### Shell Injection Tests
```bash
# Test these should be REJECTED
./solve.sh '; rm -rf /'
./solve.sh '"; touch /tmp/pwned; "'
./solve.sh '`whoami`'
./compute.sh differentiate 'x|cat /etc/passwd' x
```

### Template Injection Tests
```bash
# Test these should be REJECTED
./solve.sh '"); console.log("pwned"); nerdamer("'
./compute.sh integrate 'x' x '0,eval(1)"'
```

### sed Injection Tests
```bash
# Test these should be REJECTED (not cause sed error)
./format.sh --to-latex 'x/y&z'
./format.sh --to-latex 'a/b\c'
```

### DoS Tests
```bash
# Test these should be REJECTED
EXPR="x"
for i in {1..200}; do EXPR="sin($EXPR)"; done
./solve.sh "$EXPR"  # Should timeout or reject

./format.sh --to-latex "$(printf 'x%.0s' {1..60000})"
```

### LaTeX Injection Tests
```bash
# Test these should be REJECTED
./format.sh --from-latex '\write'
./format.sh --from-latex '\openout'
./format.sh --from-latex '\immediate'
```

---

## Sign-Off Requirements

Before marking complete:

1. **Development**: All code changes committed
2. **Testing**: All tests passing (100%)
3. **Security**: All vulnerabilities fixed verified
4. **Code Review**: Security team signed off
5. **Confidence**: Score recalculated >= 0.85
6. **Documentation**: Audit re-run shows all fixed

---

## Rollback Plan

If issues found after deployment:
1. [ ] Disable external access immediately
2. [ ] Revert to backup from commit [INSERT HASH]
3. [ ] Notify stakeholders
4. [ ] Document incident
5. [ ] Root cause analysis
6. [ ] Re-audit and fix

---

## Post-Deployment Monitoring

After fixes deployed:
- [ ] Monitor error logs for exploitation attempts
- [ ] Monitor resource usage for DoS attacks
- [ ] Check logs for injection patterns
- [ ] Monthly security audit
- [ ] Dependency update monitoring

---

**Document Owner:** Security Specialist Agent
**Last Updated:** December 4, 2025
**Status:** ACTIVE - In Progress
