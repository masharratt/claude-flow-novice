# Security Integration Guide - Sprint 2.1

Step-by-step guide for integrating security modules into keyword discovery collectors.

## Pre-Integration Checklist

- [ ] All security tests passing (77/77)
- [ ] Team reviewed security approach
- [ ] Environment variables configured for secrets
- [ ] Rate limiting thresholds tuned to API quotas
- [ ] Error logging configured for server-side
- [ ] Backup of existing collector code created

## Phase 1: Google Suggest Collector

**File:** `.claude/skills/cfn-seo-pipeline/lib/seo/lib/discovery/google-suggest-collector.ts`

### Changes Required

```typescript
// Add imports at top
import { validateInput } from '../security/input-validator';
import { validateURL } from '../security/ssrf-protection';
import { ErrorHandler, ErrorSeverity } from '../security/error-handler';
import { RATE_LIMITERS } from '../security/rate-limiter';

// Update queryGoogleSuggest function
async function queryGoogleSuggest(
  query: string,
  language = 'en',
  country = 'us'
): Promise<string[]> {
  // Add input validation
  const safeQuery = validateInput(query, 'keyword');

  // Build URL
  const url = new URL('https://suggestqueries.google.com/complete/search');
  url.searchParams.set('client', 'firefox');
  url.searchParams.set('q', safeQuery); // Use sanitized query
  url.searchParams.set('hl', language);
  url.searchParams.set('gl', country);

  try {
    // Add SSRF validation
    await validateURL(url.toString());

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`Google Suggest API error (${response.status})`);
    }

    const data = await response.json() as [string, string[]];
    return data[1] || [];
  } catch (error) {
    // Add error sanitization
    const publicError = ErrorHandler.sanitizeForClient(error, {
      category: 'Google Suggest Collector',
      location: 'google-suggest-collector.ts:queryGoogleSuggest',
      severity: ErrorSeverity.MEDIUM,
      timestamp: Date.now()
    });
    console.error(`[Suggest Collector] Error querying "${safeQuery}":`, publicError);
    return [];
  }
}

// Update collectFromGoogleSuggest function
export async function collectFromGoogleSuggest(
  keyword: string,
  options?: SuggestCollectorOptions
): Promise<KeywordSource[]> {
  try {
    // Validate inputs
    const safeKeyword = validateInput(keyword, 'keyword');
    const safeNiche = options?.niche
      ? validateInput(options.niche, 'niche')
      : 'general';
    const taskId = options?.taskId;

    // Check rate limit
    if (taskId) {
      await RATE_LIMITERS.googleSuggest.checkLimit(taskId);
    }

    // Generate and validate variations
    const variations = generateVariations(safeKeyword);

    // Rest of function...
  } catch (error) {
    const publicError = ErrorHandler.sanitizeForClient(error, {
      category: 'Google Suggest Collector',
      location: 'google-suggest-collector.ts:collectFromGoogleSuggest',
      severity: ErrorSeverity.MEDIUM,
      timestamp: Date.now()
    });
    throw new Error(publicError.message);
  }
}
```

## Phase 2: PAA Collector

**File:** `.claude/skills/cfn-seo-pipeline/lib/seo/lib/discovery/paa-collector.ts`

### Changes Required

```typescript
import { validateInput } from '../security/input-validator';
import { validateURL } from '../security/ssrf-protection';
import { ErrorHandler, ErrorSeverity } from '../security/error-handler';
import { RATE_LIMITERS } from '../security/rate-limiter';

export async function collectFromPAA(
  keyword: string,
  options?: PAACollectorOptions
): Promise<KeywordSource[]> {
  try {
    // Validate keyword input
    const safeKeyword = validateInput(keyword, 'keyword');
    const safeNiche = options?.niche
      ? validateInput(options.niche, 'niche')
      : 'general';

    // Check rate limit
    if (options?.taskId) {
      await RATE_LIMITERS.paa.checkLimit(options.taskId);
    }

    // Validate URL before scraping
    const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(safeKeyword)}`;
    await validateURL(googleUrl);

    // Fetch and extract PAA
    const response = await fetch(googleUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      }
    });

    if (!response.ok) {
      throw new Error(`PAA fetch failed (${response.status})`);
    }

    const html = await response.text();
    const paaQuestions = extractPAAQuestions(html, safeKeyword);

    return paaQuestions.map(question => ({
      keyword: question,
      source: 'paa',
      metadata: { questionType: 'other' },
      discoveredAt: new Date().toISOString(),
      cacheHit: false
    }));
  } catch (error) {
    const publicError = ErrorHandler.sanitizeForClient(error, {
      category: 'PAA Collector',
      location: 'paa-collector.ts:collectFromPAA',
      severity: ErrorSeverity.MEDIUM,
      timestamp: Date.now()
    });
    throw new Error(publicError.message);
  }
}
```

## Phase 3: Social Collector

**File:** `.claude/skills/cfn-seo-pipeline/lib/seo/lib/discovery/social-collector.ts`

### Changes Required

```typescript
import { validateInput } from '../security/input-validator';
import { validateURL } from '../security/ssrf-protection';
import { ErrorHandler, ErrorSeverity } from '../security/error-handler';
import { RATE_LIMITERS } from '../security/rate-limiter';

