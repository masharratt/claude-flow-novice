# Redis Pub/Sub Integration for Web Portal

## Overview

This document describes the Redis pub/sub bridge implementation that enables real-time event capture from CLI agent coordination layer to the web portal.

**Implementation Date:** 2025-10-21
**Agent:** backend-dev
**CLAUDE.md Compliance:** Critical Rule #19 - ALL agent communication MUST use Redis pub/sub

## Architecture

```
CLI Agents (Redis pub/sub)
        ↓
Redis Server (localhost:6379)
        ↓
RedisClientService (singleton)
        ↓
SwarmAdapter (pattern subscriber)
        ↓
WebSocket Server
        ↓
Web Portal Clients
```

## Components

### 1. RedisClientService (`/src/server/services/redis-client.ts`)

**Purpose:** Singleton service managing Redis connections with auto-reconnect and error handling.

**Features:**
- Exponential backoff reconnection (max 10 attempts)
- Separate subscriber client for pub/sub (Redis requirement)
- Health check monitoring
- Graceful shutdown
- Environment-based configuration

**Key Methods:**
- `connect()`: Initialize main Redis client
- `getSubscriber()`: Get or create subscriber client for pub/sub
- `healthCheck()`: Check connection status and latency
- `disconnect()`: Graceful shutdown

**Configuration (Environment Variables):**
```env
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_PREFIX=cfn:
```

### 2. SwarmAdapter (`/src/server/websocket/integrations/SwarmAdapter.ts`)

**Purpose:** Bridge between Redis pub/sub events and WebSocket hierarchy_change events.

**Features:**
- Pattern-based subscriptions: `swarm:*`, `agent:*`, `cfn:*`
- Event mapping from CLI formats to SwarmCoordinatorEvent
- EventStore persistence (non-blocking)
- WebSocket broadcast to connected clients
- Subscription status tracking

**Key Methods:**
- `subscribeToSwarmCoordinator()`: Initialize Redis pub/sub subscriptions
- `handleRedisMessage()`: Parse incoming Redis messages
- `mapRedisMessageToEvent()`: Map Redis events to SwarmCoordinatorEvent format
- `handleSwarmEvent()`: Broadcast to WebSocket and persist to EventStore
- `getSubscriptionStatus()`: Check subscription health

**Supported Event Patterns:**

| Redis Channel Pattern | Event Type | WebSocket Event |
|-----------------------|------------|-----------------|
| `swarm:{id}:created` | swarm_created | N/A |
| `swarm:{id}:updated` | swarm_updated | N/A |
| `swarm:{id}:terminated` | swarm_terminated | N/A |
| `agent:{id}:spawned` | agent_spawned | hierarchy_change (spawn) |
| `agent:{id}:terminated` | agent_terminated | hierarchy_change (terminate) |
| `agent:{id}:reparented` | agent_reparented | hierarchy_change (reparent) |
| `cfn:{taskId}:*` | Various | Mapped to appropriate swarm/agent events |

### 3. Server Integration (`/src/server/index.ts`)

**Purpose:** Wire Redis client and SwarmAdapter to server lifecycle.

**Features:**
- Async service initialization after server start
- Graceful shutdown on SIGTERM/SIGINT
- Error recovery (server continues without Redis if connection fails)
- 10-second timeout for forced shutdown

**Initialization Flow:**
1. Server starts and listens on port
2. `initializeServices()` called asynchronously
3. Redis client connects
4. SwarmAdapter created and subscribed
5. Ready to receive CLI coordination events

**Shutdown Flow:**
1. SIGTERM/SIGINT received
2. SwarmAdapter unsubscribes and cleans up
3. Redis client disconnects
4. HTTP server closes
5. Process exits (or force exits after 10s timeout)

## Event Flow Examples

### Agent Spawned Event

**CLI publishes to Redis:**
```bash
redis-cli publish "agent:coder-1:spawned" '{"swarmId":"task-123","parentId":"coordinator","timestamp":"2025-10-21T14:00:00Z"}'
```

**SwarmAdapter receives and maps:**
```typescript
{
  type: 'agent_spawned',
  agentId: 'coder-1',
  swarmId: 'task-123',
  parentId: 'coordinator',
  data: { swarmId: 'task-123', parentId: 'coordinator' },
  timestamp: Date
}
```

**WebSocket broadcasts:**
```json
{
  "type": "hierarchy_change",
  "payload": {
    "type": "spawn",
    "agentId": "coder-1",
    "parentId": "coordinator",
    "metadata": { "swarmId": "task-123", "parentId": "coordinator" }
  }
}
```

### CFN Loop Phase Event

**CLI publishes to Redis:**
```bash
redis-cli publish "cfn:phase-auth:loop" '{"loop":3,"status":"complete","confidence":0.85}'
```

**SwarmAdapter maps to swarm_updated:**
```typescript
{
  type: 'swarm_updated',
  swarmId: 'phase-auth',
  data: {
    loop: 3,
    status: 'complete',
    confidence: 0.85,
    cfnEvent: true,
    eventType: 'loop'
  },
  timestamp: Date
}
```

## Testing

### Manual Testing

**1. Start Redis server:**
```bash
redis-server
```

**2. Start web portal:**
```bash
cd packages/web-portal
npm run dev
```

**3. Verify Redis connection:**
Check server logs for:
```
[Server] Initializing Redis client...
[Server] Redis client connected
[SwarmAdapter] Successfully subscribed to Redis pub/sub
[SwarmAdapter] Listening for CLI agent coordination events
```

**4. Publish test event:**
```bash
redis-cli publish "agent:test-agent:spawned" '{"swarmId":"test-swarm","parentId":"test-parent","timestamp":"2025-10-21T14:00:00Z"}'
```

