# Step 13 Security Audit - Quick Reference Guide

**Audit Date:** December 2, 2025
**Confidence:** 0.82 (High)
**Risk Level:** MEDIUM
**Overall CVSS:** 4.2

---

## Vulnerability Summary Table

| ID | Title | CVSS | File | Priority | Est. Hours |
|----|-------|------|------|----------|-----------|
| **CRITICAL-4** | Shell Command Injection | 8.1 | `ingest-performance.sh` | P0 | 2 |
| **CRITICAL-2** | Redis Key Injection | 7.4 | `step-13-...ts` | P0 | 1.5 |
| **CRITICAL-1** | Unbounded Metrics | 7.3 | `performance-feedback.ts` | P0 | 2 |
| **CRITICAL-5** | Unbounded Redis Ops | 7.2 | `performance-feedback.ts` | P0 | 3 |
| **CRITICAL-3** | Pattern ID Injection | 7.1 | `performance-feedback.ts` | P1 | 2 |
| **HIGH-2** | SSRF in URLs | 5.8 | `performance-tracker.ts` | P1 | 2 |
| **HIGH-3** | Missing Type Validation | 5.5 | `performance-tracker.ts` | P1 | 2 |
| **HIGH-1** | Bad Timestamp Validation | 5.3 | `performance-tracker.ts` | P1 | 1.5 |
| **HIGH-5** | Unvalidated Algorithm Updates | 5.2 | `performance-feedback.ts` | P1 | 1.5 |
| **HIGH-4** | Error Info Leakage | 5.1 | `step-13-...ts` | P1 | 1 |

---

## Critical Fixes Required (P0 - This Sprint)

### CRITICAL-4: Shell Command Injection (2 hours)
**File:** `planning/seo/scripts/ingest-performance.sh`

**Quick Fix:**
```bash
# MOVE validation BEFORE using variables
# FROM: Use variables → Validate (WRONG)
# TO:   Validate → Use variables (CORRECT)

main() {
  # Parse arguments
  while (( $# > 0 )); do
    case "${1}" in
      --source) source="${2}"; shift 2 ;;
      --content-id) content_id="${2}"; shift 2 ;;
      # ...
    esac
  done

  # VALIDATE FIRST (CRITICAL!)
  if ! validate_all_inputs "${source}" "${lookback_days}" \
       "${content_id}" "${batch_size}"; then
    exit 1
  fi

  # THEN use validated variables
  ingest_performance_data "${source}" "${lookback_days}" \
    "${content_id}" "false" "${batch_size}" "${use_mock_data}"
}
```

**Test:**
```bash
# Should FAIL validation
./ingest-performance.sh --content-id '$(whoami)' --source gsc --mock-data
```

---

### CRITICAL-2: Redis Key Injection (1.5 hours)
**File:** `planning/seo/lib/steps/step-13-performance-tracking.ts`

**Quick Fix:**
```typescript
// BEFORE (VULNERABLE):
async function fetchAppliedPatterns(contentId: string, redis: Redis, store: string) {
  const appliedKey = `content:performance:${contentId}:applied_patterns`;  // TOO EARLY!
  const sanitized = sanitizeContentId(contentId);  // TOO LATE!
}

// AFTER (SECURE):
async function fetchAppliedPatterns(contentId: string, redis: Redis, store: string) {
  const sanitized = sanitizeContentId(contentId);  // FIRST!
  if (!sanitized || sanitized.length === 0) return [];
  const appliedKey = `content:performance:${sanitized}:applied_patterns`;  // NOW OK
}
```

**Test:**
```typescript
// Attack attempt should be sanitized:
const malicious = "test:evil:inject";  // Contains colons
const safe = sanitizeContentId(malicious);  // -> "testevilinject"
```

---

### CRITICAL-1: Unbounded Metrics (2 hours)
**File:** `planning/seo/lib/performance-feedback.ts`

**Quick Fix:**
```typescript
function validateMetricsBounds(metrics: ContentPerformanceMetrics): boolean {
  // Ranking: 1-100
  if (metrics.averageRanking < 1 || metrics.averageRanking > 100) return false;
  if (metrics.peakRanking < 1 || metrics.peakRanking > 100) return false;

  // Must be finite (not NaN, not Infinity)
  if (!Number.isFinite(metrics.impressions) || metrics.impressions < 0) return false;
  if (!Number.isFinite(metrics.clicks) || metrics.clicks < 0) return false;

  // CTR: 0.0-1.0
  if (metrics.ctr < 0 || metrics.ctr > 1) return false;

  return true;
}

// USE IN updatePatternFromPerformance():
if (!validateMetricsBounds(metrics)) {
  throw new PerformanceFeedbackError(
    `Invalid metrics for pattern ${appliedPattern.patternId}`,
    'VALIDATION_FAILED'
  );
}
```

