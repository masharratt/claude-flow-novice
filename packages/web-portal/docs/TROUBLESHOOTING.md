# Web Portal Troubleshooting Guide

## Table of Contents

1. [Connection Issues](#connection-issues)
2. [Performance Issues](#performance-issues)
3. [Authentication Issues](#authentication-issues)
4. [Data Loading Issues](#data-loading-issues)
5. [WebSocket Issues](#websocket-issues)
6. [Build and Deployment Issues](#build-and-deployment-issues)
7. [Browser Compatibility](#browser-compatibility)
8. [Common Error Messages](#common-error-messages)
9. [Debugging Tools](#debugging-tools)
10. [Getting Help](#getting-help)

---

## Connection Issues

### Problem: "WebSocket disconnected" banner appears

**Symptoms**:
- Yellow warning banner at top of page
- Real-time updates stop working
- Manual refresh required to see changes

**Root Causes**:
1. Backend server not running
2. Network connectivity issue
3. Port 3000 blocked by firewall
4. WebSocket connection timeout
5. Too many concurrent connections

**Diagnostic Steps**:

1. Check if backend server is running:
```bash
# Check process
ps aux | grep node

# Check port listening
netstat -an | grep 3000
# or
lsof -i :3000
```

2. Test backend health:
```bash
curl http://localhost:3000/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "version": "3.0.0",
  "uptime": 123456
}
```

3. Check browser console for WebSocket errors:
```
F12 → Console tab
Look for: "WebSocket connection failed" or "ERR_CONNECTION_REFUSED"
```

4. Check server logs:
```bash
# PM2 logs
pm2 logs web-portal

# Direct logs
tail -f logs/web-portal.log
```

**Solutions**:

1. **Start backend server**:
```bash
# Development
npm run dev:server

# Production
pm2 start ecosystem.config.js
```

2. **Check firewall rules**:
```bash
# Ubuntu/Debian
sudo ufw status
sudo ufw allow 3000/tcp

# CentOS/RHEL
sudo firewall-cmd --list-all
sudo firewall-cmd --add-port=3000/tcp --permanent
sudo firewall-cmd --reload
```

3. **Increase WebSocket timeout** (in .env):
```bash
WS_PING_TIMEOUT=120000  # 2 minutes
WS_PING_INTERVAL=25000  # 25 seconds
```

4. **Check reverse proxy configuration** (if using Nginx):
```nginx
# Ensure WebSocket headers are set
location /socket.io {
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

5. **Clear browser cache and reload**:
```
Ctrl+Shift+R (Windows/Linux)
Cmd+Shift+R (Mac)
```

---

### Problem: Connection drops frequently

**Symptoms**:
- WebSocket disconnects every few minutes
- "Reconnecting..." messages appear repeatedly
- Inconsistent real-time updates

**Root Causes**:
1. Unstable network connection
2. Server resource constraints (CPU/memory)
3. Load balancer timeout too short
4. Client-side memory leak
5. WebSocket proxy misconfiguration

**Diagnostic Steps**:

1. Check network stability:
```bash
ping -c 100 localhost
# Look for packet loss
```

2. Monitor server resources:
```bash
# CPU and memory
top
htop

# Node.js process
pm2 monit
```

3. Check for client-side memory leaks:
```
F12 → Performance tab → Record → Reload page → Stop
Look for increasing memory usage over time
```

**Solutions**:

1. **Increase server resources**:
```bash
# PM2 - increase max memory restart threshold
pm2 start dist/server/index.js --max-memory-restart 2G
```

2. **Enable WebSocket reconnection** (already configured):
```javascript
// Client-side (already in useWebSocket.ts)
const socket = io('http://localhost:3000', {
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 5,
});
```

3. **Adjust load balancer timeout** (Nginx):
```nginx
proxy_read_timeout 300s;
proxy_connect_timeout 300s;
proxy_send_timeout 300s;
```

4. **Reduce WebSocket event frequency** (server-side):
```javascript
// Increase throttle delays in SocketIOServer.ts
throttleEmit('metrics:update', data, 10000); // 10 seconds instead of 5
```

---

## Performance Issues

### Problem: Dashboard loads slowly

**Symptoms**:
- Initial page load takes >3 seconds
- Blank screen or loading spinner for extended period
- Browser becomes unresponsive

**Root Causes**:
1. Large number of agents (>1000)
2. High event volume (>10,000 events)
3. Slow network connection
4. Browser resource constraints
5. Inefficient React rendering

**Diagnostic Steps**:

1. **Check bundle size**:
```bash
npm run build
# Check dist/client size
du -sh dist/client
```

2. **Measure load time**:
```
F12 → Network tab → Reload page → Check timeline
Look for: DOMContentLoaded, Load events
```

3. **Profile React performance**:
```
React DevTools → Profiler tab → Record → Interact with app → Stop
Look for: Long render times, excessive re-renders
```

4. **Check API response times**:
```bash
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:3000/api/agents/hierarchy

# curl-format.txt:
time_namelookup:  %{time_namelookup}\n
time_connect:     %{time_connect}\n
time_starttransfer: %{time_starttransfer}\n
time_total:       %{time_total}\n
```

**Solutions**:

1. **Reduce time range**:
```
Dashboard → Time Range dropdown → Select "Last Hour" instead of "Last 7 Days"
```

2. **Enable pagination**:
```
Agents View → Shows 20 agents per page (already implemented)
Events View → Shows 50 events per page (already implemented)
```

3. **Pause auto-refresh**:
```
Dashboard → Click Pause button (⏸️)
```

4. **Clear browser cache**:
```bash
# Chrome
chrome://settings/clearBrowserData
Select: Cached images and files

# Firefox
about:preferences#privacy
Clear Data → Cached Web Content
```

5. **Optimize React rendering**:
```typescript
// Use React.memo for expensive components
export const AgentCard = React.memo(({ agent }) => {
  // Component logic
});

// Use useMemo for expensive calculations
const filteredAgents = useMemo(() => {
  return agents.filter(a => a.status === 'active');
}, [agents]);
```

6. **Reduce WebSocket event subscription**:
```javascript
// Only subscribe to necessary events
socket.on('agent:update', callback);
// Don't subscribe to 'event:stream' on Dashboard if not needed
```

---

### Problem: High CPU usage

**Symptoms**:
- Fan noise increases
- Browser/system becomes sluggish
- CPU usage >80% in Task Manager

**Root Causes**:
1. Infinite render loop
2. Too frequent WebSocket updates
3. Memory leak causing GC thrashing
4. Unoptimized chart rendering

**Diagnostic Steps**:

1. **Identify CPU-intensive component**:
```
React DevTools → Profiler → Record → Stop
Sort by: Render duration
```

2. **Check WebSocket event frequency**:
```javascript
// In browser console
let eventCount = 0;
socket.onAny(() => {
  eventCount++;
  console.log('Events per second:', eventCount);
});
setInterval(() => { eventCount = 0; }, 1000);
```

3. **Monitor memory usage**:
```
F12 → Memory tab → Take heap snapshot → Interact → Take another snapshot → Compare
```

**Solutions**:

1. **Debounce state updates**:
```typescript
import { debounce } from 'lodash';

const debouncedUpdate = useMemo(
  () => debounce((data) => updateAgent(data.agentId, data), 1000),
  []
);

socket.on('agent:update', debouncedUpdate);
```

2. **Reduce chart data points**:
```typescript
// Limit to last 100 data points instead of all
const chartData = useMemo(() => {
  return performanceData.slice(-100);
}, [performanceData]);
```

3. **Virtualize long lists** (already implemented):
```typescript
// Events.tsx and Fleet.tsx use react-window
<FixedSizeList
  height={600}
  itemCount={filteredEvents.length}
  itemSize={120}
>
  {Row}
</FixedSizeList>
```

4. **Cleanup effect dependencies**:
```typescript
useEffect(() => {
  const subscription = socket.on('agent:update', callback);

  return () => {
    socket.off('agent:update', callback);
  };
}, [socket, callback]);
```

---

## Authentication Issues

### Problem: "401 Unauthorized" error

**Symptoms**:
- API requests fail with 401 status
- "Unauthorized" error message
- Redirected to login page

**Root Causes**:
1. JWT token expired
2. Token not included in request
3. Invalid token format
4. Token blacklisted (after logout)

**Diagnostic Steps**:

1. **Check if token exists**:
```javascript
// Browser console
console.log(localStorage.getItem('accessToken'));
```

2. **Decode JWT token**:
```bash
# Copy token and paste below
jwt_token="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Decode (Node.js)
node -e "console.log(JSON.stringify(JSON.parse(Buffer.from('$jwt_token'.split('.')[1], 'base64').toString()), null, 2))"
```

3. **Check token expiration**:
```javascript
// Browser console
const token = localStorage.getItem('accessToken');
const payload = JSON.parse(atob(token.split('.')[1]));
const exp = new Date(payload.exp * 1000);
console.log('Token expires at:', exp);
console.log('Expired:', Date.now() > payload.exp * 1000);
```

4. **Verify Authorization header**:
```
F12 → Network tab → Select failed request → Headers tab
Look for: Authorization: Bearer <token>
```

**Solutions**:

1. **Refresh token**:
```javascript
// Call refresh endpoint
const response = await fetch('http://localhost:3000/api/auth/refresh', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    refreshToken: localStorage.getItem('refreshToken'),
  }),
});

const { accessToken, refreshToken } = await response.json();
localStorage.setItem('accessToken', accessToken);
localStorage.setItem('refreshToken', refreshToken);
```

2. **Clear tokens and re-login**:
```javascript
// Browser console
localStorage.removeItem('accessToken');
localStorage.removeItem('refreshToken');
// Then navigate to login page
```

3. **Check token format**:
```javascript
// Token should have format: eyJhbGciOiJI...
// If missing "Bearer " prefix, add it:
Authorization: `Bearer ${token}`
```

---

### Problem: "403 Forbidden" error

**Symptoms**:
- API request returns 403 status
- "Insufficient permissions" error
- Cannot perform admin actions

**Root Causes**:
1. User role lacks required permissions
2. RBAC middleware blocking request
3. API key invalid or missing

**Diagnostic Steps**:

1. **Check user role**:
```javascript
// Browser console
const token = localStorage.getItem('accessToken');
const payload = JSON.parse(atob(token.split('.')[1]));
console.log('User role:', payload.role);
```

2. **Verify endpoint requires admin**:
```typescript
// Check server/routes/api/agents.ts
router.post('/:id/intervene',
  authenticateJWT,
  requireAdmin,  // <-- Admin required
  ...
);
```

**Solutions**:

1. **Use admin account**:
```
Login with admin credentials
```

2. **Request role upgrade**:
```
Contact system administrator to upgrade user role
```

3. **Use API key** (if supported):
```javascript
// Add API key header
headers: {
  'X-API-Key': 'your-api-key',
}
```

---

## Data Loading Issues

### Problem: Metrics show as 0 or "No data"

**Symptoms**:
- Dashboard metrics display 0 or default values
- "No data available" message
- Empty charts

**Root Causes**:
1. No agents running
2. WebSocket not connected
3. Backend not receiving data from Transparency Service
4. Time range filter excludes all data

**Diagnostic Steps**:

1. **Check if agents exist**:
```bash
curl http://localhost:3000/api/agents/hierarchy
```

2. **Verify WebSocket connection**:
```javascript
// Browser console
console.log('Connected:', socket?.connected);
```

3. **Check API response**:
```bash
curl http://localhost:3000/api/metrics
```

4. **Verify time range**:
```
Dashboard → Time Range dropdown → Check selected range
```

**Solutions**:

1. **Spawn agents**:
```
Navigate to Agents view → Click "Spawn Agent" button
```

2. **Refresh data manually**:
```
Click Refresh button (🔄) in top-right corner
```

3. **Adjust time range**:
```
Change time range to "Last 24 Hours" or "Last 7 Days"
```

4. **Restart backend server**:
```bash
pm2 restart web-portal
```

5. **Check Transparency Service integration**:
```bash
# Check server logs for Transparency Service errors
tail -f logs/web-portal.log | grep "transparency"
```

---

## WebSocket Issues

### Problem: Real-time updates not working

**Symptoms**:
- Data doesn't update automatically
- Manual refresh required to see changes
- WebSocket connected but no events received

**Root Causes**:
1. Not subscribed to events
2. Event listener not registered
3. Socket.IO room not joined
4. Server not emitting events

**Diagnostic Steps**:

1. **Check event subscription**:
```javascript
// Browser console
socket.listeners('agent:update');  // Should return array with listeners
```

2. **Monitor incoming events**:
```javascript
// Browser console
socket.onAny((eventName, ...args) => {
  console.log('Received:', eventName, args);
});
```

3. **Check server-side emission**:
```bash
# Server logs
tail -f logs/web-portal.log | grep "emit"
```

**Solutions**:

1. **Subscribe to events**:
```javascript
// Add in component
useEffect(() => {
  if (!socket) return;

  const handler = (data) => {
    console.log('Agent update:', data);
    updateAgent(data.agentId, data);
  };

  socket.on('agent:update', handler);

  return () => {
    socket.off('agent:update', handler);
  };
}, [socket, updateAgent]);
```

2. **Join specific room**:
```javascript
socket.emit('subscribe', {
  type: 'agent',
  id: 'coder-001',
}, (response) => {
  console.log('Subscribed:', response);
});
```

3. **Verify server emits events**:
```javascript
// In server/websocket/SocketIOServer.ts
io.emit('agent:update', {
  agentId: 'coder-001',
  status: 'active',
  timestamp: new Date().toISOString(),
});

console.log('[WebSocket] Emitted agent:update');
```

---

### Problem: WebSocket connection rejected

**Symptoms**:
- "Connection rejected" error in console
- 401 or 403 status code
- Authentication error message

**Root Causes**:
1. Invalid JWT token
2. Token missing from handshake
3. CORS policy blocking connection

**Diagnostic Steps**:

1. **Check auth token**:
```javascript
// Browser console
console.log('Token:', socket.auth.token);
```

2. **Check server authentication middleware**:
```bash
# Server logs
tail -f logs/web-portal.log | grep "authentication"
```

**Solutions**:

1. **Include token in connection**:
```javascript
const socket = io('http://localhost:3000', {
  auth: {
    token: `Bearer ${accessToken}`,
  },
});
```

2. **Refresh token and reconnect**:
```javascript
socket.disconnect();
// Refresh token
socket.auth.token = `Bearer ${newAccessToken}`;
socket.connect();
```

3. **Allow guest connections** (if appropriate):
```javascript
// Server-side: Allow unauthenticated connections
io.use((socket, next) => {
  if (!token) {
    socket.authenticated = false;
    socket.role = 'guest';
    return next();  // Allow connection
  }
  // ... validate token
});
```

---

## Build and Deployment Issues

### Problem: Build fails with TypeScript errors

**Symptoms**:
- `npm run build` exits with error
- TypeScript compilation errors
- Type mismatch errors

**Root Causes**:
1. Outdated dependencies
2. Type definition missing
3. TypeScript configuration issue

**Diagnostic Steps**:

1. **Check TypeScript version**:
```bash
npx tsc --version
```

2. **Run type check only**:
```bash
npm run type-check
```

3. **View full error**:
```bash
npm run build 2>&1 | tee build-error.log
```

**Solutions**:

1. **Install type definitions**:
```bash
npm install --save-dev @types/node @types/react @types/react-dom
```

2. **Clear build cache**:
```bash
npm run clean
rm -rf node_modules
npm install
npm run build
```

3. **Fix TypeScript errors**:
```typescript
// Add type assertions
const data = response.data as Agent[];

// Add optional chaining
const status = agent?.status;

// Add type guards
if (typeof value === 'string') {
  // Use value as string
}
```

4. **Update tsconfig.json**:
```json
{
  "compilerOptions": {
    "skipLibCheck": true,
    "strict": true,
    "esModuleInterop": true
  }
}
```

---

### Problem: Production build doesn't work

**Symptoms**:
- App works in dev but not production
- Blank page after deployment
- 404 errors for assets

**Root Causes**:
1. Environment variables not set
2. Base path incorrect
3. Assets not served correctly

**Diagnostic Steps**:

1. **Check environment variables**:
```bash
# In production environment
echo $NODE_ENV
echo $VITE_API_URL
```

2. **Check browser console**:
```
F12 → Console tab
Look for: 404 errors, JavaScript errors
```

3. **Check server logs**:
```bash
pm2 logs web-portal
```

**Solutions**:

1. **Set production environment variables**:
```bash
# Create .env.production
NODE_ENV=production
VITE_API_URL=https://api.your-domain.com
VITE_WS_URL=wss://api.your-domain.com
```

2. **Build with production env**:
```bash
NODE_ENV=production npm run build
```

3. **Configure base path** (vite.config.ts):
```typescript
export default defineConfig({
  base: '/',  // or '/web-portal/' if served from subdirectory
});
```

4. **Serve static files correctly**:
```javascript
// server/index.ts
app.use(express.static('dist/client'));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});
```

---

## Browser Compatibility

### Supported Browsers

- **Chrome**: 90+
- **Firefox**: 88+
- **Safari**: 14+
- **Edge**: 90+

### Known Issues

1. **Safari 13**: WebSocket reconnection issues
   - **Solution**: Upgrade to Safari 14+

2. **Firefox <88**: Chart rendering issues
   - **Solution**: Upgrade to Firefox 88+

3. **IE11**: Not supported
   - **Solution**: Use modern browser (Chrome, Firefox, Edge)

4. **Mobile browsers**: Limited support
   - **Solution**: Use desktop browser for full functionality

### Check Browser Compatibility

```javascript
// Browser console
console.log('User Agent:', navigator.userAgent);
console.log('WebSocket support:', 'WebSocket' in window);
console.log('LocalStorage support:', 'localStorage' in window);
```

---

## Common Error Messages

### "Failed to fetch"

**Cause**: Network error, CORS issue, or server not running

**Solution**:
1. Check server is running
2. Verify CORS configuration
3. Check network connectivity

### "Cannot read property 'map' of undefined"

**Cause**: Data not loaded yet or null

**Solution**:
```typescript
// Add null check
{agents?.map(agent => (
  <AgentCard key={agent.id} agent={agent} />
))}
```

### "Token expired"

**Cause**: JWT access token expired (>15 minutes old)

**Solution**:
1. Call `/api/auth/refresh` endpoint
2. Store new access token
3. Retry failed request

### "Maximum update depth exceeded"

**Cause**: Infinite render loop

**Solution**:
```typescript
// Ensure dependencies array is correct
useEffect(() => {
  // Effect logic
}, [dependency]); // Don't forget dependency array

// Use useCallback for functions
const handleClick = useCallback(() => {
  // Handler logic
}, []);
```

---

## Debugging Tools

### Browser DevTools

#### Console

```javascript
// Enable verbose logging
localStorage.setItem('debug', '*');

// Check socket connection
console.log('Socket connected:', socket.connected);
console.log('Socket ID:', socket.id);

// Monitor state changes
window.agentStore = useAgentStore;
console.log('Agents:', window.agentStore.getState().agents);
```

#### Network Tab

1. **Filter requests**: All, XHR, WS
2. **Check response**: Click request → Preview tab
3. **Copy as cURL**: Right-click request → Copy → Copy as cURL

#### React DevTools

1. **Components tab**: Inspect component props and state
2. **Profiler tab**: Measure render performance
3. **Hooks**: View hook values

### Server-Side Debugging

#### PM2

```bash
# View logs
pm2 logs web-portal

# Monitor resources
pm2 monit

# Restart with increased verbosity
pm2 restart web-portal --update-env --log-date-format 'YYYY-MM-DD HH:mm:ss.SSS'
```

#### Node.js Debugger

```bash
# Start with debugger
node --inspect dist/server/index.js

# In Chrome
chrome://inspect → Open dedicated DevTools for Node
```

---

## Getting Help

### Documentation

- **User Guide**: `/docs/USER_GUIDE.md`
- **API Documentation**: `/docs/API.md`
- **Deployment Guide**: `/docs/DEPLOYMENT.md`
- **Architecture Documentation**: `/docs/ARCHITECTURE.md`

### Support Channels

- **GitHub Issues**: [repository]/issues
- **Slack/Discord**: [community channel]
- **Email**: support@claude-flow-novice.com

### Reporting Bugs

When reporting bugs, include:

1. **Environment**:
   - OS and version
   - Browser and version
   - Node.js version
   - Package version

2. **Steps to reproduce**:
   - Exact sequence of actions
   - Expected vs actual behavior

3. **Logs**:
   - Browser console errors (F12 → Console)
   - Server logs (`pm2 logs` or log files)
   - Network tab HAR export (F12 → Network → Export HAR)

4. **Screenshots**:
   - Screenshot of error message
   - Screenshot of relevant UI state

### Example Bug Report

```markdown
**Environment**:
- OS: Ubuntu 22.04
- Browser: Chrome 120.0.6099.109
- Node.js: 20.10.0
- Package: @claude-flow-novice/web-portal@3.0.0

**Steps to Reproduce**:
1. Navigate to Agents view
2. Click "Spawn Agent" button
3. Fill form with name "test-agent", type "coder"
4. Click "Spawn" button

**Expected Behavior**:
New agent appears in agent list

**Actual Behavior**:
Error message: "Failed to spawn agent"
Agent does not appear in list

**Logs**:
Browser console:
```
POST http://localhost:3000/api/agents/spawn 500 (Internal Server Error)
```

Server logs:
```
[ERROR] TypeError: Cannot read property 'id' of undefined
    at transparencyService.spawnAgent (transparency-service.ts:45)
```

**Screenshots**: [Attached]
```

---

**Document Version**: 1.0.0
**Last Updated**: 2025-10-12
**Maintained By**: Claude Flow Novice Support Team
