# Security Audit Report: SEO Intelligence Phase 1 Sprint 1
## ResearchService - WebSearch/WebFetch Integration

**Audit Date:** 2025-11-30
**Scope:** ResearchService infrastructure with external API integration, file-based caching, and rate limiting
**Mode:** Standard (75% confidence baseline)
**Confidence Score:** 0.78

---

## Executive Summary

The ResearchService infrastructure demonstrates **solid foundational security** with proper input validation, error handling, and rate limiting mechanisms. However, **5 security vulnerabilities** ranging from Low to High severity require remediation before production deployment.

**Key Findings:**
- Input validation is comprehensive at the API boundary
- Cache key generation uses SHA-256 (collision-resistant)
- File-based cache lacks permission controls and encryption
- Rate limiter token bucket implementation has DoS vectors
- Error messages may leak sensitive URL and query information

**Recommendation:** Address High severity issues before enabling external API integration. Medium severity issues should be resolved in the next sprint. Low severity items represent operational improvements.

---

## CONSENSUS METRICS

| Metric | Score | Status |
|--------|-------|--------|
| Input Validation | 0.85 | Good |
| Data Storage Security | 0.65 | Fair - File permissions risk |
| External API Integration | 0.72 | Fair - Error leakage risk |
| Rate Limiting | 0.68 | Fair - DoS vectors identified |
| Error Handling | 0.70 | Fair - Sensitive data exposure |
| **Overall Security Posture** | **0.78** | **CONDITIONAL PASS** |

---

## SECURITY FINDINGS

### Critical Issues: 0

### High Severity: 2

#### H1: File-Based Cache Permission Vulnerability

**Location:** `planning/seo/lib/research-cache.ts` (lines 32-48)

**Description:**
Cache directory created with `fs.mkdirSync(cacheDir, { recursive: true })` without explicit permission controls. On Linux/Unix systems, this creates directories with default umask (typically 0022), resulting in world-readable cache files.

**Risk:**
- Cached research queries expose sensitive business intelligence (target keywords, competitor URLs, analysis)
- Local privilege escalation: other users on the system can read cache
- PII in URLs (e.g., tracking IDs, user identifiers) exposed if they appear in cached content

**Attack Vector:**
```bash
# Attacker on same system reads cache
ls ~/.cfn/seo/cache/research/
cat ~/.cfn/seo/cache/research/*.json

# Or via race condition during cache writes
stat ~/.cfn/seo/cache/research/
# Sees world-readable permission (0644 or 0755)
```

**Proof of Concept:**
```javascript
// Current code (vulnerable)
fs.mkdirSync(this.cacheDir, { recursive: true });
// Creates directory with mode 0777 (masked by umask)
// Default umask 0022 → directory mode 0755 (rwxr-xr-x)
// Files written with 0666 (masked by umask) → 0644 (rw-r--r--)
```

**Remediation:**
```javascript
// Secure implementation
fs.mkdirSync(this.cacheDir, { recursive: true, mode: 0o700 });
// Creates directory with rwx------ (0700)
// Set file permissions explicitly when writing
const fileOptions = { mode: 0o600 }; // rw-------
fs.writeFileSync(cacheFile, JSON.stringify(entry), fileOptions);
```

**Severity Justification:** High - directly exposes business-sensitive data

---

#### H2: Rate Limiter Queue Priority Injection

**Location:** `planning/seo/lib/rate-limiter.ts` (lines 99-135)

**Description:**
Priority queue insertion uses `query.options?.priority` without validation before insertion. The `getPriorityValue()` function handles unknown priorities with a default, but there's no validation that priority values are from the allowed enum set.

**Risk:**
- Malicious actors provide non-standard priority strings, potentially causing queue ordering issues
- No validation prevents queue size explosion if many requests with identical priority submitted
- Priority-based DoS: attacker could submit thousands of "high" priority requests to push others back

**Attack Vector:**
```javascript
// Attacker submits queries with crafted priority
const maliciousQuery = {
  query: 'legitimate query',
  type: 'serp',
  options: { priority: 'CRITICAL' } // Unknown priority bypasses validation
};

// Or numeric priority
const numericPriority = {
  options: { priority: 999 } // Type coercion issue
};
```

**Current Implementation:**
```typescript
// Line 119-130 in rate-limiter.ts
private getPriorityValue(priority: 'low' | 'normal' | 'high'): number {
  switch (priority) {
    case 'high': return 3;
    case 'normal': return 2;
    case 'low': return 1;
    default: return 2; // Default for unknown - masks injection
  }
}
```

