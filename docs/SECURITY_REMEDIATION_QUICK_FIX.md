# Security Remediation Quick Fix Guide - Sprint 2.1

**Status:** ITERATE REQUIRED
**Critical Vulns:** 3 (Must fix before production)
**High Vulns:** 7 (Before beta)
**Estimated Fix Time:** 12-15 hours

---

## Phase 1: Critical Fixes (First 24 Hours)

### 1. Create Input Validation Module

**File:** `.claude/skills/cfn-seo-pipeline/lib/seo/lib/discovery/validation.ts` (NEW)

```typescript
/**
 * Input validation module for keyword discovery
 * Validates all user-controlled parameters to prevent injection attacks
 */

export class ValidationError extends Error {
  constructor(
    public field: string,
    public reason: string
  ) {
    super(`Invalid ${field}: ${reason}`);
    this.name = 'ValidationError';
  }
}

/**
 * Validate niche parameter
 * Max 200 chars, alphanumeric+space+hyphen+underscore only
 */
export function validateNiche(niche: string | undefined): string {
  if (!niche) {
    throw new ValidationError('niche', 'Required parameter');
  }

  if (typeof niche !== 'string') {
    throw new ValidationError('niche', 'Must be a string');
  }

  if (niche.length > 200) {
    throw new ValidationError('niche', 'Exceeds maximum length (200 characters)');
  }

  if (!/^[a-zA-Z0-9\s\-_]+$/.test(niche)) {
    throw new ValidationError('niche', 'Contains invalid characters (allowed: a-z, 0-9, spaces, hyphens, underscores)');
  }

  return niche.trim().replace(/\s+/g, ' ');
}

/**
 * Validate seed keyword
 * Max 500 chars, no null bytes or control characters
 */
export function validateKeyword(keyword: string, maxLength = 500): string {
  if (!keyword || typeof keyword !== 'string') {
    throw new ValidationError('keyword', 'Must be a non-empty string');
  }

  if (keyword.length > maxLength) {
    throw new ValidationError('keyword', `Exceeds maximum length (${maxLength} characters)`);
  }

  // Remove control characters and null bytes
  const sanitized = keyword.replace(/[\x00-\x1F\x7F]/g, '').trim();

  if (sanitized.length === 0) {
    throw new ValidationError('keyword', 'Cannot be empty after sanitization');
  }

  return sanitized;
}

/**
 * Validate array of keywords
 */
export function validateKeywordArray(keywords: unknown, maxItems = 1000): string[] {
  if (!Array.isArray(keywords)) {
    throw new ValidationError('keywords', 'Must be an array');
  }

  if (keywords.length === 0) {
    throw new ValidationError('keywords', 'Array cannot be empty');
  }

  if (keywords.length > maxItems) {
    throw new ValidationError('keywords', `Exceeds maximum items (${maxItems})`);
  }

  return keywords.map((keyword, idx) => {
    try {
      return validateKeyword(keyword);
    } catch (error) {
      if (error instanceof ValidationError) {
        throw new ValidationError('keywords[' + idx + ']', error.reason);
      }
      throw error;
    }
  });
}

/**
 * Validate taskId parameter
 * UUID format or alphanumeric+hyphen+underscore (max 64 chars)
 */
export function validateTaskId(taskId: string | undefined): string {
  if (!taskId) {
    // Generate default if not provided
    return `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  if (typeof taskId !== 'string') {
    throw new ValidationError('taskId', 'Must be a string');
  }

  // UUID v4 format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (uuidRegex.test(taskId)) {
    return taskId;
  }

  // Alphanumeric with hyphen and underscore
  if (!/^[a-zA-Z0-9\-_]{1,64}$/.test(taskId)) {
    throw new ValidationError('taskId', 'Invalid format (UUID or alphanumeric with hyphens/underscores, max 64 chars)');
  }

  return taskId;
}

/**
 * Validate subreddit name
 * Reddit rules: alphanumeric, underscore, hyphen; max 21 chars
 */
export function validateSubreddit(subreddit: string): string {
  if (!subreddit || typeof subreddit !== 'string') {
    throw new ValidationError('subreddit', 'Must be a non-empty string');
  }

  if (subreddit.length > 21) {
    throw new ValidationError('subreddit', 'Exceeds maximum length (21 characters)');
  }

  if (!/^[a-zA-Z0-9_-]{1,21}$/.test(subreddit)) {
    throw new ValidationError('subreddit', 'Invalid characters (allowed: alphanumeric, underscore, hyphen)');
  }

  if (subreddit.includes('..') || subreddit.includes('/')) {
    throw new ValidationError('subreddit', 'Cannot contain path traversal sequences');
  }

  return subreddit.toLowerCase();
}

