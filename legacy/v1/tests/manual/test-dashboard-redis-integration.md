# Dashboard Redis Integration Test Suite

**Phase 5: Validation & Monitoring + Dashboard Integration**

End-to-end testing of Redis monitoring service with web dashboard integration.

---

## Prerequisites

- Redis server running on `localhost:6379`
- Node.js v18+ installed
- Dependencies installed: `npm install`

---

## Test Environment Setup

```bash
# 1. Ensure Redis is running
redis-cli ping
# Expected: PONG

# 2. Clean previous test data
redis-cli flushdb

# 3. Create test directories
mkdir -p .artifacts/hooks
mkdir -p .artifacts/agents/test-agent-1
mkdir -p .artifacts/logs
```

---

## Test Suite Overview

| Test ID | Component | Description | Duration |
|---------|-----------|-------------|----------|
| T1 | Backend Service | Redis monitoring service initialization | 2 min |
| T2 | WebSocket Integration | Real-time event broadcasting | 3 min |
| T3 | REST API | Initial data endpoints | 2 min |
| T4 | Hook Feedback Flow | End-to-end feedback delivery | 5 min |
| T5 | Dashboard UI | React component rendering | 3 min |
| T6 | Performance | High-load stress test | 5 min |
| T7 | Error Handling | Redis unavailable scenario | 2 min |
| T8 | Integration | Full workflow test | 10 min |

**Total Estimated Time:** 32 minutes

---

## Test Cases

### T1: Redis Monitoring Service Initialization

**Objective:** Verify RedisMonitoringService starts and connects to Redis.

**Steps:**

1. Create test script:

```javascript
// test-redis-monitoring-service.js
import { RedisMonitoringService } from '../src/web/dashboard/realtime/RedisMonitoringService.js';

async function testMonitoringService() {
    console.log('🧪 Testing Redis Monitoring Service...');

    const service = new RedisMonitoringService({
        redisHost: 'localhost',
        redisPort: 6379,
        monitoringInterval: 2000,
        enablePatternValidation: true
    });

    // Test event handlers
    service.on('connected', () => {
        console.log('✅ Service connected');
    });

    service.on('redis_feedback', (feedback) => {
        console.log('📬 Feedback received:', feedback);
    });

    service.on('redis_metrics', (metrics) => {
        console.log('📊 Metrics:', metrics);
    });

    service.on('error', (error) => {
        console.error('❌ Error:', error.message);
    });

    // Start service
    try {
        await service.start();
        console.log('✅ Service started successfully');

        // Wait 10 seconds to monitor
        await new Promise(resolve => setTimeout(resolve, 10000));

        // Get initial metrics
        const metrics = service.getMetrics();
        console.log('📈 Current metrics:', metrics);

        // Stop service
        await service.stop();
        console.log('✅ Service stopped successfully');

    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}

testMonitoringService();
```

2. Run test:

```bash
node test-redis-monitoring-service.js
```

**Expected Output:**

```
🧪 Testing Redis Monitoring Service...
✅ Redis monitoring service connected
✅ Subscribed to Redis monitoring channels
✅ Service connected
✅ Service started successfully
📈 Current metrics: {
  feedbackDeliveryRate: 0,
  averageFeedbackLatency: 0,
  agentActionRate: 0,
  activeChannels: 0,
  totalMessages: 0,
  staleKeys: 0,
  patternViolations: 0
}
✅ Redis monitoring service stopped
✅ Service stopped successfully
```

**Success Criteria:**
- ✅ Service connects to Redis
- ✅ Pattern subscriptions active
- ✅ Metrics initialized correctly
- ✅ No errors during start/stop

---

### T2: WebSocket Event Broadcasting

**Objective:** Verify RealtimeServer broadcasts Redis events via WebSocket.

**Steps:**

1. Start RealtimeServer with Redis monitoring:

```javascript
// test-realtime-server.js
import { RealtimeServer } from '../src/web/dashboard/realtime/RealtimeServer.js';

const server = new RealtimeServer({
    port: 3001,
    enableWebSocket: true,
    enableRedisMonitoring: true,
    redisMonitoringConfig: {
        redisHost: 'localhost',
        redisPort: 6379,
        monitoringInterval: 2000
    }
});

await server.start();
console.log('✅ Server started on port 3001');
```