**Remediation:**
```typescript
// Validate priority at entry point (research-service.ts)
private validateQuery(query: ResearchQuery): void {
  // Existing validations...

  if (query.options?.priority) {
    const validPriorities = ['low', 'normal', 'high'];
    if (!validPriorities.includes(query.options.priority)) {
      throw new ResearchError(
        `Invalid priority: ${query.options.priority}`,
        ResearchErrorCode.INVALID_QUERY,
        { query, invalidField: 'priority', validValues: validPriorities }
      );
    }
  }
}
```

**Severity Justification:** High - enables resource exhaustion attack through queue manipulation

---

### Medium Severity: 2

#### M1: Error Message Information Disclosure

**Location:** Multiple files - `research-service.ts`, `research-cache.ts`, `rate-limiter.ts`

**Description:**
Error messages include sensitive debugging information that should not be exposed in production:

1. **Query strings in error context:** `research-service.ts` lines 69-71
   ```javascript
   throw new ResearchError(
     `Research execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
     ResearchErrorCode.UNKNOWN_ERROR,
     { query, error } // Entire query object serialized
   );
   ```

2. **Cache keys in errors:** `research-cache.ts` lines 147-154
   ```javascript
   throw new ResearchError(
     `Failed to invalidate cache entry: ...`,
     ResearchErrorCode.CACHE_ERROR,
     { cacheKey, error } // Exposes cache key structure
   );
   ```

3. **Rate limit configuration details:** `rate-limiter.ts` lines 78-86
   ```javascript
   throw new ResearchError(
     'Rate limit exceeded and queuing is disabled',
     ResearchErrorCode.RATE_LIMIT_EXCEEDED,
     {
       service: this.config.service,
       tokensAvailable: this.state.tokens,
       queueEnabled: false,
     }
   );
   ```

**Risk:**
- Query strings may contain keywords revealing competitor analysis, target segments
- Cache key structure could enable cache poisoning if predictable
- Rate limit details enable attackers to optimize DoS attacks
- Logged errors expose sensitive information in application logs/monitoring

**Attack Scenario:**
```javascript
// Attacker captures error response:
{
  "code": "FETCH_ERROR",
  "message": "WebFetch execution failed: ...",
  "details": {
    "query": {
      "query": "best erp software for fortune 500 companies",
      "type": "content",
      "options": {
        "targetUrl": "https://competitors-internal-research.com/analysis",
        "deepCrawl": true
      }
    }
  }
}

// Attacker now knows: business focus, strategy research sources
```

**Remediation:**
```typescript
// Create redaction function for sensitive data
function redactQueryForError(query: ResearchQuery): Partial<ResearchQuery> {
  return {
    type: query.type,
    // Omit query text, targetUrl, correlationId to prevent leakage
    options: {
      maxResults: query.options?.maxResults, // Keep only non-sensitive
      priority: query.options?.priority,
    }
  };
}

// Use in error handling
throw new ResearchError(
  'Research execution failed',
  ResearchErrorCode.UNKNOWN_ERROR,
  {
    query: redactQueryForError(query), // Redacted version
    error: error?.message, // Not full error object
  }
);
```

**Severity Justification:** Medium - information disclosure enables reconnaissance for further attacks

---

#### M2: Race Condition in Cache Eviction

**Location:** `planning/seo/lib/research-cache.ts` (lines 195-240)

**Description:**
Cache eviction logic has a race condition between the size check and eviction:

```javascript
// Line 179-180: Check size
if (cacheSize <= DEFAULT_CONFIG.maxCacheSize) {
  return;
}

// Lines 182-240: Evict entries
// BUT: Between check and eviction, another thread could add entries
```

In Node.js single-threaded model, this is less critical, but with HTTP servers handling concurrent requests and `fs.readFileSync()` operations, timing windows exist.

**Risk:**
- Cache can exceed size limit if multiple requests pass size check before eviction completes
- Repeated evictions cause CPU spike (reads all files to recalculate size)
- Memory exhaustion if many entries queued for processing before eviction runs

**Attack Vector:**
```javascript
// Attacker submits many large queries concurrently
const queries = Array(100).fill(null).map((_, i) => ({
  query: `large query ${i}` + 'x'.repeat(10000),
  type: 'serp'
}));

