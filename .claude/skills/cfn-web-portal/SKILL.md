# Web Portal Skill - Monitoring & Visualization Interface

**Version:** 1.0.0
**Status:** Production Ready
**Skill Type:** Infrastructure / Monitoring
**Dependencies:** Redis, packages/web-portal

---

## Overview

The Web Portal Skill provides programmatic access to the claude-flow-novice web portal monitoring and visualization system. This skill enables agents to query real-time metrics, agent status, event streams, and system health without direct web browser access.

### Core Capabilities

- **Lifecycle Management:** Start/stop web portal server with health validation
- **Metrics Querying:** Retrieve system and agent-level performance metrics
- **Dashboard Access:** Get comprehensive system status summaries
- **Agent Monitoring:** Query agent hierarchy, status, and coordination state
- **Event Streaming:** Access event timeline with filtering and pagination
- **Graceful Shutdown:** Clean server termination with WebSocket cleanup

---

## Skill Architecture

### Technology Stack

- **Server:** Express.js + Socket.IO (WebSocket coordination)
- **Client:** Vite + React (development mode)
- **API:** RESTful endpoints with caching
- **Coordination:** Redis pub/sub integration
- **Caching:** 60-second TTL for metrics, 30-second for agents

### API Endpoints

| Endpoint | Method | Purpose | Cache TTL |
|----------|--------|---------|-----------|
| `/health` | GET | Health check | None |
| `/api/metrics` | GET | System metrics | 10s (server) |
| `/api/agents/hierarchy` | GET | Agent tree | 30s (server) |
| `/api/agents/:id/status` | GET | Agent details | None |
| `/api/events` | GET | Event timeline | None |
| `/api/events/phase/:id` | GET | Phase events | None |
| `/api/events/agent/:id` | GET | Agent events | None |

---

## Invoke Scripts Reference

### 1. invoke-portal-start.sh

**Purpose:** Start web portal server with health validation

**Usage:**
```bash
./.claude/skills/web-portal/invoke-portal-start.sh [--port PORT] [--production]
```

**Arguments:**
- `--port PORT` - Server port (default: 3000)
- `--production` - Build and run in production mode

**Returns:**
```json
{
  "success": true,
  "serverUrl": "http://localhost:3000",
  "port": 3000,
  "pid": 12345,
  "mode": "development",
  "health": {
    "status": "healthy",
    "redis": true,
    "uptime": 0,
    "checks": 5
  },
  "endpoints": {
    "api": "http://localhost:3000/api",
    "metrics": "http://localhost:3000/api/metrics",
    "agents": "http://localhost:3000/api/agents",
    "events": "http://localhost:3000/api/events",
    "health": "http://localhost:3000/health"
  }
}
```

**Example:**
```bash
# Start development server
./invoke-portal-start.sh

# Start on custom port
./invoke-portal-start.sh --port 3001

# Production mode
./invoke-portal-start.sh --production
```

**Health Check:**
- Max attempts: 30
- Interval: 1 second
- Validates Redis connection
- Verifies HTTP responses

---

### 2. invoke-portal-metrics.sh

**Purpose:** Query system and agent metrics with caching

**Usage:**
```bash
./.claude/skills/web-portal/invoke-portal-metrics.sh [OPTIONS]
```

**Arguments:**
- `--agent AGENT_ID` - Filter by agent
- `--timeframe TIMEFRAME` - Time window (e.g., "5m", "1h")
- `--view VIEW` - Metric view type
- `--format json|table` - Output format (default: json)
- `--port PORT` - Server port (default: 3000)

**Cache Behavior:**
- TTL: 60 seconds
- Cache directory: `.artifacts/cache/web-portal/`
- Cache key includes all filter parameters
- Automatic cache invalidation after TTL

**Returns:**
```json
{
  "data": {
    "totalAgents": 15,
    "activeAgents": 12,
    "avgConfidence": 0.87,
    "systemHealth": "healthy",
    "redis": {
      "connected": true,
      "uptime": 3600
    },
    "performance": {
      "cpuUsage": 45.2,
      "memoryUsage": 1024
    }
  }
}
```