export async function collectFromSocial(
  keyword: string,
  options?: SocialCollectorOptions
): Promise<KeywordSource[]> {
  const results: KeywordSource[] = [];

  try {
    // Validate inputs
    const safeKeyword = validateInput(keyword, 'keyword');
    const safeNiche = options?.niche
      ? validateInput(options.niche, 'niche')
      : 'general';

    // Check rate limit
    if (options?.taskId) {
      await RATE_LIMITERS.reddit.checkLimit(options?.taskId);
    }

    // Query Reddit with validated inputs
    const redditResults = await queryReddit(safeKeyword, options);
    results.push(...redditResults);

    // Query Quora with validated inputs
    const quoraResults = await queryQuora(safeKeyword, options);
    results.push(...quoraResults);

    return results;
  } catch (error) {
    const publicError = ErrorHandler.sanitizeForClient(error, {
      category: 'Social Collector',
      location: 'social-collector.ts:collectFromSocial',
      severity: ErrorSeverity.MEDIUM,
      timestamp: Date.now()
    });
    throw new Error(publicError.message);
  }
}

async function queryReddit(
  keyword: string,
  options?: SocialCollectorOptions
): Promise<KeywordSource[]> {
  try {
    // Build and validate URL
    const url = `https://api.reddit.com/search?q=${encodeURIComponent(keyword)}`;
    await validateURL(url);

    const response = await fetch(url, {
      headers: { 'User-Agent': 'SEO-Pipeline/1.0' }
    });

    if (!response.ok) {
      throw new Error(`Reddit API error (${response.status})`);
    }

    // Process response...
    return [];
  } catch (error) {
    console.error('Reddit query failed:',
      ErrorHandler.sanitizeForClient(error, {
        category: 'Reddit Query',
        location: 'social-collector.ts:queryReddit',
        severity: ErrorSeverity.MEDIUM,
        timestamp: Date.now()
      })
    );
    return [];
  }
}
```

## Phase 4: GSC Collector

**File:** `.claude/skills/cfn-seo-pipeline/lib/seo/lib/discovery/gsc-collector.ts`

### Changes Required

```typescript
import { validateInput } from '../security/input-validator';
import { ErrorHandler, ErrorSeverity } from '../security/error-handler';
import { RATE_LIMITERS } from '../security/rate-limiter';

export async function collectFromGSC(
  options: GSCCollectorOptions
): Promise<KeywordSource[]> {
  try {
    // Validate URL format
    const safeSiteUrl = validateInput(options.siteUrl, 'siteUrl');

    // Check rate limit
    await RATE_LIMITERS.gsc.checkLimit(options.taskId);

    // GSC API call with validated URL
    const response = await queryGSCAPI(safeSiteUrl, {
      startDate: options.startDate,
      endDate: options.endDate,
      limit: options.limit
    });

    return response.map(item => ({
      keyword: item.query,
      source: 'gsc',
      metadata: {
        impressions: item.impressions,
        clicks: item.clicks,
        position: item.position
      },
      discoveredAt: new Date().toISOString(),
      cacheHit: false
    }));
  } catch (error) {
    const publicError = ErrorHandler.sanitizeForClient(error, {
      category: 'GSC Collector',
      location: 'gsc-collector.ts:collectFromGSC',
      severity: ErrorSeverity.HIGH, // GSC is auth-required
      timestamp: Date.now()
    });
    throw new Error(publicError.message);
  }
}
```

## Phase 5: Update Index/Orchestrator

**File:** `.claude/skills/cfn-seo-pipeline/lib/seo/lib/discovery/index.ts`

### Changes Required

Add error wrapping to batch operations:

```typescript
import {
  validateInput,
  validateInputBatchSoft
} from '../security/input-validator';
import {
  ErrorHandler,
  ErrorSeverity
} from '../security/error-handler';

// In executeBatchCollectors function
export async function executeBatchCollectors(
  params: CollectorParams,
  collectorNames: string[] = []
): Promise<BatchCollectorResult> {
  const startTime = Date.now();
  const results: CollectorResult[] = [];
  const allKeywords: KeywordSource[] = [];

  try {
    // Validate batch inputs
    const safeNiche = params.niche
      ? validateInput(params.niche, 'niche')
      : undefined;
    const safeTaskId = validateInput(params.taskId, 'taskId');

    // Filter safe keywords
    const safeSeeds = params.seedKeywords
      ? validateInputBatchSoft(params.seedKeywords, 'keyword')
      : [];

    // Update params with safe values
    const safeParams = {
      ...params,
      taskId: safeTaskId,
      niche: safeNiche,
      seedKeywords: safeSeeds
    };

    // Rest of execution...
  } catch (error) {
    const publicError = ErrorHandler.sanitizeForClient(error, {
      category: 'Keyword Discovery',
      location: 'discovery/index.ts:executeBatchCollectors',
      severity: ErrorSeverity.MEDIUM,
      timestamp: Date.now()
    });
    throw new Error(publicError.message);
  }
}
```

## Testing After Integration

### Unit Tests

Run security-specific tests:
```bash
npm test -- security/__tests__/security-integration.test.ts
```

Expected: 77/77 tests passing

### Integration Tests

Test each collector with security checks:

```bash
# Google Suggest with XSS payload
npm test -- google-suggest-collector.test.ts -- --testNamePattern="should reject XSS"

