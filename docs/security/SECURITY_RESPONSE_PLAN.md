# Security Incident Response & Vulnerability Management Plan

**Effective Date:** November 17, 2025
**Review Frequency:** Quarterly
**Owner:** Security Specialist Agent

---

## 1. Vulnerability Triage & Prioritization

### CVSS Score Severity Mapping

| CVSS Score | Severity | Response Time | Action |
|-----------|----------|----------------|--------|
| 9.0-10.0 | Critical | 24 hours | Emergency fix + hotfix deployment |
| 7.0-8.9 | High | 1 week | Standard fix + planned deployment |
| 5.0-6.9 | Medium | 2 weeks | Review + targeted fix |
| 3.0-4.9 | Low | 30 days | Standard maintenance window |
| < 3.0 | Minimal | As needed | Document + future refactor |

### Current Vulnerabilities Triage Status

| ID | Issue | CVSS | Priority | Status | Owner | ETA |
|----|-------|------|----------|--------|-------|-----|
| CV-001 | JWT Default Secret | 7.8 | Critical | Open | Security | Nov 20 |
| CV-002 | Timing Attack Hash | 7.4 | Critical | Open | Security | Nov 20 |
| CV-003 | Command Injection | 8.6 | Critical | Open | Security | Nov 20 |
| CV-004 | SQL Injection Regex | 6.8 | High | Open | Backend | Nov 27 |
| CV-005 | Symlink TOCTOU | 6.5 | High | Open | Backend | Nov 27 |
| CV-006 | Password Entropy | 5.9 | High | Open | Security | Dec 4 |
| CV-007 | Transaction Race | 6.2 | High | Open | Backend | Dec 4 |
| CV-008 | Log Disclosure | 5.8 | Medium | Open | DevOps | Dec 11 |

---

## 2. Incident Response Workflow

### Phase 1: Detection (T+0 hours)

**Activities:**
- Security alert received (automated or manual)
- Initial severity assessment
- Notify security team and engineering lead

**Checklist:**
- [ ] Create incident ticket in tracking system
- [ ] Assign severity level (Critical/High/Medium/Low)
- [ ] Identify affected components
- [ ] Assess potential business impact
- [ ] Determine if active exploitation suspected

**Output:** Incident ticket with initial triage

---

### Phase 2: Containment (T+4 hours for Critical)

**Activities:**
- Isolate affected systems if needed
- Disable vulnerable feature if critical
- Gather evidence and logs
- Notify stakeholders

**Checklist for Critical Issues:**
- [ ] Is production actively exploited? → Enable monitoring
- [ ] Can vulnerability be disabled? → Create feature flag
- [ ] Need to revert recent deployment? → Prepare rollback
- [ ] Customer data at risk? → Notify leadership
- [ ] Notify affected users? → Draft communications

**Example: JWT Secret Bypass**
```bash
# If actively exploited, immediately rotate all JWT tokens
JWT_SECRET=$(openssl rand -base64 32)
export JWT_SECRET

# Invalidate all existing sessions
sqlite3 ./data/sessions.db "DELETE FROM sessions WHERE created_at < datetime('now');"

# Redeploy with new secret
npm run build && npm run deploy:production
```

**Output:** Incident status report with containment actions

---

### Phase 3: Remediation (T+24 hours for Critical)

**Activities:**
- Develop security fix
- Create comprehensive test cases
- Code review security fix
- Test in staging environment
- Prepare deployment plan

**Code Review Checklist:**
- [ ] Is the fix complete and comprehensive?
- [ ] Are all related code paths updated?
- [ ] Does fix avoid introducing new vulnerabilities?
- [ ] Are there test cases for the vulnerability?
- [ ] Does fix address root cause, not symptom?

**Testing Requirements:**
```bash
# Run security-specific tests
npm run test:security

# Run full test suite
npm run test

# Run SAST analysis
npx semgrep --config p/security-audit

# Run dependency audit
npm audit
```

**Output:** Remediated code with tests and deployment plan

---

### Phase 4: Deployment (T+48 hours for Critical)

**Deployment Plan Template:**

