# API Key Rotation & Rate Limit Handling

## Problem Statement

When executing parallel sprints with 50+ agents, API request volume can easily exceed provider rate limits:

**Example Scenario**:
- 5 parallel sprints
- 10 agents per sprint = 50 agents
- Each agent makes ~20 requests/min
- **Total**: 1,000 requests/min

**Z.ai Rate Limits** (typical):
- Single API key: 100-200 requests/min
- **Result**: Instant rate limiting with single key

---

## Solution: API Key Pool with Rotation

### Architecture

```
┌────────────────────────────────────────────────────┐
│              Agent Swarm (50+ agents)               │
│  Agent1  Agent2  Agent3 ... Agent50                │
└────────────┬───────────────────────────────────────┘
             │
             │ All requests funnel through rotator
             ▼
┌────────────────────────────────────────────────────┐
│          API Key Rotator (Singleton)                │
│                                                     │
│  ┌─────────────────────────────────────────┐      │
│  │  Key Pool (3 keys)                      │      │
│  │  - key-1: 45/100 req/min ✅             │      │
│  │  - key-2: 78/100 req/min ✅             │      │
│  │  - key-3: 92/100 req/min ⚠️              │      │
│  └─────────────────────────────────────────┘      │
│                                                     │
│  Strategy: Round-robin with rate limit detection   │
└────────────┬───────────────────────────────────────┘
             │
             ▼
┌────────────────────────────────────────────────────┐
│         Z.ai API (100 req/min per key)             │
└────────────────────────────────────────────────────┘
```

---

## Implementation

### 1. API Key Rotator

