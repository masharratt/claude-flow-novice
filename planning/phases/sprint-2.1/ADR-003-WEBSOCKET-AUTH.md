# ADR-003: WebSocket Authentication Strategy

**Status**: Accepted
**Date**: 2025-10-11
**Context**: Phase 2 Sprint 2.1 - Unified Express Server Architecture

---

## Context and Problem Statement

WebSocket (Socket.IO) connections require authentication before establishing the connection. Unlike REST APIs where authentication can fail gracefully with a 401 response, WebSocket authentication must succeed or reject the connection entirely.

**Challenge**: How do we authenticate WebSocket connections before they are established, while supporting multiple authentication methods (JWT, API Key)?

**Key Questions**:
1. Where do clients provide authentication credentials for WebSocket connections?
2. How do we verify credentials before accepting the connection?
3. How do we handle authentication failures gracefully?
4. Can we reuse REST API authentication logic for WebSockets?

---

## Decision Drivers

1. **Security**: Authentication must happen before connection establishment
2. **Compatibility**: Support same authentication methods as REST API (JWT, API Key)
3. **User Experience**: Provide clear error messages for authentication failures
4. **Performance**: Minimize authentication overhead
5. **Standards Compliance**: Follow Socket.IO best practices

---

## Considered Options

### Option 1: Token in Handshake Auth Object (Recommended by Socket.IO)

**Client Code**:
```javascript
const socket = io('http://localhost:3000', {
  auth: {
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
  }
});
```

**Server Code**:
```typescript
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication token required'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!);
    socket.data.user = decoded;
    next();
  } catch (error) {
    next(new Error('Invalid token'));
  }
});
```

**Pros**:
- Official Socket.IO recommendation
- Clean separation of auth credentials from HTTP headers
- Typed in Socket.IO TypeScript definitions
- Easy to debug (clear auth object in handshake)

**Cons**:
- Requires Socket.IO v3+ (not compatible with older clients)
- Different from REST API (uses `Authorization` header)

### Option 2: Token in Authorization Header

**Client Code**:
```javascript
const socket = io('http://localhost:3000', {
  extraHeaders: {
    Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
  }
});
```

**Server Code**:
```typescript
io.use(async (socket, next) => {
  const authHeader = socket.handshake.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next(new Error('Authorization header required'));
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!);
    socket.data.user = decoded;
    next();
  } catch (error) {
    next(new Error('Invalid token'));
  }
});
```

**Pros**:
- Consistent with REST API authentication (uses `Authorization` header)
- Standard HTTP header
- Compatible with older Socket.IO versions

**Cons**:
- Socket.IO discourages using `extraHeaders` for authentication
- Not the official Socket.IO pattern
- Harder to debug (auth mixed with other headers)

### Option 3: Token in Query String

**Client Code**:
```javascript
const socket = io('http://localhost:3000', {
  query: {
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
  }
});
```

**Server Code**:
```typescript
io.use(async (socket, next) => {
  const token = socket.handshake.query.token as string;
  if (!token) {
    return next(new Error('Authentication token required'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!);
    socket.data.user = decoded;
    next();
  } catch (error) {
    next(new Error('Invalid token'));
  }
});
```

**Pros**:
- Simple to implement
- Compatible with all Socket.IO versions

**Cons**:
- **SECURITY RISK**: Tokens visible in URLs (logged by proxies, browsers, servers)
- Not recommended by Socket.IO
- Violates security best practices

### Option 4: Hybrid (Auth Object + Authorization Header Fallback)

**Client Code**:
```javascript
// Preferred method (Socket.IO v3+)
const socket = io('http://localhost:3000', {
  auth: {
    token: jwtToken
  }
});

// Fallback method (older clients)
const socketLegacy = io('http://localhost:3000', {
  extraHeaders: {
    Authorization: `Bearer ${jwtToken}`
  }
});
```

**Server Code**:
```typescript
io.use(async (socket, next) => {
  // Try auth object first (preferred)
  let token = socket.handshake.auth.token;

  // Fallback to Authorization header
  if (!token) {
    const authHeader = socket.handshake.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  if (!token) {
    return next(new Error('Authentication required'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!);
    socket.data.user = decoded;
    next();
  } catch (error) {
    next(new Error('Invalid token'));
  }
});
```

**Pros**:
- Supports both modern and legacy clients
- Follows Socket.IO best practices (auth object preferred)
- Backward compatible
- Flexible

**Cons**:
- More complex implementation
- Two authentication paths to maintain

---

## Decision Outcome

**Chosen Option**: Option 4 (Hybrid: Auth Object + Authorization Header Fallback)

### Implementation

