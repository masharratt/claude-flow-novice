# ADR-001: Middleware Stack Ordering

**Status**: Accepted
**Date**: 2025-10-11
**Context**: Phase 2 Sprint 2.1 - Unified Express Server Architecture

---

## Context and Problem Statement

The Express middleware stack execution order is critical for security, performance, and correctness. We need to define a clear, justified ordering of middleware that ensures:
1. Security checks happen before business logic
2. Request parsing happens before validation
3. Logging captures all requests regardless of authentication status
4. Error handling catches all exceptions

**Key Question**: What is the optimal middleware execution order for our unified Express server?

---

## Decision Drivers

1. **Security First**: Security-related middleware (Helmet, CORS) must execute before any business logic
2. **Performance**: Compression and caching should happen early to reduce downstream processing
3. **Observability**: Logging must capture all requests, including failed authentication attempts
4. **Error Handling**: Error handler must be last to catch all exceptions
5. **Standards Compliance**: Follow Express.js best practices and industry standards

---

## Considered Options

### Option 1: Security → Logging → Auth → Business Logic
```
1. Helmet (Security Headers)
2. CORS
3. Compression
4. Body Parsing
5. Request Logging
6. Rate Limiting
7. Authentication
8. Validation
9. Error Handler
```

**Pros**:
- Security headers applied to all responses
- Logging captures unauthenticated requests (useful for security monitoring)
- Rate limiting protects against DDoS before expensive auth checks

**Cons**:
- Logging happens after body parsing (no raw body logged)

### Option 2: Auth First → Security → Business Logic
```
1. Authentication
2. Helmet
3. CORS
4. Rate Limiting
5. Body Parsing
6. Request Logging
7. Validation
8. Error Handler
```

**Pros**:
- Reject unauthenticated requests immediately
- Less processing for invalid requests

**Cons**:
- Security headers not applied to 401 responses
- No logging of failed authentication attempts
- Rate limiting after auth (allows auth brute force)

### Option 3: Rate Limit First → Security → Auth → Business Logic
```
1. Rate Limiting
2. Helmet
3. CORS
4. Compression
5. Body Parsing
6. Authentication
7. Request Logging
8. Validation
9. Error Handler
```

**Pros**:
- Rate limiting protects all endpoints including auth
- Security headers on all responses

**Cons**:
- Logging after authentication (missed failed auth attempts)

---

## Decision Outcome

**Chosen Option**: Option 1 (Security → Logging → Auth → Business Logic)

### Final Middleware Stack:

```
Request
  ↓
1. Helmet (Security Headers)          ← Apply security headers to ALL responses
  ↓
2. CORS (Cross-Origin)                ← Allow cross-origin requests from whitelisted domains
  ↓
3. Compression (gzip)                 ← Compress responses early
  ↓
4. Body Parsing (JSON, urlencoded)    ← Parse request bodies
  ↓
5. Rate Limiting (100 req/min)        ← Protect against DDoS before expensive operations
  ↓
6. Request Logging (Winston)          ← Log ALL requests (including failed auth)
  ↓
7. Authentication (JWT/API Key)       ← Verify identity (applied to protected routes only)
  ↓
8. Validation (Zod schemas)           ← Validate request data (applied to routes with schemas)
  ↓
Route Handler                          ← Business logic
  ↓
9. Error Handler (catch-all)          ← Centralized error handling
  ↓
Response
```

---

## Rationale

### 1. Security Headers First (Helmet)
**Why**: Security headers must be applied to ALL responses, including error responses. Executing Helmet first ensures:
- `Content-Security-Policy` prevents XSS attacks
- `Strict-Transport-Security` enforces HTTPS
- `X-Frame-Options` prevents clickjacking
- `X-Content-Type-Options` prevents MIME sniffing

**Example**: If authentication fails (401), the response still needs security headers to prevent browser-based attacks.

### 2. CORS Second
**Why**: CORS preflight requests (OPTIONS) should be handled before any other processing. This reduces latency for cross-origin requests and prevents CORS errors from interfering with security headers.

**Example**: A frontend dashboard at `https://dashboard.example.com` making requests to `https://api.example.com` needs CORS headers on ALL responses.

### 3. Compression Third
**Why**: Compress responses as early as possible to reduce network bandwidth. Compression is stateless and doesn't require request context.

