# Step 13 Performance Tracking - Security Remediation Guide

**Remediation Date:** December 2, 2025
**Target Completion:** December 9, 2025 (1 week)
**Effort Estimate:** 40-50 hours
**Priority:** High

---

## Overview

This guide provides step-by-step remediation for the 16 findings identified in the Step 13 Performance Tracking security audit. Findings are prioritized into three phases: **Immediate (P0)**, **This Week (P1)**, and **Next Sprint (P2)**.

---

## Phase 0: Immediate Actions (24-48 hours)

### P0-1: Fix Shell Command Injection (CRITICAL-4)

**Impact:** Remote command execution possible
**Effort:** 2 hours
**File:** `planning/seo/scripts/ingest-performance.sh`

**Steps:**

1. **Validate inputs before using them**

```bash
# CURRENT (VULNERABLE):
main() {
  local source="${DEFAULT_SOURCE}"
  # ... parse arguments
  # Use variables here
  case "${source}" in
    gsc)
      fetch_gsc_data "${lookback_days}" "${content_id}"  # NOT VALIDATED YET
      ;;
  esac

  # Validate HERE (TOO LATE)
  validate_source "${source}"
}

# FIXED:
main() {
  local source="${DEFAULT_SOURCE}"
  local lookback_days="${DEFAULT_LOOKBACK_DAYS}"
  local content_id=""
  local batch_size="${MAX_BATCH_SIZE}"
  local use_mock_data="false"

  # Parse arguments
  while (( $# > 0 )); do
    case "${1}" in
      --source)
        source="${2}"
        shift 2
        ;;
      --lookback-days)
        lookback_days="${2}"
        shift 2
        ;;
      --content-id)
        content_id="${2}"
        shift 2
        ;;
      # ... other arguments
    esac
  done

  # VALIDATE FIRST (CORRECT ORDER)
  if ! validate_all_inputs "${source}" "${lookback_days}" "${content_id}" "${batch_size}"; then
    exit 1
  fi

  # NOW safe to use
  ingest_performance_data "${source}" "${lookback_days}" "${content_id}" \
    "false" "${batch_size}" "${use_mock_data}"
}

validate_all_inputs() {
  local source="${1}"
  local lookback_days="${2}"
  local content_id="${3:-}"
  local batch_size="${4}"

  log_step "Validating all input parameters..."

  if ! validate_source "${source}"; then
    return 1
  fi

  if ! validate_lookback_days "${lookback_days}"; then
    return 1
  fi

  if [[ -n "${content_id}" ]] && ! validate_content_id "${content_id}"; then
    return 1
  fi

  if ! validate_batch_size "${batch_size}"; then
    return 1
  fi

  log_success "All inputs validated"
  return 0
}
```

2. **Add additional quoting and escaping for safety**

```bash
# In log_error and other output functions:
log_error() {
  # Quote variable to prevent expansion
  echo -e "${LOG_ERROR} ${1@Q}"  # @Q: quote the string safely
}

# When using contentId in commands (if needed):
# Always quote properly
local safe_id="${content_id//[^a-zA-Z0-9_-]/}"  # Remove unsafe chars inline
```

3. **Test the fix:**

```bash
# Test case 1: Normal usage (should work)
./ingest-performance.sh --content-id "blog-post-123" --source gsc --mock-data

# Test case 2: Command injection attempt (should fail validation)
./ingest-performance.sh --content-id '$(whoami)' --source gsc --mock-data
# Expected: "Invalid content ID format: $(whoami)"

# Test case 3: Backtick injection (should fail validation)
./ingest-performance.sh --content-id 'test`whoami`post' --source gsc --mock-data
# Expected: "Invalid content ID format: testwhoamipost"
```

---

### P0-2: Fix Redis Key Injection (CRITICAL-2)

**Impact:** Redis namespace pollution, data contamination
**Effort:** 1.5 hours
**File:** `planning/seo/lib/steps/step-13-performance-tracking.ts`

**Current Issue:**
```typescript
// Lines 302-310: Content ID used BEFORE sanitization
async function fetchAppliedPatterns(
  contentId: string,
  redis: Redis,
  store: string
): Promise<AppliedPatternReference[]> {
  try {
    // WRONG: Using contentId before sanitization
    const appliedKey = `content:performance:${contentId}:applied_patterns`;
    const appliedData = await redis.lrange(appliedKey, 0, -1);

    // LATER: Sanitization happens here
    const sanitized = sanitizeContentId(contentId);
```

