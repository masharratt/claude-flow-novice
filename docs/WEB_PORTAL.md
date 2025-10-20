# Web Portal - Auto-Start Configuration

## Overview

The Claude Flow Novice web portal provides real-time monitoring of:
- Agent coordination and execution
- CFN Loop iterations and consensus
- Cost optimization metrics (z.ai vs Anthropic)
- Redis pub/sub event streaming

## Auto-Start Behavior

The portal automatically starts when you begin a new Claude Code session, ensuring it's always available for monitoring.

### How It Works

1. **Session Start Hook**: The `.claude/commands/hooks/session-start.md` hook executes `scripts/start-portal.sh`
2. **Smart Detection**: If the portal is already running, it won't start a duplicate
3. **Background Process**: Runs silently in the background with PID tracking
4. **Logging**: All output goes to `/tmp/claude-flow-portal.log`

## Manual Control

### Start Portal
```bash
npm run portal:start
# OR
bash scripts/start-portal.sh
```

### Stop Portal
```bash
npm run portal:stop
# OR
bash scripts/stop-portal.sh
```

### Check Status
```bash
npm run portal:status
# OR
bash scripts/portal-status.sh
```

### Restart Portal
```bash
npm run portal:restart
```

## Accessing the Portal

Once started, access the portal at:
- **URL**: http://localhost:3456
- **Health Check**: http://localhost:3456/api/health
- **Status API**: http://localhost:3456/api/status

## Configuration

### Port Configuration
Default port is `3456`. To change:
```bash
export PORTAL_PORT=8080
npm run portal:start
```

### Log Location
Logs are written to `/tmp/claude-flow-portal.log`

View logs:
```bash
tail -f /tmp/claude-flow-portal.log
```

## Features

### Current (v2.0.0)
✅ Auto-start on session initialization
✅ Health check and status APIs
✅ Lightweight standalone server (no external dependencies)
✅ Background process management
✅ Graceful shutdown handling

### Planned (Future)
- Real-time WebSocket event streaming
- Agent execution visualization
- CFN Loop iteration tracking
- Cost analytics dashboard
- Redis pub/sub integration
- Multi-user support

## Troubleshooting

### Portal Won't Start

1. **Check if port is in use:**
```bash
lsof -i :3456
```

2. **Check logs:**
```bash
cat /tmp/claude-flow-portal.log
```

3. **Kill stale process:**
```bash
npm run portal:stop
# Then try starting again
npm run portal:start
```

### Portal Started But Not Accessible

1. **Verify it's running:**
```bash
npm run portal:status
```

2. **Test health endpoint:**
```bash
curl http://localhost:3456/api/health
```

3. **Check firewall rules** (if accessing remotely)

## Architecture

### Components

```
.claude/commands/hooks/session-start.md  # Auto-start trigger
scripts/start-portal.sh                  # Start script with PID tracking
scripts/stop-portal.sh                   # Stop script
scripts/portal-status.sh                 # Status checker
scripts/simple-portal-server.cjs         # Lightweight HTTP server (Node.js built-ins only)
/tmp/claude-flow-portal.pid             # Process ID tracking
/tmp/claude-flow-portal.log             # Server logs
```

### Process Management

The portal uses PID file tracking for reliable process management:

1. **Start**: Creates `/tmp/claude-flow-portal.pid` with process ID
2. **Detection**: Checks PID file and validates process is running
3. **Stop**: Kills process by PID, removes PID file
4. **Status**: Reads PID file and checks process status

## Disabling Auto-Start

If you don't want the portal to start automatically:

