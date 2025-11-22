# ADR-002: Authentication Strategy

**Status**: Accepted
**Date**: 2025-10-11
**Context**: Phase 2 Sprint 2.1 - Unified Express Server Architecture

---

## Context and Problem Statement

The unified Express server consolidates three separate servers with different authentication mechanisms:
1. **src/web/api/server.ts**: JWT + optional auth in development
2. **src/web/portal-server.ts**: No authentication (relies on network security)
3. **monitor/dashboard/secure-server.ts**: JWT + session-based auth + database-backed users

We need a unified, production-ready authentication strategy that supports multiple client types (web dashboard, CLI tools, mobile apps, service-to-service) while maintaining security and usability.

**Key Question**: What authentication mechanism(s) should the unified server support?

---

## Decision Drivers

1. **Security**: Production-grade authentication with industry-standard protocols
2. **Flexibility**: Support multiple client types (web, mobile, CLI, services)
3. **Statelessness**: Avoid session storage for horizontal scalability
4. **Token Expiration**: Automatic token expiration with refresh mechanism
5. **Backward Compatibility**: Support existing clients during migration
6. **Simplicity**: Easy to implement and maintain

---

## Considered Options

### Option 1: JWT Only (Stateless)
**Authentication**: JSON Web Tokens (JWT) with Bearer authentication

**Pros**:
- Stateless (no session storage, horizontally scalable)
- Self-contained tokens (includes user ID, role, permissions)
- Standard protocol (RFC 7519)
- Works across all client types
- No database lookup on every request

**Cons**:
- Cannot revoke tokens before expiration (without blacklist)
- Token size larger than session IDs (~200-500 bytes)
- Requires secret management

### Option 2: Session-Based (Stateful)
**Authentication**: Session cookies with database-backed session storage

**Pros**:
- Easy to revoke sessions (database delete)
- Small cookie size (~32 bytes)
- Built-in CSRF protection (SameSite cookies)

**Cons**:
- Requires session storage (Redis, database)
- Not horizontally scalable without sticky sessions or shared session store
- Doesn't work well with mobile apps or CLI tools
- Requires database lookup on every request

### Option 3: OAuth 2.0 / OpenID Connect
**Authentication**: Delegated authentication via OAuth 2.0 providers (Google, GitHub, etc.)

**Pros**:
- No password management
- Single Sign-On (SSO) support
- Industry-standard protocol

**Cons**:
- Complex implementation (authorization server required)
- Dependency on external providers
- Not suitable for service-to-service authentication
- Overkill for internal tools

### Option 4: API Keys (Service-to-Service)
**Authentication**: Long-lived API keys for service accounts

**Pros**:
- Simple to implement
- Perfect for CLI tools and service-to-service
- No expiration (can be manually revoked)
- Single HTTP header (`X-API-Key`)

**Cons**:
- Not suitable for user authentication (no user identity)
- Requires secure storage (environment variables, secrets manager)
- No granular permissions (admin access only)

### Option 5: Hybrid (JWT + API Key + Basic Auth)
**Authentication**: Multiple methods supported

**Pros**:
- Flexible (supports all client types)
- JWT for user authentication (web, mobile)
- API keys for service-to-service (CLI tools, automation)
- Basic Auth for development/testing

**Cons**:
- More complex implementation (3 authentication methods)
- Requires clear documentation on when to use each method

---

## Decision Outcome

**Chosen Option**: Option 5 (Hybrid: JWT + API Key + Basic Auth)

### Authentication Methods:

#### 1. JWT (Primary Method for User Authentication)

**Use Cases**: Web dashboard, mobile apps, user-facing APIs

**Token Structure**:
```json
{
  "sub": "user-123",           // Subject (user ID)
  "username": "admin",
  "role": "admin",             // admin | user | service
  "permissions": ["read", "write", "admin"],
  "iat": 1633024800,           // Issued at
  "exp": 1633111200,           // Expiration (24 hours)
  "iss": "web-portal-server",  // Issuer
  "aud": "web-portal-client"   // Audience
}
```

**Header**:
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Token Expiration**: 24 hours (configurable via `JWT_EXPIRATION` env variable)

**Token Refresh**: Separate `/api/auth/refresh` endpoint (not implemented in Sprint 2.1, deferred to Sprint 2.2)