**Fix:**
```typescript
async function fetchAppliedPatterns(
  contentId: string,
  redis: Redis,
  store: string
): Promise<AppliedPatternReference[]> {
  try {
    // CORRECT: Sanitize FIRST
    const sanitized = sanitizeContentId(contentId);

    // Validate result
    if (!sanitized || sanitized.length === 0) {
      return [];
    }

    // THEN construct key
    const appliedKey = `content:performance:${sanitized}:applied_patterns`;
    const appliedData = await redis.lrange(appliedKey, 0, -1);

    const patterns: AppliedPatternReference[] = [];

    for (const entry of appliedData) {
      try {
        const pattern = JSON.parse(entry) as AppliedPatternReference;

        // Validate pattern format
        if (!isValidAppliedPatternReference(pattern)) {
          console.warn(`Invalid pattern reference: ${entry.substring(0, 50)}`);
          continue;
        }

        patterns.push(pattern);
      } catch (parseError) {
        console.error(`Failed to parse pattern data: ${parseError}`);
        continue;
      }
    }

    return patterns;
  } catch (error) {
    console.error(`Failed to fetch applied patterns for content ${contentId}:`, error);
    return [];
  }
}
```

**Also fix in `executeStep13()` function:**

```typescript
// Find all places where contentId is used to construct Redis keys
// Before the fix:
const contentId = sanitizeContentId(contentId);
const appliedKey = `content:performance:${contentId}:applied_patterns`;  // WRONG ORDER

// After the fix:
const sanitized = sanitizeContentId(contentId);
if (!isValidContentId(sanitized)) {
  throw new Step13Error(`Invalid content ID: ${contentId}`, 'VALIDATION_FAILED');
}
const appliedKey = `content:performance:${sanitized}:applied_patterns`;
```

**Test the fix:**

```typescript
// Unit test
test('should sanitize content ID before using in Redis keys', async () => {
  const redis = new Redis();

  // Attack attempt: content ID with colons
  const maliciousId = 'test:malicious:inject:here';

  // Should sanitize first
  const patterns = await fetchAppliedPatterns(maliciousId, redis, 'pattern:local');

  // Verify no injection occurred
  const allKeys = await redis.keys('content:performance:*');
  expect(allKeys).not.toContain('content:performance:test:malicious:inject:here:applied_patterns');
  expect(allKeys).toContain('content:performance:testmaliciousinjection:applied_patterns');
});
```

---

### P0-3: Add Metric Bounds Validation (CRITICAL-1)

**Impact:** Invalid metrics used in confidence calculations
**Effort:** 2 hours
**File:** `planning/seo/lib/performance-feedback.ts`

**Add validation function:**

