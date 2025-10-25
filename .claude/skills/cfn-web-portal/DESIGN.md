# Web Portal Skills Wrapper: Design Specification

## Architecture Overview

### WebSocket Coordination Patterns
- Core Implementation: Redis pub/sub with Socket.IO
- Event Types: 
  * agent_update
  * metrics_update
  * event_stream
  * connection_status

### API Endpoints
1. Authentication
   - `/api/auth/login`
   - `/api/auth/logout`
   - `/api/auth/refresh`

2. Metrics
   - `/api/metrics/current`
   - `/api/metrics/historical`

3. Agents
   - `/api/agents/status`
   - `/api/agents/hierarchy`

4. Events
   - `/api/events/stream`
   - `/api/events/timeline`

## Skill Wrapper Interface Scripts

### 1. `invoke-portal-start.sh`
- Lifecycle management for web portal server
- Redis-coordinated startup sequence
- Health check integration

### 2. `invoke-portal-metrics.sh`
- Retrieve current and historical metrics
- Aggregate metrics from multiple sources
- Store metrics in SQLite memory with project-level ACL

### 3. `invoke-portal-dashboard.sh`
- Fetch dashboard data
- WebSocket coordination for real-time updates
- Implement filtering and data transformation

### 4. `invoke-portal-agents.sh`
- Agent status retrieval
- Hierarchical agent state management
- Confidence and performance tracking

### 5. `invoke-portal-events.sh`
- Event timeline generation
- Filter and aggregate events
- Support for historical and real-time event streams

### 6. `invoke-portal-stop.sh`
- Graceful server shutdown
- Clear WebSocket connections
- Store final metrics and state

## Security Considerations
- Use project-level SQLite memory ACL
- Implement rate limiting
- WebSocket authentication
- Secure event filtering
- Payload size validation

## Performance Optimizations
- Compression for large payloads
- Efficient Redis pub/sub patterns
- Minimal API call overhead
- Caching strategies for frequently accessed data

## Test Suite Structure
- 8 comprehensive test scripts
- Cover each invoke script
- Validate coordination mechanisms
- Performance and security testing

## Redis Coordination Channels
- `web-portal:metrics`
- `web-portal:agents`
- `web-portal:events`
- `web-portal:lifecycle`

## Confidence Scoring Mechanism
\`\`\`typescript
interface PortalSkillConfidence {
  overall: number;  // 0.0 - 1.0
  metrics: number;
  agents: number;
  events: number;
  performance: number;
}
\`\`\`

## Metrics Collection Strategy
- 5-minute rolling window
- Per-agent and aggregate metrics
- Confidence-based data validation

## Error Handling
- Graceful degradation
- Retry mechanisms
- Detailed error logging
- Fallback data strategies

## Integrations
- Slash command `/launch-web-dashboard`
- CFN Loop validation hooks
- Swarm coordination primitives

---

Confidence Score: 0.87