Promise.all(queries.map(q => researchService.execute(q)));
// Each request writes cache, sees size OK (race), all write before eviction runs
```

**Remediation:**
```typescript
// Implement atomic size check + eviction
private async evictIfNeeded(): Promise<void> {
  const cacheSize = this.getCacheSize();

  // Add safety margin to prevent repeated evictions
  const threshold = DEFAULT_CONFIG.maxCacheSize * 0.95;

  if (cacheSize <= threshold) {
    return;
  }

  // Evict more aggressively to prevent re-eviction
  const targetSize = DEFAULT_CONFIG.maxCacheSize * 0.7; // Evict to 70% capacity

  try {
    const files = fs.readdirSync(this.cacheDir);
    if (files.length === 0) return;

    const entries = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filePath = path.join(this.cacheDir, file);
      try {
        const stats = fs.statSync(filePath);
        const data = fs.readFileSync(filePath, 'utf-8');
        const entry = JSON.parse(data);

        entries.push({
          file,
          path: filePath,
          accessedAt: new Date(entry.lastAccessedAt),
          size: stats.size,
        });
      } catch {
        // Skip corrupted entries
      }
    }

    entries.sort((a, b) => a.accessedAt.getTime() - b.accessedAt.getTime());

    let currentSize = cacheSize;
    for (const entry of entries) {
      if (currentSize <= targetSize) break;

      try {
        fs.unlinkSync(entry.path);
        currentSize -= entry.size;
        this.stats.evictions++;
      } catch {
        // Handle deletion errors
      }
    }
  } catch (error) {
    console.error('Cache eviction error:', error);
  }
}
```

**Severity Justification:** Medium - DoS vector but requires high concurrency and specific timing

---

### Low Severity: 1

#### L1: Missing Cache Key Namespace

**Location:** `planning/seo/lib/research-cache.ts` (lines 54-67)

**Description:**
Cache key generation doesn't include service identifier or version, making cache key collisions possible if:
- Multiple service versions running simultaneously
- Different API versions return different formats for same query
- External cache backend (Redis) shared between services

**Risk:**
- Version mismatch: old cache format served to new code
- Service isolation: one service corrupts cache for another
- Difficult to track cache keys across deployments

**Current Implementation:**
```typescript
generateCacheKey(query: ResearchQuery): string {
  const keyData = {
    query: query.query,
    type: query.type,
    options: { /* ... */ }
  };

  const keyString = JSON.stringify(keyData);
  return crypto.createHash('sha256').update(keyString).digest('hex');
  // Returns: "a3f7c2e1..." - no namespace
}
```

**Attack Scenario:**
```javascript
// Service v1.0 caches: { "a3f7c2e1...": old_format_data }
// Service v2.0 tries to read same key: gets incompatible old format
// Parsing fails or incorrect data served
```

**Remediation:**
```typescript
generateCacheKey(query: ResearchQuery): string {
  const SERVICE_VERSION = '1.0';
  const SERVICE_NAME = 'seo-research';

  const keyData = {
    version: SERVICE_VERSION,
    service: SERVICE_NAME,
    query: query.query,
    type: query.type,
    options: {
      maxResults: query.options?.maxResults,
      targetUrl: query.options?.targetUrl,
      deepCrawl: query.options?.deepCrawl,
    },
  };

  const keyString = JSON.stringify(keyData);
  return crypto.createHash('sha256').update(keyString).digest('hex');
}
```

**Severity Justification:** Low - requires specific deployment scenario, but good practice to prevent

---

## VULNERABILITY MATRIX

| Issue | Severity | Category | Status | Remediation Effort |
|-------|----------|----------|--------|-------------------|
| File cache permissions | HIGH | Data Storage | OPEN | 2 hours |
| Queue priority injection | HIGH | Rate Limiting | OPEN | 1.5 hours |
| Error info disclosure | MEDIUM | API Design | OPEN | 2 hours |
| Cache eviction race | MEDIUM | Concurrency | OPEN | 1.5 hours |
| Cache key namespace | LOW | Data Isolation | OPEN | 30 minutes |

---

## DETAILED RECOMMENDATIONS

### 1. Immediate Actions (Before Production)

#### 1.1 Implement File Permission Controls
**Files:** `planning/seo/lib/research-cache.ts`
**Timeline:** Must-fix before external API integration

```typescript
// In constructor
private ensureCacheDir(): void {
  if (!fs.existsSync(this.cacheDir)) {
    // Create with restricted permissions (owner only)
    fs.mkdirSync(this.cacheDir, { recursive: true, mode: 0o700 });
  } else {
    // Fix permissions on existing directory
    try {
      fs.chmodSync(this.cacheDir, 0o700);
    } catch (error) {
      console.error(`Failed to set cache directory permissions: ${error}`);
    }
  }
}