```typescript
/**
 * Validate and sanitize performance metrics
 * Ensures all values are within acceptable bounds
 */
function validateMetricsBounds(metrics: ContentPerformanceMetrics): boolean {
  // Ranking positions must be 1-100
  if (
    !Number.isFinite(metrics.averageRanking) ||
    metrics.averageRanking < 1 ||
    metrics.averageRanking > 100
  ) {
    console.error(`Invalid averageRanking: ${metrics.averageRanking}`);
    return false;
  }

  if (
    !Number.isFinite(metrics.peakRanking) ||
    metrics.peakRanking < 1 ||
    metrics.peakRanking > 100
  ) {
    console.error(`Invalid peakRanking: ${metrics.peakRanking}`);
    return false;
  }

  // Ranking delta should be reasonable
  if (
    !Number.isFinite(metrics.rankingDelta) ||
    Math.abs(metrics.rankingDelta) > 100
  ) {
    console.error(`Invalid rankingDelta: ${metrics.rankingDelta}`);
    return false;
  }

  // Counts must be non-negative integers
  if (
    !Number.isInteger(metrics.impressions) ||
    metrics.impressions < 0
  ) {
    console.error(`Invalid impressions: ${metrics.impressions}`);
    return false;
  }

  if (
    !Number.isInteger(metrics.clicks) ||
    metrics.clicks < 0
  ) {
    console.error(`Invalid clicks: ${metrics.clicks}`);
    return false;
  }

  // CTR must be 0.0-1.0
  if (
    !Number.isFinite(metrics.ctr) ||
    metrics.ctr < 0 ||
    metrics.ctr > 1
  ) {
    console.error(`Invalid ctr: ${metrics.ctr}`);
    return false;
  }

  // Optional fields validation
  if (
    metrics.conversions !== undefined &&
    (!Number.isInteger(metrics.conversions) || metrics.conversions < 0)
  ) {
    console.error(`Invalid conversions: ${metrics.conversions}`);
    return false;
  }

  if (
    metrics.conversionRate !== undefined &&
    (!Number.isFinite(metrics.conversionRate) ||
      metrics.conversionRate < 0 ||
      metrics.conversionRate > 1)
  ) {
    console.error(`Invalid conversionRate: ${metrics.conversionRate}`);
    return false;
  }

  if (
    metrics.bounceRate !== undefined &&
    (!Number.isFinite(metrics.bounceRate) ||
      metrics.bounceRate < 0 ||
      metrics.bounceRate > 1)
  ) {
    console.error(`Invalid bounceRate: ${metrics.bounceRate}`);
    return false;
  }

  return true;
}

/**
 * Sanitize metrics to safe values
 * Clamps values to valid ranges
 */
function sanitizeMetrics(metrics: ContentPerformanceMetrics): ContentPerformanceMetrics {
  return {
    ...metrics,
    averageRanking: Math.max(1, Math.min(100, metrics.averageRanking)),
    peakRanking: Math.max(1, Math.min(100, metrics.peakRanking)),
    rankingDelta: Math.max(-100, Math.min(100, metrics.rankingDelta)),
    impressions: Math.max(0, Math.floor(metrics.impressions)),
    clicks: Math.max(0, Math.floor(metrics.clicks)),
    ctr: Math.max(0, Math.min(1, metrics.ctr)),
    conversions: metrics.conversions !== undefined
      ? Math.max(0, Math.floor(metrics.conversions))
      : undefined,
    conversionRate: metrics.conversionRate !== undefined
      ? Math.max(0, Math.min(1, metrics.conversionRate))
      : undefined,
    bounceRate: metrics.bounceRate !== undefined
      ? Math.max(0, Math.min(1, metrics.bounceRate))
      : undefined,
  };
}
```

**Use validation in `updatePatternFromPerformance()`:**

```typescript
async function updatePatternFromPerformance(
  appliedPattern: AppliedPatternReference,
  metrics: ContentPerformanceMetrics,
  contentId: string,
  redis: Redis,
  store: string,
  rules: ConfidenceAdjustmentRules
): Promise<PatternFeedbackResult | null> {
  // Validate metrics bounds FIRST
  if (!validateMetricsBounds(metrics)) {
    throw new PerformanceFeedbackError(
      `Invalid metrics for pattern ${appliedPattern.patternId}`,
      'VALIDATION_FAILED'
    );
  }

  // Optionally sanitize to safe values
  const safeMetrics = sanitizeMetrics(metrics);

  // Fetch current pattern confidence
  const currentConfidenceStr = await redis.hget(
    `${store}:${appliedPattern.patternId}`,
    'confidence'
  );
  const previousConfidence = parseFloat(currentConfidenceStr || '0.5');

  // ... rest of function using safeMetrics
}
```

---

## Phase 1: This Week (P1)

### P1-1: Fix Pattern ID Injection (CRITICAL-3)

**Impact:** Data corruption, namespace pollution
**Effort:** 2 hours
**File:** `planning/seo/lib/performance-feedback.ts`

**Add pattern ID validation:**

```typescript
const VALID_PATTERN_ID_REGEX = /^[a-zA-Z0-9_-]{3,64}$/;
const VALID_PATTERN_NAME_REGEX = /^[a-zA-Z0-9\s_-]{1,256}$/;

function validatePatternReference(ref: AppliedPatternReference): boolean {
  if (!VALID_PATTERN_ID_REGEX.test(ref.patternId)) {
    console.error(`Invalid pattern ID format: ${ref.patternId}`);
    return false;
  }

  if (!VALID_PATTERN_NAME_REGEX.test(ref.patternName)) {
    console.error(`Invalid pattern name format: ${ref.patternName}`);
    return false;
  }

  if (!['content', 'technical', 'algorithm'].includes(ref.patternType)) {
    console.error(`Invalid pattern type: ${ref.patternType}`);
    return false;
  }

  if (typeof ref.appliedAt !== 'string' || !isValidISO8601(ref.appliedAt)) {
    console.error(`Invalid appliedAt timestamp: ${ref.appliedAt}`);
    return false;
  }

  if (
    typeof ref.confidenceAtApplication !== 'number' ||
    ref.confidenceAtApplication < 0 ||
    ref.confidenceAtApplication > 1
  ) {
    console.error(`Invalid confidenceAtApplication: ${ref.confidenceAtApplication}`);
    return false;
  }

  return true;
}

function isValidISO8601(dateString: string): boolean {
  const date = new Date(dateString);
  return !isNaN(date.getTime()) && date.toISOString() === dateString;
}
```

