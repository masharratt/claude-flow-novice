# Claude Flow Novice — Event Bus Template

---

## Event-Driven Architecture

This template is optimized for **high-throughput event-driven systems** (10,000+ events/sec).

### Event Bus Initialization

```bash
# Initialize event bus with high throughput
/eventbus init --throughput-target 10000 --latency-target 50 --worker-threads 4

# Publish events with routing
/eventbus publish --type agent.lifecycle --data '{"agent": "coder-1", "status": "spawned"}' --strategy weighted

# Subscribe to event patterns
/eventbus subscribe --pattern "agent.*" --handler process-agent-events --batch-size 100
```

### Architecture

- **Throughput**: 10,000+ events/second
- **Latency**: <50ms P95
- **Workers**: 4 worker threads for parallel processing
- **Routing**: Weighted and priority-based routing strategies

### Event Patterns

1. **Agent Lifecycle**: `agent.spawned`, `agent.completed`, `agent.failed`
2. **Task Events**: `task.created`, `task.assigned`, `task.completed`
3. **CFN Loop**: `cfn.loop.phase`, `cfn.loop.consensus`, `cfn.loop.validation`
4. **Fleet Events**: `fleet.scaled`, `fleet.optimized`, `fleet.alert`

---

## Event Bus Configuration

**High-throughput settings:**

```bash
executeSwarm({
  swarmId: "event-driven-swarm",
  objective: "Process real-time events",
  strategy: "development",
  mode: "mesh",
  persistence: true,
  eventBus: {
    enabled: true,
    throughput: 10000,
    latency: 50,
    workers: 4
  }
})
```

---

## Usage Patterns

### 1. Initialize Event Bus

```bash
/eventbus init --throughput-target 10000 --worker-threads 4
```

### 2. Publish Events

```bash
# High-priority event
/eventbus publish --type "task.urgent" --data '{"task_id": "123", "priority": 10}' --priority 10

# Batch events
/eventbus publish --type "metrics.batch" --data '{"metrics": [...]}' --batch
```

### 3. Subscribe to Events

```bash
# Pattern-based subscription
/eventbus subscribe --pattern "agent.lifecycle.*" --handler lifecycle-handler

# Specific event type
/eventbus subscribe --type "task.completed" --handler completion-handler --batch-size 100
```

### 4. Monitor Performance

```bash
# Event bus metrics
/eventbus metrics --timeframe 1h --detailed

# Real-time monitoring
/eventbus monitor --filter "agent.*" --format table
```

---

## Event Handlers

Example event handler structure:

```javascript
// process-agent-events.js
export async function handleAgentEvent(event) {
  const { type, data, timestamp } = event;

  switch (type) {
    case 'agent.spawned':
      await logAgentSpawn(data);
      break;
    case 'agent.completed':
      await recordAgentMetrics(data);
      break;
    case 'agent.failed':
      await triggerRecovery(data);
      break;
  }
}
```

---

## Coordination & Memory

Event bus uses **Redis pub/sub** for message distribution:

```bash
# Redis-backed event coordination
redis-cli publish "eventbus:agent.lifecycle" '{"agent":"coder-1","status":"spawned"}'

# Subscribe to events
redis-cli subscribe "eventbus:*"
```

---

## Performance Optimization

1. **Batch Processing**: Group events for efficiency
2. **Worker Threads**: Parallel event processing
3. **Priority Routing**: Critical events processed first
4. **Backpressure Handling**: Automatic throttling under load

---

## Monitoring & Alerts

```bash
# Event bus health
/eventbus status --detailed

# Alert on high latency
/eventbus monitor --alert-latency 100 --alert-dropped 0.01
```

---

## Best Practices

1. **Use Patterns**: Subscribe to event patterns, not individual types
2. **Batch When Possible**: Reduce overhead with batch processing
3. **Handle Failures**: Implement retry logic in handlers
4. **Monitor Metrics**: Track throughput and latency continuously
5. **Set Priorities**: Use priority routing for critical events

---

For more information, see:
- `/eventbus --help`
- Main CLAUDE.md in project root
