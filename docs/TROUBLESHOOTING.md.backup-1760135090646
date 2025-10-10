# Troubleshooting Guide

Comprehensive troubleshooting guide for Claude Flow Novice. Solutions for common issues across authentication, dashboard, Redis, swarm coordination, and deployment.

---

## Table of Contents

- [Quick Diagnostics](#quick-diagnostics)
- [Authentication Issues](#authentication-issues)
- [Dashboard Issues](#dashboard-issues)
- [Redis Connection Problems](#redis-connection-problems)
- [Cache Invalidation Issues](#cache-invalidation-issues)
- [Swarm Coordination Issues](#swarm-coordination-issues)
- [Performance Problems](#performance-problems)
- [Installation Issues](#installation-issues)
- [Network and Connectivity](#network-and-connectivity)
- [Memory and Resource Issues](#memory-and-resource-issues)
- [Security Issues](#security-issues)
- [Debug Tools](#debug-tools)

---

## Quick Diagnostics

### System Health Check

Run comprehensive diagnostics:

```bash
# Full system health check
claude-flow-novice doctor --detailed

# Or manual checks
node --version          # Should be >= 20.0.0
redis-cli ping          # Should return PONG
npm run security:full-audit
claude-flow-novice status --verbose
```

### Common Quick Fixes

```bash
# 1. Restart everything
pkill -f claude-flow-novice
pkill -f node
redis-cli flushall      # Warning: clears all data
npm start

# 2. Clear cache
claude-flow-novice clean --all
rm -rf node_modules package-lock.json
npm install

# 3. Reset Redis
redis-cli flushall
npm start

# 4. Check permissions
chmod 600 .env
chmod 600 .env.keys
chmod 700 memory/security/
```

---

## Authentication Issues

### Issue: "Authentication required" on Dashboard

**Symptoms:**
- Dashboard shows login modal immediately
- API requests return 401 Unauthorized
- Token not being sent with requests

**Causes:**
1. No access token in localStorage
2. Token expired
3. Invalid token format
4. CORS blocking Authorization header

**Solutions:**

**1. Check localStorage:**
```javascript
// Open browser console (F12)
console.log(localStorage.getItem('dashboard_access_token'));
console.log(localStorage.getItem('dashboard_refresh_token'));

// If null, login again
authClient.login('admin', 'password');
```

**2. Check token expiration:**
```javascript
// Decode token (without verification)
const token = localStorage.getItem('dashboard_access_token');
const payload = JSON.parse(atob(token.split('.')[1]));
console.log('Expires:', new Date(payload.exp * 1000));
console.log('Now:', new Date());

// If expired, refresh
await authClient.refreshAccessToken();
```

**3. Verify Authorization header:**
```javascript
// Check if token is being sent
fetch('/api/fleet/status', {
  headers: {
    'Authorization': `Bearer ${token}`  // Must include "Bearer "
  }
});
```

**4. Check CORS configuration:**
```javascript
// Server-side (src/server.js)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  next();
});
```

---

### Issue: "Invalid credentials" on Login

**Symptoms:**
- Login fails with 401 Unauthorized
- Error message: "Invalid credentials"

**Causes:**
1. Wrong username or password
2. Account locked (too many failed attempts)
3. Account inactive
4. Password not meeting requirements

**Solutions:**

**1. Verify credentials:**
```bash
# Create admin user if doesn't exist
node scripts/create-admin-user.js

# Default credentials:
# Username: admin
# Password: ChangeMe123!@#
```

**2. Check account status:**
```bash
# Check Redis for user data
redis-cli -a "$REDIS_PASSWORD" hgetall "user:admin"

# Check if account is locked
redis-cli -a "$REDIS_PASSWORD" get "rate_limit:login:admin@example.com"
```

**3. Unlock account:**
```bash
# Clear rate limit
redis-cli -a "$REDIS_PASSWORD" del "rate_limit:login:admin@example.com"

# Reset login attempts
redis-cli -a "$REDIS_PASSWORD" hset "user:<user-id>" loginAttempts 0 lockedUntil 0
```

**4. Reset password:**
```bash
# Manually create new user
node -e "
const { EnhancedAuthService } = require('./src/security/EnhancedAuthService.js');
const auth = new EnhancedAuthService();
auth.initialize().then(() => {
  return auth.registerUser({
    username: 'admin',
    email: 'admin@example.com',
    password: 'NewPassword123!@#',
    firstName: 'Admin',
    lastName: 'User',
    roles: ['admin'],
    permissions: ['dashboard:access', 'fleet:read', 'fleet:write']
  });
}).then(result => console.log('User created:', result));
"
```

---

### Issue: Token Refresh Loop

**Symptoms:**
- Token refreshes continuously
- Console shows repeated refresh requests
- Performance degradation

**Causes:**
1. Refresh token also expired
2. Clock skew between client and server
3. Token refresh timer not cleared

**Solutions:**

**1. Check token validity:**
```javascript
// Check both tokens
const accessToken = localStorage.getItem('dashboard_access_token');
const refreshToken = localStorage.getItem('dashboard_refresh_token');

// Decode and check expiration
const decodeToken = (token) => {
  const payload = JSON.parse(atob(token.split('.')[1]));
  return {
    exp: new Date(payload.exp * 1000),
    type: payload.type
  };
};

console.log('Access Token:', decodeToken(accessToken));
console.log('Refresh Token:', decodeToken(refreshToken));
```

**2. Clear and re-login:**
```javascript
// Clear stale tokens
authClient.clearAuthData();

// Re-authenticate
await authClient.login('admin', 'password');
```

**3. Fix token refresh logic:**
```javascript
// In auth-client.js, ensure only one refresh timer
scheduleTokenRefresh() {
  // Clear existing timer
  if (this.tokenRefreshTimer) {
    clearTimeout(this.tokenRefreshTimer);
    this.tokenRefreshTimer = null;
  }

  // Schedule new refresh (55 minutes for 1-hour tokens)
  const refreshTime = 55 * 60 * 1000;
  this.tokenRefreshTimer = setTimeout(async () => {
    try {
      await this.refreshAccessToken();
    } catch (error) {
      console.error('Token refresh failed:', error);
      this.showLoginModal();
    }
  }, refreshTime);
}
```

---

### Issue: MFA Token Invalid

**Symptoms:**
- Correct TOTP code rejected
- Error: "Invalid MFA token"

**Causes:**
1. Clock skew between server and authenticator app
2. Wrong secret configured
3. Token already used
4. Time window too narrow

**Solutions:**

**1. Sync system time:**
```bash
# Ubuntu/Debian
sudo ntpdate pool.ntp.org
sudo systemctl restart systemd-timesyncd

# Or manually set time
sudo date -s "$(curl -s http://worldtimeapi.org/api/ip | jq -r '.datetime')"
```

**2. Increase time window:**
```javascript
// src/security/EnhancedAuthService.js
mfa: {
  window: 2  // Allow ±2 time steps (default: 1)
}
```

**3. Use backup codes:**
```javascript
// During MFA setup, save backup codes
const { backupCodes } = await authService.setupMFA(userId);
console.log('Backup codes:', backupCodes);
// Use one of these codes instead of TOTP
```

---

## Dashboard Issues

### Issue: Dashboard Not Loading / Blank Page

**Symptoms:**
- Browser shows blank white page
- No error messages
- Loading spinner stuck

**Causes:**
1. JavaScript error preventing page load
2. Authentication blocking page render
3. Missing static files
4. CORS issues

**Solutions:**

**1. Check browser console (F12 → Console):**
```
Look for errors like:
- "SyntaxError: Unexpected token <"
- "Failed to load resource"
- "CORS policy blocked"
- "authClient is not defined"
```

**2. Verify server is running:**
```bash
# Check if server responds
curl -I http://localhost:3001/

# Check if static files are served
curl http://localhost:3001/auth-client.js
```

**3. Fix static file serving:**
```javascript
// src/server.js
import express from 'express';
import path from 'path';

app.use(express.static(path.join(__dirname, '../monitor/dashboard')));

// Serve index.html for dashboard routes
app.get('/dashboard*', (req, res) => {
  res.sendFile(path.join(__dirname, '../monitor/dashboard/premium-dashboard.html'));
});
```

**4. Disable authentication temporarily:**
```javascript
// In monitor/dashboard/auth-client.js
checkAuthStatus() {
  // Comment out for testing
  // if (!this.token || !this.user) {
  //   this.showLoginModal();
  // }

  // Temporary bypass
  this.user = { username: 'test', roles: ['admin'], permissions: ['*'] };
}
```

---

### Issue: Dashboard Authentication Fails After Reload

**Symptoms:**
- Dashboard works, then fails after browser refresh
- Login required after every page load
- Tokens not persisting

**Causes:**
1. LocalStorage not being written
2. Tokens cleared on page load
3. Browser privacy mode
4. Cookie settings blocking localStorage

**Solutions:**

**1. Check localStorage persistence:**
```javascript
// Test localStorage
try {
  localStorage.setItem('test', 'value');
  const val = localStorage.getItem('test');
  console.log('LocalStorage working:', val === 'value');
  localStorage.removeItem('test');
} catch (e) {
  console.error('LocalStorage blocked:', e);
}
```

**2. Verify tokens are saved:**
```javascript
// In auth-client.js after login
async login(username, password) {
  // ... login logic ...

  // Verify tokens are saved
  localStorage.setItem('dashboard_access_token', this.token);
  localStorage.setItem('dashboard_refresh_token', this.refreshToken);
  localStorage.setItem('dashboard_user', JSON.stringify(this.user));

  // Confirm save
  console.log('Tokens saved:', {
    access: !!localStorage.getItem('dashboard_access_token'),
    refresh: !!localStorage.getItem('dashboard_refresh_token'),
    user: !!localStorage.getItem('dashboard_user')
  });
}
```

**3. Disable browser privacy mode:**
- Exit incognito/private mode
- Check browser settings for localStorage blocking
- Disable third-party cookie blocking

---

### Issue: Dashboard Realtime Updates Not Working

**Symptoms:**
- Dashboard shows stale data
- Metrics not updating
- No live connection established

**Causes:**
1. WebSocket connection failed
2. HTTP polling not working
3. Server not broadcasting updates
4. CORS blocking WebSocket upgrade

**Solutions:**

**1. Check WebSocket connection:**
```javascript
// Browser console
const ws = new WebSocket('ws://localhost:3001');
ws.onopen = () => console.log('WebSocket connected');
ws.onerror = (error) => console.error('WebSocket error:', error);
ws.onmessage = (msg) => console.log('Message:', msg.data);
```

**2. Enable HTTP polling fallback:**
```javascript
// monitor/dashboard/http-polling-service.js
class HTTPPollingService {
  constructor(interval = 5000) {
    this.interval = interval;
    this.isPolling = false;
  }

  start() {
    this.isPolling = true;
    this.poll();
  }

  async poll() {
    if (!this.isPolling) return;

    try {
      const response = await fetch('/api/dashboard/metrics');
      const data = await response.json();
      window.dispatchEvent(new CustomEvent('dashboard-update', { detail: data }));
    } catch (error) {
      console.error('Polling error:', error);
    }

    setTimeout(() => this.poll(), this.interval);
  }

  stop() {
    this.isPolling = false;
  }
}

// Initialize
const pollingService = new HTTPPollingService(5000);
pollingService.start();
```

**3. Check server-side updates:**
```javascript
// src/server.js
import { EventEmitter } from 'events';

const dashboardEvents = new EventEmitter();

// Emit updates
setInterval(() => {
  const metrics = collectMetrics();
  dashboardEvents.emit('update', metrics);
}, 5000);

// HTTP endpoint for polling
app.get('/api/dashboard/metrics', (req, res) => {
  const metrics = collectMetrics();
  res.json(metrics);
});
```

---

## Redis Connection Problems

### Issue: "Redis connection failed" / ECONNREFUSED

**Symptoms:**
- Error: `connect ECONNREFUSED 127.0.0.1:6379`
- Application won't start
- Session management not working

**Causes:**
1. Redis not installed or not running
2. Wrong host/port configuration
3. Firewall blocking connection
4. Redis authentication required but not provided

**Solutions:**

**1. Check if Redis is running:**
```bash
# Check Redis status
sudo systemctl status redis

# Or check process
ps aux | grep redis-server

# Check port
sudo lsof -i :6379
```

**2. Start Redis:**
```bash
# Ubuntu/Debian
sudo systemctl start redis
sudo systemctl enable redis  # Auto-start on boot

# macOS (Homebrew)
brew services start redis

# Docker
docker run -d -p 6379:6379 --name redis redis:latest

# Manual start
redis-server /etc/redis/redis.conf
```

**3. Verify connection:**
```bash
# Test connection
redis-cli ping
# Expected: PONG

# With authentication
redis-cli -a "$REDIS_PASSWORD" ping

# Check Redis info
redis-cli info server
```

**4. Fix connection configuration:**
```bash
# Check .env
grep REDIS .env

# Should have:
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=<your-password>

# Test with environment variables
REDIS_URL=redis://localhost:6379 npm start
```

---

### Issue: "NOAUTH Authentication required"

**Symptoms:**
- Error: `ReplyError: NOAUTH Authentication required`
- Commands rejected by Redis

**Causes:**
1. Redis password configured but not provided in connection
2. Wrong password
3. Password not configured in redis.conf

**Solutions:**

**1. Check Redis password requirement:**
```bash
# Check if password is required
redis-cli config get requirepass

# If returns a password, authentication is required
```

**2. Configure application password:**
```bash
# Add to .env
echo "REDIS_PASSWORD=$(grep requirepass /etc/redis/redis.conf | awk '{print $2}')" >> .env
```

**3. Test authentication:**
```bash
# Test with password
export REDIS_PASSWORD="<your-password>"
redis-cli -a "$REDIS_PASSWORD" ping

# If authentication fails, reset password
sudo redis-cli config set requirepass "new-secure-password"

# Update .env
echo "REDIS_PASSWORD=new-secure-password" >> .env
```

**4. Disable authentication (development only):**
```bash
# Edit /etc/redis/redis.conf
# Comment out or remove:
# requirepass <password>

# Restart Redis
sudo systemctl restart redis
```

---

### Issue: Redis Memory Full / OOM

**Symptoms:**
- Error: `OOM command not allowed when used memory > 'maxmemory'`
- Redis refusing writes
- Application crashes

**Causes:**
1. Redis maxmemory limit reached
2. Memory leak in application
3. No eviction policy configured

**Solutions:**

**1. Check memory usage:**
```bash
# Check current memory usage
redis-cli info memory

# Key metrics:
# used_memory_human
# maxmemory_human
# maxmemory_policy
```

**2. Increase memory limit:**
```bash
# /etc/redis/redis.conf
maxmemory 2gb
maxmemory-policy allkeys-lru  # Evict least recently used keys

# Restart Redis
sudo systemctl restart redis

# Or set runtime
redis-cli config set maxmemory 2gb
redis-cli config set maxmemory-policy allkeys-lru
```

**3. Clear unnecessary keys:**
```bash
# Find large keys
redis-cli --bigkeys

# Clear specific patterns
redis-cli --scan --pattern "temp:*" | xargs redis-cli del

# Clear all (WARNING: clears all data)
redis-cli flushall
```

**4. Enable persistence and eviction:**
```bash
# /etc/redis/redis.conf
maxmemory 2gb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
```

---

## Cache Invalidation Issues

### Issue: ACL Cache Not Updating

**Symptoms:**
- Permission changes not taking effect
- Old permissions still active
- User roles not updated

**Causes:**
1. ACL cache not invalidated on permission change
2. Cached data TTL too long
3. Multiple Redis instances with inconsistent data

**Solutions:**

**1. Manual cache invalidation:**
```bash
# Clear ACL cache for specific user
redis-cli -a "$REDIS_PASSWORD" del "acl:cache:user:<user-id>"

# Clear all ACL cache
redis-cli -a "$REDIS_PASSWORD" --scan --pattern "acl:cache:*" | \
  xargs redis-cli -a "$REDIS_PASSWORD" del

# Force reload permissions
redis-cli -a "$REDIS_PASSWORD" publish "acl:invalidate" "all"
```

**2. Implement automatic cache invalidation:**
```javascript
// src/security/acl-manager.js
class ACLManager {
  async updateUserPermissions(userId, newPermissions) {
    // Update permissions
    await this.storePermissions(userId, newPermissions);

    // Invalidate cache
    await this.invalidateCache(userId);

    // Publish invalidation event
    await this.redis.publish('acl:invalidate', JSON.stringify({ userId }));
  }

  async invalidateCache(userId) {
    const cacheKeys = [
      `acl:cache:user:${userId}`,
      `acl:cache:roles:${userId}`,
      `acl:cache:permissions:${userId}`
    ];

    await Promise.all(cacheKeys.map(key => this.redis.del(key)));
  }

  // Subscribe to invalidation events
  async subscribeToInvalidations() {
    const subscriber = this.redis.duplicate();
    await subscriber.subscribe('acl:invalidate');

    subscriber.on('message', async (channel, message) => {
      const { userId } = JSON.parse(message);
      await this.invalidateCache(userId);
    });
  }
}
```

**3. Set reasonable TTL:**
```javascript
// Cache with 5-minute TTL
await redis.setEx(`acl:cache:user:${userId}`, 300, JSON.stringify(permissions));
```

**4. Force re-authentication:**
```javascript
// Invalidate all sessions for user
await authService.deleteAllUserSessions(userId);

// User must login again with new permissions
```

---

### Issue: Stale Dashboard Data

**Symptoms:**
- Dashboard shows outdated metrics
- Fleet status not updating
- Agent counts incorrect

**Causes:**
1. Caching middleware not refreshing
2. Browser cache serving old files
3. Server-side cache not invalidated

**Solutions:**

**1. Disable browser cache:**
```javascript
// Server-side (src/server.js)
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});
```

**2. Force cache refresh:**
```bash
# Browser: Hard reload
# Chrome/Firefox: Ctrl+Shift+R (Cmd+Shift+R on Mac)

# Clear service worker cache
# Browser console:
navigator.serviceWorker.getRegistrations().then(registrations => {
  registrations.forEach(reg => reg.unregister());
});
```

**3. Invalidate server cache:**
```javascript
// Implement cache-busting headers
app.use('/api/dashboard/metrics', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('ETag', `"${Date.now()}"`);
  next();
});
```

**4. Implement cache invalidation strategy:**
```javascript
// Use Redis pub/sub for cache invalidation
class CacheInvalidator {
  async invalidateDashboardCache() {
    await redis.publish('cache:invalidate', JSON.stringify({
      scope: 'dashboard',
      timestamp: Date.now()
    }));
  }

  async subscribeToInvalidations() {
    const subscriber = redis.duplicate();
    await subscriber.subscribe('cache:invalidate');

    subscriber.on('message', async (channel, message) => {
      const { scope } = JSON.parse(message);
      if (scope === 'dashboard') {
        // Clear local cache
        this.clearLocalCache();
      }
    });
  }
}
```

---

## Swarm Coordination Issues

### Issue: Agents Not Communicating

**Symptoms:**
- Swarm agents not coordinating
- Tasks not being distributed
- Agents working in isolation

**Causes:**
1. Redis pub/sub not working
2. Agents not subscribing to coordination channel
3. Messages not being published
4. Network partition

**Solutions:**

**1. Check Redis pub/sub:**
```bash
# Terminal 1: Subscribe to coordination channel
redis-cli -a "$REDIS_PASSWORD" subscribe "swarm:coordination"

# Terminal 2: Publish test message
redis-cli -a "$REDIS_PASSWORD" publish "swarm:coordination" "test message"

# Terminal 1 should receive: "test message"
```

**2. Verify agent subscriptions:**
```javascript
// Check active subscriptions
const subscriptions = await redis.pubsubChannels('swarm:*');
console.log('Active subscriptions:', subscriptions);

// Check subscribers count
const count = await redis.pubsubNumsub('swarm:coordination');
console.log('Subscribers:', count);
```

**3. Fix agent coordination:**
```javascript
// Ensure agents subscribe on spawn
class SwarmAgent {
  async initialize() {
    // Subscribe to coordination channel
    this.subscriber = this.redis.duplicate();
    await this.subscriber.subscribe(`swarm:coordination:${this.swarmId}`);

    this.subscriber.on('message', (channel, message) => {
      this.handleCoordinationMessage(JSON.parse(message));
    });
  }

  async publishStatus(status) {
    await this.redis.publish(
      `swarm:coordination:${this.swarmId}`,
      JSON.stringify({
        agentId: this.id,
        status,
        timestamp: Date.now()
      })
    );
  }
}
```

**4. Monitor coordination health:**
```bash
# Monitor pub/sub activity
redis-cli -a "$REDIS_PASSWORD" monitor | grep -E "(PUBLISH|SUBSCRIBE)"

# Check for message backlog
redis-cli -a "$REDIS_PASSWORD" client list | grep -E "pub-channel|sub-channel"
```

---

### Issue: Swarm State Corruption

**Symptoms:**
- Swarm status inconsistent
- Agent counts don't match
- Tasks stuck in pending state
- Recovery fails

**Causes:**
1. Redis data corruption
2. Incomplete state updates
3. Race conditions in state writes
4. Network interruption during write

**Solutions:**

**1. Verify swarm state:**
```bash
# Check swarm data
redis-cli -a "$REDIS_PASSWORD" get "swarm:<swarm-id>"

# Check all swarm keys
redis-cli -a "$REDIS_PASSWORD" --scan --pattern "swarm:*"

# Validate JSON structure
redis-cli -a "$REDIS_PASSWORD" get "swarm:<swarm-id>" | jq .
```

**2. Reset swarm state:**
```bash
# Backup current state
redis-cli -a "$REDIS_PASSWORD" get "swarm:<swarm-id>" > swarm-backup.json

# Delete corrupted state
redis-cli -a "$REDIS_PASSWORD" del "swarm:<swarm-id>"

# Reinitialize swarm
node test-swarm-direct.js "Resume previous task" --swarm-id <swarm-id>
```

**3. Implement atomic state updates:**
```javascript
// Use Redis transactions for atomic updates
class SwarmStateManager {
  async updateSwarmState(swarmId, updates) {
    const multi = this.redis.multi();

    // Get current state
    const currentState = await this.redis.get(`swarm:${swarmId}`);
    const state = JSON.parse(currentState || '{}');

    // Merge updates
    const newState = { ...state, ...updates, version: (state.version || 0) + 1 };

    // Atomic update
    multi.watch(`swarm:${swarmId}`);
    multi.set(`swarm:${swarmId}`, JSON.stringify(newState));

    const result = await multi.exec();

    if (!result) {
      // Transaction failed due to concurrent modification
      throw new Error('State update conflict - retrying');
    }

    return newState;
  }
}
```

**4. Enable state recovery:**
```javascript
// Implement checkpoint-based recovery
class SwarmRecovery {
  async createCheckpoint(swarmId) {
    const state = await redis.get(`swarm:${swarmId}`);
    const checkpointId = `checkpoint:${swarmId}:${Date.now()}`;

    await redis.setEx(checkpointId, 3600, state); // 1-hour TTL
    await redis.lpush(`checkpoints:${swarmId}`, checkpointId);

    // Keep last 10 checkpoints
    await redis.ltrim(`checkpoints:${swarmId}`, 0, 9);
  }

  async restoreFromCheckpoint(swarmId, checkpointId) {
    const state = await redis.get(checkpointId);
    if (!state) throw new Error('Checkpoint not found');

    await redis.set(`swarm:${swarmId}`, state);
    return JSON.parse(state);
  }
}
```

---

## Performance Problems

### Issue: Slow Response Times

**Symptoms:**
- API requests take > 1 second
- Dashboard loads slowly
- Timeouts on operations

**Causes:**
1. Redis connection latency
2. Inefficient queries
3. Large data transfers
4. CPU/memory bottleneck

**Solutions:**

**1. Check Redis latency:**
```bash
# Measure latency
redis-cli -a "$REDIS_PASSWORD" --latency

# Intrinsic latency
redis-cli -a "$REDIS_PASSWORD" --intrinsic-latency 100

# Latency history
redis-cli -a "$REDIS_PASSWORD" --latency-history
```

**2. Optimize Redis operations:**
```javascript
// Use pipelining for multiple operations
const pipeline = redis.pipeline();
for (const key of keys) {
  pipeline.get(key);
}
const results = await pipeline.exec();

// Use MGET instead of multiple GETs
const values = await redis.mget(...keys);

// Use hash operations for structured data
await redis.hset('user:123', { name: 'John', age: 30 });
const user = await redis.hgetall('user:123');
```

**3. Enable connection pooling:**
```javascript
// src/cli/utils/redis-client.js
import { createClient } from 'redis';

const pool = [];
const POOL_SIZE = 10;

export async function getRedisConnection() {
  if (pool.length > 0) {
    return pool.pop();
  }

  const client = createClient({
    url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
    password: process.env.REDIS_PASSWORD,
    socket: {
      keepAlive: true,
      noDelay: true
    }
  });

  await client.connect();
  return client;
}

export function releaseRedisConnection(client) {
  if (pool.length < POOL_SIZE) {
    pool.push(client);
  } else {
    client.quit();
  }
}
```

**4. Monitor system resources:**
```bash
# CPU usage
top -bn1 | grep node

# Memory usage
free -h
ps aux --sort=-%mem | head -10

# I/O wait
iostat -x 1 5

# Network latency
ping localhost
```

---

### Issue: High Memory Usage

**Symptoms:**
- Node.js process using > 2GB memory
- Out of memory errors
- System slowdown

**Causes:**
1. Memory leaks
2. Large data caching
3. No garbage collection
4. Event listener leaks

**Solutions:**

**1. Increase Node.js memory limit:**
```bash
export NODE_OPTIONS="--max-old-space-size=4096"
npm start
```

**2. Find memory leaks:**
```javascript
// Take heap snapshots
const v8 = require('v8');
const fs = require('fs');

function takeHeapSnapshot() {
  const filename = `heap-${Date.now()}.heapsnapshot`;
  const stream = v8.writeHeapSnapshot(filename);
  console.log('Heap snapshot written to', filename);
}

// Take snapshot periodically
setInterval(takeHeapSnapshot, 30 * 60 * 1000); // Every 30 minutes
```

**3. Implement memory cleanup:**
```javascript
// Clear caches periodically
setInterval(() => {
  if (global.gc) {
    global.gc();
  }

  // Clear local caches
  cache.clear();

  // Remove old event listeners
  process.removeAllListeners('uncaughtException');
}, 60 * 60 * 1000); // Hourly
```

**4. Monitor memory usage:**
```javascript
setInterval(() => {
  const usage = process.memoryUsage();
  console.log('Memory usage:', {
    rss: `${Math.round(usage.rss / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
    heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
    external: `${Math.round(usage.external / 1024 / 1024)}MB`
  });
}, 30000);
```

---

## Installation Issues

### Issue: "Permission Denied" During Installation

**Symptoms:**
- npm install fails with EACCES
- Cannot write to global node_modules

**Causes:**
1. Installing globally without sudo
2. Wrong npm directory permissions
3. System directories not writable

**Solutions:**

**1. Use sudo (quick fix):**
```bash
sudo npm install -g claude-flow-novice
```

**2. Fix npm permissions (recommended):**
```bash
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
npm install -g claude-flow-novice
```

**3. Use nvm:**
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
npm install -g claude-flow-novice
```

---

### Issue: Node.js Version Too Old

**Symptoms:**
- Error: "Node.js version X.X.X not supported"
- Syntax errors in modern JavaScript

**Solutions:**

```bash
# Check current version
node --version

# Install Node.js 20 with nvm
nvm install 20
nvm use 20
nvm alias default 20

# Or download from nodejs.org
# https://nodejs.org/en/download/
```

---

## Security Issues

### Issue: Secrets Exposed in Git

**Symptoms:**
- git-secrets warning during commit
- API keys visible in repository
- .env file committed

**Solutions:**

**1. Remove from git history:**
```bash
# Install BFG Repo-Cleaner
brew install bfg  # macOS
# Or download from https://rtyley.github.io/bfg-repo-cleaner/

# Remove secrets from history
bfg --replace-text passwords.txt
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Force push (WARNING: rewrites history)
git push origin --force --all
```

**2. Rotate exposed keys:**
```bash
npm run security:rotate-keys --all
```

**3. Install git-secrets:**
```bash
npm run security:git-secrets

# Verify installation
git secrets --scan
```

---

## Debug Tools

### Enable Debug Logging

```bash
# All debugging
DEBUG=claude-flow:* npm start

# Specific modules
DEBUG=claude-flow:auth npm start
DEBUG=claude-flow:swarm npm start
DEBUG=claude-flow:redis npm start

# Multiple modules
DEBUG=claude-flow:auth,claude-flow:swarm npm start
```

### Health Check Commands

```bash
# System health
claude-flow-novice doctor --detailed

# Component status
claude-flow-novice status --verbose

# Redis status
redis-cli -a "$REDIS_PASSWORD" info server

# Security audit
npm run security:full-audit

# Performance metrics
curl http://localhost:3001/metrics
```

### Log Analysis

```bash
# View application logs
tail -f logs/app.log

# View error logs only
tail -f logs/app.log | grep ERROR

# View authentication logs
tail -f logs/app.log | grep "Authentication event"

# System logs (systemd)
sudo journalctl -u claude-flow-novice -f

# Redis logs
sudo tail -f /var/log/redis/redis-server.log
```

---

## Getting Help

### Before Requesting Support

1. Run diagnostics:
   ```bash
   claude-flow-novice doctor --detailed > diagnostics.txt
   npm run security:full-audit > security-audit.txt
   ```

2. Collect logs:
   ```bash
   tail -n 100 logs/app.log > recent-logs.txt
   sudo journalctl -u claude-flow-novice -n 100 > system-logs.txt
   ```

3. Gather system info:
   ```bash
   node --version > system-info.txt
   npm --version >> system-info.txt
   redis-cli info server >> system-info.txt
   ```

### Support Channels

- **GitHub Issues**: https://github.com/masharratt/claude-flow-novice/issues
- **Documentation**: Full docs in `/docs` directory
- **Security Issues**: security@claude-flow-novice.com

---

**Last Updated**: 2025-01-09
**Version**: 1.6.6