**Update storage function:**

```typescript
async function storeFeedbackHistory(
  contentId: string,
  results: PatternFeedbackResult[],
  redis: Redis
): Promise<void> {
  // Validate all pattern data before storage
  for (const result of results) {
    // Validate pattern ID format
    if (!VALID_PATTERN_ID_REGEX.test(result.patternId)) {
      throw new PerformanceFeedbackError(
        `Invalid pattern ID: ${result.patternId}`,
        'VALIDATION_FAILED'
      );
    }

    // Validate pattern name
    if (!VALID_PATTERN_NAME_REGEX.test(result.patternName)) {
      throw new PerformanceFeedbackError(
        `Invalid pattern name: ${result.patternName}`,
        'VALIDATION_FAILED'
      );
    }

    // Validate numeric fields
    if (
      !Number.isFinite(result.previousConfidence) ||
      !Number.isFinite(result.newConfidence) ||
      !Number.isFinite(result.delta)
    ) {
      throw new PerformanceFeedbackError(
        `Invalid confidence values for pattern ${result.patternId}`,
        'VALIDATION_FAILED'
      );
    }
  }

  // Store validated data
  const historyKey = `content:performance:${contentId}:feedback_history`;

  for (const result of results) {
    await redis.lpush(historyKey, JSON.stringify(result));
  }

  // Keep only last 50 entries
  await redis.ltrim(historyKey, 0, 49);

  // Set 90-day expiration
  await redis.expire(historyKey, 90 * 24 * 60 * 60);
}
```

---

### P1-2: Add Rate Limiting to Correlation Detection (CRITICAL-5)

**Impact:** DoS prevention
**Effort:** 3 hours
**Files:** `performance-feedback.ts`, potentially new utility file

**Create rate limiting utility:**

```typescript
// In new file: planning/seo/lib/rate-limit.ts

export interface RateLimitConfig {
  maxOperations: number;
  timeWindowMs: number;
}

export class RedisRateLimiter {
  constructor(
    private redis: Redis,
    private config: RateLimitConfig
  ) {}

  async isAllowed(key: string): Promise<boolean> {
    const bucket = `rate_limit:${key}`;
    const now = Date.now();
    const windowStart = now - this.config.timeWindowMs;

    // Remove old entries
    await this.redis.zremrangebyscore(bucket, '-inf', windowStart.toString());

    // Check current count
    const count = await this.redis.zcard(bucket);

    if (count >= this.config.maxOperations) {
      return false;
    }

    // Add current operation
    await this.redis.zadd(bucket, now.toString(), `${now}:${Math.random()}`);
    await this.redis.expire(bucket, Math.ceil(this.config.timeWindowMs / 1000) + 1);

    return true;
  }
}
```

**Use in correlation detection:**

```typescript
const CORRELATION_DETECTION_LIMIT: RateLimitConfig = {
  maxOperations: 10,  // Max 10 correlation scans
  timeWindowMs: 60000, // Per 60 seconds
};

export async function detectAlgorithmUpdateCorrelation(
  algorithmUpdates: ReadonlyArray<AlgorithmUpdate>,
  redis: Redis,
  store: string = 'pattern:local',
  lookbackDays: number = 30
): Promise<ReadonlyArray<AlgorithmCorrelation>> {
  const limiter = new RedisRateLimiter(redis, CORRELATION_DETECTION_LIMIT);

  // Rate limit the operation
  if (!await limiter.isAllowed(`correlation_detection:${store}`)) {
    throw new PerformanceFeedbackError(
      'Rate limit exceeded for correlation detection',
      'VALIDATION_FAILED'
    );
  }

  try {
    const correlations: AlgorithmCorrelation[] = [];
    const lookbackDate = new Date();
    lookbackDate.setDate(lookbackDate.getDate() - lookbackDays);

    // Use SCAN with cursor instead of KEYS
    let cursor = '0';
    let scannedPatterns = 0;
    const maxPatterns = 1000;

    do {
      const [newCursor, keys] = await redis.scan(
        cursor,
        'MATCH',
        `${store}:*`,
        'COUNT',
        100
      );

      for (const key of keys) {
        if (
          key.includes(':feedback_history') ||
          key.includes(':applications') ||
          key.includes(':history')
        ) {
          continue;
        }

        scannedPatterns++;
        if (scannedPatterns > maxPatterns) {
          console.warn(`Reached max pattern scan limit (${maxPatterns})`);
          break;
        }

        const patternId = key.replace(`${store}:`, '');

        // ... rest of correlation detection logic
      }

      cursor = newCursor;
    } while (cursor !== '0' && scannedPatterns <= maxPatterns);

    return correlations;
  } catch (error) {
    throw new PerformanceFeedbackError(
      'Failed to detect algorithm update correlation',
      'CORRELATION_FAILED',
      error
    );
  }
}
```

