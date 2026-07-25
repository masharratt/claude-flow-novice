# Authentication Pattern Specification

## Header Format

### Standard: Bearer Token
```http
Authorization: Bearer <token>
```

### Rules
1. **Header name**: `Authorization` (case-insensitive per HTTP spec)
2. **Scheme**: `Bearer` (capital B, single space before token)
3. **Token**: No whitespace, URL-safe characters only

### Validation Pattern
```typescript
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;

  const match = authHeader.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}
```

## Token Types

### JWT Structure
```
header.payload.signature
```

| Component | Contents | Validation |
|-----------|----------|------------|
| Header | `{"alg":"HS256","typ":"JWT"}` | Must be HS256 or RS256 |
| Payload | Claims (sub, exp, iat, etc.) | Check exp, iat |
| Signature | HMAC or RSA signature | Verify with secret/key |

### Required Claims
```typescript
interface JWTPayload {
  sub: string;      // Subject (user ID)
  exp: number;      // Expiration (Unix timestamp)
  iat: number;      // Issued at (Unix timestamp)
  iss?: string;     // Issuer
  aud?: string;     // Audience
}
```

### Validation Sequence
1. Extract token from header
2. Verify signature
3. Check `exp` > now
4. Check `iat` <= now
5. Validate `iss` and `aud` if required

## Error Responses

### HTTP Status Codes
| Scenario | Status | Body |
|----------|--------|------|
| Missing header | 401 | `{"error": "auth_required", "message": "Authorization header required"}` |
| Invalid format | 401 | `{"error": "invalid_token", "message": "Invalid authorization header format"}` |
| Expired token | 401 | `{"error": "token_expired", "message": "Token has expired"}` |
| Invalid signature | 401 | `{"error": "invalid_token", "message": "Token signature invalid"}` |
| Insufficient scope | 403 | `{"error": "forbidden", "message": "Insufficient permissions"}` |

### Response Headers
```http
WWW-Authenticate: Bearer realm="api", error="invalid_token", error_description="Token expired"
```

## Middleware Pattern

### Express/Koa Style
```typescript
async function authMiddleware(req, res, next) {
  const token = extractBearerToken(req.headers.authorization);

  if (!token) {
    return res.status(401).json({
      error: 'auth_required',
      message: 'Authorization header required',
    });
  }

  try {
    const payload = await verifyToken(token);
    req.user = payload;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'token_expired',
        message: 'Token has expired',
      });
    }
    return res.status(401).json({
      error: 'invalid_token',
      message: 'Token signature invalid',
    });
  }
}
```

## Token Refresh Pattern

### Refresh Token Flow
1. Client sends expired access token + refresh token
2. Server validates refresh token
3. Server issues new access + refresh tokens
4. Client stores new tokens

### Endpoint
```http
POST /auth/refresh
Content-Type: application/json

{
  "refresh_token": "<refresh_token>"
}
```

### Response
```json
{
  "access_token": "<new_access_token>",
  "refresh_token": "<new_refresh_token>",
  "expires_in": 3600
}
```

## API Key Authentication (Alternative)

### Header Format
```http
X-API-Key: <api_key>
```

### When to Use
- Server-to-server communication
- CLI tools
- Webhook callbacks

### Validation
```typescript
function validateApiKey(key: string): boolean {
  // Format: cfn_<env>_<32-char-hex>
  return /^cfn_(dev|staging|prod)_[a-f0-9]{32}$/.test(key);
}
```

## Security Requirements

### Token Handling
- [ ] Tokens transmitted over HTTPS only
- [ ] Tokens never logged (redact as `[REDACTED]`)
- [ ] Tokens never in URL query params
- [ ] Short expiration (1h for access, 7d for refresh)
- [ ] Refresh tokens rotated on use

### Server-Side
- [ ] Secrets from env vars only
- [ ] Rate limiting on auth endpoints
- [ ] Brute force protection
- [ ] Audit logging for auth events

## Test Requirements

### Required Test Cases
1. Missing Authorization header -> 401
2. Malformed header (no Bearer) -> 401
3. Invalid token format -> 401
4. Expired token -> 401
5. Invalid signature -> 401
6. Valid token -> 200 + user context
7. Refresh with valid refresh token -> new tokens
8. Refresh with expired refresh token -> 401