**Test:**
```typescript
// Should reject invalid values
validateMetricsBounds({ averageRanking: -5, ... });  // false
validateMetricsBounds({ ctr: 2.5, ... });           // false
validateMetricsBounds({ averageRanking: NaN, ... }); // false
```

---

### CRITICAL-5: Unbounded Redis Operations (3 hours)
**File:** `planning/seo/lib/performance-feedback.ts`

**Quick Fix:**
```typescript
const MAX_PATTERNS_TO_SCAN = 1000;

// BEFORE (VULNERABLE):
const patternKeys = await redis.keys(`${store}:*`);  // Blocks Redis!

// AFTER (SECURE):
let cursor = '0';
let scannedPatterns = 0;
const patternKeys: string[] = [];

do {
  const [newCursor, keys] = await redis.scan(
    cursor,
    'MATCH',
    `${store}:*`,
    'COUNT',
    100
  );

  patternKeys.push(...keys);
  cursor = newCursor;
  scannedPatterns += keys.length;

  if (scannedPatterns >= MAX_PATTERNS_TO_SCAN) break;
} while (cursor !== '0');
```

---

## Remediation Checklist (Priority Order)

### Phase 0 (Immediate - 24-48 hours)
```
[ ] CRITICAL-4: Fix shell validation order
[ ] CRITICAL-2: Move sanitization before key construction
[ ] CRITICAL-1: Add metric bounds validation
[ ] Code review Phase 0 changes
[ ] Unit test Phase 0 changes
[ ] Deploy Phase 0 fixes
```

### Phase 1 (This Week - 5 days)
```
[ ] CRITICAL-3: Validate pattern IDs before storage
[ ] CRITICAL-5: Implement rate limiting and SCAN
[ ] HIGH-1: Add timestamp validation (no future dates)
[ ] HIGH-2: Fix SSRF in URL validation
[ ] HIGH-3: Improve type guard validation
[ ] HIGH-4: Remove error object from exceptions
[ ] HIGH-5: Validate algorithm update data
[ ] Code review Phase 1 changes
[ ] Integration test Phase 1 changes
[ ] Deploy Phase 1 fixes
```

### Phase 2 (Next Sprint - 7 days)
```
[ ] MEDIUM-1 through MEDIUM-8 fixes
[ ] Add concurrency control (Redis transactions)
[ ] Add retry logic with exponential backoff
[ ] Standardize JSON parsing
[ ] Security re-audit
```

---

## Quick Test Commands

### Shell Script Testing
```bash
# Valid usage (should work)
./ingest-performance.sh --content-id "blog-post-123" --source gsc --mock-data

# Command injection attempt (should FAIL)
./ingest-performance.sh --content-id '$(whoami)' --source gsc --mock-data

# Backtick injection (should FAIL)
./ingest-performance.sh --content-id 'test`id`post' --source gsc --mock-data

# Semicolon injection (should FAIL)
./ingest-performance.sh --content-id 'test; rm -rf /' --source gsc --mock-data
```

### TypeScript Unit Tests
```bash
# Run security-specific tests
npm test -- planning/seo/tests/security.test.ts

# Test metric validation
npm test -- --grep "metric.*bound"

# Test Redis injection prevention
npm test -- --grep "redis.*inject"

# Test URL validation
npm test -- --grep "ssrf|localhost|metadata"
```

---

## File Locations

| Document | Path |
|----------|------|
| Full Audit Report | `/planning/reports/security/STEP_13_SECURITY_AUDIT.md` |
| Remediation Guide | `/planning/reports/security/STEP_13_REMEDIATION_GUIDE.md` |
| Findings (JSON) | `/planning/reports/security/STEP_13_SECURITY_FINDINGS.json` |
| Summary (TXT) | `/planning/reports/security/STEP_13_AUDIT_SUMMARY.txt` |
| Quick Reference | `/planning/reports/security/STEP_13_QUICK_REFERENCE.md` |

---

## Key Validation Patterns to Implement