---

### P1-3: Fix Timestamp Validation (HIGH-1)

**Impact:** False performance data injection
**Effort:** 1.5 hours
**File:** `planning/seo/lib/performance-tracker.ts`

**Update `normalizeTimestamp()` function:**

```typescript
const MAX_HISTORICAL_DAYS = 730; // 2 years
const MAX_FUTURE_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes tolerance

export function normalizeTimestamp(timestamp: Date | string | number): string {
  try {
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);

    if (isNaN(date.getTime())) {
      throw new Error('Invalid timestamp');
    }

    const now = new Date();

    // Prevent far-future dates
    const maxFutureDate = new Date(now.getTime() + MAX_FUTURE_TOLERANCE_MS);
    if (date > maxFutureDate) {
      throw new PerformanceTrackerError(
        `Timestamp cannot be in the future: ${timestamp}`,
        'VALIDATION_FAILED'
      );
    }

    // Prevent dates too far in the past
    const minHistoricalDate = new Date();
    minHistoricalDate.setDate(minHistoricalDate.getDate() - MAX_HISTORICAL_DAYS);
    if (date < minHistoricalDate) {
      throw new PerformanceTrackerError(
        `Timestamp is too old (max ${MAX_HISTORICAL_DAYS} days): ${timestamp}`,
        'VALIDATION_FAILED'
      );
    }

    return date.toISOString();
  } catch (error) {
    if (error instanceof PerformanceTrackerError) {
      throw error;
    }

    throw new PerformanceTrackerError(
      `Failed to normalize timestamp: ${timestamp}`,
      'VALIDATION_FAILED',
      error instanceof Error ? error.message : error
    );
  }
}
```

**Add test cases:**

```typescript
test('normalizeTimestamp rejects future dates', () => {
  const futureDate = new Date();
  futureDate.setHours(futureDate.getHours() + 1);

  expect(() => normalizeTimestamp(futureDate)).toThrow(
    /cannot be in the future/
  );
});

test('normalizeTimestamp rejects very old dates', () => {
  const veryOldDate = new Date();
  veryOldDate.setDate(veryOldDate.getDate() - 800);

  expect(() => normalizeTimestamp(veryOldDate)).toThrow(
    /too old/
  );
});

test('normalizeTimestamp accepts valid dates', () => {
  const validDate = new Date();
  const result = normalizeTimestamp(validDate);

  expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
});
```

---

### P1-4: Fix URL Validation for SSRF Prevention (HIGH-2)

**Impact:** SSRF vulnerability
**Effort:** 2 hours
**File:** `planning/seo/lib/performance-tracker.ts`

**Update `isValidUrl()` function:**

```typescript
// Blocked hostnames
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '0.0.0.0',
  '::',
  'metadata.google.internal',
  '169.254.169.254',
  '10.0.0.2', // AWS metadata
]);

// Blocked IP ranges (CIDR)
const BLOCKED_IP_RANGES = [
  { start: '10.0.0.0', end: '10.255.255.255' },     // 10.0.0.0/8
  { start: '172.16.0.0', end: '172.31.255.255' },   // 172.16.0.0/12
  { start: '192.168.0.0', end: '192.168.255.255' }, // 192.168.0.0/16
  { start: '169.254.0.0', end: '169.254.255.255' }, // Link-local
];

function ipToNumber(ip: string): number {
  const parts = ip.split('.').map(Number);
  return (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function isInBlockedRange(ip: string): boolean {
  const ipNum = ipToNumber(ip);

  for (const range of BLOCKED_IP_RANGES) {
    const startNum = ipToNumber(range.start);
    const endNum = ipToNumber(range.end);

    if (ipNum >= startNum && ipNum <= endNum) {
      return true;
    }
  }

  return false;
}

export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    // Check protocol
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    const hostname = parsed.hostname || '';

    // Block known-bad hostnames
    if (BLOCKED_HOSTNAMES.has(hostname)) {
      return false;
    }

    // Try to parse as IP address
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipRegex.test(hostname)) {
      // Validate IP is well-formed
      const parts = hostname.split('.').map(Number);
      if (parts.some(p => isNaN(p) || p < 0 || p > 255)) {
        return false;
      }

      // Check against blocked IP ranges
      if (isInBlockedRange(hostname)) {
        return false;
      }
    }

    // Hostname format validation
    if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(hostname) && !ipRegex.test(hostname)) {
      return false;
    }

    // No localhost variations
    if (hostname.includes('localhost') || hostname === 'localhost') {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
```

