# sec-1.5 Implementation Guide: API Response Validation

Quick reference for implementing validated API calls in TypeScript with Zod schemas and error handling.

## Pattern Overview

### 1. Define Typed Error Classes

```typescript
import { z } from 'zod';

export class ApiError extends Error {
  constructor(message: string, public statusCode?: number, public originalError?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

export class NetworkError extends Error {
  constructor(message: string, public originalError?: unknown) {
    super(message);
    this.name = 'NetworkError';
  }
}

export class ValidationError extends Error {
  constructor(message: string, public schemaError?: z.ZodError) {
    super(message);
    this.name = 'ValidationError';
  }
}
```

### 2. Define Response Schemas

```typescript
// Generic API response
const ApiResponseSchema = z.object({
  status: z.string().optional(),
  error: z.string().optional(),
  data: z.unknown().optional(),
});

// Specific response for your API
const RuVectorResponseSchema = z.object({
  id: z.string().optional(),
  success: z.boolean().optional(),
  error: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});
```

### 3. Implement Validation Helper

```typescript
function validateApiResponse<T>(
  response: unknown,
  schema: z.ZodSchema<T>,
  operationName: string
): T {
  const result = schema.safeParse(response);

  if (!result.success) {
    const errorDetails = result.error.errors
      .map(e => `${e.path.join('.')}: ${e.message}`)
      .join('; ');

    throw new ValidationError(
      `Invalid ${operationName} response: ${errorDetails}`,
      result.error
    );
  }

  return result.data;
}
```

### 4. Implement Network-Safe Wrapper

```typescript
async function safeApiCall<T>(
  operation: () => Promise<T>,
  timeoutMs = 10000,
  operationName = 'API call'
): Promise<T> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const result = await Promise.race([
        operation(),
        new Promise<T>((_, reject) =>
          controller.signal.addEventListener('abort', () => {
            reject(
              new NetworkError(
                `${operationName} timed out after ${timeoutMs}ms`,
                new Error('AbortError')
              )
            );
          })
        ),
      ]);

      clearTimeout(timeoutId);
      return result;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    // Error categorization
    if (error instanceof NetworkError || error instanceof ValidationError || error instanceof ApiError) {
      throw error;
    }

    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new NetworkError(
        `Network request failed for ${operationName}: connectivity issue`,
        error
      );
    }

    if (error instanceof Error && error.message.includes('AbortError')) {
      throw new NetworkError(`${operationName} timeout: no response within ${timeoutMs}ms`);
    }

    throw new ApiError(`${operationName} failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
```

## Usage Patterns

### Pattern 1: Fire-and-Forget with Error Logging

Use for non-critical operations that should not block (e.g., analytics, learning).

```typescript
async function captureEvent(payload: EventPayload): Promise<void> {
  try {
    const result = await safeApiCall(
      async () => {
        const response = await api.capture(payload);
        return validateApiResponse(response, EventResponseSchema, 'Event capture');
      },
      10000,
      'Event capture operation'
    );

    console.log('Event captured successfully');
  } catch (error) {
    // Log error but don't throw - operation is fire-and-forget
    if (error instanceof ValidationError) {
      console.warn(`Event capture failed: Schema validation error: ${error.message}`);
    } else if (error instanceof NetworkError) {
      console.warn(`Event capture failed: Network error: ${error.message}`);
    } else if (error instanceof ApiError) {
      console.warn(`Event capture failed: API error (${error.statusCode}): ${error.message}`);
    }
  }
}
```

### Pattern 2: Blocking Operation with Error Propagation

Use for critical operations that must succeed.

```typescript
async function queryDatabase(query: string): Promise<DatabaseResult> {
  try {
    const result = await safeApiCall(
      async () => {
        const response = await db.query(query);
        return validateApiResponse(response, DatabaseResultSchema, 'Database query');
      },
      30000, // Longer timeout for complex queries
      'Database query operation'
    );

    return result;
  } catch (error) {
    // Re-throw for caller to handle
    if (error instanceof ValidationError) {
      throw new Error(`Invalid database response: ${error.message}`);
    }
    if (error instanceof NetworkError) {
      throw new Error(`Database unavailable: ${error.message}`);
    }
    throw error;
  }
}
```

### Pattern 3: Graceful Degradation with Fallback

Use for operations that can fall back to defaults on failure.

```typescript
async function findSimilarItems(query: string): Promise<SimilarItem[]> {
  try {
    const results = await safeApiCall(
      async () => {
        const response = await searchApi.find(query);
        return validateApiResponse(response, SearchResponseSchema, 'Similar items search');
      },
      5000,
      'Similar items search'
    );

    return results;
  } catch (error) {
    // Log error but return empty results
    console.warn(`Search failed, returning empty results: ${error instanceof Error ? error.message : String(error)}`);
    return []; // Graceful fallback
  }
}
```

## Common Errors and Fixes

### Error: "Cannot read property 'id' of undefined"

**Before** (vulnerable):
```typescript
const response = await collection.insert({...});
const id = response.id; // Crashes if response is undefined
```

**After** (fixed):
```typescript
const response = await safeApiCall(
  async () => {
    const resp = await collection.insert({...});
    return validateApiResponse(resp, RuVectorResponseSchema, 'insert');
  },
  10000,
  'RuVector insert'
);
const id = response.id; // Safe - validation guaranteed id exists
```

### Error: "Network request timed out"

**Before** (vulnerable):
```typescript
const results = await collection.search({...}); // Hangs if network is slow
```

**After** (fixed):
```typescript
const results = await safeApiCall(
  async () => {
    const resp = await collection.search({...});
    return validateApiResponse(resp, SearchResponseSchema, 'search');
  },
  10000, // Automatically times out after 10 seconds
  'RuVector search'
);
```

### Error: "error.foo is not a string"

**Before** (vulnerable):
```typescript
const response = await api.call();
const value = response.foo.toUpperCase(); // Crashes if foo is wrong type
```

**After** (fixed):
```typescript
const ResponseSchema = z.object({
  foo: z.string(),
});