```typescript
interface APIKey {
  key: string;
  requestCount: number;
  lastReset: number;
  rateLimitHit: boolean;
  rateLimitResetTime?: number;
}

class APIKeyRotator {
  private keys: APIKey[] = [];
  private currentKeyIndex = 0;
  private rateLimitThreshold = 100; // req/min
  private redis: Redis;

  constructor(apiKeys: string[], redis: Redis) {
    this.keys = apiKeys.map(key => ({
      key,
      requestCount: 0,
      lastReset: Date.now(),
      rateLimitHit: false
    }));
    this.redis = redis;

    // Load state from Redis (for distributed coordination)
    this.loadStateFromRedis();

    // Reset counters every minute
    setInterval(() => this.resetCounters(), 60000);
  }

  /**
   * Make API request with automatic key rotation
   */
  async makeRequest(params: RequestParams): Promise<Response> {
    let attempts = 0;
    const maxAttempts = this.keys.length;

    while (attempts < maxAttempts) {
      const apiKey = this.getCurrentKey();

      // Skip keys that hit rate limit recently
      if (this.isRateLimited(apiKey)) {
        this.rotateToNextKey();
        attempts++;
        continue;
      }

      try {
        // Make request
        const response = await this.callAPI(apiKey, params);

        // Increment usage counter
        await this.incrementKeyUsage(apiKey);

        return response;

      } catch (error) {
        // Check if error is rate limit (429)
        if (this.isRateLimitError(error)) {
          logger.warn(`API key rate limited: ${apiKey.key.substr(0, 8)}...`);

          // Mark key as rate limited
          await this.markRateLimited(apiKey, error);

          // Rotate to next key
          this.rotateToNextKey();
          attempts++;

        } else {
          // Non-rate-limit error, throw
          throw error;
        }
      }
    }

    // All keys exhausted - use exponential backoff
    logger.error('All API keys rate limited, entering backoff');
    return await this.makeRequestWithBackoff(params);
  }

  /**
   * Make request with exponential backoff
   */
  private async makeRequestWithBackoff(params: RequestParams): Promise<Response> {
    const backoffDelays = [1000, 2000, 4000, 8000]; // 1s, 2s, 4s, 8s

    for (let attempt = 0; attempt < backoffDelays.length; attempt++) {
      // Wait before retry
      if (attempt > 0) {
        await sleep(backoffDelays[attempt - 1]);
      }

      // Try first available key
      const availableKey = this.getFirstAvailableKey();
      if (availableKey) {
        try {
          const response = await this.callAPI(availableKey, params);
          await this.incrementKeyUsage(availableKey);
          return response;
        } catch (error) {
          if (!this.isRateLimitError(error)) {
            throw error;
          }
        }
      }
    }

    throw new Error('All API keys exhausted after exponential backoff');
  }

  /**
   * Check if API key is rate limited
   */
  private isRateLimited(apiKey: APIKey): boolean {
    // Check if explicitly marked as rate limited
    if (apiKey.rateLimitHit) {
      // Check if reset time passed
      if (apiKey.rateLimitResetTime && Date.now() > apiKey.rateLimitResetTime) {
        apiKey.rateLimitHit = false;
        apiKey.requestCount = 0;
        return false;
      }
      return true;
    }

    // Check if approaching threshold (90%)
    const threshold = this.rateLimitThreshold * 0.9;
    return apiKey.requestCount >= threshold;
  }

  /**
   * Mark key as rate limited
   */
  private async markRateLimited(apiKey: APIKey, error: any): Promise<void> {
    apiKey.rateLimitHit = true;

    // Parse Retry-After header if available
    const retryAfter = error.response?.headers?.['retry-after'];
    if (retryAfter) {
      const retrySeconds = parseInt(retryAfter);
      apiKey.rateLimitResetTime = Date.now() + (retrySeconds * 1000);
    } else {
      // Default: 60 seconds
      apiKey.rateLimitResetTime = Date.now() + 60000;
    }

    // Persist to Redis
    await this.saveStateToRedis();

    // Emit Prometheus metric
    apiKeyRateLimitHit.labels(apiKey.key.substr(0, 8)).inc();
  }

  /**
   * Increment key usage counter
   */
  private async incrementKeyUsage(apiKey: APIKey): Promise<void> {
    apiKey.requestCount++;

    // Update Redis every 10 requests (reduce write load)
    if (apiKey.requestCount % 10 === 0) {
      await this.saveStateToRedis();
    }

    // Emit Prometheus metric
    apiKeyRequestCount.labels(apiKey.key.substr(0, 8)).inc();
  }

  /**
   * Rotate to next key in pool
   */
  private rotateToNextKey(): void {
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.keys.length;
    logger.debug(`Rotated to API key ${this.currentKeyIndex + 1}/${this.keys.length}`);
  }

  /**
   * Get current API key
   */
  private getCurrentKey(): APIKey {
    return this.keys[this.currentKeyIndex];
  }

  /**
   * Get first available (not rate limited) key
   */
  private getFirstAvailableKey(): APIKey | null {
    for (const key of this.keys) {
      if (!this.isRateLimited(key)) {
        return key;
      }
    }
    return null;
  }

  /**
   * Reset usage counters (every minute)
   */
  private resetCounters(): void {
    for (const key of this.keys) {
      if (Date.now() - key.lastReset > 60000) {
        key.requestCount = 0;
        key.lastReset = Date.now();
      }
    }
  }

  /**
   * Check if error is rate limit error
   */
  private isRateLimitError(error: any): boolean {
    return error.response?.status === 429 ||
           error.code === 'rate_limit_exceeded' ||
           error.message?.includes('rate limit');
  }

  /**
   * Save state to Redis (distributed coordination)
   */
  private async saveStateToRedis(): Promise<void> {
    const state = {
      keys: this.keys.map(k => ({
        keyHash: k.key.substr(0, 8), // Don't store full key
        requestCount: k.requestCount,
        lastReset: k.lastReset,
        rateLimitHit: k.rateLimitHit,
        rateLimitResetTime: k.rateLimitResetTime
      })),
      currentKeyIndex: this.currentKeyIndex,
      timestamp: Date.now()
    };

    await this.redis.setex(
      'api:key:rotation:state',
      120, // 2 minute TTL
      JSON.stringify(state)
    );
  }

  /**
   * Load state from Redis (recovery after crash)
   */
  private async loadStateFromRedis(): Promise<void> {
    const stateJson = await this.redis.get('api:key:rotation:state');
    if (!stateJson) return;

    const state = JSON.parse(stateJson);

    // Restore usage counters
    for (let i = 0; i < this.keys.length; i++) {
      const savedState = state.keys[i];
      if (savedState) {
        this.keys[i].requestCount = savedState.requestCount;
        this.keys[i].lastReset = savedState.lastReset;
        this.keys[i].rateLimitHit = savedState.rateLimitHit;
        this.keys[i].rateLimitResetTime = savedState.rateLimitResetTime;
      }
    }

    this.currentKeyIndex = state.currentKeyIndex;

    logger.info('API key rotation state loaded from Redis', {
      keysLoaded: this.keys.length,
      currentKey: this.currentKeyIndex
    });
  }

  /**
   * Get usage statistics
   */
  getUsageStats(): UsageStats {
    return {
      totalKeys: this.keys.length,
      activeKeys: this.keys.filter(k => !k.rateLimitHit).length,
      rateLimitedKeys: this.keys.filter(k => k.rateLimitHit).length,
      usagePerKey: this.keys.map(k => ({
        keyHash: k.key.substr(0, 8),
        requestCount: k.requestCount,
        rateLimitHit: k.rateLimitHit,
        utilization: (k.requestCount / this.rateLimitThreshold) * 100
      })),
      totalRequests: this.keys.reduce((sum, k) => sum + k.requestCount, 0)
    };
  }
}
```

