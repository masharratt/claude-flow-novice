# Audit Reports

Audit results for compliance standards, code quality assessments, and regulatory reporting outputs.

## Purpose

This directory contains compliance audit results (GDPR, SOC2, HIPAA), code quality assessments, regulatory reports, and formal audit trails required for enterprise governance and legal compliance.

## Report Types

### Compliance Audit Reports
- **Format**: `audit-{standard}-{scope}-{date}.md`
- **Content**: Compliance validation results, violations, remediation steps, certification readiness
- **Generated**: /compliance validate command or scheduled audits

### Code Quality Audits
- **Format**: `code-audit-{scope}-{date}.md`
- **Content**: Static analysis, code smells, technical debt, maintainability index
- **Generated**: Periodic code quality reviews or CFN Loop validators

### Regulatory Reports
- **Format**: `regulatory-{jurisdiction}-{date}.pdf`
- **Content**: Formal reports for regulatory bodies, data residency, privacy compliance
- **Generated**: /compliance audit command with --format pdf

### Audit Trail Logs
- **Format**: `audit-trail-{timeframe}.log`
- **Content**: Immutable log of all system changes, agent actions, decision points
- **Generated**: Continuous logging via event bus

## Compliance Standards Supported

### GDPR (General Data Protection Regulation)
- Data privacy validation
- Right to erasure verification
- Consent management audit
- Data breach notification readiness
- Cross-border data transfer compliance

### SOC2 (Service Organization Control 2)
- Security controls validation
- Availability monitoring
- Processing integrity checks
- Confidentiality verification
- Privacy compliance

### HIPAA (Health Insurance Portability and Accountability Act)
- PHI protection validation
- Access control audits
- Encryption verification
- Audit trail completeness
- Breach notification procedures

### ISO 27001
- Information security management
- Risk assessment validation
- Control implementation verification
- Continuous improvement audit

## Report Structure

```markdown
# Compliance Audit Report - {Standard}

## Metadata
- Standard: {GDPR|SOC2|HIPAA|ISO27001}
- Scope: {data-privacy|security|audit-trail}
- Date: {ISO-8601}
- Auditor: {agent-id or human auditor}
- Status: {COMPLIANT|NON_COMPLIANT|PARTIAL}

## Executive Summary
{High-level compliance status and critical findings}

## Audit Scope
- Systems audited: {list}
- Time period: {date range}
- Controls tested: {count}
- Sampling method: {random|comprehensive|targeted}

## Findings

### Compliant Controls ✅
1. Data encryption at rest (AES-256)
2. Access control (RBAC implemented)
3. Audit logging (comprehensive trail)

### Non-Compliant Controls ❌
1. Data retention policy not enforced
2. Consent management missing for EU users

### Partial Compliance ⚠️
1. Breach notification procedure defined but not tested

## Violations
1. **GDPR Article 17 (Right to Erasure)**
   - Severity: HIGH
   - Description: User data deletion not implemented
   - Remediation: Implement DELETE /users/:id endpoint
   - Deadline: 30 days

## Recommendations
1. Implement automated data retention cleanup (HIGH)
2. Add consent management UI for EU users (HIGH)
3. Test breach notification procedure quarterly (MEDIUM)

## Certification Readiness
- Overall: 85% compliant
- Critical gaps: 2
- Target: 100% by {date}

## Next Steps
1. Remediate violations within deadlines
2. Re-audit in 90 days
3. External certification audit scheduled for {date}
```

## Usage

Audit reports are required for:
- Enterprise customer due diligence
- Security certifications (SOC2, ISO 27001)
- Regulatory compliance (GDPR, HIPAA)
- Legal discovery and litigation support
- Insurance and risk management
- CFN Loop 4 product owner compliance gates

## Examples

- `audit-GDPR-data-privacy-2025-10-10.md` - GDPR compliance audit
- `audit-SOC2-security-2025-Q3.md` - Quarterly SOC2 audit
- `code-audit-authentication-2025-10-10.md` - Code quality audit
- `regulatory-EU-2025-annual.pdf` - Annual regulatory report
- `audit-trail-2025-10.log` - Monthly audit trail

## Retention

**CRITICAL**: Keep audit reports for 7 years minimum (legal requirement).
- Compliance audits: 7 years
- Code quality audits: 2 years
- Regulatory reports: 10 years (jurisdiction-dependent)
- Audit trail logs: 7 years (immutable, append-only)

## Access Control

**HIGHLY RESTRICTED**: Audit reports contain sensitive compliance data.
- Compliance officers: Full access
- Legal team: Full access
- Executive leadership: Summary access
- External auditors: Scoped access during audit period
- Project team: Read-only for remediation purposes

## Automation

```bash
# Validate GDPR compliance
/compliance validate --standard GDPR --scope data-privacy --detailed

# Generate SOC2 audit report
/compliance audit --standard SOC2 --period quarterly --format pdf

# Check compliance readiness
/compliance readiness --target-date 2025-12-31
```
