# TypeScript Fixes - Code Snippets Reference

Complete code changes for all 11 TypeScript compilation errors fixed in Iteration 3.

## 1. rate-limiter.ts

### Fix 1-2: RateLimiterState Initialization (Lines 63-72)

**Location:** Constructor initialization

```typescript
// BEFORE (ERROR: Missing properties)
this.state = {
  tokens: this.config.maxRequests,
  maxTokens: this.config.maxRequests,
  refillRate,
  lastRefill: new Date(),
  queue: [],
  totalRequests: 0,
  throttledRequests: 0,
};

// AFTER (FIXED: All properties included)
this.state = {
  tokens: this.config.maxRequests,
  maxTokens: this.config.maxRequests,
  refillRate,
  lastRefill: new Date(),
  queue: [],
  totalRequests: 0,
  throttledRequests: 0,
  isThrottled: false,          // ADDED
  estimatedWaitMs: 0,          // ADDED
};
```

### Fix 3: QueuedRequest Initialization (Lines 132-142)

**Location:** enqueueRequest method

```typescript
// BEFORE (ERROR: Missing createdAt)
const queuedRequest: QueuedRequest = {
  id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
  query,
  queuedAt: new Date(),
  priority: query.options?.priority || 'normal',
  retries: 0,
  maxRetries: 3,
  resolve: resolve as (result: ResearchResult) => void,
  reject,
};

// AFTER (FIXED: createdAt added, resolve properly typed)
const queuedRequest: QueuedRequest = {
  id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
  query,
  queuedAt: new Date(),
  createdAt: new Date(),      // ADDED
  priority: query.options?.priority || 'normal',
  retries: 0,
  maxRetries: 3,
  resolve,                     // FIXED: Removed unsafe cast
  reject,
};
```

### Fix 4: Promise Type (Lines 130, 120-121)

**Location:** enqueueRequest signature and acquireToken usage

```typescript
// BEFORE (ERROR: Promise<void> incompatible)
private enqueueRequest(query: ResearchQuery): Promise<void> {
  return new Promise((resolve, reject) => {
    // ...
    resolve: resolve as (result: ResearchResult) => void,
    // ...
  });
}

async acquireToken(query: ResearchQuery): Promise<void> {
  // ...
  return this.enqueueRequest(query);  // ERROR: Type mismatch
}

// AFTER (FIXED: Proper Promise type)
private enqueueRequest(query: ResearchQuery): Promise<ResearchResult> {
  return new Promise((resolve, reject) => {
    // ...
    resolve,  // No cast needed - types align
    // ...
  });
}

async acquireToken(query: ResearchQuery): Promise<void> {
  // ...
  await this.enqueueRequest(query);  // FIXED: Await handles the promise
}
```

### Fix 5: getStats() Return Type (Lines 239-276)

**Location:** getStats method return statement

```typescript
// BEFORE (ERROR: Missing properties in return)
return {
  currentTokens: this.state.tokens,
  requestsInWindow: this.state.maxTokens - this.state.tokens,
  queueLength: this.state.queue.length,
  totalRequests,
  throttledRequests,
  throttleRate,
  avgQueueWaitMs,
  // ERROR: Missing isThrottled and estimatedWaitMs
};

// AFTER (FIXED: All properties included)
// Calculate estimated wait time (how long until next token is available)
let estimatedWaitMs = 0;
if (this.state.tokens < 1) {
  // Calculate time until at least 1 token is available
  const tokensNeeded = 1 - this.state.tokens;
  const timeForTokens = tokensNeeded / this.state.refillRate;
  estimatedWaitMs = Math.ceil(timeForTokens * 1000);
}

return {
  currentTokens: this.state.tokens,
  requestsInWindow: this.state.maxTokens - this.state.tokens,
  queueLength: this.state.queue.length,
  totalRequests,
  throttledRequests,
  throttleRate,
  avgQueueWaitMs,
  isThrottled: this.state.isThrottled,     // ADDED
  estimatedWaitMs,                         // ADDED with calculation
};
```

---

## 2. research-cache.ts

### Fix 1-3: Union Type Property Access (Lines 93-115)

**Location:** generateCacheKey method

```typescript
// BEFORE (ERROR: Cannot access union type properties directly)
generateCacheKey(query: ResearchQuery): string {
  const keyData = {
    query: query.query,
    type: query.type,
    options: {
      maxResults: query.options?.maxResults,    // ERROR: doesn't exist on WebFetchOptions
      targetUrl: query.options?.targetUrl,      // ERROR: doesn't exist on WebSearchOptions
      deepCrawl: query.options?.deepCrawl,      // ERROR: doesn't exist on WebSearchOptions
    },
  };

  const keyString = JSON.stringify(keyData);
  return crypto.createHash('sha256').update(keyString).digest('hex');
}

// AFTER (FIXED: Type guards with 'in' operator)
generateCacheKey(query: ResearchQuery): string {
  const keyData: any = {
    query: query.query,
    type: query.type,
    options: {},
  };

  // Use type guards to safely access union type properties
  if (query.options) {
    if ('maxResults' in query.options) {
      keyData.options.maxResults = query.options.maxResults;
    }
    if ('targetUrl' in query.options) {
      keyData.options.targetUrl = query.options.targetUrl;
    }
    if ('deepCrawl' in query.options) {
      keyData.options.deepCrawl = query.options.deepCrawl;
    }
  }

  const keyString = JSON.stringify(keyData);
  return crypto.createHash('sha256').update(keyString).digest('hex');
}
```