**Example:**
```bash
# Get all metrics (JSON)
./invoke-portal-metrics.sh

# Filter by agent (table format)
./invoke-portal-metrics.sh --agent coder-1 --format table

# Specific timeframe
./invoke-portal-metrics.sh --timeframe 5m --view performance
```

---

### 3. invoke-portal-dashboard.sh

**Purpose:** Fetch comprehensive dashboard summary

**Usage:**
```bash
./.claude/skills/web-portal/invoke-portal-dashboard.sh [--port PORT] [--format json|table]
```

**Arguments:**
- `--port PORT` - Server port (default: 3000)
- `--format json|table` - Output format (default: json)

**Returns:**
```json
{
  "success": true,
  "dashboard": {
    "activeAgents": 12,
    "systemHealth": "healthy",
    "metrics": {
      "totalAgents": 15,
      "avgConfidence": 0.87,
      "redis": { "connected": true }
    },
    "timestamp": "2025-10-19T12:00:00Z"
  }
}
```

**Example:**
```bash
# Get dashboard (JSON)
./invoke-portal-dashboard.sh

# Table format
./invoke-portal-dashboard.sh --format table
```

**Table Output:**
```
=== Dashboard Summary ===
Active Agents: 12
System Health: healthy
Timestamp: 2025-10-19T12:00:00Z

=== Metrics ===
totalAgents: 15
avgConfidence: 0.87
...
```

---

### 4. invoke-portal-agents.sh

**Purpose:** Query agent hierarchy and individual agent status

**Usage:**
```bash
./.claude/skills/web-portal/invoke-portal-agents.sh [OPTIONS]
```

**Arguments:**
- `--status STATUS` - Filter by status (active, idle, error)
- `--type TYPE` - Filter by agent type (coder, tester, reviewer)
- `--swarm SWARM_ID` - Filter by swarm ID
- `--agent-id AGENT_ID` - Get specific agent status
- `--format json|table` - Output format (default: json)
- `--port PORT` - Server port (default: 3000)

**Hierarchy Query Returns:**
```json
{
  "success": true,
  "data": [
    {
      "id": "coder-1",
      "status": "active",
      "type": "coder",
      "swarmId": "swarm-123",
      "confidence": 0.85,
      "uptime": 3600
    }
  ]
}
```

**Agent Status Query Returns:**
```json
{
  "data": {
    "id": "coder-1",
    "status": "active",
    "type": "coder",
    "confidence": 0.85,
    "uptime": 3600,
    "metrics": {
      "tokensUsed": 15000,
      "apiCalls": 25,
      "successRate": 0.96
    }
  }
}
```

**Example:**
```bash
# Get all agents
./invoke-portal-agents.sh

# Active agents only
./invoke-portal-agents.sh --status active

# Specific swarm
./invoke-portal-agents.sh --swarm swarm-123

# Single agent status
./invoke-portal-agents.sh --agent-id coder-1

# Table format
./invoke-portal-agents.sh --status active --format table
```

---

### 5. invoke-portal-events.sh

**Purpose:** Query event timeline with filtering and pagination

**Usage:**
```bash
./.claude/skills/web-portal/invoke-portal-events.sh [OPTIONS]
```

**Arguments:**
- `--type TYPE` - Filter by event type
- `--agent AGENT_ID` - Filter by agent
- `--phase PHASE_ID` - Filter by phase
- `--since TIMESTAMP` - Events since timestamp
- `--severity LEVEL` - Filter by severity (info, warning, error, critical)
- `--limit NUM` - Max events to return (default: 50)
- `--offset NUM` - Pagination offset (default: 0)
- `--format json|table` - Output format (default: json)
- `--port PORT` - Server port (default: 3000)