```typescript
// websocket/authentication.ts

import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import type { JWTPayload } from '../types/api.types';

/**
 * WebSocket authentication middleware
 *
 * Supports two authentication methods (in order of preference):
 * 1. Socket.IO auth object: socket.handshake.auth.token
 * 2. HTTP Authorization header: Authorization: Bearer <token>
 *
 * Also supports API key authentication via:
 * 1. Socket.IO auth object: socket.handshake.auth.apiKey
 * 2. HTTP X-API-Key header: X-API-Key: <api-key>
 */
export function setupWebSocketAuth(io: SocketIOServer): void {
  io.use(async (socket: Socket, next) => {
    try {
      // Try to extract authentication token
      let token = socket.handshake.auth.token;

      // Fallback to Authorization header (for legacy clients)
      if (!token) {
        const authHeader = socket.handshake.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
          token = authHeader.substring(7);
        }
      }

      // Try JWT authentication
      if (token) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
          socket.data.user = {
            id: decoded.sub,
            username: decoded.username,
            role: decoded.role,
            permissions: decoded.permissions
          };
          socket.data.authenticated = true;
          socket.data.authMethod = 'jwt';

          console.log(`WebSocket authenticated: ${socket.id} (user: ${decoded.username})`);
          return next();
        } catch (error) {
          // Invalid JWT, try API key
        }
      }

      // Try API key authentication
      let apiKey = socket.handshake.auth.apiKey;

      // Fallback to X-API-Key header
      if (!apiKey) {
        apiKey = socket.handshake.headers['x-api-key'] as string;
      }

      if (apiKey && apiKey === process.env.API_KEY) {
        socket.data.user = {
          id: 'api-key-user',
          username: 'api-key',
          role: 'service',
          permissions: ['read', 'write', 'admin']
        };
        socket.data.authenticated = true;
        socket.data.authMethod = 'api-key';

        console.log(`WebSocket authenticated: ${socket.id} (API key)`);
        return next();
      }

      // No valid authentication found
      console.warn(`WebSocket authentication failed: ${socket.id}`);
      return next(new Error('Authentication required'));

    } catch (error) {
      console.error(`WebSocket authentication error: ${socket.id}`, error);
      return next(new Error('Authentication failed'));
    }
  });
}

/**
 * Verify user has required role for WebSocket event
 */
export function requireRole(socket: Socket, requiredRole: string): boolean {
  if (!socket.data.user) {
    return false;
  }

  return socket.data.user.role === requiredRole || socket.data.user.role === 'admin';
}

/**
 * Verify user has required permission for WebSocket event
 */
export function requirePermission(socket: Socket, permission: string): boolean {
  if (!socket.data.user) {
    return false;
  }

  return (
    socket.data.user.permissions?.includes(permission) ||
    socket.data.user.role === 'admin' ||
    socket.data.user.permissions?.includes('*')
  );
}
```

---

## Client-Side Implementation

### React Dashboard

```typescript
// frontend/src/lib/websocket.ts

import { io, Socket } from 'socket.io-client';

export function connectWebSocket(token: string): Socket {
  const socket = io('http://localhost:3000', {
    auth: {
      token
    },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5
  });

  socket.on('connect', () => {
    console.log('WebSocket connected:', socket.id);
  });

  socket.on('connect_error', (error) => {
    console.error('WebSocket connection error:', error.message);
    // Handle authentication errors
    if (error.message === 'Authentication required') {
      // Redirect to login page
      window.location.href = '/login';
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('WebSocket disconnected:', reason);
  });

  return socket;
}
```

### CLI Tool

```typescript
// cli/src/websocket-client.ts

import { io } from 'socket.io-client';

export function connectWebSocketCLI(apiKey: string) {
  const socket = io('http://localhost:3000', {
    auth: {
      apiKey
    },
    transports: ['websocket']
  });

  socket.on('connect', () => {
    console.log('Connected to server');
  });

  socket.on('connect_error', (error) => {
    console.error('Connection failed:', error.message);
    process.exit(1);
  });

  return socket;
}
```

### Legacy Client (Authorization Header)

```typescript
// legacy/client.ts

import { io } from 'socket.io-client';

export function connectWebSocketLegacy(token: string) {
  const socket = io('http://localhost:3000', {
    extraHeaders: {
      Authorization: `Bearer ${token}`
    }
  });

  return socket;
}
```

---

## Rationale

### Why Hybrid Approach?

1. **Future-Proof**: Socket.IO auth object is the official recommendation (v3+)
2. **Backward Compatible**: Authorization header fallback for legacy clients
3. **Flexible**: Supports both JWT and API key authentication
4. **Migration Path**: Gradual migration from old auth to new auth

### Why Not Query String?

**Security Risk**: Tokens in query strings are:
- Logged by web servers (Apache access logs, nginx logs)
- Logged by proxies and load balancers
- Stored in browser history
- Visible in network monitoring tools

**Example Attack**: An attacker with access to server logs can extract JWT tokens and impersonate users.

### Why Socket.IO Middleware?

Socket.IO middleware (`io.use()`) is executed BEFORE the connection is established:
- Connection is rejected if authentication fails
- No need to manually disconnect authenticated sockets
- Clean separation of concerns (auth vs. business logic)

---

## Error Handling

### Authentication Failures

**Server-Side**:
```typescript
io.use(async (socket, next) => {
  try {
    // Authentication logic...
    next();
  } catch (error) {
    // Reject connection with error message
    return next(new Error('Authentication failed: ' + error.message));
  }
});
```