```markdown
## Deployment: Security Fix for CV-XXX

### Change Summary
- CVSS Score: X.X (XXX Severity)
- Fix: [Brief description]
- Files Modified: [List of files]
- Testing Completed: [Yes/No]

### Risk Assessment
- Deployment Risk: [Low/Medium/High]
- Rollback Risk: [Low/Medium/High]
- Customer Impact: [None/Minor/Moderate/Severe]

### Deployment Steps
1. [ ] Backup production database
2. [ ] Deploy to staging
3. [ ] Run full test suite
4. [ ] Execute penetration tests
5. [ ] Deploy to canary (5% traffic)
6. [ ] Monitor metrics for 1 hour
7. [ ] If OK, deploy to 100%
8. [ ] Verify fix is active
9. [ ] Monitor for 24 hours

### Rollback Plan
If issues occur:
1. [ ] Immediate rollback to previous version
2. [ ] Verify rollback successful
3. [ ] Notify stakeholders
4. [ ] Schedule post-mortem

### Success Criteria
- [ ] All tests passing
- [ ] No error rate increase
- [ ] No latency increase
- [ ] Security metrics improving
```

**Deployment Command:**
```bash
#!/bin/bash
set -euo pipefail

VERSION=$(git rev-parse --short HEAD)
TIMESTAMP=$(date +%s)
BACKUP_FILE="backup_${VERSION}_${TIMESTAMP}.sql"

echo "Backing up production database..."
pg_dump $POSTGRES_URL > $BACKUP_FILE
aws s3 cp $BACKUP_FILE s3://backups/

echo "Deploying security fix..."
git tag -a "security-fix-${TIMESTAMP}" -m "Security fix deployment"
git push --tags

npm run build:production
npm run deploy:production --env=production

echo "Verifying deployment..."
npm run test:e2e --env=production

echo "Deployment successful!"
```

**Output:** Deployed fix verified in production

---

### Phase 5: Verification (T+72 hours for Critical)

**Activities:**
- Confirm vulnerability is fixed
- Verify no regression
- Review logs for exploitation attempts
- Document lessons learned

**Verification Checklist:**
- [ ] Vulnerability test case fails (exploit blocked)
- [ ] Legitimate functionality still works
- [ ] No new security issues introduced
- [ ] Performance metrics normal
- [ ] Error logs show no issues
- [ ] No exploitation attempts in logs

**Verification Script:**
```bash
#!/bin/bash

echo "Verifying Security Fix"
echo "====================="

# Test 1: Vulnerability should be fixed
echo "1. Testing vulnerability is fixed..."
curl -X POST http://localhost:3000/api/vulnerable \
  -H "Authorization: Bearer invalid-jwt" 2>&1 | \
  grep -q "Unauthorized\|Invalid token" && echo "✓ PASS" || echo "✗ FAIL"

# Test 2: Legitimate requests should work
echo "2. Testing legitimate functionality..."
VALID_TOKEN=$(npm run generate-test-token 2>/dev/null | tail -1)
curl -X POST http://localhost:3000/api/legitimate \
  -H "Authorization: Bearer $VALID_TOKEN" 2>&1 | \
  grep -q "success" && echo "✓ PASS" || echo "✗ FAIL"

# Test 3: Check logs for attempts
echo "3. Checking logs for exploitation attempts..."
tail -1000 logs/production.log | \
  grep -c "Unauthorized\|invalid" | \
  awk '{if ($1 > 10) print "⚠ High unauthorized attempts"}'

echo "Verification Complete"
```

**Output:** Verification report confirming fix is effective

---

## 3. Post-Incident Review

### Blameless Post-Mortem Template