### 1. Content ID Validation
```typescript
const CONTENT_ID_REGEX = /^[a-zA-Z0-9_-]{3,128}$/;

function validateContentId(id: string): boolean {
  return CONTENT_ID_REGEX.test(id);
}
```

### 2. Metric Bounds Validation
```typescript
function isValidMetricValue(value: unknown, min: number, max: number): boolean {
  return typeof value === 'number' &&
         Number.isFinite(value) &&
         value >= min &&
         value <= max;
}
```

### 3. Timestamp Validation
```typescript
function isValidTimestamp(date: Date): boolean {
  const now = new Date();
  const maxAge = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000); // 2 years
  return date <= now && date >= maxAge;
}
```

### 4. URL Validation (SSRF Prevention)
```typescript
function isValidUrl(url: string): boolean {
  const parsed = new URL(url);
  const hostname = parsed.hostname || '';

  // Block local addresses
  if (['localhost', '127.0.0.1', '::1'].includes(hostname)) return false;

  // Block private IPs
  if (/^(10|172|192\.168)\./.test(hostname)) return false;

  // Block AWS metadata
  if (hostname.includes('169.254.169.254')) return false;

  return true;
}
```

### 5. Safe JSON Parsing
```typescript
function safeJsonParse<T>(json: string, validator?: (v: unknown) => v is T): T | null {
  try {
    const parsed = JSON.parse(json);
    if (validator && !validator(parsed)) return null;
    return parsed as T;
  } catch {
    return null;
  }
}
```

---

## Security Testing Checklist

### Input Validation Tests
- [ ] Test with negative numbers (rankings, counts)
- [ ] Test with NaN and Infinity values
- [ ] Test with zero and very large numbers
- [ ] Test with empty strings
- [ ] Test with special characters (colons, quotes, backticks)
- [ ] Test with Unicode and multibyte characters

### Injection Prevention Tests
- [ ] Redis key injection with colons
- [ ] Shell command injection with backticks
- [ ] Shell command injection with $(...)
- [ ] Shell command injection with semicolons
- [ ] JSON parsing with malformed data

### SSRF Prevention Tests
- [ ] http://localhost
- [ ] http://127.0.0.1
- [ ] http://169.254.169.254 (AWS metadata)
- [ ] http://10.0.0.1 (private IP range)
- [ ] http://192.168.1.1 (private IP range)

### Concurrency Tests
- [ ] Simultaneous pattern updates
- [ ] Race condition detection
- [ ] Transaction rollback scenarios

### Resource Exhaustion Tests
- [ ] Very large datasets (1M+ patterns)
- [ ] Unbounded loop iterations
- [ ] Memory growth monitoring

---

## Deployment Validation

After deploying Phase 0 fixes, verify:

```bash
# 1. Compile TypeScript with no errors
npm run build

# 2. Run all tests
npm test

# 3. Check security linter
npm run lint:security

# 4. Verify shell script syntax
shellcheck planning/seo/scripts/ingest-performance.sh

# 5. Manual test cases (see Quick Test Commands above)
```

---

## Communication Template

### For Development Team
```
Priority: CRITICAL (5 vulnerabilities, CVSS 7.0+)

We need to fix command injection and Redis injection vulnerabilities
in Step 13 Performance Tracking before next release.

Phase 0 (48 hours): 5.5 hours of focused work
Phase 1 (1 week):   12.5 hours
Phase 2 (2 weeks):  25 hours

See: /planning/reports/security/STEP_13_SECURITY_AUDIT.md
```

### For Security Review
```
Audit complete: Step 13 Performance Tracking

Findings: 5 Critical, 5 High, 8 Medium vulnerabilities
Confidence: 0.82 (Standard mode audit)
Risk Level: MEDIUM → LOW (after remediation)

See: /planning/reports/security/STEP_13_SECURITY_FINDINGS.json
```

---

## References

- Full Audit: `/planning/reports/security/STEP_13_SECURITY_AUDIT.md`
- OWASP Top 10 (2021): https://owasp.org/Top10/
- CWE-20 (Input Validation): https://cwe.mitre.org/data/definitions/20.html
- CWE-78 (OS Command Injection): https://cwe.mitre.org/data/definitions/78.html
- CVSS v3.1: https://www.first.org/cvss/v3.1/specification-document

---

**Report Status:** FINAL
**Review Date:** 2025-12-02
**Next Audit:** 2025-12-30 (Post-remediation)
