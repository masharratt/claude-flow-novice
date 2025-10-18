# Migration Guide: Base64 to JWT Authentication

Complete guide for migrating from Base64-encoded credentials to JWT-based authentication in Claude Flow Novice.

## Table of Contents

- [Overview](#overview)
- [Why Migrate](#why-migrate)
- [Breaking Changes](#breaking-changes)
- [Migration Steps](#migration-steps)
- [Backward Compatibility](#backward-compatibility)
- [Testing](#testing)
- [Rollback Plan](#rollback-plan)
- [Troubleshooting](#troubleshooting)

---

## Overview

Claude Flow Novice v1.6.0+ replaces Base64-encoded authentication with enterprise-grade JWT tokens featuring:

- **RS256 asymmetric signing** (vs. reversible Base64)
- **Token expiration** and automatic refresh
- **Session management** with Redis persistence
- **Multi-factor authentication** support
- **Role-based access control** (RBAC)
- **OAuth2 flows** for third-party integrations

---

## Why Migrate

### Security Improvements

| Feature | Base64 | JWT (RS256) |
|---------|--------|-------------|
| **Encoding** | Reversible | Cryptographically signed |
| **Expiration** | None | 1 hour (access) / 7 days (refresh) |
| **Session Management** | Stateless | Redis-backed sessions |
| **Revocation** | Not possible | Token blacklisting |
| **MFA Support** | No | TOTP + backup codes |
| **Permissions** | Binary (yes/no) | Granular RBAC |
| **Audit Trail** | Limited | Comprehensive logging |

### Base64 Vulnerabilities

```javascript
// ❌ OLD: Base64 is NOT encryption
const credentials = Buffer.from('admin:password').toString('base64');
// Result: "YWRtaW46cGFzc3dvcmQ="
// Can be decoded: Buffer.from('YWRtaW46cGFzc3dvcmQ=', 'base64').toString()
// Output: "admin:password"

// ✅ NEW: JWT with RS256 signature
const token = jwt.sign(payload, privateKey, { algorithm: 'RS256' });
// Cannot be forged without private key
// Expires after 1 hour
// Can be revoked
```

---

## Breaking Changes

### 1. Authentication Header Format

**Before (Base64):**
```http
Authorization: Basic YWRtaW46cGFzc3dvcmQ=
```

**After (JWT):**
```http
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 2. Login Flow

**Before:**
```javascript
// Base64 authentication (implicit)
const credentials = Buffer.from(`${username}:${password}`).toString('base64');
const response = await fetch('/api/data', {
  headers: { 'Authorization': `Basic ${credentials}` }
});
```

**After:**
```javascript
// Step 1: Login to get tokens
const loginResponse = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password })
});

const { tokens } = await loginResponse.json();

// Step 2: Use access token for requests
const response = await fetch('/api/data', {
  headers: { 'Authorization': `Bearer ${tokens.accessToken}` }
});
```

### 3. Token Refresh Required

**Before:**
- Credentials never expired
- No refresh mechanism needed

**After:**
- Access tokens expire after 1 hour
- Must implement token refresh:

```javascript
// Auto-refresh before expiration
async function refreshAccessToken() {
  const response = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: storedRefreshToken })
  });

  const data = await response.json();
  accessToken = data.accessToken;
  refreshToken = data.refreshToken;
}

// Schedule refresh 5 minutes before expiry
setTimeout(refreshAccessToken, 55 * 60 * 1000);
```

### 4. Session Management

**Before:**
- No sessions
- Stateless authentication

**After:**
- Sessions tracked in Redis
- Logout invalidates session
- Multi-device session management

```javascript
// Logout current session
await fetch('/api/auth/logout', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${accessToken}` },
  body: JSON.stringify({ sessionId })
});

// Logout all devices
await fetch('/api/auth/logout', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${accessToken}` },
  body: JSON.stringify({ logoutAllDevices: true })
});
```

### 5. Error Handling Changes

**Before:**
- `401 Unauthorized` for invalid credentials
- No distinction between expired/invalid

**After:**
- `401 Unauthorized`: Invalid credentials, expired token, revoked token
- `403 Forbidden`: Insufficient permissions
- `423 Locked`: Account locked (too many attempts)
- `429 Too Many Requests`: Rate limit exceeded

---

## Migration Steps

### Step 1: Update Dependencies

```bash
# Install required packages
npm install jsonwebtoken argon2 bcrypt speakeasy qrcode