**5. Check WebSocket broadcast:**
- Open browser dev tools on web portal
- Connect to WebSocket
- Join 'hierarchy' room
- Verify hierarchy_change event received

### Health Check

**Check Redis connection:**
```bash
curl http://localhost:3002/health
```

**Check subscription status (add endpoint if needed):**
```typescript
app.get('/api/redis/status', async (req, res) => {
  const health = await redisClientService.healthCheck();
  const status = swarmAdapter?.getSubscriptionStatus();
  res.json({ redis: health, subscription: status });
});
```

## Error Handling

### Redis Connection Failures

**Behavior:**
- Server continues to run without Redis integration
- Logs error but doesn't crash
- Reconnection attempts with exponential backoff

**Log Example:**
```
[Server] Failed to initialize services: Error: Redis connection timeout
[Server] Server will continue without Redis integration
```

### Message Parsing Errors

**Behavior:**
- Invalid JSON or unknown event formats logged
- Processing continues for other messages
- No impact on WebSocket server

**Log Example:**
```
[SwarmAdapter] Error parsing Redis message: SyntaxError: Unexpected token
[SwarmAdapter] Channel: agent:test:invalid
[SwarmAdapter] Raw message: {invalid-json}
```

### EventStore Persistence Failures

**Behavior:**
- Non-blocking persistence (fire-and-forget)
- Real-time WebSocket broadcast not affected
- Errors logged for debugging

**Log Example:**
```
Failed to persist swarm event to event store: Error: Database connection lost
```

## Performance

**Expected Metrics:**
- Redis connection latency: <10ms (localhost)
- Message processing: <5ms per event
- WebSocket broadcast: <10ms to all clients
- Memory overhead: ~10MB (Redis client + subscription tracking)

**Monitoring:**
- Message count tracked: `swarmAdapter.getSubscriptionStatus().messageCount`
- Redis health: `redisClientService.healthCheck()`
- Active swarms: `swarmAdapter.getActiveSwarms().size`
- Agent hierarchy: `swarmAdapter.getAgentHierarchy().size`

## Production Considerations

### Scaling

**Single Server:**
- Current implementation supports 1 web portal server
- Redis pub/sub broadcasts to all subscribers

**Multi-Server (Future):**
- Each server subscribes to same Redis channels
- All servers receive all events (fan-out pattern)
- Consider Redis Cluster for >100k events/sec

### Security

**Network Security:**
- Use `REDIS_PASSWORD` for authentication
- Enable TLS for Redis connections (update client config)
- Firewall Redis port (6379) - allow only trusted servers

**Environment Variables:**
- Never commit `.env` to version control
- Use secrets management in production (AWS Secrets Manager, HashiCorp Vault)
- Rotate Redis passwords regularly

### Monitoring

**Metrics to Track:**
- Redis connection uptime
- Subscription status (connected/disconnected)
- Message processing rate (events/sec)
- Error rate (parsing failures, connection errors)
- EventStore persistence success rate

**Alerting:**
- Alert on Redis connection failures
- Alert on subscription failures
- Alert on high error rates (>1% of messages)

## Troubleshooting

### Issue: SwarmAdapter not receiving events

**Check:**
1. Redis server running: `redis-cli ping`
2. Redis connection: Check server logs for `[Server] Redis client connected`
3. Subscription active: Check for `[SwarmAdapter] Successfully subscribed to Redis pub/sub`
4. Event published to correct channel: Use `redis-cli monitor` to see all events

**Fix:**
- Restart Redis server
- Restart web portal server
- Check REDIS_URL environment variable

### Issue: Events received but not broadcasted to WebSocket

**Check:**
1. WebSocket clients connected: Check server logs for client connections
2. Clients joined correct room: Verify `socket.join('hierarchy')` called
3. SwarmAdapter mapping logic: Check for unknown event format warnings

**Fix:**
- Verify client-side WebSocket connection code
- Check event mapping logic in `mapRedisMessageToEvent()`
- Add debug logging to `handleSwarmEvent()`

### Issue: High memory usage

**Check:**
1. Active swarms not cleared: `swarmAdapter.getActiveSwarms().size`
2. Agent hierarchy growing unbounded: `swarmAdapter.getAgentHierarchy().size`
3. Redis subscriber buffering messages

**Fix:**
- Call `swarmAdapter.clearCache()` periodically
- Implement TTL for swarm/agent data
- Monitor Redis memory usage: `redis-cli info memory`

## Future Enhancements

1. **Message Batching:** Batch multiple Redis events before broadcasting to WebSocket
2. **Event Filtering:** Allow clients to subscribe to specific event types/patterns
3. **Event Replay:** Support historical event replay from EventStore
4. **Compression:** Compress large event payloads before WebSocket broadcast
5. **Rate Limiting:** Implement per-client rate limiting for high-frequency events
6. **Metrics Dashboard:** Real-time visualization of Redis pub/sub metrics

## References

- **CLAUDE.md Critical Rule #19:** ALL agent communication MUST use Redis pub/sub
- **Redis Pub/Sub Documentation:** https://redis.io/docs/interact/pubsub/
- **Redis Node Client:** https://github.com/redis/node-redis
- **Socket.IO Documentation:** https://socket.io/docs/v4/

## Change Log

### 2025-10-21 - Initial Implementation
- Created RedisClientService with auto-reconnect
- Implemented SwarmAdapter Redis pub/sub integration
- Wired to server lifecycle with graceful shutdown
- Added documentation and testing instructions

---

**Status:** ✅ Implementation Complete
**Confidence:** 0.92
**Blockers:** None
**Next Steps:** Manual testing with CLI agents