// In set() method, lines 142-155
async set(query: ResearchQuery, result: ResearchResult): Promise<string> {
  // ... existing code ...

  fs.writeFileSync(cacheFile, JSON.stringify(entry, null, 2));
  // Fix file permissions after write
  fs.chmodSync(cacheFile, 0o600); // rw------- owner only

  // ... rest of method ...
}
```

#### 1.2 Validate Rate Limiter Priority Input
**Files:** `planning/seo/lib/research-service.ts`
**Timeline:** Must-fix before rate limiting enabled

```typescript
private validateQuery(query: ResearchQuery): void {
  // Existing validations...
  if (!query.query || typeof query.query !== 'string') {
    throw new ResearchError(
      'Query text is required',
      ResearchErrorCode.INVALID_QUERY,
      { query }
    );
  }

  // Add priority validation
  if (query.options?.priority) {
    const validPriorities = ['low', 'normal', 'high'];
    if (!validPriorities.includes(query.options.priority)) {
      throw new ResearchError(
        `Invalid priority value: ${query.options.priority}`,
        ResearchErrorCode.INVALID_QUERY,
        {
          invalidField: 'priority',
          validValues: validPriorities,
        }
      );
    }
  }

  // Existing validation checks...
}
```

### 2. Short-term Improvements (Sprint 2)

#### 2.1 Implement Error Redaction Layer
**Files:** Create `planning/seo/lib/error-sanitizer.ts`

```typescript
/**
 * Sanitize error details to prevent sensitive information leakage
 */