**Add comprehensive tests:**

```typescript
test('isValidUrl rejects localhost', () => {
  expect(isValidUrl('http://localhost/path')).toBe(false);
});

test('isValidUrl rejects 127.0.0.1', () => {
  expect(isValidUrl('http://127.0.0.1/path')).toBe(false);
});

test('isValidUrl rejects AWS metadata service', () => {
  expect(isValidUrl('http://169.254.169.254/metadata')).toBe(false);
});

test('isValidUrl rejects private IP ranges', () => {
  expect(isValidUrl('http://10.0.0.1/path')).toBe(false);
  expect(isValidUrl('http://192.168.1.1/path')).toBe(false);
  expect(isValidUrl('http://172.16.0.1/path')).toBe(false);
});

test('isValidUrl accepts valid public URLs', () => {
  expect(isValidUrl('https://example.com/content')).toBe(true);
  expect(isValidUrl('https://google.com/search')).toBe(true);
});
```

---

### P1-5: Improve Type Guard Validation (HIGH-3 & HIGH-6)

**Impact:** Invalid data acceptance
**Effort:** 2 hours
**File:** `planning/seo/lib/performance-tracker.ts`

**Helper validation functions:**

```typescript
function isValidPositiveNumber(
  n: unknown,
  max?: number
): n is number {
  if (typeof n !== 'number') return false;
  if (!Number.isFinite(n)) return false;
  if (n <= 0) return false;
  if (max !== undefined && n > max) return false;
  return true;
}

function isValidNonNegativeNumber(
  n: unknown,
  max?: number
): n is number {
  if (typeof n !== 'number') return false;
  if (!Number.isFinite(n)) return false;
  if (n < 0) return false;
  if (max !== undefined && n > max) return false;
  return true;
}

function isValidProbability(n: unknown): n is number {
  if (typeof n !== 'number') return false;
  if (!Number.isFinite(n)) return false;
  return n >= 0 && n <= 1;
}
```

**Update type guards:**

```typescript
export function isValidContentPerformanceMetrics(
  value: unknown
): value is ContentPerformanceMetrics {
  if (typeof value !== 'object' || value === null) return false;

  const metrics = value as any;

  // Ranking positions: 1-100
  if (!isValidPositiveNumber(metrics.averageRanking, 100)) return false;
  if (!isValidPositiveNumber(metrics.peakRanking, 100)) return false;

  // Ranking delta: -100 to +100
  if (typeof metrics.rankingDelta !== 'number' || !Number.isFinite(metrics.rankingDelta)) {
    return false;
  }
  if (metrics.rankingDelta < -100 || metrics.rankingDelta > 100) return false;

  // Counts: non-negative integers
  if (!Number.isInteger(metrics.impressions) || metrics.impressions < 0) return false;
  if (!Number.isInteger(metrics.clicks) || metrics.clicks < 0) return false;

  // CTR: 0.0-1.0
  if (!isValidProbability(metrics.ctr)) return false;

  // Trend validation
  if (!isValidRankingTrend(metrics.rankingTrend)) return false;

  // Optional fields
  if (
    metrics.conversions !== undefined &&
    (!Number.isInteger(metrics.conversions) || metrics.conversions < 0)
  ) {
    return false;
  }

  if (
    metrics.conversionRate !== undefined &&
    !isValidProbability(metrics.conversionRate)
  ) {
    return false;
  }

  if (
    metrics.bounceRate !== undefined &&
    !isValidProbability(metrics.bounceRate)
  ) {
    return false;
  }

  // Timestamps
  if (typeof metrics.periodStart !== 'string') return false;
  if (typeof metrics.periodEnd !== 'string') return false;

  // Time window and source validation
  if (!isValidTimeWindow(metrics.timeWindow)) return false;
  if (!isValidMetricSource(metrics.source)) return false;

  return true;
}
```

---

## Phase 2: Next Sprint (P2)

### P2-1: Add Concurrency Control (MEDIUM-2)