```markdown
## Post-Mortem: CV-XXX - [Vulnerability Name]

### Summary
- **Date Discovered:** YYYY-MM-DD
- **Date Fixed:** YYYY-MM-DD
- **Time to Fix:** X days
- **Severity:** CVSS X.X (XXX)
- **Root Cause:** [Brief explanation]

### Timeline
- T+0: Issue discovered
- T+X: Containment completed
- T+Y: Fix deployed
- T+Z: Verification completed

### Root Cause Analysis
1. **Why did this happen?**
   - Insufficient code review
   - Lack of security testing
   - Missing validation layer

2. **Why wasn't it caught earlier?**
   - SAST tool not configured for this pattern
   - Security training gap
   - Architecture review process

3. **How do we prevent this in future?**
   - Add SAST rule for pattern
   - Add test case to test suite
   - Update security guidelines

### Action Items
- [ ] Action 1: [Description] - Owner: [Name] - Due: [Date]
- [ ] Action 2: [Description] - Owner: [Name] - Due: [Date]
- [ ] Action 3: [Description] - Owner: [Name] - Due: [Date]

### Metrics
- MTTR (Mean Time to Remediate): X days
- MTTD (Mean Time to Detect): Y days
- Severity Score: CVSS Z.Z
- Customer Impact: [Yes/No] - Affected: [X] users
```

---

## 4. Continuous Security Monitoring

### Automated Vulnerability Detection