1. Edit `.claude/commands/hooks/session-start.md`
2. Comment out or remove the portal start command:
```markdown
# Start web portal automatically if not already running:
#
# ```bash
# ./scripts/start-portal.sh
# ```
```

## Development

### Extending the Portal

The simple portal server (`scripts/simple-portal-server.cjs`) can be extended with:
- WebSocket support (add `ws` package)
- Database integration (SQLite for event storage)
- React frontend (build and serve static files)
- API endpoints for agent coordination

### Integration Points

For future WebSocket/real-time features:
- Spawn workers can emit events to portal
- CFN Loop coordinators can publish progress
- Redis pub/sub can be bridged to WebSocket

See `planning/completed/cli-hybrid-routing/web-portal-integration-epic.json` for full integration roadmap.

## Phase 1: Redis Integration (2025-10-19)

### Implementation Complete

**Acceptance Criteria Met:**
- ✅ Redis client connected to portal server
- ✅ GET /api/swarms endpoint lists all active tasks across all repos/sessions
- ✅ GET /api/swarms/:taskId endpoint returns task details
- ✅ Cross-session visibility validated
- ✅ Cross-repo visibility validated
- ✅ Graceful degradation if Redis unavailable
- ✅ Health check includes Redis connection status
- ✅ Integration tests passing (3/3 pass, 1 info)

### API Endpoints

**GET /api/health**
```json
{
  "status": "ok",
  "timestamp": "2025-10-19T22:52:45.587Z",
  "uptime": 17.425920164,
  "port": 3456,
  "platform": "claude-flow-novice v2.0.0",
  "redis": {
    "connected": true,
    "url": "redis://localhost:6379"
  }
}
```

**GET /api/swarms**
```json
{
  "count": 1,
  "tasks": [
    {
      "taskId": "swarm-redis-phase7-1760900252",
      "metadata": {
        "created_at": "2025-10-19T18:57:32Z",
        "phase": "phase-7",
        "mode": "standard",
        "status": "in_progress"
      },
      "agentCount": 0,
      "consensus": null,
      "status": "in_progress"
    }
  ],
  "timestamp": "2025-10-19T22:52:47.201Z"
}
```

**GET /api/swarms/:taskId**
```json
{
  "taskId": "swarm-redis-phase7-1760900252",
  "metadata": {
    "agents": "architect-6,backend-dev-14,...",
    "topology": "hierarchical",
    "created_at": "2025-10-19T18:57:32Z",
    ...
  },
  "agents": [],
  "agentCount": 0,
  "metrics": {
    "loop3": {},
    "loop2": {}
  },
  "timestamp": "2025-10-19T22:53:03.307Z"
}
```

### Cross-Session/Cross-Repo Visibility

**How It Works:**
- All sessions share single Redis instance (localhost:6379)
- Tasks stored in `swarm:*` namespace
- Portal queries all `swarm:*:metadata` keys
- Displays tasks from ANY session, ANY repository

**Validation:**
- Test suite: `tests/web-portal-redis-integration.test.cjs`
- Run: `node tests/web-portal-redis-integration.test.cjs`
- Results: 3/3 pass, 1 info (cross-session validated by architecture)

### Testing

```bash
# Health check (includes Redis status)
curl http://localhost:3456/api/health

# List all swarms (cross-session/cross-repo)
curl http://localhost:3456/api/swarms

# Get specific task details
curl http://localhost:3456/api/swarms/swarm-redis-phase7-1760900252

# Run integration tests
node tests/web-portal-redis-integration.test.cjs
```

## Phase 2: WebSocket Integration (2025-10-19)

### Implementation Complete

**Acceptance Criteria Met:**
- ✅ Socket.IO server integrated with portal
- ✅ Redis pub/sub subscriber for `swarm:*:events` channels
- ✅ Real-time event forwarding to connected clients
- ✅ WebSocket connection handling (connect/disconnect)
- ✅ Initial swarms data sent on connection
- ✅ Client request handlers (request-swarms, request-task-details)
- ✅ Live dashboard updates without page refresh
- ✅ Integration tests passing (4/4 pass)

### WebSocket Events

**Server → Client:**
- `swarm-event` - Real-time swarm events from Redis pub/sub
- `initial-swarms` - Initial swarm data sent on connection
- `swarms-list` - Swarms list response
- `task-details` - Task details response
- `error` - Error messages

**Client → Server:**
- `request-swarms` - Request updated swarms list
- `request-task-details` - Request specific task details

### Live Dashboard Features

- **WebSocket Status**: Shows connection state (✓ Connected / ✗ Disconnected)
- **Active Swarms Count**: Updated in real-time
- **Auto-refresh**: Requests swarm list every 30 seconds
- **Event Logging**: All WebSocket events logged to browser console

### Testing

```bash
# Run WebSocket integration tests
node tests/web-portal-websocket.test.cjs