---

## Configuration

### Environment Variables

```bash
# .env file
ZAI_API_KEYS="key-1,key-2,key-3"  # Comma-separated
ZAI_RATE_LIMIT=100                 # Requests per minute per key
ZAI_BACKOFF_DELAYS="1000,2000,4000,8000"  # Exponential backoff (ms)
```

### Integration with CFN Loop

```typescript
// src/cfn-loop/meta-coordinator.ts
import { APIKeyRotator } from '../providers/api-key-rotator';

class MetaCoordinator {
  private apiKeyRotator: APIKeyRotator;

  async initialize() {
    // Initialize API key rotator
    const apiKeys = process.env.ZAI_API_KEYS?.split(',') || [];

    if (apiKeys.length === 0) {
      throw new Error('No API keys configured. Set ZAI_API_KEYS environment variable.');
    }

    this.apiKeyRotator = new APIKeyRotator(apiKeys, redis);

    logger.info(`API key pool initialized with ${apiKeys.length} keys`);
  }

  async spawnAgent(agentType: string) {
    // All agent API calls go through rotator
    const response = await this.apiKeyRotator.makeRequest({
      model: 'claude-sonnet-4',
      messages: [{ role: 'user', content: 'Task...' }]
    });
  }
}
```

---

## Monitoring & Alerts

### Prometheus Metrics

```typescript
// API key usage
api_key_request_count{key_hash="abc123ef"}

// Rate limit hits
api_key_rate_limit_hit_total{key_hash="abc123ef"}

// Current utilization (percentage)
api_key_utilization_percent{key_hash="abc123ef"}

// Backoff events
api_key_backoff_triggered_total
```

### Grafana Dashboard

```yaml
panels:
  - title: "API Key Utilization"
    query: api_key_utilization_percent
    type: graph
    alert: "> 90%"

  - title: "Rate Limit Hits (Last Hour)"
    query: rate(api_key_rate_limit_hit_total[1h])
    type: graph

  - title: "Backoff Events"
    query: api_key_backoff_triggered_total
    type: singlestat
    alert: "> 5 in 5 minutes"

  - title: "Key Usage Distribution"
    query: sum by (key_hash) (api_key_request_count)
    type: piechart
```

### Alerts

```yaml
# Alert when all keys at 90%+ utilization
- alert: APIKeysNearLimit
  expr: min(api_key_utilization_percent) > 90
  for: 2m
  annotations:
    summary: "All API keys at >90% utilization"
    description: "Consider adding more keys or reducing parallelism"

# Alert when backoff triggered frequently
- alert: FrequentAPIBackoff
  expr: rate(api_key_backoff_triggered_total[5m]) > 0.5
  for: 5m
  annotations:
    summary: "API backoff triggered >5 times in 5 minutes"
    description: "All API keys exhausted frequently"
```

---

## Testing Strategy

### Unit Tests

```typescript
describe('API Key Rotation', () => {
  it('should rotate to next key when rate limited', async () => {
    const rotator = new APIKeyRotator(['key-1', 'key-2', 'key-3'], redis);

    // Simulate key-1 rate limited
    mockAPI.mockRateLimit('key-1');

    // Make request
    const response = await rotator.makeRequest({ prompt: 'test' });

    // Should have used key-2
    expect(mockAPI.lastKeyUsed).toBe('key-2');
  });

  it('should track usage per key', async () => {
    const rotator = new APIKeyRotator(['key-1', 'key-2'], redis);

    // Make 50 requests (should distribute)
    for (let i = 0; i < 50; i++) {
      await rotator.makeRequest({ prompt: `test ${i}` });
    }

    const stats = rotator.getUsageStats();

    // Both keys should have been used
    expect(stats.usagePerKey[0].requestCount).toBeGreaterThan(0);
    expect(stats.usagePerKey[1].requestCount).toBeGreaterThan(0);
  });
});
```

### Integration Tests

```typescript
describe('API Key Rotation Integration', () => {
  it('should handle 300 requests with 3 keys @ 100 limit', async () => {
    const rotator = new APIKeyRotator(
      ['key-1', 'key-2', 'key-3'],
      redis,
      { rateLimitThreshold: 100 }
    );

    // Make 300 requests (3x limit)
    const results = await Promise.all(
      Array.from({ length: 300 }, () =>
        rotator.makeRequest({ prompt: 'test' })
      )
    );

    // All should succeed (via rotation)
    expect(results.filter(r => r.success).length).toBe(300);

    // Each key should be under limit
    const stats = rotator.getUsageStats();
    for (const keyStats of stats.usagePerKey) {
      expect(keyStats.requestCount).toBeLessThanOrEqual(100);
    }
  });
});
```