#### 2. API Key (Service-to-Service Authentication)

**Use Cases**: CLI tools, automation scripts, service accounts

**Header**:
```http
X-API-Key: sk_live_abc123def456...
```

**Key Format**: `sk_live_` prefix + 24-character random string

**Permissions**: API keys have full admin access (read, write, intervene)

**Storage**: Environment variable `API_KEY` (single shared key for Sprint 2.1, per-service keys deferred to Phase 3)

#### 3. Basic Auth (Development Only)

**Use Cases**: Local development, testing, quick prototyping

**Header**:
```http
Authorization: Basic YWRtaW46YWRtaW4=  # Base64(admin:admin)
```

**Credentials**:
- Username: `admin`
- Password: `admin`

**Security**: Only enabled in development mode (`NODE_ENV=development`), returns 401 in production.

---

## Rationale

### Why JWT for User Authentication?

1. **Stateless**: No session storage required, horizontally scalable
2. **Self-Contained**: Token includes user ID, role, permissions (no database lookup)
3. **Standard**: Widely supported by libraries (jsonwebtoken, passport-jwt)
4. **Cross-Platform**: Works with web, mobile, desktop clients
5. **Expiration**: Built-in expiration mechanism (24 hours)

**Trade-off**: Cannot revoke tokens before expiration without implementing a token blacklist (deferred to Phase 3).

### Why API Keys for Service-to-Service?

1. **Simplicity**: Single HTTP header, no token generation
2. **Long-Lived**: No expiration, suitable for automation
3. **CLI-Friendly**: Easy to store in environment variables
4. **Standard Practice**: Common pattern for service authentication (AWS, Stripe, etc.)

**Trade-off**: Shared API key (single key for all services) in Sprint 2.1. Per-service keys deferred to Phase 3.

### Why Basic Auth for Development?

1. **Quick Testing**: No token generation required
2. **Curl-Friendly**: Easy to test with curl commands
3. **Standard**: Built into HTTP spec
4. **Safe**: Only enabled in development mode

**Trade-off**: Not secure for production (credentials in every request, no expiration).

---

## Implementation Details

### Middleware Order

```typescript
// middleware/authentication.ts

export const authMiddleware = (req, res, next) => {
  // Skip authentication for public endpoints
  if (req.path === '/api/health') {
    return next();
  }

  // Try JWT authentication first
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!);
      req.user = {
        id: decoded.sub,
        username: decoded.username,
        role: decoded.role,
        permissions: decoded.permissions
      };
      return next();
    } catch (error) {
      // Invalid JWT, try API key
    }
  }

  // Try API key authentication
  const apiKey = req.headers['x-api-key'];
  if (apiKey === process.env.API_KEY) {
    req.user = {
      id: 'api-key-user',
      username: 'api-key',
      role: 'service',
      permissions: ['read', 'write', 'admin']
    };
    return next();
  }

  // Try Basic Auth (development only)
  if (process.env.NODE_ENV === 'development' && authHeader?.startsWith('Basic ')) {
    const credentials = Buffer.from(authHeader.substring(6), 'base64').toString();
    const [username, password] = credentials.split(':');
    if (username === 'admin' && password === 'admin') {
      req.user = {
        id: 'dev-admin',
        username: 'admin',
        role: 'admin',
        permissions: ['read', 'write', 'admin']
      };
      return next();
    }
  }

  // No valid authentication found
  return res.status(401).json({
    error: 'Unauthorized',
    message: 'Authentication required',
    timestamp: new Date().toISOString()
  });
};
```

### Role-Based Authorization

```typescript
// middleware/authentication.ts

export const requireRole = (requiredRole: string) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }

    if (req.user.role !== requiredRole && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Requires ${requiredRole} role`
      });
    }

    next();
  };
};

// Usage:
app.post('/api/agents/:id/intervene',
  authMiddleware,
  requireRole('admin'),
  interventionHandler
);
```

### WebSocket Authentication

```typescript
// websocket/authentication.ts