/**
 * Validate language code
 * Whitelist of supported languages
 */
export function validateLanguage(language: string): string {
  const SUPPORTED = new Set([
    'en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh', 'ru', 'ar'
  ]);

  if (!SUPPORTED.has(language.toLowerCase())) {
    throw new ValidationError('language', `Unsupported language: ${language} (supported: ${Array.from(SUPPORTED).join(', ')})`);
  }

  return language.toLowerCase();
}

/**
 * Validate country code
 * Whitelist of supported countries
 */
export function validateCountry(country: string): string {
  const SUPPORTED = new Set([
    'us', 'gb', 'ca', 'au', 'de', 'fr', 'jp', 'in', 'br', 'mx',
    'es', 'it', 'nl', 'se', 'ch', 'kr', 'cn', 'ru', 'ae', 'sg'
  ]);

  if (!SUPPORTED.has(country.toLowerCase())) {
    throw new ValidationError('country', `Unsupported country: ${country} (supported: ${Array.from(SUPPORTED).join(', ')})`);
  }

  return country.toLowerCase();
}

/**
 * Validate array of subreddits
 */
export function validateSubreddits(subreddits: unknown): string[] {
  if (!Array.isArray(subreddits) || subreddits.length === 0) {
    throw new ValidationError('subreddits', 'Must be a non-empty array');
  }

  return subreddits.map((sub, idx) => {
    try {
      return validateSubreddit(sub);
    } catch (error) {
      if (error instanceof ValidationError) {
        throw new ValidationError(`subreddits[${idx}]`, error.reason);
      }
      throw error;
    }
  });
}
```

### 2. Create Error Handling Module

**File:** `.claude/skills/cfn-seo-pipeline/lib/seo/lib/discovery/errors.ts` (NEW)

```typescript
/**
 * Sanitized error classes for keyword discovery
 * Never expose internal details to callers
 */

export interface ErrorContext {
  code: string;
  statusCode?: number;
  apiName?: string;
  timestamp: string;
}

/**
 * Base error class - sanitized messages
 */
export class DiscoveryError extends Error {
  public context: ErrorContext;

  constructor(
    code: string,
    message: string,
    statusCode?: number,
    apiName?: string
  ) {
    super(message);
    this.name = 'DiscoveryError';
    this.context = {
      code,
      statusCode,
      apiName,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get user-safe error message (no internal details)
   */
  getUserMessage(): string {
    return this.message;
  }

  /**
   * Log detailed error for debugging (server-side only)
   */
  logDetails(logger: any): void {
    logger.error('[Discovery Error]', {
      code: this.context.code,
      message: this.message,
      statusCode: this.context.statusCode,
      apiName: this.context.apiName,
      timestamp: this.context.timestamp,
      stack: this.stack,
    });
  }
}

/**
 * GSC API specific error
 */
export class GSCError extends DiscoveryError {
  constructor(code: string, message: string, statusCode?: number) {
    super(code, message, statusCode, 'Google Search Console');
  }
}

/**
 * Google Suggest API error
 */
export class SuggestError extends DiscoveryError {
  constructor(code: string, message: string, statusCode?: number) {
    super(code, message, statusCode, 'Google Suggest');
  }
}

/**
 * Reddit API error
 */
export class RedditError extends DiscoveryError {
  constructor(code: string, message: string, statusCode?: number) {
    super(code, message, statusCode, 'Reddit API');
  }
}

/**
 * PAA/DataForSEO API error
 */
export class PAAError extends DiscoveryError {
  constructor(code: string, message: string, statusCode?: number) {
    super(code, message, statusCode, 'DataForSEO SERP API');
  }
}

/**
 * RuVector error
 */
export class RuVectorError extends DiscoveryError {
  constructor(code: string, message: string, statusCode?: number) {
    super(code, message, statusCode, 'RuVector Database');
  }
}
```

### 3. Add Data Sanitization Module

**File:** `.claude/skills/cfn-seo-pipeline/lib/seo/lib/discovery/sanitization.ts` (NEW)

```typescript
/**
 * Data sanitization module
 * Removes dangerous content: scripts, HTML, control characters
 */

/**
 * Sanitize user-generated content
 * Removes: script tags, HTML entities, event handlers, control characters
 */
export function sanitizeText(text: string, maxLength = 500): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  // Remove null bytes and control characters (except newline, tab)
  let sanitized = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Remove script tags and content
  sanitized = sanitized
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
    .replace(/<object[^>]*>.*?<\/object>/gi, '')
    .replace(/<embed[^>]*>/gi, '');

  // Remove event handlers (onclick, onload, etc.)
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');

  // Remove dangerous protocols
  sanitized = sanitized
    .replace(/javascript:/gi, '')
    .replace(/vbscript:/gi, '')
    .replace(/data:text\/html/gi, '');

  // Normalize whitespace
  sanitized = sanitized.trim();

  // Enforce maximum length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength).trim();
  }