const response = await safeApiCall(
  async () => {
    const resp = await api.call();
    return validateApiResponse(resp, ResponseSchema, 'API call');
  },
  10000,
  'API call'
);
const value = response.foo.toUpperCase(); // Safe - foo is guaranteed string
```

## Testing Patterns

### Test 1: Valid Response

```typescript
it('should handle valid response', async () => {
  const schema = z.object({ id: z.string() });
  const validResponse = { id: '123' };

  const result = validateApiResponse(validResponse, schema, 'test');

  expect(result.id).toBe('123');
});
```

### Test 2: Invalid Response

```typescript
it('should throw ValidationError on invalid response', () => {
  const schema = z.object({ id: z.string() });
  const invalidResponse = { id: 123 }; // Wrong type

  expect(() => {
    validateApiResponse(invalidResponse, schema, 'test');
  }).toThrow(ValidationError);
});
```

### Test 3: Network Timeout

```typescript
it('should timeout on slow operation', async () => {
  const slowOp = new Promise(resolve => {
    setTimeout(() => resolve('done'), 5000);
  });

  await expect(
    safeApiCall(() => slowOp, 100, 'slow operation')
  ).rejects.toThrow(NetworkError);
});
```

### Test 4: Error Categorization

```typescript
it('should categorize fetch errors as NetworkError', async () => {
  const fetchError = new TypeError('Failed to fetch');

  if (fetchError instanceof TypeError && fetchError.message.includes('fetch')) {
    const error = new NetworkError('Network failed', fetchError);
    expect(error).toBeInstanceOf(NetworkError);
  }
});
```

## Best Practices

### 1. Always Validate Before Using

```typescript
// Bad
const data = await api.fetch();
const value = data.nested.field; // May crash

// Good
const data = await validateApiResponse(
  await api.fetch(),
  MySchema,
  'fetch'
);
const value = data.nested.field; // Safe
```

### 2. Use Specific Schemas

```typescript
// Bad - too permissive
const AnySchema = z.object({
  data: z.unknown(),
});

// Good - strict validation
const SpecificSchema = z.object({
  taskId: z.string(),
  score: z.number().min(0).max(1),
  metadata: z.object({
    timestamp: z.number(),
    source: z.string(),
  }),
});
```

### 3. Handle Errors by Type

```typescript
// Bad - catch-all
try {
  const result = await operation();
} catch (error) {
  console.error('Operation failed:', error);
}

// Good - type-specific handling
try {
  const result = await operation();
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Invalid response:', error.message);
  } else if (error instanceof NetworkError) {
    console.error('Network unavailable:', error.message);
  } else if (error instanceof ApiError) {
    console.error(`API error (${error.statusCode}):`, error.message);
  }
}
```

### 4. Set Appropriate Timeouts

```typescript
// Search operations: 5-10 seconds
await safeApiCall(async () => db.search(query), 5000, 'search');

// Database queries: 30 seconds (may be slower)
await safeApiCall(async () => db.query(sql), 30000, 'query');

// Quick operations: 2-3 seconds
await safeApiCall(async () => cache.get(key), 2000, 'cache get');
```

## Debugging Tips

### Enable Verbose Logging

```typescript
if (process.env.DEBUG_API) {
  console.log(`[API] Calling ${operationName}...`);
  console.time(`${operationName}`);

  const result = await safeApiCall(operation, timeoutMs, operationName);

  console.timeEnd(`${operationName}`);
  console.log(`[API] Success:`, result);

  return result;
}
```

### Capture Request/Response

```typescript
async function safeApiCallWithLogging<T>(
  operation: () => Promise<T>,
  timeoutMs = 10000,
  operationName = 'API call'
): Promise<T> {
  const startTime = Date.now();

  try {
    const result = await safeApiCall(operation, timeoutMs, operationName);
    const duration = Date.now() - startTime;

    console.log(`[${operationName}] SUCCESS (${duration}ms)`);
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;

    console.error(`[${operationName}] FAILED (${duration}ms):`, error);
    throw error;
  }
}
```

### Monitor Error Distribution

```typescript
const errorStats = {
  validation: 0,
  network: 0,
  api: 0,
  other: 0,
};

function trackError(error: unknown) {
  if (error instanceof ValidationError) errorStats.validation++;
  else if (error instanceof NetworkError) errorStats.network++;
  else if (error instanceof ApiError) errorStats.api++;
  else errorStats.other++;

  console.log('Error distribution:', errorStats);
}
```

## Summary

The sec-1.5 pattern provides:

1. **Type Safety**: Typed errors for proper handling
2. **Schema Validation**: Zod ensures data contracts
3. **Network Resilience**: Timeouts prevent hangs
4. **Error Categorization**: Distinguish between failure types
5. **Security Audit Trail**: Error context preserved

Apply this pattern to all external API calls in your codebase.
