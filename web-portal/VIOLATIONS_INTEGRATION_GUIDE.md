# CFN Loop Violations Integration Guide

## Overview

Real-time CFN Loop violation monitoring integrated into the web portal with WebSocket alerts.

## Components Created

### 1. Monitoring Script
**File:** `.claude/skills/redis-coordination/monitor-cfn-violations.sh`

**Features:**
- Detects 5 types of CFN Loop violations
- Runs in background, polls Redis every 30s
- Sends alerts via Redis pub/sub AND REST API
- Prevents duplicate alerts with Redis TTL

**Violation Types Detected:**
1. `orchestrator_never_started` - Orchestrator not spawned after 2+ minutes
2. `gate_bypass_violation` - Loop 2 started before Loop 3 complete
3. `orchestrator_hang_with_complete_agents` - All agents done but orchestrator still waiting
4. `coordinator_monitoring_timeout` - Coordinator cancelled after 5-10 min (likely Bash timeout)
5. `product_owner_not_consulted` - Loop 2 complete but PO not spawned

**Usage:**
```bash
# Start monitoring in background
./.claude/skills/redis-coordination/monitor-cfn-violations.sh &

# Or with custom settings
./monitor-cfn-violations.sh --interval 60 --websocket-port 3001
```

### 2. WebSocket Server
**File:** `web-portal/server.js`

**Features:**
- Socket.IO server on port 3001
- Redis pub/sub integration
- REST API endpoints for violations
- Broadcasts real-time violations to all clients

**API Endpoints:**
```
POST /api/violations              # Receive violation from monitor script
GET  /api/violations              # Fetch violation history
GET  /api/violations?task_id=...  # Filter by task
POST /api/violations/:id/acknowledge  # Acknowledge violation
```

**WebSocket Events:**
```
Client → Server:
  - subscribe-swarm: Subscribe to specific swarm
  - acknowledge-violation: Acknowledge a violation

Server → Client:
  - cfn-violation: New violation detected
  - historical-violations: Past violations for subscribed swarm
  - violation-acknowledged: Violation acknowledged by user
  - swarm-status: Swarm status update
```

### 3. React Component
**File:** `web-portal/src/components/ViolationsPanel.tsx`

**Features:**
- Real-time violation display
- Severity filtering (critical/warning/info)
- Expandable details with evidence
- Acknowledge violations
- Auto-updating timestamps

**Props:**
```typescript
interface ViolationsPanelProps {
  socket: Socket | null;
  currentSwarmId?: string;  // Filter violations by swarm
}
```

## Integration Steps

### Step 1: Update App.tsx

Add violations view mode and integrate ViolationsPanel:

```typescript
// 1. Import ViolationsPanel
import ViolationsPanel from './components/ViolationsPanel';

// 2. Update AppState interface (line 34)
viewMode: 'dashboard' | 'messages' | 'agents' | 'transparency' | 'mcp' | 'playwright' | 'violations';

// 3. Add violations tab button (in render section)
<button
  className={state.viewMode === 'violations' ? 'active' : ''}
  onClick={() => setState(prev => ({ ...prev, viewMode: 'violations' }))}
>
  🚨 Violations
</button>

// 4. Add view rendering (in view switch)
{state.viewMode === 'violations' && (
  <ViolationsPanel
    socket={socket}
    currentSwarmId={state.currentSwarmId}
  />
)}
```

### Step 2: Update package.json

Add server dependencies:

```json
{
  "dependencies": {
    "express": "^4.18.2",
    "socket.io": "^4.7.4",
    "ioredis": "^5.3.2"
  },
  "scripts": {
    "server": "node server.js",
    "dev:all": "concurrently \"npm run server\" \"npm start\"",
    "start:monitor": "bash ../.claude/skills/redis-coordination/monitor-cfn-violations.sh"
  }
}
```

### Step 3: Start All Services

```bash
# Terminal 1: Start Redis (if not running)
redis-server

# Terminal 2: Start WebSocket server
cd web-portal
npm run server

# Terminal 3: Start monitoring script
./.claude/skills/redis-coordination/monitor-cfn-violations.sh &

# Terminal 4: Start React frontend
cd web-portal
npm start
```

## Usage Example

### Scenario: Coordinator Spawns Orchestrator Synchronously

**What happens:**

1. **Coordinator runs** (spawns orchestrator without `run_in_background: true`)
2. **Monitor detects** (after 2 minutes, no orchestrator status in Redis)
3. **Alert sent:**
   ```json
   {
     "timestamp": "2025-10-20T22:00:00Z",
     "task_id": "phase-4-testing-qa-1760997343",
     "violation_type": "orchestrator_never_started",
     "severity": "critical",
     "description": "Orchestrator was never spawned after 120s. Coordinator may have failed at Step 2.",
     "recommendation": "Check coordinator logs. Ensure orchestrator spawned with run_in_background: true",
     "evidence": {
       "swarm_created_at": "2025-10-20T21:55:43Z",
       "time_elapsed_seconds": 120,
       "status_key_exists": false,
       "agent_keys_count": 0
     }
   }
   ```

