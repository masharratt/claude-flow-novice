# Metrics Counter API - Usage Guide

Simple API for tracking metrics with minimal code.

## Quick Start

```typescript
import { incrementMetric, recordGauge, trackProviderRouting } from './src/observability/metrics-counter.js';

// Count something
incrementMetric('user.signup');

// Track with context
incrementMetric('api.requests', 1, {
  endpoint: '/users',
  method: 'POST',
  status: '201'
});

// Record current value
recordGauge('queue.size', 42);

// Track provider routing
trackProviderRouting('custom', 'Tier 2: Z.ai', 'coder', 'fallback');
```

## Core Functions

### `incrementMetric(name, value?, tags?)`

Increment a counter by 1 (or custom value).

```typescript
// Simple increment
incrementMetric('page.views');

// Custom increment
incrementMetric('bytes.sent', 1024);

// With tags
incrementMetric('button.clicks', 1, {
  buttonId: 'submit',
  page: 'checkout'
});
```

### `recordGauge(name, value, tags?)`

Record a point-in-time measurement.

```typescript
// Current queue depth
recordGauge('queue.depth', 42);

// Memory usage
recordGauge('memory.usage', process.memoryUsage().heapUsed, {
  unit: 'bytes',
  process: 'worker-1'
});
```

### `recordTiming(name, durationMs, tags?)`

Record a duration/latency.

```typescript
const start = Date.now();
await doWork();
recordTiming('task.duration', Date.now() - start, {
  taskType: 'export'
});
```

### `measureExecution(name, fn, tags?)`

Automatically measure async function execution time.

```typescript
const result = await measureExecution('api.fetch', async () => {
  return await fetch('https://api.example.com/data');
}, { endpoint: '/data' });
// Automatically records timing with success/error status
```

## Pre-built Domain Trackers

### Provider Routing

```typescript
import { trackProviderRouting } from './src/observability/metrics-counter.js';

trackProviderRouting(
  'custom',              // provider: 'custom' (Z.ai) or 'anthropic'
  'Tier 2: Z.ai',       // tier name
  'coder',              // agent type
  'fallback'            // routing source
);
```

### Agent Lifecycle

```typescript
import { trackAgentSpawn, trackAgentCompletion } from './src/observability/metrics-counter.js';

// Track spawn
trackAgentSpawn('coder', 'swarm-123', 'mesh');

// Track completion
const start = Date.now();
const success = await runAgent();
trackAgentCompletion('coder', success, Date.now() - start);
```

### API Calls

```typescript
import { trackAPICall } from './src/observability/metrics-counter.js';

trackAPICall(
  '/api/users',    // endpoint
  'GET',          // method
  200,            // status code
  45              // duration in ms
);
```

### Errors

```typescript
import { trackError } from './src/observability/metrics-counter.js';

try {
  await riskyOperation();
} catch (error) {
  trackError(
    'DatabaseConnectionError',  // error type
    'user-service',            // component
    'critical'                 // severity: low|medium|high|critical
  );
  throw error;
}
```

### Subscription Usage

```typescript
import { trackSubscriptionUsage } from './src/observability/metrics-counter.js';

trackSubscriptionUsage(
  45,    // used
  100,   // limit
  55     // remaining
);
```

## Querying Metrics

### Get Total Count

```typescript
import { getMetricValue } from './src/observability/metrics-counter.js';

const loginCount = getMetricValue('user.login');
console.log(`Total logins: ${loginCount}`);
```

### Get Breakdown by Tag

```typescript
import { getMetricBreakdown } from './src/observability/metrics-counter.js';

const breakdown = getMetricBreakdown('provider.request', 'provider');
// Returns: { custom: 50, anthropic: 25 }

Object.entries(breakdown).forEach(([provider, count]) => {
  console.log(`${provider}: ${count} requests`);
});
```

## Integration Examples

### Track Provider Routing in Router

```typescript
// In src/providers/tiered-router.ts
import { trackProviderRouting } from '../observability/metrics-counter.js';

async selectProvider(agentType: string): Promise<LLMProvider> {
  const provider = this.determineProvider(agentType);

  // Track the routing decision
  trackProviderRouting(
    provider,
    this.getTierName(provider),
    agentType,
    'tier-config'
  );

  return provider;
}
```

### Track Swarm Operations

```typescript
// In swarm coordinator
import { trackSwarmOperation } from '../observability/metrics-counter.js';

async initializeSwarm(topology: string, maxAgents: number) {
  trackSwarmOperation('init', topology, maxAgents);

  // ... swarm initialization

  return swarmId;
}
```