# Update Redis client (if needed)
npm install redis@latest
```

### Step 2: Update Environment Variables

Create or update `.env` file:

```bash
# Old Base64 config (remove these)
# DASHBOARD_USERNAME=admin
# DASHBOARD_PASSWORD=password

# New JWT config (add these)
JWT_ALGORITHM=RS256
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d
JWT_ISSUER=claude-flow-novice
JWT_AUDIENCE=claude-flow-users

# Redis for session management
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=<your-secure-password>

# Session configuration
SESSION_TIMEOUT=1800000          # 30 minutes
ABSOLUTE_SESSION_TIMEOUT=28800000 # 8 hours
MAX_CONCURRENT_SESSIONS=5

# Security settings
PASSWORD_MIN_LENGTH=12
BCRYPT_ROUNDS=12
ENABLE_MFA=false                 # Optional: enable later
ENABLE_RATE_LIMITING=true
LOGIN_ATTEMPTS=5
LOGIN_WINDOW=900000              # 15 minutes
```

### Step 3: Initialize Authentication Service

```javascript
// src/server.js (or your main server file)
import { EnhancedAuthService } from './security/EnhancedAuthService.js';

const authService = new EnhancedAuthService({
  jwtAlgorithm: process.env.JWT_ALGORITHM || 'RS256',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  redisHost: process.env.REDIS_HOST || 'localhost',
  redisPort: process.env.REDIS_PORT || 6379,
  redisPassword: process.env.REDIS_PASSWORD
});

await authService.initialize();
```

### Step 4: Create Initial Admin User

```javascript
// scripts/create-admin-user.js
import { EnhancedAuthService } from './src/security/EnhancedAuthService.js';

const authService = new EnhancedAuthService();
await authService.initialize();

const adminUser = await authService.registerUser({
  username: 'admin',
  email: 'admin@example.com',
  password: 'ChangeMe123!@#',  // CHANGE THIS!
  firstName: 'System',
  lastName: 'Administrator',
  roles: ['admin'],
  permissions: [
    'dashboard:access',
    'fleet:read',
    'fleet:write',
    'swarm:execute',
    'monitoring:access'
  ]
});

console.log('Admin user created:', adminUser.user.username);
console.log('Please change the password after first login!');
```

Run the script:
```bash
node scripts/create-admin-user.js
```

### Step 5: Update Server Routes

Replace Basic Auth middleware with JWT authentication:

**Before (Base64):**
```javascript
// Old Basic Auth middleware
function basicAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Basic ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const credentials = Buffer.from(authHeader.slice(6), 'base64').toString();
  const [username, password] = credentials.split(':');

  if (username === process.env.DASHBOARD_USERNAME &&
      password === process.env.DASHBOARD_PASSWORD) {
    next();
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
}
```

**After (JWT):**
```javascript
// New JWT authentication middleware
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const validation = await authService.validateToken(token);

    if (!validation.valid) {
      return res.status(401).json({ error: validation.error });
    }

    req.user = validation.user;
    req.sessionId = validation.sessionId;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
}