4. **Web Portal displays:**
   - 🔴 Red badge in violations tab
   - Real-time toast notification
   - Detailed violation with expandable evidence
   - Recommendation to fix coordinator template

5. **Developer actions:**
   - Click violation to see details
   - Review evidence (timing, missing keys)
   - Follow recommendation
   - Acknowledge violation when fixed

## Testing

### Test Violation Detection

```bash
# Simulate orchestrator never starting
TASK_ID="test-violation-$(date +%s)"
redis-cli HSET "swarm:swarm-${TASK_ID}:metadata" created_at "$(date -Iseconds)" task_id "$TASK_ID"

# Wait 2 minutes - monitor should detect and alert
# Check web portal violations tab for alert
```

### Test Real-Time Alerts

```bash
# Send test violation manually
curl -X POST http://localhost:3001/api/violations \
  -H "Content-Type: application/json" \
  -d '{
    "timestamp": "'$(date -Iseconds)'",
    "task_id": "test-123",
    "violation_type": "test_violation",
    "severity": "warning",
    "description": "Test violation alert",
    "recommendation": "This is a test",
    "evidence": {}
  }'

# Should appear immediately in web portal
```

## Architecture Diagram

```
┌─────────────────┐
│ CFN Loop        │
│ Orchestrator    │
│ (Bash Script)   │
└────────┬────────┘
         │ writes state
         ▼
┌─────────────────┐      ┌──────────────────┐
│ Redis           │◄─────┤ Violation        │
│ (Pub/Sub)       │      │ Monitor Script   │
└────────┬────────┘      └──────────────────┘
         │                        │
         │ pub/sub                │ HTTP POST
         ▼                        ▼
┌─────────────────┐      ┌──────────────────┐
│ WebSocket       │◄─────┤ Violation        │
│ Server          │      │ REST API         │
│ (Node.js)       │      └──────────────────┘
└────────┬────────┘
         │ WebSocket
         ▼
┌─────────────────┐
│ React Web       │
│ Portal          │
│ ViolationsPanel │
└─────────────────┘
```

## Benefits

1. **Instant Debugging** - Know within 30s when orchestrator/coordinator fails
2. **Root Cause Analysis** - Evidence shows exactly what went wrong
3. **Historical Tracking** - All violations stored in Redis for 24 hours
4. **Actionable Recommendations** - Specific fixes for each violation type
5. **Zero Interruption** - Monitor runs in background, no impact on CFN Loop

## Future Enhancements

1. **Email Alerts** - Send critical violations via email
2. **Slack Integration** - Post violations to Slack channel
3. **Auto-Remediation** - Attempt automatic fixes for common violations
4. **Violation Patterns** - Detect recurring issues across multiple tasks
5. **Performance Impact** - Track violation impact on task completion time

## Configuration

### Monitor Script Environment Variables

```bash
export REDIS_HOST=localhost
export REDIS_PORT=6379
export CHECK_INTERVAL=30  # seconds between checks
export WEBSOCKET_PORT=3001
```

### WebSocket Server Environment Variables

```bash
export PORT=3001
export REDIS_HOST=localhost
export REDIS_PORT=6379
export CORS_ORIGIN=http://localhost:3000
```

## Troubleshooting

### Violations Not Appearing in Portal

1. Check WebSocket server is running: `curl http://localhost:3001/health`
2. Check monitor script is running: `ps aux | grep monitor-cfn`
3. Check Redis connectivity: `redis-cli ping`
4. Check browser console for WebSocket errors

### Duplicate Violations

- Monitor script uses Redis TTL to prevent duplicates (1 hour)
- If seeing duplicates, check `violation:${task_id}:${type}` keys in Redis

### High Memory Usage

- Monitor script keeps only last 100 violations per task
- Global violations limited to 500
- All violation keys have 24-hour TTL

## Documentation References

- **Monitoring Script:** `.claude/skills/redis-coordination/monitor-cfn-violations.sh`
- **WebSocket Server:** `web-portal/server.js`
- **React Component:** `web-portal/src/components/ViolationsPanel.tsx`
- **Coordinator Template:** `.claude/agents/core-agents/cost-savings-cfn-loop-coordinator.md`
- **Orchestrator Script:** `.claude/skills/redis-coordination/orchestrate-cfn-loop.sh`