2. Create WebSocket client:

```javascript
// test-websocket-client.js
import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:3001/ws');

ws.on('open', () => {
    console.log('✅ Connected to WebSocket');
});

ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    console.log(`📨 Received: ${message.type}`, message.payload);
});

ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
});
```

3. Trigger Redis event:

```bash
# Send test feedback to Redis
redis-cli LPUSH "agent:test-agent-1:feedback" '{"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'","type":"TEST","agentId":"test-agent-1","spawnMode":"cli","severity":"info","delivered":false}'
```

4. Verify WebSocket receives event

**Expected Output (WebSocket client):**

```
✅ Connected to WebSocket
📨 Received: welcome { clientId: 'client_...', serverTime: '...', protocol: 'websocket' }
📨 Received: redis_feedback {
  timestamp: '2025-10-17T...',
  agentId: 'test-agent-1',
  type: 'TEST',
  severity: 'info',
  delivered: false
}
```

**Success Criteria:**
- ✅ WebSocket connection established
- ✅ Welcome message received
- ✅ Redis feedback event broadcasted
- ✅ Event format matches schema

---

### T3: REST API Endpoints

**Objective:** Verify REST API endpoints return correct data.

**Steps:**

1. Get feedback history:

```bash
curl http://localhost:3001/api/redis/feedback?limit=10
```

**Expected Response:**

```json
{
  "feedback": [
    {
      "timestamp": "2025-10-17T...",
      "source": "post-edit-pipeline",
      "agentId": "test-agent-1",
      "spawnMode": "cli",
      "type": "TEST",
      "severity": "info",
      "delivered": false
    }
  ],
  "count": 1
}
```

2. Get current metrics:

```bash
curl http://localhost:3001/api/redis/metrics
```

**Expected Response:**

```json
{
  "feedbackDeliveryRate": 0,
  "averageFeedbackLatency": 0,
  "agentActionRate": 0,
  "activeChannels": 1,
  "totalMessages": 1,
  "staleKeys": 0,
  "patternViolations": 0
}
```

3. Get queue statuses:

```bash
curl http://localhost:3001/api/redis/queues
```

**Expected Response:**

```json
{
  "queues": [
    {
      "channel": "agent:test-agent-1:feedback",
      "length": 1,
      "oldestMessage": "{...}",
      "newestMessage": "{...}"
    }
  ],
  "count": 1
}
```

**Success Criteria:**
- ✅ All endpoints return 200 OK
- ✅ Data format matches schema
- ✅ Counts are accurate
- ✅ No 500 errors

---

### T4: Hook Feedback Flow (End-to-End)

**Objective:** Verify complete feedback flow from hook to dashboard.

**Steps:**

1. Start RealtimeServer (from T2)
2. Start WebSocket client (from T2)
3. Trigger post-edit hook with ROOT_WARNING:

```bash
# Create file in root
echo "test content" > test-file.txt

# Run post-edit hook
node config/hooks/post-edit-pipeline.js test-file.txt \
  --memory-key "swarm/test-agent-1/test" \
  --agent-id "test-agent-1"
```

4. Verify WebSocket receives ROOT_WARNING feedback
5. Verify REST API returns feedback
6. Check log file:

```bash
cat .artifacts/hooks/agent-test-agent-1-feedback.json
```

**Expected Flow:**

```
Hook → Redis PUBLISH → Monitoring Service → WebSocket → Dashboard
    ↘ Log File
```

**Expected WebSocket Message:**

```json
{
  "type": "redis_feedback",
  "payload": {
    "timestamp": "2025-10-17T...",
    "source": "post-edit-pipeline",
    "agentId": "test-agent-1",
    "spawnMode": "cli",
    "type": "ROOT_WARNING",
    "file": "test-file.txt",
    "severity": "error",
    "delivered": false
  }
}
```

**Success Criteria:**
- ✅ Hook executes successfully
- ✅ Redis receives feedback
- ✅ Monitoring service detects feedback
- ✅ WebSocket broadcasts to clients
- ✅ Log file persists feedback
- ✅ REST API returns feedback
- ✅ Latency <100ms (CLI mode)

---

### T5: Dashboard UI Component

**Objective:** Verify RedisCoordinationMonitor component renders correctly.

**Steps:**

1. Create test React app:

```javascript
// test-dashboard-component.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { RedisCoordinationMonitor } from '../src/web/dashboard/components/RedisCoordinationMonitor.tsx';

const App = () => {
    return (
        <div style={{ padding: '20px' }}>
            <h1>Redis Coordination Monitor Test</h1>
            <RedisCoordinationMonitor
                wsUrl="ws://localhost:3001/ws"
                refreshInterval={2000}
                maxFeedbackItems={50}
            />
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
```

2. Start dev server (if using Vite/CRA)
3. Open browser: `http://localhost:5173`
4. Verify component renders:
   - Header with "Redis Coordination Monitor"
   - Connection status indicator (green = connected)
   - Four metric cards
   - Three tabs (Feedback, Queues, Violations)

5. Trigger feedback event (from T4)
6. Verify real-time updates in dashboard

**Expected UI:**

```
╔══════════════════════════════════════════════════════════╗
║  ⚡ Redis Coordination Monitor          🟢 Connected    ║
╠══════════════════════════════════════════════════════════╣
║  Feedback Delivery │ Avg Latency │ Active Channels │...║
║      99.9%        │    45ms     │       3         │...║
╠══════════════════════════════════════════════════════════╣
║  [Hook Feedback] [Queue Status] [Violations]            ║
╠══════════════════════════════════════════════════════════╣
║  📬 ROOT_WARNING • test-agent-1 (cli) • 12:34:56       ║
║     File: test-file.txt                    ✅ Delivered ║
║                                                          ║
║  📬 LOW_COVERAGE • coder-2 (task) • 12:33:21           ║
║     File: src/example.ts                   ⏳ Pending   ║
╚══════════════════════════════════════════════════════════╝
```

**Success Criteria:**
- ✅ Component renders without errors
- ✅ WebSocket connects successfully
- ✅ Connection indicator shows green
- ✅ Metrics cards display data
- ✅ Feedback items appear in real-time
- ✅ Tab switching works
- ✅ No console errors

---

### T6: Performance & Stress Test

**Objective:** Verify system handles high message throughput.

**Steps:**

1. Generate 1000 feedback messages:

```bash
for i in {1..1000}; do
  redis-cli LPUSH "agent:stress-test-$i:feedback" "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)\",\"type\":\"STRESS_TEST\",\"agentId\":\"stress-test-$i\",\"severity\":\"info\"}"
done
```

2. Monitor metrics endpoint:

```bash
watch -n 1 'curl -s http://localhost:3001/api/redis/metrics | jq .'
```

3. Verify dashboard updates without lag
4. Check memory usage:

```bash
ps aux | grep node
```

**Performance Targets:**

- Message processing: >1000 msg/sec
- WebSocket latency: <50ms
- Memory usage: <500MB
- CPU usage: <30%
- No dropped messages

**Success Criteria:**
- ✅ All 1000 messages processed
- ✅ No WebSocket disconnections
- ✅ Dashboard remains responsive
- ✅ No memory leaks
- ✅ Metrics accurate

---

### T7: Error Handling (Redis Unavailable)

**Objective:** Verify graceful degradation when Redis unavailable.

**Steps:**

1. Stop Redis:

```bash
redis-cli shutdown
```

2. Start RealtimeServer:

```bash
node test-realtime-server.js
```

3. Verify error handling:
   - Service logs warning
   - REST API returns 503
   - Dashboard shows disconnected state
   - No crashes

4. Restart Redis:

```bash
redis-server &
```

5. Verify automatic reconnection

**Expected Behavior:**

```
❌ Redis monitoring error: Connection refused
⚠️  Redis monitoring not available (503 response)
🔄 Attempting reconnection... (1/10)
✅ Redis monitoring service connected
```

**Success Criteria:**
- ✅ No application crashes
- ✅ Graceful error messages
- ✅ 503 status codes (not 500)
- ✅ Automatic reconnection works
- ✅ Dashboard updates connection status

---

### T8: Full Integration Test

**Objective:** Comprehensive end-to-end workflow test.

**Scenario:** Simulate real agent coordination with hook feedback.

**Steps:**

1. Setup:
   ```bash
   redis-cli flushdb
   node test-realtime-server.js &
   ```

2. Open dashboard in browser
3. Spawn test agent:
   ```bash
   node config/hooks/post-spawn-validation.js test-agent-1 --format json
   ```