**Returns:**
```json
{
  "success": true,
  "data": [
    {
      "timestamp": "2025-10-19T12:00:00Z",
      "phaseId": "phase-1",
      "agentId": "coder-1",
      "eventType": "agent.lifecycle",
      "payload": { "status": "spawned" },
      "metadata": { "severity": "info" }
    }
  ]
}
```

**Example:**
```bash
# Get recent events
./invoke-portal-events.sh --limit 100

# Filter by agent
./invoke-portal-events.sh --agent coder-1

# Filter by phase
./invoke-portal-events.sh --phase phase-auth

# Error events only
./invoke-portal-events.sh --severity error

# Pagination
./invoke-portal-events.sh --limit 50 --offset 100

# Table format
./invoke-portal-events.sh --type agent.lifecycle --format table
```

**Table Output:**
```
=== Events Timeline ===
Total Events: 25

[2025-10-19T12:00:00Z] agent.lifecycle - Agent: coder-1 - Phase: phase-1
[2025-10-19T12:00:05Z] agent.complete - Agent: coder-1 - Phase: phase-1
...
```

---

### 6. invoke-portal-stop.sh

**Purpose:** Gracefully stop web portal server with cleanup

**Usage:**
```bash
./.claude/skills/web-portal/invoke-portal-stop.sh [--port PORT] [--force]
```

**Arguments:**
- `--port PORT` - Server port (default: 3000)
- `--force` - Skip graceful shutdown, force kill

**Shutdown Sequence:**
1. Attempt graceful shutdown via `/api/shutdown` (if implemented)
2. Wait up to 10 seconds for clean exit
3. Terminate process via SIGTERM
4. Force kill with SIGKILL if needed
5. Kill by port using `lsof`
6. Cleanup PID file

**Returns:**
```json
{
  "success": true,
  "message": "Web portal server stopped successfully",
  "port": 3000,
  "pid": "12345",
  "method": "graceful"
}
```

**Example:**
```bash
# Graceful shutdown
./invoke-portal-stop.sh

# Force shutdown
./invoke-portal-stop.sh --force

# Custom port
./invoke-portal-stop.sh --port 3001
```

---

## WebSocket Integration

### Real-Time Event Streaming

The web portal provides WebSocket support for live updates:

**Connection:**
```javascript
const socket = io('http://localhost:3000');

socket.on('agent_update', (data) => {
  console.log('Agent updated:', data);
});

socket.on('metrics_update', (data) => {
  console.log('Metrics updated:', data);
});
```

**Event Types:**
- `agent_update` - Agent status changes
- `metrics_update` - System metrics refresh
- `event_stream` - New events published
- `connection_status` - WebSocket health

### Coordination Pattern

```bash
# Publish agent lifecycle event (triggers WebSocket broadcast)
redis-cli publish "web-portal:agents" '{"agent":"coder-1","status":"active"}'

# Publish metrics update
redis-cli publish "web-portal:metrics" '{"systemHealth":"healthy"}'

# Publish custom event
redis-cli publish "web-portal:events" '{"type":"deployment","status":"success"}'
```

---

## Error Handling

### Common Errors

**Server Not Running:**
```json
{
  "success": false,
  "error": "Failed to query metrics API at http://localhost:3000/api/metrics"
}
```

**Invalid Response:**
```json
{
  "success": false,
  "error": "Invalid JSON response from metrics API"
}
```

**Health Check Timeout:**
```json
{
  "success": false,
  "error": "Server failed health check after 30 attempts",
  "port": 3000,
  "redisConnected": false
}
```

### Error Recovery

1. **Check Redis:** Ensure Redis is running (`redis-cli ping`)
2. **Verify Port:** Check no port conflicts (`lsof -ti:3000`)
3. **Clean Restart:** Stop server, clear cache, restart
4. **Check Logs:** Review server output for errors

---

## Performance Considerations

### Caching Strategy

**Client-Side Cache (invoke-portal-metrics.sh):**
- TTL: 60 seconds
- Cache directory: `.artifacts/cache/web-portal/`
- Automatic invalidation

