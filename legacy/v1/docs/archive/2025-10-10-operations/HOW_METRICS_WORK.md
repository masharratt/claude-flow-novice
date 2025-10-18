# How Metrics Work - Plain English Explanation

## The Increment Function - When It's Triggered

### In Plain English:

**The `incrementMetric()` function is triggered whenever YOU write code that calls it.**

It's like a counter you press - nothing happens until you press the button.

### Example Flow:

```typescript
// 1. You write this line in your code:
incrementMetric('api.requests');

// 2. This triggers the function
// 3. The function adds 1 to the counter
// 4. The counter is saved to SQLite database
// 5. Done - metric is now stored permanently
```

## Complete Journey of a Metric

### Step 1: You Trigger It

```typescript
// Somewhere in your code, YOU write:
import { incrementMetric } from './src/observability/metrics-counter.js';

incrementMetric('user.login');
```

**When this runs**: The moment that line of code executes.

### Step 2: Metric Counter Function Runs

The function does 3 things:

1. **Gets the telemetry system** (global singleton)
2. **Calls `recordCounter()`** with your metric name
3. **Returns immediately** (doesn't block your code)

### Step 3: Telemetry System Stores It

The telemetry system does 2 things in parallel:

1. **Memory storage**: Adds metric to in-memory Map
   - Fast (microseconds)
   - Lost on restart
   - Used for real-time queries

2. **SQLite storage**: Writes to database file
   - Slower (milliseconds)
   - **Persists across restarts** ✅
   - Used for historical analysis

```
Your Code
    ↓
incrementMetric('api.requests')
    ↓
metrics-counter.ts → recordCounter()
    ↓
telemetry.ts → storeMetric()
    ├→ Memory: this.metrics.set(name, metric)  [temporary]
    └→ SQLite: this.storage.store(metric)       [permanent]
```

## Where Metrics Are Stored

### Storage Location 1: Memory (RAM)

```typescript
// In telemetry.ts, line 102
private metrics: Map<string, MetricPoint[]> = new Map();
```

- **Type**: JavaScript Map object
- **Lifetime**: Lost when process exits
- **Speed**: Super fast (microseconds)
- **Limit**: 1000 metrics per name
- **Purpose**: Real-time queries in current session

### Storage Location 2: SQLite Database (Disk)

```
File: .claude-flow/metrics.db
```

- **Type**: SQLite database file on disk
- **Lifetime**: Permanent (survives restarts) ✅
- **Speed**: Fast (milliseconds)
- **Limit**: Unlimited (disk space)
- **Purpose**: Historical analysis, cross-process queries

## When Does It Actually Write to Disk?

**Immediately** - every time you call `incrementMetric()`.

```typescript
// In telemetry.ts, storeMetric() function:
private storeMetric(name: string, metric: MetricPoint): void {
  // 1. Store in memory
  this.metrics.get(name).push(metric);

  // 2. Store to SQLite (IMMEDIATELY)
  if (this.config.enablePersistence && this.storage) {
    this.storage.store(metric);  // ← Writes to disk RIGHT NOW
  }
}
```

**No buffering** - each metric writes immediately.

## Real-World Example

### Scenario: Tracking Provider Routing

```typescript
// In tiered-router.ts (line 165)
async selectProvider(agentType: string): Promise<LLMProvider> {
  const provider = this.determineProvider(agentType);

  // ← This line triggers the metric
  trackProviderRouting(
    provider,           // 'custom' (Z.ai) or 'anthropic'
    tierName,          // 'Tier 2: Z.ai'
    agentType,         // 'coder'
    'fallback'         // routing source
  );

  return provider;
}
```

**What happens when this code runs:**

1. **Moment of execution**: When `selectProvider()` is called
2. **Function triggered**: `trackProviderRouting()` runs
3. **Counter incremented**: Calls `incrementMetric('provider.request', 1, {...tags})`
4. **Telemetry stores it**:
   - Memory: Added to Map (instant)
   - SQLite: Written to `.claude-flow/metrics.db` (instant)
5. **Metric is now permanent**: Even if process crashes, it's saved

### Timeline:

```
10:30:15.123 - selectProvider('coder') called
10:30:15.124 - trackProviderRouting() executes
10:30:15.125 - incrementMetric() writes to SQLite
10:30:15.126 - Function returns, code continues
                ↓
              METRIC IS NOW IN DATABASE FOREVER
```

## Querying Metrics

### From Memory (current session only):

```typescript
import { getMetricValue } from './src/observability/metrics-counter.js';

const count = getMetricValue('user.login');
// Returns: count from THIS session only
```

### From SQLite (all time):

```typescript
import { getGlobalMetricsStorage } from './src/observability/metrics-storage.js';

const storage = getGlobalMetricsStorage();
const totalCount = storage.getCounterTotal('user.login');
// Returns: count from ALL sessions (across restarts)
```

## Database Structure

```sql
CREATE TABLE metrics (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,              -- 'provider.request'
  value REAL NOT NULL,             -- 1
  type TEXT NOT NULL,              -- 'counter'
  timestamp TEXT NOT NULL,         -- '2025-10-04T03:43:47.370Z'
  tags TEXT NOT NULL,              -- '{"provider":"custom","tier":"Tier 2"}'
  created_at DATETIME DEFAULT NOW
);
```

**Example row:**
```
id: 1
name: provider.request
value: 1
type: counter
timestamp: 2025-10-04T03:43:47.370Z
tags: {"provider":"custom","tier":"Tier 2: Z.ai","agentType":"coder"}
```

## Persistence Proof

**Run this 3 times:**
```bash
npx tsx examples/persistent-metrics-demo.ts
```

**First run:**
```
Total demo runs: 1
Total metrics stored: 5
```

**Second run:**
```
Total demo runs: 2  ← Counter survived restart!
Total metrics stored: 10
```

**Third run:**
```
Total demo runs: 3  ← Still there!
Total metrics stored: 15
```

**Check database directly:**
```bash
sqlite3 .claude-flow/metrics.db "SELECT COUNT(*) FROM metrics;"
# Returns: 15
```

## Common Use Cases

### 1. Track Every API Request

```typescript
// In your API handler
app.get('/api/users', async (req, res) => {
  const start = Date.now();

  incrementMetric('api.requests', 1, {
    endpoint: '/users',
    method: 'GET'
  });

  // ... handle request

  recordTiming('api.duration', Date.now() - start, {
    endpoint: '/users'
  });

  res.json(users);
});
```

**Triggered**: Every time `/api/users` is called
**Stored**: Immediately to SQLite
**Query later**: "How many requests did /api/users get this month?"

### 2. Track Agent Spawns

```typescript
// When spawning an agent
async function spawnAgent(type: string) {
  trackAgentSpawn(type, swarmId, 'mesh');  // ← Metric triggered HERE

  const agent = await createAgent(type);
  return agent;
}
```

**Triggered**: Every time `spawnAgent()` is called
**Stored**: Metric saved with tags (agentType, swarmId, topology)
**Query later**: "How many coder agents were spawned this week?"

### 3. Track Provider Routing (Already Implemented!)

```typescript
// In tiered-router.ts (already done)
async selectProvider(agentType: string) {
  const provider = determineProvider(agentType);

  trackProviderRouting(provider, tier, agentType, source);  // ← HERE

  return provider;
}
```

**Triggered**: Every time an agent selects a provider
**Stored**: With tags (provider, tier, agentType, source)
**Query later**: "What % of requests went to Z.ai vs Anthropic?"

## Key Takeaways

1. **You control when metrics are triggered** - they only run when your code calls them
2. **Metrics save immediately** - no buffering, no delays
3. **Metrics persist forever** - stored in SQLite on disk
4. **Works across processes** - any process can query the database
5. **Survives restarts** - metrics never lost

## Mental Model

Think of it like a notebook:

- **incrementMetric()** = Writing a tally mark in your notebook
- **SQLite database** = The notebook itself (permanent record)
- **Memory Map** = Your short-term memory (fast but temporary)
- **Query functions** = Reading your notebook entries

Every time you call `incrementMetric()`, you're adding a permanent entry to the notebook that never goes away.