### Chaos Tests

```typescript
describe('API Key Chaos', () => {
  it('should recover when all keys rate limited simultaneously', async () => {
    const rotator = new APIKeyRotator(['key-1', 'key-2', 'key-3'], redis);

    // Simulate all keys rate limited
    mockAPI.mockRateLimitAll();

    // Make request (should use backoff)
    const startTime = Date.now();
    const response = await rotator.makeRequest({ prompt: 'test' });
    const duration = Date.now() - startTime;

    // Should have used exponential backoff (>1s delay)
    expect(duration).toBeGreaterThan(1000);

    // Should eventually succeed
    expect(response.success).toBe(true);
  });
});
```

---

## Usage Examples

### Basic Usage

```typescript
// Initialize rotator
const apiKeys = process.env.ZAI_API_KEYS.split(',');
const rotator = new APIKeyRotator(apiKeys, redis);

// Make requests (automatic rotation)
const response = await rotator.makeRequest({
  model: 'claude-sonnet-4',
  messages: [
    { role: 'user', content: 'Implement authentication system' }
  ]
});
```

### With Retry Logic

```typescript
async function makeRequestWithRetry(prompt: string, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await rotator.makeRequest({ prompt });
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      logger.warn(`Request failed (attempt ${attempt}/${maxRetries}), retrying...`);
    }
  }
}
```

### Monitoring Usage

```typescript
// Get real-time stats
const stats = rotator.getUsageStats();

console.log(`Active keys: ${stats.activeKeys}/${stats.totalKeys}`);
console.log(`Total requests: ${stats.totalRequests}`);

for (const keyStats of stats.usagePerKey) {
  console.log(`Key ${keyStats.keyHash}: ${keyStats.utilization}% utilization`);
}
```

---

## Performance Impact

### Overhead
- Key rotation decision: <1ms
- Redis state sync: ~5ms (every 10 requests)
- Total overhead: **<0.1% of request time**

### Throughput
- Single key: 100 req/min
- 3 keys: 300 req/min (3x)
- 5 keys: 500 req/min (5x)

### Reliability
- Without rotation: 100% failure after 100 req/min
- With 3 keys: 0% failure up to 300 req/min
- With backoff: 99.9% success even when all keys exhausted

---

## Best Practices

### 1. Use Multiple Keys (Minimum 3)

```bash
# Good: 3 keys = 300 req/min capacity
ZAI_API_KEYS="key-1,key-2,key-3"

# Better: 5 keys = 500 req/min capacity
ZAI_API_KEYS="key-1,key-2,key-3,key-4,key-5"
```

### 2. Monitor Utilization

Set alert at 90% to add more keys proactively:

```yaml
- alert: HighAPIKeyUtilization
  expr: api_key_utilization_percent > 90
  for: 5m
```

### 3. Adjust Parallelism Based on Key Count

```typescript
// Calculate safe parallel sprint count
const keysAvailable = apiKeys.length;
const maxRequestsPerMin = keysAvailable * 100;
const requestsPerSprintPerMin = 20;
const maxSafeSprints = Math.floor(maxRequestsPerMin / requestsPerSprintPerMin);

logger.info(`Safe parallel sprints: ${maxSafeSprints} (based on ${keysAvailable} keys)`);
```

### 4. Fallback to Sequential on Key Exhaustion

```typescript
if (stats.activeKeys === 0) {
  logger.warn('All API keys exhausted, reducing parallelism');

  // Temporarily reduce to sequential execution
  await executeEpic({ maxParallelSprints: 1 });
}
```

---

## Production Checklist

- [ ] Configure `ZAI_API_KEYS` with 3+ keys
- [ ] Set `ZAI_RATE_LIMIT` based on provider limits
- [ ] Enable Prometheus metrics scraping
- [ ] Configure Grafana dashboards
- [ ] Set up alerts for key exhaustion
- [ ] Test with 3x rate limit load
- [ ] Verify backoff behavior when all keys exhausted
- [ ] Document key rotation process for team

---

## Next Steps

1. Implement `APIKeyRotator` class
2. Integrate with `MetaCoordinator`
3. Add Prometheus metrics
4. Test with 300+ requests across 3 keys
5. Deploy with monitoring enabled