# PAA with SQLi payload
npm test -- paa-collector.test.ts -- --testNamePattern="should reject SQLi"

# Social with malicious URLs
npm test -- social-collector.test.ts -- --testNamePattern="should validate URLs"
```

### Manual Testing Checklist

- [ ] Test with XSS payload: `<script>alert('xss')</script>`
- [ ] Test with SQLi payload: `' OR '1'='1`
- [ ] Test with SSRF: `http://localhost:6379`
- [ ] Test with malformed input: empty string, null bytes
- [ ] Test rate limiting: >100 requests to Google Suggest
- [ ] Test error messages: no internal paths/IPs exposed
- [ ] Test batch operations: mix of valid/invalid inputs

### Performance Testing

Measure overhead:
```bash
npm run benchmark -- discovery/security-overhead.bench.ts
```

Expected impact: <5% latency increase

## Rollback Procedure

If security integration breaks collectors:

1. **Restore from backups:**
   ```bash
   cp /tmp/security-backups/*.bak .claude/skills/cfn-seo-pipeline/lib/seo/lib/discovery/
   ```

2. **Revert git changes:**
   ```bash
   git checkout HEAD -- .claude/skills/cfn-seo-pipeline/lib/seo/lib/discovery/
   ```

3. **Disable security validation (temporary):**
   ```typescript
   // In each collector, wrap security calls with try-catch:
   let safeKeyword = keyword;
   try {
     safeKeyword = validateInput(keyword, 'keyword');
   } catch {
     // Fall back to original if validation fails
     console.warn('Security validation failed, using original input');
   }
   ```

## Monitoring & Observability

### Logging

All errors are logged with:
- Severity level
- Category
- Location
- Timestamp
- Sensitive data REDACTED

Example log entry:
```json
{
  "severity": "medium",
  "category": "Google Suggest Collector",
  "location": "google-suggest-collector.ts:queryGoogleSuggest",
  "message": "API rate limit exceeded",
  "sanitized": "API rate limit exceeded",
  "timestamp": "2025-12-04T07:10:05.257Z"
}
```

### Metrics to Track

1. **Security Events:**
   - XSS attempts blocked
   - SQLi attempts blocked
   - SSRF attempts blocked
   - Rate limit violations
   - Invalid input rejections

2. **Performance:**
   - Validation latency (ms)
   - Rate limiter overhead (ms)
   - Error sanitization latency (ms)

3. **Availability:**
   - Collector uptime
   - Rate limit hit rate
   - Error rate by type

## Compliance Verification

### Security Checklist

- [ ] Input validation on all user-controlled inputs
- [ ] XSS protection (script tags, event handlers, protocols)
- [ ] SQLi protection (OR/AND patterns, UNION, DROP)
- [ ] SSRF protection (private IPs, dangerous ports, domains)
- [ ] Rate limiting on all external API calls
- [ ] Error messages sanitized (no paths, IPs, credentials)
- [ ] No hardcoded secrets in code
- [ ] Secrets loaded from environment variables
- [ ] Error logging on server-side only
- [ ] Public errors are generic/helpful

### OWASP Compliance

- ✓ A01:2021 – Broken Access Control (SSRF prevention)
- ✓ A02:2021 – Cryptographic Failures (error sanitization)
- ✓ A03:2021 – Injection (input validation, rate limiting)
- ✓ A04:2021 – Insecure Design (security by design)
- ✓ A08:2021 – Software and Data Integrity Failures (rate limiting)

## Support & Escalation

### Common Issues

**Issue:** Rate limit errors for valid requests
- **Solution:** Increase rate limiter thresholds in `RATE_LIMITERS`
- **File:** `rate-limiter.ts:RATE_LIMITERS`

**Issue:** Valid input rejected as XSS
- **Solution:** Update `VALIDATION_RULES` pattern
- **File:** `input-validator.ts:VALIDATION_RULES`

**Issue:** URLs failing SSRF validation
- **Solution:** Add domain to whitelist via `addWhitelistedDomain()`
- **File:** `ssrf-protection.ts:addWhitelistedDomain()`

### Emergency Contacts

- Security Team: [contact info]
- On-Call: [contact info]
- Escalation: [contact info]

## Post-Integration Sign-off

- [ ] All tests passing (77/77)
- [ ] Security review completed
- [ ] Performance benchmarks acceptable (<5% overhead)
- [ ] Error handling verified
- [ ] Logging configured
- [ ] Documentation updated
- [ ] Team trained on new security modules
- [ ] Monitoring alerts configured
- [ ] Backup procedures documented
- [ ] Rollback plan tested

**Sign-off Date:** ___________
**Security Lead:** ___________
**Engineering Lead:** ___________