io.use(async (socket, next) => {
  const token = socket.handshake.auth.token ||
                socket.handshake.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return next(new Error('Authentication required'));
  }

  try {
    // Try JWT authentication
    const decoded = jwt.verify(token, process.env.JWT_SECRET!);
    socket.data.user = {
      id: decoded.sub,
      username: decoded.username,
      role: decoded.role,
      permissions: decoded.permissions
    };
    next();
  } catch (error) {
    // Try API key authentication
    if (token === process.env.API_KEY) {
      socket.data.user = {
        id: 'api-key-user',
        username: 'api-key',
        role: 'service',
        permissions: ['read', 'write', 'admin']
      };
      next();
    } else {
      next(new Error('Invalid token'));
    }
  }
});
```

---

## Security Considerations

### 1. Secret Management

**JWT Secret**: Store in environment variable `JWT_SECRET`
- Minimum 32 characters
- Randomly generated (e.g., `openssl rand -base64 32`)
- Rotate every 90 days

**API Key**: Store in environment variable `API_KEY`
- Format: `sk_live_` + 24-character random string
- Rotate every 180 days

**Production Requirements**:
- Use secrets manager (AWS Secrets Manager, HashiCorp Vault)
- Never commit secrets to version control
- Use different secrets per environment (dev, staging, production)

### 2. Token Expiration

**JWT**: 24-hour expiration (configurable)
- Short-lived tokens reduce risk of token theft
- Refresh tokens deferred to Sprint 2.2

**API Key**: No expiration (manual revocation)
- Monitor API key usage (log all requests)
- Implement key rotation policy

### 3. HTTPS Enforcement

**Production**: Enforce HTTPS for all requests
- Tokens transmitted in HTTP headers (vulnerable to man-in-the-middle attacks)
- Use `Strict-Transport-Security` header (HSTS)

**Development**: Allow HTTP for local testing

### 4. Rate Limiting

**JWT Authentication**: 100 requests/minute per IP
**API Key Authentication**: 1000 requests/minute per key
**Failed Auth Attempts**: 10 failed attempts → 15-minute lockout

---

## Migration Strategy

### Phase 1: Deploy Unified Server (Sprint 2.1)
- Implement JWT + API Key + Basic Auth
- Deploy on new port (3000)
- Existing clients continue using old servers

### Phase 2: Frontend Migration (Sprint 2.2)
- Update frontend to use JWT authentication
- Implement login flow (username/password → JWT token)
- Implement token refresh mechanism

### Phase 3: CLI Tool Migration (Sprint 2.3)
- Update CLI tools to use API key authentication
- Distribute API keys to users (environment variable)

### Phase 4: Deprecate Old Servers (Sprint 2.4)
- Shut down old servers
- Remove legacy authentication code

---

## Consequences

### Positive
1. **Flexible**: Supports multiple client types (web, mobile, CLI, services)
2. **Scalable**: Stateless JWT authentication (no session storage)
3. **Secure**: Industry-standard protocols (JWT, API keys)
4. **Backward Compatible**: Basic Auth for development/testing

### Negative
1. **Complex**: Three authentication methods to maintain
2. **Token Revocation**: Cannot revoke JWT tokens before expiration (without blacklist)
3. **Shared API Key**: Single API key for all services (security risk)

### Mitigation Strategies
1. **Documentation**: Clear API documentation on when to use each method
2. **Token Blacklist**: Implement JWT blacklist in Phase 3 (Redis-based)
3. **Per-Service API Keys**: Implement per-service keys in Phase 3

---

## Future Enhancements (Deferred)

### Sprint 2.2
- [ ] JWT refresh token endpoint
- [ ] Login endpoint (username/password → JWT)
- [ ] Logout endpoint (optional token blacklist)

### Phase 3
- [ ] Per-service API keys (separate keys per CLI tool, automation script)
- [ ] Token blacklist (Redis-based, for immediate revocation)
- [ ] Multi-factor authentication (MFA)
- [ ] OAuth 2.0 integration (Google, GitHub SSO)

---

## Related ADRs
- ADR-001: Middleware Stack Ordering
- ADR-003: WebSocket Authentication
- ADR-006: Rate Limiting Implementation

---

## References
1. RFC 7519: JSON Web Token (JWT)
2. RFC 6750: OAuth 2.0 Bearer Token Usage
3. OWASP Authentication Cheat Sheet
4. Express.js Authentication Best Practices

---

## Approval

**Approved By**: architect-1
**Date**: 2025-10-11
**Status**: Accepted for implementation in Sprint 2.1
