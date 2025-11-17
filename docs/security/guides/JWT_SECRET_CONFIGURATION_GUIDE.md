# JWT Secret Configuration Guide

## Quick Start

### Required Configuration

The `AuthMiddleware` now **requires** an explicit JWT_SECRET. The default 'dev-secret-key' has been removed for security.

```typescript
// ❌ WRONG - This will throw an error
const auth = new AuthMiddleware(); // Error: JWT_SECRET required

// ✅ CORRECT - Provide explicit secret
const auth = new AuthMiddleware('your-secure-secret-key-at-least-16-chars');

// ✅ CORRECT - Use environment variable
process.env.JWT_SECRET = 'your-secure-secret-key-at-least-16-chars';
const auth = new AuthMiddleware();
```

---

## Security Requirements

### 1. Minimum Length: 16 Characters

```typescript
// ❌ WRONG - Too short
const auth = new AuthMiddleware('short'); // Error: Must be at least 16 characters

// ✅ CORRECT
const auth = new AuthMiddleware('secure-key-123456'); // 18 characters
```

### 2. No Empty or Whitespace

```typescript
// ❌ WRONG - Empty
const auth = new AuthMiddleware(''); // Error: Cannot be empty

// ❌ WRONG - Whitespace only
const auth = new AuthMiddleware('   '); // Error: Cannot be empty

// ✅ CORRECT
const auth = new AuthMiddleware('my-secret-key-12345');
```

### 3. No Insecure Defaults

The following secrets are **blocked** (case-insensitive, ignoring dashes/underscores):

- `dev-secret-key`
- `secret`
- `password`
- `test`
- `default`
- `123456`
- `changeme`

```typescript
// ❌ WRONG - Insecure default
const auth = new AuthMiddleware('dev-secret-key'); // Error: Insecure default

// ❌ WRONG - Case doesn't matter
const auth = new AuthMiddleware('DEV-SECRET-KEY'); // Error: Insecure default

// ✅ CORRECT - Use strong random secret
const auth = new AuthMiddleware('prod-jwt-secret-abc123xyz789');
```

---

## Environment Configuration

### Development (.env.development)

```bash
# Generate a secure random secret
JWT_SECRET="dev-jwt-secret-$(openssl rand -hex 16)"
```

### Production (.env.production)

```bash
# Use a strong, unique secret (minimum 16 characters)
JWT_SECRET="your-production-secret-from-secrets-manager"
```

### Docker

```dockerfile
# In docker-compose.yml
environment:
  - JWT_SECRET=${JWT_SECRET}
```

---

## Generating Secure Secrets

### Option 1: OpenSSL (Recommended)

```bash
# Generate 32-byte base64 secret (best)
openssl rand -base64 32

# Generate 32-byte hex secret
openssl rand -hex 32
```

### Option 2: Node.js

```javascript
// Generate secure random secret
const crypto = require('crypto');
const secret = crypto.randomBytes(32).toString('base64');
console.log(secret);
```

### Option 3: Online Tools

- Use reputable password generators (minimum 32 characters)
- Ensure high entropy (mix of letters, numbers, symbols)

---

## Migration Guide

### Before (Insecure)

```typescript
// Old code that relied on default secret
const auth = new AuthMiddleware(); // Used 'dev-secret-key' by default
```

### After (Secure)

```typescript
// Option 1: Explicit secret (for testing)
const auth = new AuthMiddleware('test-secret-key-for-unit-tests');

// Option 2: Environment variable (for production)
require('dotenv').config();
const auth = new AuthMiddleware(); // Reads from process.env.JWT_SECRET

// Option 3: Explicit parameter (for flexibility)
const jwtSecret = process.env.JWT_SECRET || 'fallback-secret-16-chars';
const auth = new AuthMiddleware(jwtSecret);
```

---

## Testing Configuration

### Unit Tests

```typescript
// tests/my-feature.test.ts
import { AuthMiddleware } from './auth-middleware';

describe('My Feature', () => {
  let auth: AuthMiddleware;

  beforeEach(() => {
    // Use explicit test secret (not default)
    auth = new AuthMiddleware('test-secret-key-for-unit-tests-123');
  });

  it('should generate valid token', () => {
    const token = auth.generateToken('user-001', 'test-user', UserRole.ADMIN);
    expect(token).toBeDefined();
  });
});
```

### Integration Tests

```typescript
// tests/integration/auth.test.ts
describe('Auth Integration', () => {
  beforeEach(() => {
    // Set environment variable for tests
    process.env.JWT_SECRET = 'integration-test-secret-key-123';
  });

  afterEach(() => {
    // Clean up
    delete process.env.JWT_SECRET;
  });

  it('should authenticate with environment secret', () => {
    const auth = new AuthMiddleware();
    // Test authentication flow
  });
});
```