// Permission middleware
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user.permissions.includes(permission)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}
```

**Add Authentication Routes:**
```javascript
// Authentication endpoints
app.post('/api/auth/register', async (req, res) => {
  try {
    const result = await authService.registerUser(req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const result = await authService.authenticateUser(req.body);
    res.json(result);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

app.post('/api/auth/refresh', async (req, res) => {
  try {
    const tokens = await authService.refreshToken(req.body.refreshToken);
    res.json(tokens);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  try {
    await authService.logout(req.user.id, req.sessionId, req.body.logoutAllDevices);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Protected routes (update existing routes)
app.get('/api/fleet/status',
  authenticateToken,
  requirePermission('fleet:read'),
  async (req, res) => {
    // Your existing route logic
  }
);
```

### Step 6: Update Dashboard Client

Replace `monitor/dashboard/auth-client.js` with JWT authentication:

```javascript
// monitor/dashboard/auth-client.js
class SecureAuthClient {
  constructor() {
    this.baseURL = window.location.origin;
    this.token = localStorage.getItem('dashboard_access_token');
    this.refreshToken = localStorage.getItem('dashboard_refresh_token');
    this.user = JSON.parse(localStorage.getItem('dashboard_user') || 'null');
    this.tokenRefreshTimer = null;
    this.init();
  }

  init() {
    if (this.token) {
      this.scheduleTokenRefresh();
    }
    this.setupFetchInterceptor();
    this.checkAuthStatus();
  }

  setupFetchInterceptor() {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      let [url, options = {}] = args;

      if (url.startsWith('/api')) {
        options.headers = {
          ...options.headers,
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        };
      }

      const response = await originalFetch(url, options);

      if (response.status === 401) {
        await this.handleUnauthorized();
        throw new Error('Authentication required');
      }

      return response;
    };
  }

  async login(username, password) {
    const response = await fetch(`${this.baseURL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Login failed');
    }

    this.token = data.tokens.accessToken;
    this.refreshToken = data.tokens.refreshToken;
    this.user = data.user;

    localStorage.setItem('dashboard_access_token', this.token);
    localStorage.setItem('dashboard_refresh_token', this.refreshToken);
    localStorage.setItem('dashboard_user', JSON.stringify(this.user));

    this.scheduleTokenRefresh();
    this.hideLoginModal();

    return data;
  }

  async refreshAccessToken() {
    const response = await fetch(`${this.baseURL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: this.refreshToken })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Token refresh failed');
    }

    this.token = data.accessToken;
    this.refreshToken = data.refreshToken;

    localStorage.setItem('dashboard_access_token', this.token);
    localStorage.setItem('dashboard_refresh_token', this.refreshToken);

    this.scheduleTokenRefresh();
  }

  scheduleTokenRefresh() {
    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer);
    }

    // Refresh 5 minutes before expiry
    const refreshTime = 55 * 60 * 1000; // 55 minutes
    this.tokenRefreshTimer = setTimeout(async () => {
      try {
        await this.refreshAccessToken();
      } catch (error) {
        console.error('Auto token refresh failed:', error);
        this.showLoginModal();
      }
    }, refreshTime);
  }

  async logout() {
    try {
      await fetch(`${this.baseURL}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      this.clearAuthData();
      this.showLoginModal();
    }
  }

  clearAuthData() {
    this.token = null;
    this.refreshToken = null;
    this.user = null;

    localStorage.removeItem('dashboard_access_token');
    localStorage.removeItem('dashboard_refresh_token');
    localStorage.removeItem('dashboard_user');

    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer);
    }
  }

  checkAuthStatus() {
    if (!this.token || !this.user) {
      this.showLoginModal();
    }
  }

  showLoginModal() {
    // Create or show login modal
    const modal = document.getElementById('login-modal');
    if (modal) {
      modal.style.display = 'flex';
    } else {
      this.createLoginModal();
    }
  }

  hideLoginModal() {
    const modal = document.getElementById('login-modal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  createLoginModal() {
    // Login modal HTML (see JWT_AUTHENTICATION.md for full code)
  }
}

// Initialize
window.authClient = new SecureAuthClient();
```

### Step 7: Update CLI Tools

For CLI tools using authentication:

```javascript
// Before (Base64)
const credentials = Buffer.from(`${username}:${password}`).toString('base64');
const response = await fetch(url, {
  headers: { 'Authorization': `Basic ${credentials}` }
});

// After (JWT)
class ClaudeFlowCLI {
  constructor() {
    this.accessToken = null;
    this.refreshToken = null;
  }

  async login(username, password) {
    const response = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();
    this.accessToken = data.tokens.accessToken;
    this.refreshToken = data.tokens.refreshToken;

    // Store tokens securely (consider using keytar or similar)
    return data;
  }

  async request(endpoint, options = {}) {
    const response = await fetch(`http://localhost:3001${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (response.status === 401) {
      await this.refresh();
      return this.request(endpoint, options);
    }

    return response.json();
  }

  async refresh() {
    const response = await fetch('http://localhost:3001/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: this.refreshToken })
    });

    const data = await response.json();
    this.accessToken = data.accessToken;
    this.refreshToken = data.refreshToken;
  }
}
```

---

## Backward Compatibility

### Dual Authentication Support (Temporary)

For a transition period, support both Base64 and JWT:

```javascript
async function authenticateRequest(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Check for JWT (Bearer token)
  if (authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7);
      const validation = await authService.validateToken(token);

      if (!validation.valid) {
        return res.status(401).json({ error: validation.error });
      }

      req.user = validation.user;
      req.authType = 'jwt';
      return next();
    } catch (error) {
      return res.status(403).json({ error: 'Invalid JWT token' });
    }
  }

  // Fallback to Base64 (deprecated)
  if (authHeader.startsWith('Basic ')) {
    console.warn('[DEPRECATED] Basic Auth is deprecated. Please migrate to JWT.');

    const credentials = Buffer.from(authHeader.slice(6), 'base64').toString();
    const [username, password] = credentials.split(':');

    if (username === process.env.LEGACY_USERNAME &&
        password === process.env.LEGACY_PASSWORD) {
      req.user = {
        id: 'legacy-user',
        username,
        roles: ['admin'],
        permissions: ['*'] // Full access for legacy
      };
      req.authType = 'basic';
      return next();
    }

    return res.status(401).json({ error: 'Invalid credentials' });
  }

  return res.status(401).json({ error: 'Unsupported authentication method' });
}
```

### Migration Warning Headers

Add deprecation warnings to responses using Base64:

```javascript
if (req.authType === 'basic') {
  res.setHeader('X-Auth-Deprecated', 'true');
  res.setHeader('X-Auth-Migration-Deadline', '2025-03-01');
  res.setHeader('Warning', '299 - "Basic Auth is deprecated. Migrate to JWT by 2025-03-01"');
}
```

---

## Testing

### Test JWT Authentication

```bash
# 1. Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"ChangeMe123!@#"}'

# Response:
# {
#   "success": true,
#   "user": {...},
#   "tokens": {
#     "accessToken": "eyJhbGc...",
#     "refreshToken": "eyJhbGc..."
#   }
# }

# 2. Use access token
curl http://localhost:3001/api/fleet/status \
  -H "Authorization: Bearer eyJhbGc..."

# 3. Refresh token
curl -X POST http://localhost:3001/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"eyJhbGc..."}'

# 4. Logout
curl -X POST http://localhost:3001/api/auth/logout \
  -H "Authorization: Bearer eyJhbGc..."
```

### Test Dashboard Login

1. Open browser to `http://localhost:3001`
2. Login modal should appear
3. Enter credentials: `admin` / `ChangeMe123!@#`
4. Dashboard should load with user info displayed
5. Wait 55 minutes → token should auto-refresh
6. Click logout → should return to login modal

### Automated Testing

```javascript
// test/auth-migration.test.js
import { expect } from 'chai';
import { EnhancedAuthService } from '../src/security/EnhancedAuthService.js';

describe('JWT Authentication Migration', () => {
  let authService;

  before(async () => {
    authService = new EnhancedAuthService();
    await authService.initialize();
  });

  it('should register new user', async () => {
    const result = await authService.registerUser({
      username: 'testuser',
      email: 'test@example.com',
      password: 'TestPass123!@#',
      firstName: 'Test',
      lastName: 'User',
      roles: ['user']
    });

    expect(result.success).to.be.true;
    expect(result.user.username).to.equal('testuser');
  });

  it('should authenticate user and return tokens', async () => {
    const result = await authService.authenticateUser({
      username: 'testuser',
      password: 'TestPass123!@#'
    });

    expect(result.success).to.be.true;
    expect(result.tokens.accessToken).to.exist;
    expect(result.tokens.refreshToken).to.exist;
  });

  it('should validate access token', async () => {
    const loginResult = await authService.authenticateUser({
      username: 'testuser',
      password: 'TestPass123!@#'
    });

    const validation = await authService.validateToken(
      loginResult.tokens.accessToken
    );

    expect(validation.valid).to.be.true;
    expect(validation.user.username).to.equal('testuser');
  });

  it('should refresh token', async () => {
    const loginResult = await authService.authenticateUser({
      username: 'testuser',
      password: 'TestPass123!@#'
    });

    const newTokens = await authService.refreshToken(
      loginResult.tokens.refreshToken
    );

    expect(newTokens.accessToken).to.exist;
    expect(newTokens.refreshToken).to.exist;
    expect(newTokens.accessToken).to.not.equal(loginResult.tokens.accessToken);
  });

  it('should logout and invalidate session', async () => {
    const loginResult = await authService.authenticateUser({
      username: 'testuser',
      password: 'TestPass123!@#'
    });

    await authService.logout(loginResult.user.id, loginResult.session.id);

    // Token should be blacklisted
    const validation = await authService.validateToken(
      loginResult.tokens.accessToken
    );

    expect(validation.valid).to.be.false;
  });
});
```

Run tests:
```bash
npm test -- test/auth-migration.test.js
```

---

## Rollback Plan

If critical issues occur during migration:

### 1. Emergency Rollback to Base64

```javascript
// Temporarily disable JWT requirement
const ENABLE_JWT = process.env.ENABLE_JWT !== 'false';

function authenticate(req, res, next) {
  if (ENABLE_JWT) {
    return authenticateJWT(req, res, next);
  } else {
    return authenticateBasic(req, res, next);
  }
}
```

Set environment variable:
```bash
export ENABLE_JWT=false
npm start
```

### 2. Data Preservation

JWT migration doesn't modify existing data:

- No database schema changes
- Redis sessions can be flushed: `redis-cli flushdb`
- User accounts stored in `.env` are unchanged

### 3. Gradual Rollout

Enable JWT for specific routes first:

```javascript
// JWT for new endpoints
app.get('/api/v2/fleet/status', authenticateJWT, handler);

// Base64 for legacy endpoints
app.get('/api/fleet/status', authenticateBasic, handler);

// Migration notice
res.setHeader('X-Deprecated-Endpoint', 'true');
res.setHeader('X-New-Endpoint', '/api/v2/fleet/status');
```

---

## Troubleshooting

### Issue: "Authentication required" on all requests

**Cause**: Access token not included in requests

**Solution**:
```javascript
// Ensure token is in Authorization header
fetch('/api/data', {
  headers: {
    'Authorization': `Bearer ${accessToken}` // Note: "Bearer" not "Basic"
  }
});
```

### Issue: Token expires too quickly

**Cause**: Access token lifetime is 1 hour by default

**Solution**: Implement automatic refresh
```javascript
// Refresh token proactively
setTimeout(() => refreshAccessToken(), 55 * 60 * 1000);
```

### Issue: "Session expired" error

**Cause**: Session timeout (30 minutes of inactivity)

**Solution**: Update session activity on requests
```javascript
// Server-side middleware
async function updateSessionActivity(req, res, next) {
  if (req.sessionId) {
    await redisClient.hSet(`session:${req.sessionId}`, {
      lastActivity: Date.now()
    });
  }
  next();
}
```

### Issue: Can't login - "Invalid credentials"

**Causes**:
1. Wrong username/password
2. Account locked (5 failed attempts)
3. Account not created yet

**Solutions**:
```bash
# 1. Create admin user
node scripts/create-admin-user.js

# 2. Check account status
redis-cli hgetall "user:admin"

# 3. Unlock account
redis-cli del "rate_limit:login:admin@example.com"
```

### Issue: Redis connection failed

**Cause**: Redis not running or wrong credentials

**Solution**:
```bash
# Start Redis
redis-server

# Test connection
redis-cli -a "$REDIS_PASSWORD" ping

# Check password in .env
grep REDIS_PASSWORD .env
```

### Issue: Dashboard shows blank page

**Cause**: CORS issues or auth client not loaded

**Solution**:
```javascript
// Enable CORS on server
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

// Load auth client before app scripts
<script src="/auth-client.js"></script>
<script src="/app.js"></script>
```

---

## Post-Migration Checklist

- [ ] Admin user created and tested
- [ ] All dashboard pages accessible with JWT
- [ ] Token refresh working automatically
- [ ] Logout functionality tested
- [ ] CLI tools updated and tested
- [ ] Security audit passed: `npm run security:full-audit`
- [ ] Base64 authentication disabled
- [ ] Environment variables updated
- [ ] Documentation updated
- [ ] Team trained on new login flow

---

## Support

For migration assistance:

1. **Pre-migration**: Run security audit
   ```bash
   npm run security:full-audit
   ```

2. **During migration**: Enable debug logging
   ```bash
   DEBUG=claude-flow:auth npm start
   ```

3. **Post-migration**: Test all endpoints
   ```bash
   npm test -- test/auth-migration.test.js
   ```

4. **Issues**: Check troubleshooting guide
   - [JWT Authentication](./JWT_AUTHENTICATION.md)
   - [Troubleshooting Guide](../TROUBLESHOOTING.md)

---

**Migration Deadline**: 2025-03-01 (Base64 support will be removed)
**Support**: [GitHub Issues](https://github.com/masharratt/claude-flow-novice/issues)
**Last Updated**: 2025-01-09
**Version**: 1.6.6