### Track CLI Commands

```typescript
// In CLI command handler
import { incrementMetric, recordTiming } from '../observability/metrics-counter.js';

async function handleCommand(cmd: string) {
  const start = Date.now();

  incrementMetric('cli.commands', 1, { command: cmd });

  try {
    await executeCommand(cmd);
    recordTiming('cli.duration', Date.now() - start, {
      command: cmd,
      status: 'success'
    });
  } catch (error) {
    recordTiming('cli.duration', Date.now() - start, {
      command: cmd,
      status: 'error'
    });
    throw error;
  }
}
```

## Real-World Usage Pattern

```typescript
// Example: Track a complete agent workflow
import {
  trackAgentSpawn,
  trackAgentCompletion,
  trackProviderRouting,
  measureExecution,
  trackError
} from './src/observability/metrics-counter.js';

async function runAgentWorkflow(agentType: string, task: string) {
  const swarmId = 'swarm-123';
  const start = Date.now();

  // 1. Track spawn
  trackAgentSpawn(agentType, swarmId, 'mesh');

  // 2. Track routing decision
  trackProviderRouting('custom', 'Tier 2: Z.ai', agentType, 'fallback');

  try {
    // 3. Measure task execution
    const result = await measureExecution('agent.task', async () => {
      return await executeTask(task);
    }, { agentType, taskType: 'implementation' });

    // 4. Track successful completion
    trackAgentCompletion(agentType, true, Date.now() - start);

    return result;

  } catch (error) {
    // 5. Track error
    trackError('TaskExecutionError', 'agent-runtime', 'high');

    // 6. Track failed completion
    trackAgentCompletion(agentType, false, Date.now() - start);

    throw error;
  }
}
```

## Viewing Metrics

### Via Code

```typescript
import { getMetricValue, getMetricBreakdown } from './src/observability/metrics-counter.js';

// Get total count
console.log('Total requests:', getMetricValue('provider.request'));

// Get breakdown
const providerStats = getMetricBreakdown('provider.request', 'provider');
console.log('By provider:', providerStats);

const tierStats = getMetricBreakdown('provider.request', 'tier');
console.log('By tier:', tierStats);
```

### Via Demo Script

```bash
# Run the demo to see all features
npx tsx examples/metrics-counter-demo.ts

# Or check routing stats
node scripts/check-routing-stats.cjs
```

## Best Practices

1. **Use Consistent Naming**: Use dot-notation for hierarchical metrics
   - ✅ `api.requests`, `api.errors`, `api.latency`
   - ❌ `apiRequests`, `api_errors`, `APILatency`

2. **Add Meaningful Tags**: Include context that helps with debugging
   - ✅ `{ endpoint: '/users', method: 'POST', status: '201' }`
   - ❌ `{ e: '/users', m: 'P' }`

3. **Track Both Success and Failure**: Don't just count successes
   ```typescript
   trackAgentCompletion(agentType, success, duration);
   // status tag automatically added: success/failure
   ```

4. **Use Pre-built Trackers**: They ensure consistent tagging
   ```typescript
   // ✅ Use pre-built tracker
   trackProviderRouting(provider, tier, agentType, source);

   // ❌ Don't manually increment with inconsistent tags
   incrementMetric('provider', 1, { p: provider });
   ```

5. **Measure Critical Paths**: Track timing for performance analysis
   ```typescript
   const result = await measureExecution('critical.operation', async () => {
     return await criticalWork();
   }, { component: 'payment-processor' });
   ```

## Metrics Reference

### Standard Metrics

| Metric Name | Type | Tags | Description |
|-------------|------|------|-------------|
| `provider.request` | Counter | provider, tier, agentType, source | Provider routing decisions |
| `agent.spawned` | Counter | agentType, swarmId, topology | Agent spawns |
| `agent.completed` | Counter | agentType, status | Agent completions |
| `agent.duration` | Timer | agentType, status | Agent execution time |
| `task.orchestrated` | Counter | taskType, strategy | Task orchestration events |
| `swarm.operation` | Counter | operation, topology | Swarm lifecycle operations |
| `api.requests` | Counter | endpoint, method, status | API call tracking |
| `api.duration` | Timer | endpoint, method | API latency |
| `errors.count` | Counter | errorType, component, severity | Error tracking |
| `subscription.usage` | Gauge | limit, remaining, utilizationPct | Subscription quota |

## See Also

- [Telemetry System Documentation](../src/observability/telemetry.ts)
- [Provider Routing Guide](../wiki/Provider-Routing.md)
- [Cost Optimization](../wiki/Cost-Optimization.md)