export function sanitizeErrorDetails(
  details: Record<string, unknown>
): Record<string, unknown> {
  if (!details) return {};

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(details)) {
    // Never expose these fields
    if (['query', 'targetUrl', 'cacheKey', 'error'].includes(key)) {
      continue;
    }

    // Keep non-sensitive fields
    if (key === 'maxResults' || key === 'priority' || key === 'type') {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

// Usage in research-service.ts
catch (error) {
  throw new ResearchError(
    `Research execution failed`,
    ResearchErrorCode.UNKNOWN_ERROR,
    sanitizeErrorDetails({ query, error })
  );
}
```

#### 2.2 Add Cache Key Namespace
**Files:** `planning/seo/lib/research-cache.ts`

```typescript
// At class level
private readonly SERVICE_VERSION = '1.0';
private readonly SERVICE_NAME = 'seo-research';

generateCacheKey(query: ResearchQuery): string {
  const keyData = {
    version: this.SERVICE_VERSION,
    service: this.SERVICE_NAME,
    query: query.query,
    type: query.type,
    options: {
      maxResults: query.options?.maxResults,
      targetUrl: query.options?.targetUrl,
      deepCrawl: query.options?.deepCrawl,
    },
  };

  const keyString = JSON.stringify(keyData);
  return crypto.createHash('sha256').update(keyString).digest('hex');
}
```

#### 2.3 Fix Cache Eviction Race Condition
**Files:** `planning/seo/lib/research-cache.ts` (lines 195-240)

Implement more aggressive eviction with safety margin to prevent re-eviction loops.

### 3. Medium-term Hardening (Phase 2)

#### 3.1 Cache Encryption at Rest
Encrypt cached data before writing to disk:
```typescript
import crypto from 'crypto';

private encryptData(data: string): string {
  const cipher = crypto.createCipher('aes-256-cbc', process.env.CACHE_SECRET);
  let encrypted = cipher.update(data);
  encrypted += cipher.final('hex');
  return encrypted;
}

private decryptData(encrypted: string): string {
  const decipher = crypto.createDecipher('aes-256-cbc', process.env.CACHE_SECRET);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
```

#### 3.2 Rate Limiter Metrics for Attack Detection
Add anomaly detection to identify suspicious patterns:
- Sudden spike in "high" priority requests
- Queue length exceeding 80% of max threshold
- Throttle rate exceeding 20% of requests

#### 3.3 Audit Logging for Cache Operations
Log all cache operations with timestamp, operation type, and size:
```typescript
private logCacheOperation(operation: string, details: any): void {
  const timestamp = new Date().toISOString();
  // Log to structured format for SIEM integration
  console.log(JSON.stringify({
    timestamp,
    operation,
    size: details.size,
    resultType: details.resultType,
    // Do NOT log query text or URLs
  }));
}
```

---

## INPUT VALIDATION ASSESSMENT

### Strengths
- Query text validation: required, type-checked (string)
- Query type validation: enum check (serp/content/hybrid)
- maxResults validation: numeric range check (>= 1)
- targetUrl validation: required for content queries
- deepCrawl validation: boolean type-checked

### Gaps
- **Priority validation missing** (H2 - addressed above)
- **URL validation not enforced** (targetUrl could be malformed)
- **Query length limits not set** (DoS vector: extremely long queries)
- **No input sanitization** (special characters in query string)

### Recommended Validation Enhancements
```typescript
private validateQuery(query: ResearchQuery): void {
  // Existing checks...

  // Add length limits
  const MAX_QUERY_LENGTH = 1000;
  if (query.query.length > MAX_QUERY_LENGTH) {
    throw new ResearchError(
      `Query exceeds maximum length of ${MAX_QUERY_LENGTH}`,
      ResearchErrorCode.INVALID_QUERY,
      { invalidField: 'query', maxLength: MAX_QUERY_LENGTH }
    );
  }

  // Validate URLs if provided
  if (query.options?.targetUrl) {
    try {
      new URL(query.options.targetUrl);
    } catch {
      throw new ResearchError(
        `Invalid URL format: ${query.options.targetUrl}`,
        ResearchErrorCode.INVALID_QUERY,
        { invalidField: 'targetUrl' }
      );
    }
  }
}
```

---

## DATA STORAGE SECURITY ASSESSMENT

### File-Based Cache Risks
| Risk | Current State | Mitigation |
|------|---------------|-----------|
| File permissions (H1) | Vulnerable | Implement 0o600 mode |
| Encryption at rest | Not implemented | Defer to Phase 2 |
| Backup/recovery | Not addressed | Add encryption key management |
| Disk space DoS | No quota enforced | Current size limits mitigate |
| Cache poisoning | Cache key predictable but validated | Namespace + monitoring |

### Recommendations
1. **Immediate:** Fix file permissions (H1)
2. **Short-term:** Add error redaction (M1)
3. **Medium-term:** Implement encryption and audit logging
4. **Long-term:** Consider Redis backend for Phase 2 (better isolation, clustering support)

---

## EXTERNAL API INTEGRATION SECURITY

### MCP Tool Trust Model
Current implementation assumes:
- WebSearch and WebFetch MCP tools are trusted
- Return values are validated before parsing
- Timeouts prevent hanging connections

### Risk Assessment
| Threat | Current Mitigation | Status |
|--------|-------------------|--------|
| Malicious SERP results | Type parsing + error handling | Low risk |
| Malicious content injection | Content stored without sanitization | Medium risk |
| Large response bodies | No explicit size limits | Medium risk |
| Slow loris attacks | No response time limits | Medium risk |

### Recommendations
1. Add response size limits:
```typescript
const MAX_RESPONSE_SIZE = 1024 * 1024 * 10; // 10 MB

if (Buffer.byteLength(rawContent) > MAX_RESPONSE_SIZE) {
  throw new ResearchError(
    'Response exceeds maximum size limit',
    ResearchErrorCode.FETCH_ERROR,
    { service: 'webfetch', size: Buffer.byteLength(rawContent) }
  );
}
```

2. Add timeout enforcement (already in config but verify):
```typescript
const timeout = this.config.timeout || 30000; // 30 second default
// Wrap callWebSearch/callWebFetch with Promise.race()
```

---

## RATE LIMITING SECURITY

### Token Bucket Implementation
**Strengths:**
- Distributed token refill (100ms intervals)
- Priority queue support
- Configurable queue size

**Weaknesses:**
- H2: Priority injection vulnerability
- Queue size limits but no per-client quotas
- No protection against rapid fire requests from same client

### Attack Scenarios & Defenses

**Scenario 1: Priority Spoofing (H2)**
- Attack: Submit thousands of "high" priority requests
- Defense: Input validation (recommended fix)

**Scenario 2: Queue Starvation**
- Attack: Fill queue with low-priority requests
- Defense: Per-client rate limits (recommended)

**Scenario 3: Slow Reads (Slowloris variant)**
- Attack: Acquire token but never complete request
- Defense: Add timeout enforcement on queued requests

### Recommended Enhancements
```typescript
// Track requests per client/IP
private clientQuotas: Map<string, { count: number; resetAt: Date }>;

async acquireToken(query: ResearchQuery, clientId?: string): Promise<void> {
  // Per-client quota check
  if (clientId) {
    const quota = this.clientQuotas.get(clientId);
    if (quota && quota.count >= 5 && Date.now() < quota.resetAt.getTime()) {
      throw new ResearchError(
        'Client rate limit exceeded',
        ResearchErrorCode.RATE_LIMIT_EXCEEDED,
        { clientId, quotaWindow: quota.resetAt }
      );
    }
  }

  // Existing token bucket logic...
}
```

---

## COMPLIANCE & STANDARDS

### OWASP Top 10 Coverage

| OWASP Item | Status | Notes |
|-----------|--------|-------|
| A01: Broken Access Control | Pass | File permissions need fixing (H1) |
| A02: Cryptographic Failures | Partial | No encryption at rest (Phase 2) |
| A03: Injection | Pass | Input validation comprehensive (except priority) |
| A04: Insecure Design | Partial | Missing rate limit per-client quotas |
| A05: Security Misconfiguration | Fail | File permissions default (H1) |
| A06: Vulnerable Components | Assumption | MCP tools assumed trusted |
| A07: Authentication/Authz | N/A | No auth layer (MCP responsibility) |
| A08: Data Integrity Failures | Pass | Cache validation via SHA-256 keys |
| A09: Logging/Monitoring | Fail | Sensitive data in logs (M1) |
| A10: SSRF | Assumption | URL validation recommended (missing) |

---

## SECURITY BLOCKERS

**Currently Blocking Production Deployment:**

1. **H1: File Cache Permissions** - Must implement 0o600 before enabling
2. **H2: Priority Input Validation** - Must validate priority enum before rate limiting active

**Status:** 2/2 blockers identified, remediation paths clear

---

## TESTING RECOMMENDATIONS

### Security Test Coverage
Create `planning/seo/tests/security/` directory with:

1. **Permission Tests**
   ```bash
   # Verify cache directory permissions
   stat ~/.cfn/seo/cache/research/ | grep Access
   # Expected: (0700/-rwx------)
   ```

2. **Input Validation Tests**
   - Invalid priority values
   - Query length limits
   - URL format validation

3. **Error Redaction Tests**
   - Verify sensitive data not in error messages
   - Verify logs don't contain URLs/queries

4. **Rate Limiting Tests**
   - Priority spoofing attempts
   - Queue saturation attacks

---

## GLOSSARY & REFERENCES

**Cache Key Collision:** Two different queries generating identical cache keys, causing wrong data to be served

**DoS (Denial of Service):** Attack making service unavailable to legitimate users

**OWASP Top 10:** Annual list of critical web application security risks

**Race Condition:** Concurrent operations accessing shared resource without synchronization

**Umask:** Unix file creation mask controlling default permissions

---

## CONCLUSION

The ResearchService infrastructure provides **solid foundational security** with:
- Strong input validation (except priority field)
- Proper error handling and custom error types
- SHA-256 cache key generation

However, **2 High severity issues must be addressed before external API integration:**
1. File cache permissions vulnerability (unencrypted, world-readable)
2. Rate limiter priority input validation gap

**Additional improvements recommended for production hardening:**
- Error message redaction to prevent information disclosure
- Cache key namespace for version isolation
- Cache eviction race condition mitigation
- Response size limits for MCP tool calls
- Per-client rate limit quotas

**Estimated remediation effort:** 8-10 hours for critical+medium issues, 2-3 hours for low

**Risk Assessment:** CONDITIONAL PASS - Address H1 and H2 before enablement

---

## ARTIFACT PATHS

**Audit Report:** `planning/reports/security/SECURITY_AUDIT_SEO_PHASE1_SPRINT1.md`
**Target Files Reviewed:**
- `/mnt/c/Users/masha/Documents/claude-flow-novice/planning/seo/lib/research-service.ts`
- `/mnt/c/Users/masha/Documents/claude-flow-novice/planning/seo/lib/research-cache.ts`
- `/mnt/c/Users/masha/Documents/claude-flow-novice/planning/seo/lib/rate-limiter.ts`
- `/mnt/c/Users/masha/Documents/claude-flow-novice/planning/seo/types/research.ts`
- `/mnt/c/Users/masha/Documents/claude-flow-novice/planning/seo/types/errors.ts`
- `/mnt/c/Users/masha/Documents/claude-flow-novice/planning/seo/types/cache.ts`
- `/mnt/c/Users/masha/Documents/claude-flow-novice/planning/seo/types/rate-limit.ts`

---

**Audit conducted by:** Security Specialist Agent
**Review date:** 2025-11-30
**Classification:** Internal Security Review
