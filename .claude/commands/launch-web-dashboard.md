# Launch Web Dashboard - Start Web Portal Development Server

Launch the claude-flow-novice web portal with hot-reload development servers for both client and server.

## Command

```bash
/launch-web-dashboard [--port <port>] [--production]
```

## Execution Pattern

### Default Development Mode

```bash
# Navigate to web portal package
cd packages/web-portal

# Kill any existing processes on ports 3001-3003 (client) and 3000-3002 (server)
lsof -ti:3001,3002,3003,3000 | xargs -r kill -9

# Start development servers with hot-reload
npm run dev
```

This will:
1. **Client (Vite)**: Start on port 3001 (or next available: 3002, 3003)
2. **Server (tsx watch)**: Start on port 3000 (or next available: 3001, 3002)

### Production Mode

```bash
# Build for production
npm run build

# Start production server
npm run start
```

## Port Configuration

### Default Ports
- **Client (Vite)**: 3001
- **Server (Express)**: 3000
- **WebSocket**: Same as server port

### Port Conflict Resolution
If ports are in use, automatically tries next available port:
- Client: 3001 → 3002 → 3003
- Server: 3000 → 3001 → 3002

## Output

```
🚀 Launching Web Portal...

📦 Package: @claude-flow-novice/web-portal
📂 Directory: packages/web-portal

🔧 Cleaning up existing processes...
✅ Ports cleared: 3001, 3002, 3000

🎬 Starting development servers...

[Client] VITE v7.1.9  ready in 951 ms
[Client] ➜  Local:   http://localhost:3001/
[Client] ➜  Network: use --host to expose

[Server] 🚀 Server running on http://localhost:3000
[Server] 📊 Metrics: http://localhost:3000/api/metrics
[Server] 🔌 WebSocket: ws://localhost:3000

✅ Web Dashboard Launched Successfully!

📱 Access Points:
   • Main UI: http://localhost:3001
   • API Server: http://localhost:3000
   • API Docs: http://localhost:3000/api-docs
   • Health Check: http://localhost:3000/health

🛠️  Available Features:
   ✓ Agent Management & Monitoring
   ✓ CFN Loop Execution & Visualization
   ✓ Real-time Metrics Dashboard
   ✓ WebSocket Live Updates
   ✓ Hybrid Routing Control Panel
   ✓ SQLite Memory Browser
   ✓ Redis Coordination Monitor

💡 Tips:
   • Hot-reload enabled for instant updates
   • Check console for detailed logs
   • Press Ctrl+C to stop servers
```

## Flags

### --port <port>
Specify custom client port (server will use port-1)

```bash
/launch-web-dashboard --port 4000
# Client: http://localhost:4000
# Server: http://localhost:3999
```

### --production
Build and run in production mode

```bash
/launch-web-dashboard --production
# Optimized build with minification
# No hot-reload, better performance
```

### --debug
Enable verbose logging

```bash
/launch-web-dashboard --debug
# Shows detailed startup logs
# Includes dependency resolution
# Displays all environment variables
```

### --kill-only
Just kill existing processes without starting new ones

```bash
/launch-web-dashboard --kill-only
# Cleanup only, useful for port conflicts
```

## Features Available in Dashboard

### 1. Agent Management
- View all active agents and their status
- Monitor agent workload and performance
- Inspect agent capabilities and roles
- Track agent communication via Redis pub/sub

### 2. CFN Loop Visualization
- Real-time phase execution tracking
- Loop 2/3/4 progress monitoring
- Confidence score aggregation
- Consensus validation status
- Product Owner decisions

### 3. Metrics Dashboard
- Cost tracking (per provider)
- Token usage analytics
- API latency monitoring
- Success/failure rates
- Performance bottlenecks

### 4. Hybrid Routing Control
- Provider selection (Claude Max / z.ai)
- Worker spawn monitoring
- Coordinator intelligence tracking
- Cost savings visualization

### 5. Memory & State
- SQLite memory browser with ACL levels
- Redis key inspection
- Audit trail viewer
- Permission management

### 6. Event Stream
- Live WebSocket event feed
- Filter by event type
- Search historical events
- Export event logs

## Troubleshooting

### Port Already in Use

```bash
# Automatic resolution
/launch-web-dashboard
# Will try ports 3001 → 3002 → 3003 automatically

# Manual cleanup
/launch-web-dashboard --kill-only
# Then try again
/launch-web-dashboard
```

### Build Errors

```bash
# Clean build cache
cd packages/web-portal
rm -rf node_modules .vite dist
npm install
npm run build

# Then launch
/launch-web-dashboard
```

### WebSocket Connection Issues

Check that both client and server are running:
```bash
# Client should show: http://localhost:3001
# Server should show: http://localhost:3000

# WebSocket connects to server port
# Ensure VITE_API_URL matches server URL
```

### Missing Dependencies

```bash
# Install all dependencies
npm install

# Web portal specific
cd packages/web-portal
npm install

# Rebuild TypeScript
npm run build
```

## Integration with Other Commands

### With CFN Loop
```bash
# Launch dashboard first
/launch-web-dashboard

# In another terminal, run CFN Loop
/cfn-loop "Task description" --mode=standard

# Dashboard will show real-time progress
```

### With Hybrid Routing
```bash
# Start dashboard
/launch-web-dashboard

# Spawn workers (dashboard monitors them)
node src/cli/hybrid-routing/spawn-workers.js "Task" --max-agents 5
```

### With Swarm Coordination
```bash
# Launch dashboard
/launch-web-dashboard

# Initialize swarm
node tests/manual/test-swarm-direct.js "Objective" --executor

# Dashboard shows agent coordination
```

## Environment Variables

The dashboard uses these environment variables (auto-configured):

```bash
# Client (.env in packages/web-portal)
VITE_API_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:3000

# Server
PORT=3000
NODE_ENV=development
REDIS_URL=redis://localhost:6379
SQLITE_DB_PATH=../../data/swarm-memory.db
```

## Security Note

Development mode runs with:
- CORS enabled for localhost
- Authentication disabled
- Verbose error messages

For production deployment, use `--production` flag which enables:
- CORS restrictions
- Authentication requirements
- Error sanitization
- Rate limiting

## Related Commands

- `/cfn-loop` - Execute CFN Loop (visible in dashboard)
- `/swarm` - Manage swarms (dashboard monitors)
- `/github-commit` - Commit changes (shows in activity feed)
- `/sqlite-memory` - Memory management (browsable in dashboard)
- `/context-stats` - Context metrics (displayed in dashboard)