```typescript
// Security Monitoring System

interface VulnerabilityAlert {
  id: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  affectedFile: string;
  detectedAt: Date;
  status: 'open' | 'in_progress' | 'resolved';
}

// SAST (Static Application Security Testing)
const sastChecks = [
  {
    name: 'hardcoded-secrets',
    pattern: /(password|secret|key|token)\s*[:=]\s*['"][^'"]+['"]$/,
    severity: 'critical',
  },
  {
    name: 'sql-injection',
    pattern: /query\s*\(\s*[`'"].*\$\{[^}]+\}/,
    severity: 'high',
  },
  {
    name: 'command-injection',
    pattern: /exec\s*\(\s*[`'"].*\$\{[^}]+\}/,
    severity: 'high',
  },
];

// DAST (Dynamic Application Security Testing)
const dastChecks = [
  {
    name: 'weak-jwt-secret',
    test: async () => {
      const token = jwt.sign({ role: 'admin' }, 'dev-secret-key');
      const response = await fetch('/api/admin', {
        headers: { Authorization: `Bearer ${token}` }
      });
      return response.status === 200; // Should fail if secret is strong
    },
    severity: 'critical',
  },
  {
    name: 'timing-attack',
    test: async () => {
      // Measure response times for correct vs incorrect hashes
      // Should be similar if constant-time comparison used
    },
    severity: 'high',
  },
];

// Dependency Vulnerability Scanning
const dependencyScan = async () => {
  const result = await execAsync('npm audit --json');
  const vulnerabilities = JSON.parse(result.stdout).vulnerabilities;

  const alerts: VulnerabilityAlert[] = Object.entries(vulnerabilities)
    .filter(([_, vuln]: any) => vuln.severity === 'critical' || vuln.severity === 'high')
    .map(([name, vuln]: any) => ({
      id: `dep-${name}`,
      type: 'dependency',
      severity: vuln.severity,
      description: `${name}@${vuln.from} has ${vuln.severity} vulnerability`,
      affectedFile: 'package.json',
      detectedAt: new Date(),
      status: 'open',
    }));

  return alerts;
};
```

### Monitoring Dashboard

```yaml
# Prometheus metrics to monitor
metrics:
  - security_vulnerabilities_total
  - security_vulnerabilities_open
  - security_patch_deployment_time_days
  - authentication_failures_total
  - unauthorized_access_attempts
  - encryption_operations_total
  - backup_integrity_checks_passed

# Grafana dashboards
dashboards:
  - vulnerability_tracker
  - authentication_audit
  - encryption_health
  - backup_integrity
```

---

## 5. Security Testing Plan

### Quarterly Security Testing Schedule

**Q1: Authentication & Authorization**
- JWT secret strength testing
- Session management testing
- RBAC bypass attempts
- Token expiration verification

**Q2: Data Protection**
- Encryption implementation review
- Backup integrity verification
- Data leakage testing
- Sensitive data in logs audit

**Q3: Input Validation**
- SQL injection testing
- Command injection testing
- Path traversal testing
- XSS vulnerability testing

**Q4: Infrastructure Security**
- Dependency vulnerability scanning
- Compliance verification
- Security header validation
- Infrastructure misconfigurations

### Automated Testing Commands

```bash
#!/bin/bash

echo "Running Security Test Suite"
echo "============================"

# SAST Analysis
echo "1. SAST Scanning..."
npx semgrep --config p/security-audit src/

# Dependency Audit
echo "2. Dependency Audit..."
npm audit --production

# Unit Security Tests
echo "3. Unit Security Tests..."
npm run test -- --testPathPattern=security

# Integration Tests
echo "4. Integration Tests..."
npm run test:integration

# Penetration Testing
echo "5. Penetration Tests..."
npm run test:penetration

# Report Generation
echo "6. Generating Report..."
npm run security:report

echo "Security testing complete!"
```

---

## 6. Security Incident Communication Plan

### Internal Communication (First 24 hours)

**To:** Engineering Lead, CTO, Security Team

**Content:**
- Vulnerability description and severity
- Affected systems and users
- Current status (detected, contained, remediating)
- Estimated time to fix
- Immediate workarounds if available

**Template:**
```
SECURITY INCIDENT ALERT
=======================
Severity: CRITICAL
Vulnerability: [Name]
CVSS Score: X.X

SUMMARY:
[Brief non-technical description]

IMPACT:
- Systems Affected: [List]
- Users Potentially Affected: [Number/Percentage]
- Data at Risk: [Yes/No - Description]

STATUS:
- Detected: [Time]
- Contained: [Time] - [Status]
- Fix ETA: [Time]

ACTION REQUIRED:
- [Action 1]
- [Action 2]

Next Update: [Time]
```

### External Communication (If Customer Impact)

**To:** Affected Customers, Trust & Safety Team

**Content (After Fix Confirmed):**
- Non-technical explanation of what happened
- How it was discovered and fixed
- What customers should do (if anything)
- Prevention measures for future
- Contact for questions

**Timeline:**
- Critical: Communicate within 72 hours of discovery
- High: Communicate within 1 week of discovery
- Medium: Include in monthly security bulletin

---

## 7. Security Training & Awareness

### Developer Security Training

**Topics:**
1. OWASP Top 10 2021
2. Secure coding practices
3. Authentication & authorization
4. Cryptography basics
5. Input validation
6. Error handling best practices

**Frequency:** Quarterly
**Format:** 1-hour workshop + recorded video
**Attendance:** Mandatory for all developers

### Security Code Review Checklist

```markdown
## Security Code Review Checklist

### Authentication & Authorization
- [ ] No hardcoded credentials
- [ ] Secrets use environment variables
- [ ] Auth checks before sensitive operations
- [ ] Role-based access control implemented
- [ ] Session management is secure

### Cryptography
- [ ] Using approved algorithms (AES-256, SHA-256)
- [ ] Keys properly managed
- [ ] Random number generation uses crypto.randomBytes()
- [ ] No custom crypto implementations

### Input Validation
- [ ] All user input validated
- [ ] No string concatenation in queries
- [ ] Path traversal checks in place
- [ ] Size limits enforced

### Error Handling
- [ ] No sensitive info in error messages
- [ ] Proper logging without exposing secrets
- [ ] Stack traces not shown to users

### Database Security
- [ ] Parameterized queries used
- [ ] Connection encryption enabled
- [ ] Least privilege database users
- [ ] Regular backups tested
```

---

## 8. Vulnerability Tracking Template

For each vulnerability identified, create an entry:

```markdown
# Vulnerability: CV-XXX - [Title]

## Metadata
- **Discovered:** YYYY-MM-DD
- **CVSS Score:** X.X ([Severity])
- **CWE:** CWE-XXX ([Title])
- **Status:** [Open/In Progress/Fixed/Verified]
- **Owner:** [Developer Name]

## Description
[Detailed technical description of vulnerability]

## Affected Code
- File: `path/to/file.ts`
- Line: XXX
- Component: [Component Name]

## Attack Scenario
[Step-by-step description of how to exploit]

## Impact
- Confidentiality: [None/Low/Medium/High]
- Integrity: [None/Low/Medium/High]
- Availability: [None/Low/Medium/High]

## Remediation
- Status: [Open/In Progress/Completed]
- Fix Version: [Version number]
- Deployment Date: [Date]

## Test Cases
- [ ] Test case 1: [Description]
- [ ] Test case 2: [Description]

## References
- OWASP: [Link]
- CWE: [Link]
- CVE: [Link if applicable]

## Sign-off
- [ ] Code reviewed by: [Name] - [Date]
- [ ] Security approved by: [Name] - [Date]
- [ ] Deployed to production: [Date]
- [ ] Verified fixed in production: [Date]
```

---

## 9. Security Metrics & KPIs

### Key Performance Indicators

| Metric | Target | Frequency | Owner |
|--------|--------|-----------|-------|
| MTTD (Mean Time to Detect) | < 7 days | Monthly | Security Team |
| MTTR (Mean Time to Remediate) | < 3 days for critical | Monthly | Engineering |
| Security Test Coverage | > 90% | Monthly | QA |
| Vulnerability Resolution Rate | > 95% on time | Monthly | Engineering |
| Dependencies Up-to-date | > 95% | Monthly | DevOps |
| Security Training Completion | 100% | Quarterly | HR |

### Monthly Security Report Template

```markdown
## Security Report - [Month] [Year]

### Executive Summary
- Vulnerabilities Discovered: X
- Vulnerabilities Fixed: Y
- Average CVSS Score: Z.Z
- Security Incidents: [Number]

### Vulnerability Metrics
- Critical: [Number] (0 acceptable)
- High: [Number] (< 5 acceptable)
- Medium: [Number]
- Low: [Number]

### Incident Metrics
- MTTD Average: [X days]
- MTTR Average: [Y days]
- Customer Impact Incidents: [Number]

### Code Coverage
- Security Test Coverage: [X%]
- SAST Scan Pass Rate: [Y%]
- Dependency Audit Pass Rate: [Z%]

### Compliance Status
- PCI-DSS: [Status]
- SOC 2: [Status]
- OWASP Top 10: [Status]

### Actions Completed
1. [Action] - Completed by [Date]
2. [Action] - Completed by [Date]

### Upcoming Actions
1. [Action] - Due [Date]
2. [Action] - Due [Date]

### Recommendations
1. [Recommendation]
2. [Recommendation]
```

---

## 10. Vulnerability Disclosure Policy

### Responsible Disclosure Process

1. **Discovery Phase** (0-30 days)
   - Verify vulnerability is real
   - Assess impact
   - Prepare notification

2. **Notification Phase** (Day 1)
   - Notify security@company.com
   - Provide detailed technical information
   - Allow 90 days for patching

3. **Patching Phase** (Days 1-90)
   - Company develops and tests fix
   - Security researcher validates fix
   - Patch is released

4. **Disclosure Phase** (Day 90+)
   - Vulnerability details can be disclosed
   - Credit security researcher
   - Publish security advisory

### Security Contact

```
Email: security@company.com
PGP Key: [Key details]
Response Time: 24-48 hours
```

---

## Current Status Summary

### Open Vulnerabilities

| ID | Title | CVSS | Status | Deadline |
|----|-------|------|--------|----------|
| CV-001 | JWT Default Secret | 7.8 | Assigned | Nov 20 |
| CV-002 | Timing Attack | 7.4 | Assigned | Nov 20 |
| CV-003 | Command Injection | 8.6 | Assigned | Nov 20 |
| CV-004 | SQL Injection | 6.8 | In Queue | Nov 27 |
| CV-005 | Symlink TOCTOU | 6.5 | In Queue | Nov 27 |
| CV-006 | Password Entropy | 5.9 | In Queue | Dec 4 |
| CV-007 | Transaction Race | 6.2 | In Queue | Dec 4 |
| CV-008 | Log Disclosure | 5.8 | Backlog | Dec 11 |

### Remediation Progress

- **Week 1 (Nov 20):** 3 critical issues
- **Week 2 (Nov 27):** 2 high issues
- **Week 3 (Dec 4):** 2 high issues
- **Week 4 (Dec 11):** 1 medium issue

**Overall Target:** 100% remediation by December 11, 2025

---

**Document Owner:** Security Specialist Agent
**Last Updated:** November 17, 2025
**Next Review:** January 17, 2026
**Classification:** Confidential