**Server-Side Cache:**
- Metrics: 10 seconds
- Agent hierarchy: 30 seconds
- Agent status: No cache (real-time)

### Best Practices

1. **Use caching for repeated queries** - Metrics script caches automatically
2. **Filter at API level** - Use query parameters instead of client filtering
3. **Paginate large results** - Use `--limit` and `--offset` for events
4. **Batch operations** - Query dashboard once instead of multiple endpoints
5. **Close WebSocket connections** - Use graceful shutdown to prevent leaks

---

## Integration Examples

### Agent Spawning Integration

```bash
# Start portal before spawning agents
./invoke-portal-start.sh

# Spawn agents (they'll appear in portal)
npx claude-flow-novice swarm "Build API" --max-agents 5

# Monitor agent status
./invoke-portal-agents.sh --status active --format table

# Check metrics
./invoke-portal-metrics.sh --format table

# Cleanup
./invoke-portal-stop.sh
```

### CFN Loop Monitoring

```bash
# Start portal
./invoke-portal-start.sh

# Launch CFN Loop (monitored by portal)
/cfn-loop "Authentication system" --phase auth

# Monitor Loop 3 agents
./invoke-portal-agents.sh --swarm cfn-loop-auth

# Track events
./invoke-portal-events.sh --phase phase-auth --limit 100

# Get consensus metrics
./invoke-portal-metrics.sh --view consensus
```

### Continuous Monitoring Script

```bash
#!/usr/bin/env bash
# Monitor web portal metrics every 30 seconds

while true; do
  echo "=== $(date) ==="
  ./.claude/skills/web-portal/invoke-portal-dashboard.sh --format table
  echo ""
  sleep 30
done
```

---

## Security Considerations

### Authentication

- Development mode: No authentication required
- Production mode: JWT authentication enforced
- API key authentication for programmatic access

### Rate Limiting

- Metrics endpoint: 100 req/min per IP
- Events endpoint: 1000 req/15min per IP
- Agent intervention: 10 req/min per IP

### Data Validation

- All query parameters sanitized
- JSON payloads validated
- SQL injection prevention (parameterized queries)
- XSS protection (output encoding)

---

## Troubleshooting

### Server Won't Start

```bash
# Check port availability
lsof -ti:3000

# Kill existing process
lsof -ti:3000 | xargs -r kill -9

# Verify Redis
redis-cli ping

# Start with verbose logs
PORT=3000 npm run dev
```

### Cache Issues

```bash
# Clear cache
rm -rf .artifacts/cache/web-portal/

# Bypass cache (direct query)
curl http://localhost:3000/api/metrics
```

### WebSocket Connection Failures

```bash
# Verify server supports WebSocket
curl -I http://localhost:3000/socket.io/

# Check firewall rules
# Ensure port 3000 allows WebSocket upgrade
```

---

## Skill Confidence Scoring

### Self-Assessment Criteria

- **Server Health:** Redis connected, API responsive
- **Data Accuracy:** Metrics match Redis state
- **Performance:** Cache hit rate >80%
- **Error Rate:** <5% failed requests
- **Uptime:** >99% availability

### Confidence Formula

```
confidence = (
  0.3 * health_score +
  0.3 * data_accuracy +
  0.2 * cache_efficiency +
  0.1 * error_rate +
  0.1 * uptime
)
```

**Target:** 0.85 for production readiness

---

## Version History

**1.0.0 (2025-10-19):**
- Initial release
- 6 core invoke scripts
- WebSocket integration
- Caching support
- Production-ready documentation

---

## Related Skills

- **Redis Coordination:** `.claude/skills/redis-coordination/SKILL.md`
- **Agent Spawning:** `.claude/skills/agent-spawning/SKILL.md`
- **CFN Loop Validation:** `.claude/skills/cfn-loop-validation/SKILL.md`

---

## Maintenance Schedule

- **Weekly:** Cache cleanup, log rotation
- **Monthly:** Security audit, dependency updates
- **Quarterly:** Performance benchmarking, optimization

**Next Review:** 2025-11-19
