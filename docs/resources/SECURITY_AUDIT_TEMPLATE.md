# Security Audit Report: [Component Name]

**Agent ID:** [agent-id]
**Date:** [YYYY-MM-DD]
**Confidence Score:** [0.00-1.00]
**Mode:** [MVP|Standard|Enterprise]

---

## Executive Summary

[Brief overview of security audit scope, findings, and overall security posture]

**Overall Security Posture:** [CRITICAL|HIGH|MODERATE|LOW] RISK
**Critical Findings:** [count]
**High Findings:** [count]
**Medium Findings:** [count]
**Low Findings:** [count]

---

## Audit Scope

**Components Reviewed:**
- [Component 1]
- [Component 2]
- [Component 3]

**Security Domains:**
- Authentication & Authorization
- Data Protection
- Network Security
- Secrets Management
- Vulnerability Assessment

---

## Findings

### 1. [Security Domain Name]

#### Current State Analysis

**Configuration Location:** `[path/to/file]`

**Implementation:**
```[language]
[code snippet - USE PLACEHOLDERS FOR SENSITIVE DATA]
```

**Findings:**

#### ✅ STRENGTH: [What's Working Well]
- [Specific positive finding]
- [Evidence of good practice]
- [Compliance with standards]

#### 🚨 CRITICAL: [Critical Vulnerability]
**Severity:** CRITICAL
**CWE:** [CWE-XXX] ([Description])
**CVSS Score:** [0.0-10.0]

**Evidence:**
```[language]
# IMPORTANT: ALWAYS REDACT SENSITIVE VALUES
# ✅ CORRECT EXAMPLES:
API_KEY=[REDACTED]
PASSWORD=[REDACTED]
JWT_SECRET=[REDACTED]
DATABASE_URL=postgres://user:[REDACTED]@localhost:5432/db

# ❌ NEVER INCLUDE ACTUAL VALUES:
# API_KEY=sk-ant-actual-key-value  # WRONG!
```

**Issue:** [Clear description of the vulnerability]

**Attack Scenario:**
1. [Step-by-step attack scenario]
2. [Exploitation method]
3. [Impact description]

**Exploitation Proof:**
```bash
# Demonstrate vulnerability (with redacted credentials)
curl -H "Authorization: Bearer [REDACTED]" https://api.example.com
```

**Remediation Required:**
```[language]
# Show secure implementation
[code with proper fixes]
```

**Additional Hardening:**
```[language]
# Show defense-in-depth measures
[enhanced security controls]
```

#### ⚠️ MEDIUM: [Medium Risk Finding]
**Severity:** MEDIUM
**CWE:** [CWE-XXX]

**Issue:** [Description]

**Recommendation:**
```[language]
[suggested fix]
```

---

## Risk Assessment Summary

### Critical Risks (Immediate Action Required)

| ID | Finding | Severity | Impact | Likelihood | Risk Score |
|----|---------|----------|--------|------------|-----------|
| SEC-001 | [Finding description] | CRITICAL | High | High | [0.0-10.0] |

### High Risks (Remediate Within 7 Days)

| ID | Finding | Severity | Impact | Likelihood | Risk Score |
|----|---------|----------|--------|------------|-----------|
| SEC-002 | [Finding description] | HIGH | Medium | High | [0.0-10.0] |

### Medium Risks (Remediate Within 30 Days)

| ID | Finding | Severity | Impact | Likelihood | Risk Score |
|----|---------|----------|--------|------------|-----------|
| SEC-003 | [Finding description] | MEDIUM | Low | Medium | [0.0-10.0] |

---

## Recommendations

### Immediate Actions (Week 1)

1. **FIX SEC-001: [Finding Name]**
   ```[language]
   [remediation code with redacted values]
   ```
   - [Action step 1]
   - [Action step 2]
   - [Verification method]

2. **FIX SEC-002: [Finding Name]**
   - [Remediation steps]
   - [Testing procedures]

### Short-Term Improvements (Month 1)

3. **[Improvement category]**
   - [Specific action]
   - [Expected outcome]

### Long-Term Enhancements (Quarter 1)

4. **[Strategic improvement]**
   - [Implementation plan]
   - [Resource requirements]

---

## Compliance Status

### OWASP Top 10 2021

| Risk | Status | Findings |
|------|--------|----------|
| A01:2021 - Broken Access Control | [✅ PASS / ⚠️ PARTIAL / 🚨 FAIL] | [brief note] |
| A02:2021 - Cryptographic Failures | [status] | [brief note] |
| A03:2021 - Injection | [status] | [brief note] |
| A04:2021 - Insecure Design | [status] | [brief note] |
| A05:2021 - Security Misconfiguration | [status] | [brief note] |
| A06:2021 - Vulnerable Components | [status] | [brief note] |
| A07:2021 - Authentication Failures | [status] | [brief note] |
| A08:2021 - Software/Data Integrity | [status] | [brief note] |
| A09:2021 - Logging Failures | [status] | [brief note] |
| A10:2021 - SSRF | [status] | [brief note] |

**Overall OWASP Compliance:** [percentage] ([X/10] PASS, [Y/10] PARTIAL, [Z/10] FAIL)

---

## Testing Evidence

### Manual Validation Performed

1. **[Test Category]**
   ```bash
   # Show test commands with redacted sensitive data
   $ [command] | grep [REDACTED]
   # ✅ PASS: [expected result]
   ```

### Automated Testing Gaps

- [Gap 1]
- [Gap 2]
- [Recommendation for improved testing]

---

## Conclusion

[Summary of overall security posture and priority actions]

**Priority Actions:**
1. [Most critical action]
2. [Second priority]
3. [Third priority]

**Confidence Score Rationale:**
- [Reason for confidence level]
- [Limitations or caveats]
- [Additional validation needed]

**Security Posture:** [Expected improvement after remediation]

---

## Appendix A: Validation Commands

```bash
# IMPORTANT: All commands must use [REDACTED] for sensitive values

# Verify [security control]
[command with redacted values]
# Expected: [safe output]

# Test [authentication]
[command with redacted credentials]
# Expected: [expected result]
```

---

## Appendix B: References

- OWASP Top 10 2021: https://owasp.org/Top10/
- CWE Top 25: https://cwe.mitre.org/top25/
- NIST Guidelines: [relevant NIST publications]
- [Component-specific security documentation]

---

## 🚨 CRITICAL REMINDER FOR SECURITY SPECIALISTS

**ALWAYS REDACT SENSITIVE VALUES IN THIS DOCUMENT:**

### What to Redact
- API Keys: `API_KEY=[REDACTED]` or `sk-ant-[REDACTED]`
- Passwords: `PASSWORD=[REDACTED]`
- Tokens: `JWT_TOKEN=eyJhbGci[REDACTED]...`
- Database URLs: `postgres://user:[REDACTED]@host:5432/db`
- Private Keys: `-----BEGIN PRIVATE KEY-----[REDACTED]-----END PRIVATE KEY-----`

### Use Placeholder Patterns
- ✅ `[REDACTED]`
- ✅ `***REDACTED***`
- ✅ First few characters + `[REDACTED]` (e.g., `sk-ant-[REDACTED]`)
- ❌ NEVER include actual credential values

### Pre-Commit Hook
This file will be checked by pre-commit hook for hardcoded credentials.
If you accidentally include real values, the commit will be BLOCKED.

---

**Document Version:** 1.0
**Classification:** INTERNAL USE
**Distribution:** Security Team, DevOps, Development Team