**Impact:** Race conditions in concurrent updates
**Effort:** 3 hours
**File:** `planning/seo/lib/performance-feedback.ts`

Use Redis transactions for atomic operations:

```typescript
async function updatePatternFromPerformance(
  appliedPattern: AppliedPatternReference,
  metrics: ContentPerformanceMetrics,
  contentId: string,
  redis: Redis,
  store: string,
  rules: ConfidenceAdjustmentRules
): Promise<PatternFeedbackResult | null> {
  const patternKey = `${store}:${appliedPattern.patternId}`;

  try {
    // Watch key for changes
    await redis.watch(patternKey);

    // Read current value
    const currentConfidenceStr = await redis.hget(patternKey, 'confidence');
    const previousConfidence = parseFloat(currentConfidenceStr || '0.5');

    // Calculate new confidence
    let newConfidence = previousConfidence;
    let confidenceDelta = 0;
    let reason = '';

    if (metrics.averageRanking <= 10) {
      confidenceDelta = rules.top10Boost;
      newConfidence = Math.min(1.0, previousConfidence + confidenceDelta);
      reason = `Top 10 ranking (position ${metrics.averageRanking})`;
    } else if (metrics.averageRanking <= 20) {
      confidenceDelta = rules.top20Boost;
      newConfidence = Math.min(1.0, previousConfidence + confidenceDelta);
      reason = `Top 20 ranking (position ${metrics.averageRanking})`;
    } else if (metrics.rankingDelta < -20) {
      confidenceDelta = rules.severeRankingDropPenalty;
      newConfidence = Math.max(0.0, previousConfidence + confidenceDelta);
      reason = `Severe ranking drop (${metrics.rankingDelta} positions)`;
    }
    // ... other conditions

    // Execute atomic transaction
    const transaction = redis.multi();

    transaction.hset(patternKey, {
      confidence: newConfidence.toString(),
      last_performance_feedback: normalizeTimestamp(new Date()),
      last_feedback_content: contentId,
      last_feedback_ranking: metrics.averageRanking.toString(),
    });

    const result = await transaction.exec();

    if (result === null) {
      // Transaction aborted (key was modified)
      throw new PerformanceFeedbackError(
        `Concurrent modification detected for pattern ${appliedPattern.patternId}`,
        'FEEDBACK_FAILED'
      );
    }

    return {
      patternId: appliedPattern.patternId,
      patternName: appliedPattern.patternName,
      previousConfidence,
      newConfidence,
      delta: confidenceDelta,
      reason,
      contentId,
      metrics,
      feedbackAt: normalizeTimestamp(new Date()),
    };
  } catch (error) {
    await redis.unwatch();
    throw error;
  }
}
```

---

### P2-2: Add Error Recovery and Retry Logic (MEDIUM-7)

**Impact:** Resilience to transient failures
**Effort:** 2.5 hours
**File:** `planning/seo/lib/performance-feedback.ts`

```typescript
interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
};

function isRetriableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();

  // Network errors (retriable)
  if (message.includes('econnreset')) return true;
  if (message.includes('econnrefused')) return true;
  if (message.includes('timeout')) return true;
  if (message.includes('eagain')) return true;

  // Redis temporary errors (retriable)
  if (message.includes('noauth')) return false; // Auth error, don't retry
  if (message.includes('wrongtype')) return false; // Logic error, don't retry

  return false;
}

async function executeWithRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> {
  let lastError: Error | null = null;
  let delayMs = config.initialDelayMs;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === config.maxRetries || !isRetriableError(error)) {
        throw error;
      }

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delayMs));

      // Exponential backoff
      delayMs = Math.min(delayMs * config.backoffMultiplier, config.maxDelayMs);
    }
  }

  throw lastError || new Error('Retry exhausted');
}

// Use in batch processing:
export async function batchProcessPerformanceFeedback(
  contentPerformances: ReadonlyArray<ContentPerformance>,
  redis: Redis,
  store: string = 'pattern:local',
  rules: ConfidenceAdjustmentRules = DEFAULT_ADJUSTMENT_RULES
): Promise<ReadonlyArray<AggregateFeedbackResult>> {
  const results: AggregateFeedbackResult[] = [];

  for (const contentPerformance of contentPerformances) {
    try {
      const result = await executeWithRetry(
        () => processPerformanceFeedback(
          contentPerformance,
          redis,
          store,
          rules
        )
      );

      results.push(result);
    } catch (error) {
      console.error(
        `Failed to process feedback for content ${contentPerformance.contentId} after retries:`,
        error
      );

      results.push({
        contentId: contentPerformance.contentId,
        patternsUpdated: 0,
        patternResults: [],
        totalConfidenceDelta: 0,
        feedbackAt: normalizeTimestamp(new Date()),
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return results;
}
```