**Key Pattern: Type Guards with 'in' operator**
```typescript
// Safe pattern for union types
if ('propertyName' in unionObject) {
  // Now propertyName is known to exist - TypeScript is happy
  const value = unionObject.propertyName;
}
```

---

## 3. error-sanitizer.ts

### Fix 1-3: Error Type Casting (Multiple locations)

**Location:** sanitize method (Lines 49-94)

```typescript
// BEFORE (ERROR: Unsafe Error casting)
static sanitize(error: Error): Error {
  const sanitized = new Error(error.message);
  sanitized.name = error.name;

  if (error.stack) {
    sanitized.stack = error.stack;
  }

  // ERROR: Cannot cast Error to Record<string, unknown>
  const errorObj = error as Record<string, unknown>;

  if (errorObj.context && typeof errorObj.context === 'object') {
    // ERROR: Unsafe casting of context
    const originalContext = errorObj.context as Record<string, unknown>;
    // ...
  }

  // ERROR: Unsafe casting in assignment
  (sanitized as Record<string, unknown>).context = sanitizedContext;

  return sanitized;
}

// AFTER (FIXED: Safe casting via unknown intermediate)
static sanitize(error: Error): Error {
  const sanitized = new Error(error.message);
  sanitized.name = error.name;

  if (error.stack) {
    sanitized.stack = error.stack;
  }

  // FIXED: Cast via unknown intermediate
  const errorObj = (error as unknown) as Record<string, unknown>;

  if (errorObj.context && typeof errorObj.context === 'object') {
    // FIXED: Safe casting via unknown
    const originalContext = (errorObj.context as unknown) as Record<string, unknown>;
    const sanitizedContext: Record<string, unknown> = {};

    // Copy over safe fields, redact sensitive ones
    for (const [key, value] of Object.entries(originalContext)) {
      if (this.isSensitiveField(key)) {
        sanitizedContext[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        // Recursively sanitize nested objects
        sanitizedContext[key] = this.sanitizeObject(value);
      } else {
        sanitizedContext[key] = value;
      }
    }

    // FIXED: Safe assignment via unknown
    ((sanitized as unknown) as Record<string, unknown>).context = sanitizedContext;
  }

  // Sanitize other custom properties
  for (const [key, value] of Object.entries(errorObj)) {
    if (
      key !== 'message' &&
      key !== 'name' &&
      key !== 'stack' &&
      key !== 'context' &&
      this.isSensitiveField(key)
    ) {
      // FIXED: Safe assignment via unknown
      ((sanitized as unknown) as Record<string, unknown>)[key] = '[REDACTED]';
    }
  }

  return sanitized;
}
```

### Additional Improvement: sanitizeContext Helper (Lines 102-121)

```typescript
// NEW: Helper method for cleaner, reusable context sanitization
private static sanitizeContext(context: unknown): Record<string, unknown> {
  if (!context || typeof context !== 'object') {
    return {};
  }

  const ctx = (context as unknown) as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(ctx)) {
    if (this.isSensitiveField(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = this.sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
```

**Key Pattern: Safe Type Casting**
```typescript
// UNSAFE (Direct cast)
const obj = error as Record<string, unknown>;  // TS2352 error

// SAFE (Via unknown intermediate)
const obj = (error as unknown) as Record<string, unknown>;  // Approved pattern
```

---

## Summary of Patterns

### Pattern 1: Complete Object Initialization
Always provide all required properties when creating typed objects:
```typescript
const obj: TypeName = {
  requiredProp1: value1,
  requiredProp2: value2,
  // Don't skip any required properties
};
```

### Pattern 2: Union Type Property Access
Use type guards to safely access properties that don't exist on all union members:
```typescript
if ('propertyName' in unionObject) {
  // Safe to access unionObject.propertyName here
}
```

### Pattern 3: Safe Type Casting
When casting types that don't overlap, use `unknown` as intermediate:
```typescript
const safeValue = (unsafeValue as unknown) as TargetType;
```

---

## Error Categories Fixed

| Category | Count | Files |
|----------|-------|-------|
| Missing Properties | 2 | rate-limiter.ts |
| Type Mismatches | 2 | rate-limiter.ts |
| Union Type Access | 3 | research-cache.ts |
| Unsafe Type Casting | 3 | error-sanitizer.ts |
| **Total** | **11** | **3 files** |

All errors have been resolved with type-safe implementations that follow TypeScript best practices.