  return sanitized;
}

/**
 * Sanitize keywords for storage
 * Removes dangerous patterns while preserving search intent
 */
export function sanitizeKeyword(keyword: string): string {
  const sanitized = sanitizeText(keyword, 500);

  // Remove excessive punctuation
  return sanitized
    .replace(/[^\w\s\-&]/g, '')  // Keep word chars, spaces, hyphens, ampersands
    .replace(/\s+/g, ' ')         // Normalize spaces
    .trim();
}

/**
 * Check if text contains potential XSS payloads
 */
export function hasXSSIndicators(text: string): boolean {
  const xssPatterns = [
    /<script/i,
    /<iframe/i,
    /<object/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /eval\(/i,
    /expression\(/i,
  ];

  return xssPatterns.some(pattern => pattern.test(text));
}

/**
 * Check if text contains potential injection patterns
 */
export function hasInjectionIndicators(text: string): boolean {
  const injectionPatterns = [
    /['";]/,        // SQL injection indicators
    /\$\{/,         // Template injection
    /%24%7B/,       // Encoded template injection
    /\.\.\//,       // Path traversal
    /%2e%2e%2f/,    // Encoded path traversal
  ];

  return injectionPatterns.some(pattern => pattern.test(text));
}
```

### 4. Update Google Suggest Collector

**File:** `.claude/skills/cfn-seo-pipeline/lib/seo/lib/discovery/google-suggest-collector.ts`

Add at the top:

```typescript
import { validateLanguage, validateCountry, validateKeyword, validateKeywordArray } from './validation';
import { SuggestError } from './errors';
```

Update `queryGoogleSuggest`:

```typescript
async function queryGoogleSuggest(
  query: string,
  language = 'en',
  country = 'us'
): Promise<string[]> {
  // Validate parameters BEFORE constructing URL
  const validatedQuery = validateKeyword(query, 500);
  const validatedLanguage = validateLanguage(language);
  const validatedCountry = validateCountry(country);

  const url = new URL('http://suggestqueries.google.com/complete/search');
  url.searchParams.set('client', 'firefox');
  url.searchParams.set('q', validatedQuery);
  url.searchParams.set('hl', validatedLanguage);
  url.searchParams.set('gl', validatedCountry);

  try {
    const response = await fetch(url.toString());

    if (!response.ok) {
      console.error('[Suggest Collector] API error:', {
        status: response.status,
        timestamp: new Date().toISOString(),
      });

      throw new SuggestError('API_ERROR', 'Failed to retrieve suggestions', response.status);
    }

    const data = await response.json() as [string, string[]];
    return data[1] || [];
  } catch (error) {
    if (error instanceof SuggestError) {
      throw error;
    }

    console.error('[Suggest Collector] Unexpected error:', error);
    throw new SuggestError('UNEXPECTED_ERROR', 'An unexpected error occurred');
  }
}
```

Update `batchCollectFromGoogleSuggest`:

```typescript
export async function batchCollectFromGoogleSuggest(
  seeds: string[],
  options?: SuggestCollectorOptions,
  seoQuery?: SEOQueryManager
): Promise<KeywordSource[]> {
  // Validate input array
  const validatedSeeds = validateKeywordArray(seeds, 1000);

  console.log(`[Suggest Collector] Batch collecting from ${validatedSeeds.length} seeds`);

  const allKeywords: KeywordSource[] = [];

  for (const seed of validatedSeeds) {
    const keywords = await collectFromGoogleSuggest(seed, options, seoQuery);
    allKeywords.push(...keywords);

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Rest of function...
}
```

### 5. Update Social Collector

**File:** `.claude/skills/cfn-seo-pipeline/lib/seo/lib/discovery/social-collector.ts`

Add at the top:

```typescript
import { validateSubreddit, validateSubreddits, validateNiche } from './validation';
import { sanitizeText, hasXSSIndicators } from './sanitization';
import { RedditError } from './errors';
```

Update `queryReddit`:

```typescript
async function queryReddit(
  subreddit: string,
  limit = 100,
  timeFilter: 'day' | 'week' | 'month' | 'year' | 'all' = 'month'
): Promise<RedditPost[]> {
  // Validate subreddit BEFORE constructing URL
  const validatedSubreddit = validateSubreddit(subreddit);

  const url = `https://www.reddit.com/r/${validatedSubreddit}/top.json?limit=${limit}&t=${timeFilter}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'SEO-Keyword-Collector/1.0',
      },
    });

    if (!response.ok) {
      console.error('[Social Collector] API error:', {
        subreddit: validatedSubreddit,
        status: response.status,
        timestamp: new Date().toISOString(),
      });

      throw new RedditError('API_ERROR', 'Failed to retrieve Reddit data', response.status);
    }

    const data = await response.json() as RedditResponse;
    return data.data.children.map(child => child.data);
  } catch (error) {
    if (error instanceof RedditError) {
      throw error;
    }

    console.error('[Social Collector] Unexpected error:', error);
    throw new RedditError('UNEXPECTED_ERROR', 'An unexpected error occurred');
  }
}
```

Update `extractQuestionsFromTitle`:

```typescript
function extractQuestionsFromTitle(title: string): string | null {
  // Sanitize immediately
  const sanitized = sanitizeText(title, 500);

  if (!sanitized) return null;

  // Check for XSS patterns
  if (hasXSSIndicators(sanitized)) {
    console.warn('[Social Collector] Potential XSS payload detected, skipping:', sanitized.substring(0, 50));
    return null;
  }

  const normalized = sanitized.toLowerCase().trim();

  const questionWords = ['what', 'why', 'how', 'when', 'where', 'who', 'which', 'can', 'should', 'does'];
  const hasQuestionWord = questionWords.some(word => normalized.startsWith(word) || normalized.includes(` ${word} `));
  const hasQuestionMark = sanitized.includes('?');

  if (hasQuestionWord || hasQuestionMark) {
    return sanitized;
  }

  return null;
}
```

---

## Phase 2: High Priority Fixes (Next 3-5 Days)

### 6. Implement Adaptive Rate Limiter

**File:** `.claude/skills/cfn-seo-pipeline/lib/seo/lib/discovery/rate-limiter.ts` (NEW)

```typescript
/**
 * Adaptive rate limiter with sliding window algorithm
 */

export interface RateLimitConfig {
  requestsPerMinute: number;
  burstSize: number;
  name: string;
}

export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  googleSuggest: {
    requestsPerMinute: 100,
    burstSize: 5,
    name: 'Google Suggest API',
  },
  reddit: {
    requestsPerMinute: 60,
    burstSize: 3,
    name: 'Reddit API',
  },
  ruvector: {
    requestsPerMinute: 1000,
    burstSize: 50,
    name: 'RuVector API',
  },
  gsc: {
    requestsPerMinute: 30,
    burstSize: 2,
    name: 'Google Search Console',
  },
};

export class AdaptiveRateLimiter {
  private requestTimes: number[] = [];
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  async checkAndWait(): Promise<void> {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Remove old requests outside the window
    this.requestTimes = this.requestTimes.filter(time => time > oneMinuteAgo);

    // Check if we've hit the limit
    if (this.requestTimes.length >= this.config.requestsPerMinute) {
      const oldestRequest = this.requestTimes[0];
      const waitTime = Math.max(0, 60000 - (now - oldestRequest) + 100);

      console.warn(`[RateLimiter] ${this.config.name} at limit, waiting ${waitTime}ms`, {
        requestCount: this.requestTimes.length,
        limit: this.config.requestsPerMinute,
        waitTime,
      });

      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.requestTimes.push(Date.now());
  }

  getStatus(): {
    requestsThisMinute: number;
    limit: number;
    percentUsed: number;
  } {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    this.requestTimes = this.requestTimes.filter(time => time > oneMinuteAgo);

    return {
      requestsThisMinute: this.requestTimes.length,
      limit: this.config.requestsPerMinute,
      percentUsed: (this.requestTimes.length / this.config.requestsPerMinute) * 100,
    };
  }
}
```

### 7. Add Environment Validation

**File:** `.claude/skills/cfn-seo-pipeline/lib/seo/lib/discovery/env-validation.ts` (NEW)

```typescript
/**
 * Environment variable validation on startup
 */

export interface EnvironmentValidationResult {
  valid: boolean;
  errors: Array<{ key: string; message: string }>;
  warnings: Array<{ key: string; message: string }>;
}

export async function validateEnvironment(): Promise<EnvironmentValidationResult> {
  const errors: Array<{ key: string; message: string }> = [];
  const warnings: Array<{ key: string; message: string }> = [];

  // GSC_ACCESS_TOKEN
  if (!process.env.GSC_ACCESS_TOKEN) {
    warnings.push({
      key: 'GSC_ACCESS_TOKEN',
      message: 'GSC collector will be disabled (no access token provided)',
    });
  } else if (process.env.GSC_ACCESS_TOKEN.length < 20) {
    errors.push({
      key: 'GSC_ACCESS_TOKEN',
      message: 'Invalid token length (must be at least 20 characters)',
    });
  }

  // GSC_API_ENDPOINT (if provided)
  if (process.env.GSC_API_ENDPOINT) {
    try {
      new URL(process.env.GSC_API_ENDPOINT);
    } catch {
      errors.push({
        key: 'GSC_API_ENDPOINT',
        message: 'Invalid URL format',
      });
    }
  }

  // NODE_ENV
  const validEnvs = ['development', 'staging', 'production'];
  if (!validEnvs.includes(process.env.NODE_ENV || '')) {
    warnings.push({
      key: 'NODE_ENV',
      message: `NODE_ENV not set or invalid (should be one of: ${validEnvs.join(', ')})`,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Run validation and exit if critical errors found
 */
export async function validateEnvironmentOrFail(): Promise<void> {
  const result = await validateEnvironment();

  if (result.warnings.length > 0) {
    console.warn('Environment validation warnings:');
    result.warnings.forEach(w => console.warn(`  [${w.key}] ${w.message}`));
    console.warn('');
  }

  if (!result.valid) {
    console.error('Environment validation FAILED. Cannot start application.');
    result.errors.forEach(e => console.error(`  [${e.key}] ${e.message}`));
    process.exit(1);
  }

  console.log('[Environment] Validation passed');
}
```

---

## Phase 3: Technical Debt (Post-Release)

### 8. API Key Rotation

Implement `CredentialStore` interface with refresh logic.

### 9. Embedding Encryption

Add AES-256-GCM encryption for cached embeddings.

---

## Testing Checklist

After implementing Phase 1 fixes, run:

```bash
# Unit tests for validation
npm test -- validation.test.ts

# Unit tests for error handling
npm test -- errors.test.ts

# Integration tests
npm run test:integration -- discovery

# Security tests
npm run test:security -- injection-tests

# Manual verification
npx ts-node -e "
  import { validateNiche, validateKeyword } from './lib/seo/lib/discovery/validation.ts';
  console.log('Testing validation module...');
  try {
    validateNiche('valid niche');
    console.log('✓ Valid niche accepted');
  } catch (e) {
    console.error('✗ Valid niche rejected:', e.message);
  }

  try {
    validateNiche('<script>alert(\"xss\")</script>');
    console.error('✗ XSS payload accepted!');
  } catch (e) {
    console.log('✓ XSS payload rejected:', e.message);
  }
"
```

---

## Deployment Checklist

Before releasing Sprint 2.1 to production:

- [ ] All 3 critical vulnerabilities fixed
- [ ] Input validation module complete and tested
- [ ] Error handling sanitized in all collectors
- [ ] SSRF protection with domain whitelists
- [ ] Rate limiting improved with adaptive behavior
- [ ] Data sanitization applied to all external inputs
- [ ] Environment validation on startup
- [ ] Security test suite passing (90%+ pass rate)
- [ ] Code review completed by security team
- [ ] Documentation updated with security controls
- [ ] No hardcoded credentials in code/logs
- [ ] Error messages sanitized in production

---

## Appendix: Files Modified

**New Files Created:**
- `lib/seo/lib/discovery/validation.ts`
- `lib/seo/lib/discovery/errors.ts`
- `lib/seo/lib/discovery/sanitization.ts`
- `lib/seo/lib/discovery/rate-limiter.ts`
- `lib/seo/lib/discovery/env-validation.ts`

**Files Updated:**
- `lib/seo/lib/discovery/google-suggest-collector.ts`
- `lib/seo/lib/discovery/social-collector.ts`
- `lib/seo/lib/discovery/gsc-collector.ts`
- `lib/seo/lib/discovery/index.ts`

**Tests Added:**
- `tests/discovery/validation.test.ts`
- `tests/discovery/errors.test.ts`
- `tests/discovery/sanitization.test.ts`
- `tests/discovery/rate-limiter.test.ts`
- `tests/discovery/ssrf-protection.test.ts`
- `tests/discovery/injection-tests.test.ts`