4. Agent creates file in root:
   ```bash
   echo "test" > agent-output.txt
   node config/hooks/post-edit-pipeline.js agent-output.txt --agent-id test-agent-1
   ```

5. Verify dashboard shows ROOT_WARNING
6. Agent moves file:
   ```bash
   mv agent-output.txt src/agent-output.txt
   ```

7. Agent writes tests (LOW_COVERAGE):
   ```bash
   echo "test" > src/test.ts
   node config/hooks/post-edit-pipeline.js src/test.ts --agent-id test-agent-1
   ```

8. Verify dashboard shows LOW_COVERAGE feedback
9. Monitor CLI script:
   ```bash
   ./scripts/monitor-swarm-redis.sh feedback
   ```

10. Verify all components working together

**Success Criteria:**
- ✅ All feedback types delivered
- ✅ Dashboard updates in real-time
- ✅ CLI monitoring shows events
- ✅ REST API data consistent
- ✅ Log files persisted
- ✅ No data loss
- ✅ End-to-end latency <200ms

---

## Validation Checklist

### Backend Service
- [ ] RedisMonitoringService connects to Redis
- [ ] Pattern subscriptions work (agent:*, coordinator:*, swarm:cfn:*)
- [ ] Event handlers emit correct events
- [ ] Metrics calculated accurately
- [ ] Queue status tracking works
- [ ] Pattern violation detection works
- [ ] Graceful error handling

### WebSocket Integration
- [ ] RealtimeServer initializes monitoring service
- [ ] Events broadcast to all connected clients
- [ ] Welcome message sent on connection
- [ ] Heartbeat mechanism works
- [ ] Multiple clients supported
- [ ] No memory leaks

### REST API
- [ ] `/api/redis/feedback` returns recent feedback
- [ ] `/api/redis/metrics` returns current metrics
- [ ] `/api/redis/queues` returns queue statuses
- [ ] `/api/redis/violations` returns violations
- [ ] `/api/redis/coordination` returns events
- [ ] Error handling (503 when unavailable)

### Dashboard Component
- [ ] Component renders without errors
- [ ] WebSocket connection established
- [ ] Connection status indicator accurate
- [ ] Metric cards display data
- [ ] Feedback tab shows messages
- [ ] Queue tab shows statuses
- [ ] Violations tab shows alerts
- [ ] Real-time updates work
- [ ] Color coding correct
- [ ] Tab switching smooth

### Integration
- [ ] Hook → Redis → Monitoring → WebSocket → Dashboard flow works
- [ ] CLI spawn mode feedback delivery <100ms
- [ ] Task spawn mode coordinator-mediated delivery works
- [ ] Log file persistence works
- [ ] CLI monitoring script works
- [ ] Post-spawn validation hook works
- [ ] All feedback types delivered correctly

---

## Cleanup

```bash
# Stop servers
pkill -f "node test-realtime-server.js"

# Clean test data
redis-cli flushdb
rm -f test-file.txt agent-output.txt src/agent-output.txt src/test.ts

# Clean logs
rm -rf .artifacts/hooks/*
rm -rf .artifacts/agents/test-agent-1
rm -rf .artifacts/agents/stress-test-*
```

---

## Known Issues & Limitations

1. **Redis Unavailable:** WebSocket clients must reconnect manually
2. **High Message Volume:** UI may lag if >10,000 messages in history
3. **Pattern Validation:** Some edge cases may not be caught
4. **Stale Detection:** Requires timestamp in message payload

---

## Next Steps

After successful testing:

1. Deploy to staging environment
2. Run load testing with realistic traffic
3. Monitor performance metrics
4. Gather user feedback
5. Iterate on UI/UX improvements
6. Document production deployment

---

## Success Metrics (Phase 5 Complete)

- ✅ Feedback delivery rate: >99.9%
- ✅ Average latency (CLI): <100ms
- ✅ Average latency (Task): <5s
- ✅ Agent action rate: >80%
- ✅ WebSocket uptime: >99.9%
- ✅ Dashboard load time: <2s
- ✅ Real-time update lag: <50ms
- ✅ Zero data loss
- ✅ Zero crashes under normal load

**Phase 5 Status:** ✅ READY FOR TESTING