---

### P2-3: Add JSON Parsing Error Recovery (MEDIUM-8)

**Impact:** DoS via malformed Redis data
**Effort:** 1.5 hours

**Standardize JSON parsing across all files:**

```typescript
interface ParseOptions<T> {
  validator?: (value: unknown) => value is T;
  onError?: 'throw' | 'skip' | 'default';
  defaultValue?: T;
}

function safeJsonParse<T = unknown>(
  jsonString: string,
  options: ParseOptions<T> = {}
): T | null {
  const {
    validator,
    onError = 'skip',
    defaultValue = null,
  } = options;

  try {
    const parsed = JSON.parse(jsonString);

    if (validator && !validator(parsed)) {
      if (onError === 'throw') {
        throw new Error(`Validation failed for parsed JSON`);
      }

      if (onError === 'default' && defaultValue) {
        return defaultValue;
      }

      return null;
    }

    return parsed as T;
  } catch (error) {
    console.error(
      `Failed to parse JSON: ${jsonString.substring(0, 100)}... - ${
        error instanceof Error ? error.message : String(error)
      }`
    );

    if (onError === 'throw') {
      throw error;
    }

    if (onError === 'default' && defaultValue) {
      return defaultValue;
    }

    return null;
  }
}

// Use in all JSON parsing:
async function fetchAppliedPatterns(
  contentId: string,
  redis: Redis,
  store: string
): Promise<AppliedPatternReference[]> {
  const sanitized = sanitizeContentId(contentId);
  const appliedKey = `content:performance:${sanitized}:applied_patterns`;
  const appliedData = await redis.lrange(appliedKey, 0, -1);

  const patterns: AppliedPatternReference[] = [];

  for (const entry of appliedData) {
    const pattern = safeJsonParse<AppliedPatternReference>(entry, {
      validator: isValidAppliedPatternReference,
      onError: 'skip',
    });

    if (pattern) {
      patterns.push(pattern);
    }
  }

  return patterns;
}
```

---

## Testing Strategy

### Unit Tests to Add

Create new test file: `planning/seo/tests/security.test.ts`

```typescript
describe('Security Tests', () => {
  describe('Input Validation', () => {
    test('rejects invalid metric values', () => {
      // Test unbounded metrics
    });

    test('rejects invalid timestamps', () => {
      // Test future/old dates
    });

    test('rejects SSRF URLs', () => {
      // Test localhost, private IPs
    });

    test('rejects invalid pattern IDs', () => {
      // Test injection patterns
    });
  });

  describe('Redis Injection Prevention', () => {
    test('sanitizes content IDs before key construction', () => {
      // Test colon injection
    });

    test('prevents namespace pollution', () => {
      // Test key enumeration
    });
  });

  describe('Shell Script Security', () => {
    test('validates inputs before use', () => {
      // Test execution order
    });

    test('prevents command injection', () => {
      // Test metacharacters
    });
  });

  describe('Concurrency', () => {
    test('handles concurrent pattern updates atomically', () => {
      // Test race conditions
    });
  });

  describe('Error Handling', () => {
    test('recovers from transient failures', () => {
      // Test retry logic
    });

    test('handles malformed JSON gracefully', () => {
      // Test error recovery
    });
  });
});
```

### Integration Tests

```bash
# Security integration test suite
./tests/security/test-step13-security.sh --mode integration
```

---

## Deployment Checklist

- [ ] Phase 0 fixes implemented and tested
- [ ] Code review completed by security specialist
- [ ] All unit tests passing (>90% coverage)
- [ ] Integration tests passing
- [ ] No new security warnings from linter
- [ ] Phase 1 fixes implemented
- [ ] Phase 1 code review and testing
- [ ] Phase 2 fixes (next sprint)
- [ ] Security re-audit after phase 2
- [ ] Documentation updated
- [ ] Team training on secure coding practices

---

## References

- OWASP Top 10 (2021): https://owasp.org/Top10/
- CWE Mappings: https://cwe.mitre.org/
- CVSS Calculator: https://www.first.org/cvss/calculator/3.1

---

**Remediation Guide Version:** 1.0
**Last Updated:** December 2, 2025
**Status:** Ready for Implementation