**Performance Impact**: gzip reduces response size by 70-80% for JSON payloads.

### 4. Body Parsing Fourth
**Why**: Request bodies must be parsed before any middleware that needs to read them (validation, logging, business logic).

**Example**: `req.body` is `undefined` until body parsing middleware executes.

### 5. Rate Limiting Fifth
**Why**: Protect against DDoS and brute force attacks BEFORE expensive operations (authentication, database queries). Rate limiting based on IP address doesn't require authentication.

**Security Impact**: Without rate limiting before auth, attackers can attempt unlimited JWT token brute force attacks.

### 6. Request Logging Sixth
**Why**: Log ALL requests, including:
- Failed authentication attempts (security monitoring)
- Rate-limited requests (abuse detection)
- Invalid requests (debugging)

**Observability Impact**: Logging after authentication means failed auth attempts are not logged, making security audits incomplete.

### 7. Authentication Seventh
**Why**: Authentication is applied selectively to protected routes. Public endpoints (e.g., `/api/health`) skip authentication.

**Implementation**:
```typescript
// Public endpoints (no auth)
app.get('/api/health', healthHandler);

// Protected endpoints (auth required)
app.get('/api/agents/hierarchy', authMiddleware, hierarchyHandler);
```

### 8. Validation Eighth
**Why**: Validate request data (query params, body, path params) AFTER authentication. Validation requires parsed request bodies.

**Example**:
```typescript
const interventionSchema = z.object({
  body: z.object({
    action: z.enum(['pause', 'resume', 'restart', 'terminate']),
    reason: z.string().min(10).max(500)
  })
});

app.post('/api/agents/:id/intervene',
  authMiddleware,
  validateRequest(interventionSchema),
  interventionHandler
);
```

### 9. Error Handler Last
**Why**: Error handler is a catch-all middleware that must be last to catch exceptions from all upstream middleware and route handlers.

**Implementation**:
```typescript
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(err.status || 500).json({
    error: err.message,
    timestamp: new Date().toISOString()
  });
});
```

---

## Consequences

### Positive
1. **Security**: Security headers applied to all responses (including errors)
2. **Observability**: All requests logged (including failed auth, rate limits)
3. **Performance**: Compression reduces bandwidth by 70-80%
4. **DDoS Protection**: Rate limiting before expensive operations
5. **Debugging**: Failed requests fully logged for troubleshooting

### Negative
1. **Slightly Increased Latency**: Logging all requests adds ~1-2ms overhead
2. **Rate Limit Before Auth**: Authenticated users share rate limit with unauthenticated users (mitigated by higher limits for authenticated users)

### Mitigation Strategies
1. **Async Logging**: Use async logging (Winston) to minimize latency impact
2. **Tiered Rate Limits**: Higher rate limits for authenticated users
3. **Cache Responses**: Cache frequently accessed endpoints (e.g., `/api/metrics`)

---

## Alternative Approaches

### Per-Route Middleware
Instead of global middleware, apply middleware per route:

```typescript
// NOT RECOMMENDED (duplicates code)
app.get('/api/agents/hierarchy',
  helmet(),
  cors(),
  compression(),
  express.json(),
  rateLimiter,
  requestLogger,
  authMiddleware,
  validateRequest(schema),
  hierarchyHandler
);
```

**Rejected Reason**: Code duplication, difficult to maintain, error-prone.

### Middleware Groups
Group middleware into reusable stacks:

```typescript
const securityStack = [helmet(), cors(), compression()];
const authStack = [authMiddleware, validateRequest()];

app.use('/api', ...securityStack, ...authStack);
```

**Rejected Reason**: Less explicit, harder to debug, doesn't solve ordering problem.

---

## Related ADRs
- ADR-002: Authentication Strategy (JWT + API Key)
- ADR-006: Rate Limiting Implementation (100 req/min per IP)
- ADR-005: Logging Strategy (Winston configuration)

---

## References
1. Express.js Documentation: Middleware Execution Order
2. OWASP Top 10: Security Best Practices
3. Helmet.js Documentation: Security Headers
4. Winston Documentation: Async Logging

---

## Approval

**Approved By**: architect-1
**Date**: 2025-10-11
**Status**: Accepted for implementation in Sprint 2.1