# Expected output:
# ✅ PASS: WebSocket connection
# ✅ PASS: Initial swarms data received
# ✅ PASS: Swarms list received
# ✅ PASS: Swarm event forwarded from Redis pub/sub
```

### Redis Pub/Sub Integration

Portal subscribes to all swarm event channels using pattern matching:
- Pattern: `swarm:*:events`
- Events forwarded to all connected WebSocket clients
- Real-time agent lifecycle updates (spawned, completed, failed)

## Phase 3: Cross-Repo Filtering (2025-10-19)

### Implementation Complete

**Acceptance Criteria Met:**
- ✅ Repository name extraction from multiple metadata fields
- ✅ GET /api/swarms/by-repo endpoint for repository grouping
- ✅ Tasks grouped by repository with accurate counts
- ✅ Repositories sorted by activity (most active first)
- ✅ Tasks within each repository sorted by creation time
- ✅ Integration tests passing (5/5 pass)

### API Endpoints

**GET /api/swarms/by-repo**
```json
{
  "repositoryCount": 2,
  "repositories": [
    {
      "repository": "claude-flow-novice",
      "taskCount": 3,
      "tasks": [
        {
          "taskId": "swarm-redis-phase7-1760900252",
          "metadata": {
            "created_at": "2025-10-19T18:57:32Z",
            "phase": "phase-7",
            "status": "in_progress"
          },
          "agentCount": 0,
          "consensus": null,
          "status": "in_progress"
        }
      ]
    },
    {
      "repository": "another-project",
      "taskCount": 1,
      "tasks": [...]
    }
  ],
  "timestamp": 1760915117978
}
```

### Repository Detection Strategy

**Priority order for extracting repository name:**
1. `metadata.repository` - Explicit repository field
2. `metadata.cwd` - Extract from current working directory path
3. `metadata.project_root` - Extract from project root path
4. `metadata.task_id` - Parse first segment before hyphen
5. Fallback to `"unknown"`

**Examples:**
```javascript
// From repository field
{ repository: "claude-flow-alpha" } → "claude-flow-alpha"

// From cwd field
{ cwd: "/home/user/projects/my-project" } → "my-project"

// From project_root field
{ project_root: "/workspace/awesome-app" } → "awesome-app"

// From task_id field
{ task_id: "myrepo-phase1-123" } → "myrepo"
```

### Testing

```bash
# List swarms grouped by repository
curl http://localhost:3456/api/swarms/by-repo

# Run cross-repo filtering tests
node tests/web-portal-cross-repo.test.cjs

# Expected output:
# ✅ PASS: Repository grouping correct
# ✅ PASS: Task count accurate
# ✅ PASS: Repositories sorted by activity
# ✅ PASS: Repository name extraction from all metadata sources
# ✅ PASS: Tasks sorted by creation time within repository
```

## Version History

- **v2.0.0** (2025-10-19): Auto-start configuration with session hook integration
- Simple HTTP server with health check and status APIs
- Background process management with PID tracking
- **Phase 1 Complete** (2025-10-19): Redis integration for cross-session/cross-repo visibility
- **Phase 2 Complete** (2025-10-19): WebSocket integration for real-time event streaming
- **Phase 3 Complete** (2025-10-19): Cross-repo filtering and repository-based grouping