**Client-Side**:
```typescript
socket.on('connect_error', (error) => {
  if (error.message.includes('Authentication')) {
    console.error('Authentication failed:', error.message);
    // Redirect to login or show error message
  }
});
```

### Token Expiration

**Problem**: JWT tokens expire after 24 hours. WebSocket connections can live longer.

**Solution**: Implement token refresh mechanism (deferred to Sprint 2.2)

**Workaround** (Sprint 2.1):
1. Client detects `connect_error` with authentication failure
2. Client fetches new JWT token (via `/api/auth/refresh` endpoint)
3. Client reconnects with new token

```typescript
socket.on('connect_error', async (error) => {
  if (error.message === 'Invalid token') {
    // Token expired, refresh and reconnect
    const newToken = await refreshToken();
    socket.auth = { token: newToken };
    socket.connect();
  }
});
```

---

## Security Considerations

### 1. Token Transmission

**Security**: Tokens transmitted during WebSocket handshake (HTTPS recommended)
- Use WSS (WebSocket Secure) in production
- Enforce `Strict-Transport-Security` header

### 2. Token Storage

**Client-Side**: Store JWT tokens securely
- localStorage (vulnerable to XSS)
- sessionStorage (cleared on tab close)
- httpOnly cookies (most secure, but requires cookie-based auth)

**Recommendation**: Use sessionStorage for short-lived sessions, implement token refresh.

### 3. Connection Hijacking

**Risk**: If an attacker intercepts a JWT token, they can establish their own WebSocket connection.

**Mitigation**:
- Short token expiration (24 hours)
- Implement token refresh mechanism
- Monitor for suspicious WebSocket connections (multiple connections from same token)

### 4. Rate Limiting

**WebSocket Connections**: Limit concurrent connections per user
- Max 5 connections per user (prevent DDoS)
- Max 1000 total connections (server capacity)

```typescript
const userConnections = new Map<string, number>();

io.use(async (socket, next) => {
  const userId = socket.data.user?.id;
  const currentConnections = userConnections.get(userId) || 0;

  if (currentConnections >= 5) {
    return next(new Error('Too many connections'));
  }

  userConnections.set(userId, currentConnections + 1);

  socket.on('disconnect', () => {
    userConnections.set(userId, (userConnections.get(userId) || 1) - 1);
  });

  next();
});
```

---

## Testing Strategy

### Unit Tests

```typescript
// __tests__/websocket/authentication.test.ts

describe('WebSocket Authentication', () => {
  let io: SocketIOServer;
  let clientSocket: Socket;

  beforeAll(() => {
    io = new SocketIOServer(3001);
    setupWebSocketAuth(io);
  });

  it('should accept valid JWT token in auth object', (done) => {
    const token = generateToken({ id: 'user-123', role: 'admin' });
    clientSocket = ioClient('http://localhost:3001', {
      auth: { token }
    });

    clientSocket.on('connect', () => {
      expect(clientSocket.connected).toBe(true);
      done();
    });
  });

  it('should accept valid JWT token in Authorization header', (done) => {
    const token = generateToken({ id: 'user-123', role: 'admin' });
    clientSocket = ioClient('http://localhost:3001', {
      extraHeaders: {
        Authorization: `Bearer ${token}`
      }
    });

    clientSocket.on('connect', () => {
      expect(clientSocket.connected).toBe(true);
      done();
    });
  });

  it('should reject connection without token', (done) => {
    clientSocket = ioClient('http://localhost:3001');

    clientSocket.on('connect_error', (error) => {
      expect(error.message).toBe('Authentication required');
      done();
    });
  });

  afterAll(() => {
    io.close();
    clientSocket.close();
  });
});
```

---

## Consequences

### Positive
1. **Secure**: Authentication before connection establishment
2. **Flexible**: Supports JWT + API key authentication
3. **Compatible**: Works with modern and legacy clients
4. **Standard**: Follows Socket.IO best practices

### Negative
1. **Complex**: Two authentication paths (auth object + header fallback)
2. **Token Expiration**: Long-lived WebSocket connections require token refresh

### Mitigation Strategies
1. **Documentation**: Clear examples for both auth methods
2. **Token Refresh**: Implement automatic token refresh in Sprint 2.2

---

## Future Enhancements (Deferred)

### Sprint 2.2
- [ ] Automatic token refresh for WebSocket connections
- [ ] Graceful reconnection with new token

### Phase 3
- [ ] Per-connection rate limiting
- [ ] Connection monitoring dashboard (active connections, bandwidth usage)

---

## Related ADRs
- ADR-002: Authentication Strategy (JWT + API Key)
- ADR-001: Middleware Stack Ordering

---

## References
1. Socket.IO Authentication Documentation
2. RFC 7519: JSON Web Token (JWT)
3. OWASP WebSocket Security Cheat Sheet

---

## Approval

**Approved By**: architect-1
**Date**: 2025-10-11
**Status**: Accepted for implementation in Sprint 2.1