---

## Error Messages

### Missing Secret

```
JWT_SECRET is required but not configured. Please set the JWT_SECRET
environment variable or provide it explicitly to the constructor.

Hint: Set JWT_SECRET in your .env file or environment:
export JWT_SECRET="your-secret-key"

Security Note: Never use default secrets in production.
Generate a strong random secret.
```

### Empty Secret

```
JWT_SECRET cannot be empty or whitespace only.

Hint: Provide a strong secret key of at least 16 characters
```

### Short Secret

```
JWT_SECRET must be at least 16 characters long for security.

Provided Length: 8
Required Length: 16

Hint: Use a strong random secret of at least 16 characters
```

### Insecure Default

```
Detected insecure default secret. Please use a strong, unique JWT_SECRET
in production.

Security Risk: CVSS 9.8 - Default secrets allow authentication bypass
and token forgery

Hint: Generate a secure random secret: openssl rand -base64 32
```

---

## Best Practices

### 1. Secret Management

✅ **DO**:
- Store secrets in environment variables
- Use secrets management services (AWS Secrets Manager, HashiCorp Vault)
- Rotate secrets regularly (quarterly or after breach)
- Use different secrets for dev/staging/prod
- Generate secrets with high entropy (32+ bytes)

❌ **DON'T**:
- Commit secrets to version control
- Use the same secret across environments
- Share secrets via email or chat
- Use predictable or common secrets
- Hardcode secrets in application code

### 2. Secret Rotation

```typescript
// Support secret rotation with fallback
class AuthService {
  private primary: AuthMiddleware;
  private fallback?: AuthMiddleware;

  constructor() {
    this.primary = new AuthMiddleware(process.env.JWT_SECRET);

    // Support old secret during rotation
    if (process.env.JWT_SECRET_OLD) {
      this.fallback = new AuthMiddleware(process.env.JWT_SECRET_OLD);
    }
  }

  validateToken(token: string): UserContext {
    try {
      return this.primary.validateToken(token);
    } catch (error) {
      if (this.fallback) {
        // Try old secret during rotation period
        return this.fallback.validateToken(token);
      }
      throw error;
    }
  }
}
```

### 3. Deployment Checklist

- [ ] Set `JWT_SECRET` in production environment
- [ ] Verify secret is at least 16 characters
- [ ] Verify secret is not a known default
- [ ] Verify secret is different from dev/staging
- [ ] Document secret rotation procedure
- [ ] Test authentication with production secret
- [ ] Monitor for authentication failures

---

## Troubleshooting

### Problem: "JWT_SECRET is required" error

**Cause**: JWT_SECRET not set in environment

**Solution**:
```bash
# Set in environment
export JWT_SECRET="your-secure-secret-key-16-chars"

# Or in .env file
echo 'JWT_SECRET="your-secure-secret-key-16-chars"' >> .env

# Or pass explicitly
const auth = new AuthMiddleware('your-secure-secret-key-16-chars');
```

### Problem: "Must be at least 16 characters" error

**Cause**: Secret is too short

**Solution**:
```bash
# Generate longer secret
openssl rand -base64 32
```

### Problem: "Insecure default secret" error

**Cause**: Using a known weak secret

**Solution**:
```bash
# Generate secure random secret
openssl rand -base64 32 > .jwt-secret
export JWT_SECRET=$(cat .jwt-secret)
```

### Problem: Tokens not validating after deployment

**Cause**: Different secret in production vs development

**Solution**:
- Ensure same secret is used for token generation and validation
- During secret rotation, support both old and new secrets temporarily
- Invalidate all existing tokens after secret change

---

## Security Audit Checklist

- [ ] JWT_SECRET configured in all environments
- [ ] Secret is at least 32 characters (recommended)
- [ ] Secret has high entropy (not dictionary words)
- [ ] Secret is unique per environment
- [ ] Secret is stored securely (not in code/version control)
- [ ] Secret rotation policy documented
- [ ] Monitoring for authentication failures enabled
- [ ] No default secrets in use
- [ ] All team members trained on secret handling

---

## Related Documentation

- [Authentication Middleware API](./AUTH_MIDDLEWARE_API.md)
- [Security Best Practices](./SECURITY_BEST_PRACTICES.md)
- [Deployment Guide](./DEPLOYMENT_GUIDE.md)
- [Test Coverage Report](../tests/security/JWT_SECURITY_TEST_REPORT.md)

---

**Last Updated**: 2025-11-17
**Security Level**: CVSS 9.8 vulnerability mitigated
**Version**: 1.0.0
