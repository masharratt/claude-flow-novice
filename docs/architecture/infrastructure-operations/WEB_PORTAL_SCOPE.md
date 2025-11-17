# Web Portal Scope and Multi-Session Support

## Current Status (v2.0.0)

### What the Portal Currently Captures

**❌ Current Implementation (Simple HTTP Server)**
The basic portal created in v2.0.0 is a **static dashboard only**:
- Shows portal health and uptime
- Provides API endpoints for status checks
- **Does NOT capture any swarm activity yet**
- No Redis integration implemented

### Answer to Your Questions

#### Q1: Does the portal capture swarms running in other sessions?

**Short Answer**: No (current implementation), but **YES - it SHOULD and CAN** (with Redis integration).

**Why It Should Work Across Sessions**:

Your project uses **Redis as a centralized coordination layer** with task-scoped keys:
```bash
# Redis stores ALL coordination data with task-scoped keys
swarm:{task_id}:{agent_id}:wake
swarm:{task_id}:metrics:retry_count
swarm:agent_status:{task_id}:{agent_id}
```

**Key Architecture Points**:
1. **Redis is centralized**: Single Redis instance on localhost (127.0.0.1:6379)
2. **Task-scoped isolation**: Each swarm execution has unique `task_id`
3. **Cross-session visibility**: Redis keys are accessible from ANY process
4. **Portal runs as single instance**: One portal per machine (port 3456)

**What This Means**:
- ✅ Portal CAN see all swarms (same repo, different sessions)
- ✅ Portal CAN see all swarms (different repos on same computer)
- ✅ Portal CAN aggregate metrics across all task_ids
- ⚠️ **BUT**: Current v2.0.0 implementation doesn't connect to Redis yet

#### Q2: How about swarms in different repos on the same computer?

**Short Answer**: **YES - they would all be visible** (once Redis integration is added).

**Why Cross-Repo Works**:

All Claude Flow Novice instances on the same machine share:
1. **Same Redis instance**: Default connection to `redis://localhost:6379`
2. **Same key namespace**: All use `swarm:*` prefix
3. **Same portal instance**: Single portal on port 3456

**Example Scenario**:
```
Machine: Your Computer
├── Redis (localhost:6379) - Shared coordination layer
│   ├── swarm:project-a-task-123:* (from repo A)
│   ├── swarm:project-b-task-456:* (from repo B)
│   └── swarm:project-c-task-789:* (from repo C)
└── Portal (localhost:3456) - Single monitoring instance
    └── Displays ALL tasks from all repos
```

**Current Evidence from Your Redis**:
```bash
# You already have multiple task contexts in Redis:
swarm:test-metrics-phase7-1760900946:*    # One execution
swarm:redis-phase7-1760900252:*           # Another execution
swarm:readme-update-v2:*                  # Different task
```

---

## Implementation Roadmap

### Phase 1: Basic Redis Integration (Next Step)

**Goal**: Connect portal to Redis to display live swarm activity

**Implementation**:
```javascript
// Add to simple-portal-server.cjs
const redis = require('redis');
const client = redis.createClient({
  url: 'redis://localhost:6379'
});

// API endpoint to list all active tasks
app.get('/api/swarms/active', async (req, res) => {
  const keys = await client.keys('swarm:*:metadata');
  const tasks = [];

  for (const key of keys) {
    const taskId = key.split(':')[1];
    const metadata = await client.get(key);
    tasks.push({ taskId, metadata: JSON.parse(metadata) });
  }

  res.json({ tasks, count: tasks.length });
});

// API endpoint to get task details
app.get('/api/swarms/:taskId', async (req, res) => {
  const { taskId } = req.params;
  const agents = await client.keys(`swarm:${taskId}:*:done`);
  const metrics = await client.hgetall(`swarm:${taskId}:metrics`);

  res.json({ taskId, agents, metrics });
});
```

**What This Enables**:
- ✅ See all active swarms (any repo, any session)
- ✅ View agent completion status per task
- ✅ Access coordination metrics (consensus, retries)
- ✅ Monitor heartbeats and agent health

### Phase 2: Real-Time Updates (WebSocket)

**Goal**: Stream Redis pub/sub events to browser

**Implementation**:
```javascript
// Add WebSocket support
const { Server } = require('socket.io');
const io = new Server(httpServer);

// Subscribe to Redis pub/sub
const subscriber = redis.createClient();
await subscriber.pSubscribe('swarm:*:events', (message, channel) => {
  // Broadcast to all connected browsers
  io.emit('swarm-event', {
    channel,
    message: JSON.parse(message),
    timestamp: Date.now()
  });
});
```

**What This Enables**:
- ✅ Live agent spawning notifications
- ✅ Real-time consensus updates
- ✅ CFN Loop iteration progress
- ✅ Automatic refresh (no page reload)

### Phase 3: Cross-Repo Filtering

**Goal**: Filter and organize swarms by repository

**Implementation**:
```javascript
// Detect repository from task metadata
app.get('/api/swarms/by-repo', async (req, res) => {
  const allTasks = await getAllTasks();
  const grouped = {};

  for (const task of allTasks) {
    const repoPath = task.metadata.cwd || 'unknown';
    const repoName = path.basename(repoPath);

    if (!grouped[repoName]) grouped[repoName] = [];
    grouped[repoName].push(task);
  }

  res.json({ repositories: grouped });
});
```

**What This Enables**:
- ✅ Filter swarms by repository
- ✅ Compare costs across projects
- ✅ Multi-project dashboard view
- ✅ Per-repo analytics

---

## Scope Boundaries

### What Portal CAN Monitor (Same Machine)

| Scenario | Visible? | Why |
|----------|----------|-----|
| Same repo, different Claude Code sessions | ✅ YES | Shared Redis, same namespace |
| Different repos, same computer | ✅ YES | Shared Redis instance |
| Multiple users, same computer | ✅ YES | Redis is per-machine, not per-user |
| Same repo, different branches | ✅ YES | Task isolation by task_id, not branch |

### What Portal CANNOT Monitor

| Scenario | Visible? | Why |
|----------|----------|-----|
| Different computers | ❌ NO | Redis is localhost-only (not networked) |
| Remote servers | ❌ NO | Need Redis network configuration |
| Docker containers (default) | ❌ NO | Isolated network namespace |

### Making Portal Work Across Machines (Advanced)

**Option 1: Redis Network Mode**
```bash
# On machine A (Redis server)
redis-server --bind 0.0.0.0 --protected-mode no --port 6379

# On machine B (client)
export REDIS_URL=redis://machine-a-ip:6379
npm run portal:start
```

**Option 2: Redis Sentinel (Production)**
```bash
# High availability with automatic failover
redis-sentinel /etc/redis/sentinel.conf
```

**Security Warning**:
⚠️ Exposing Redis to network requires authentication:
```bash
redis-server --requirepass YOUR_STRONG_PASSWORD
```

---

## Current Redis Activity on Your Machine

Based on the keys I queried, you have:

```bash
# Active task contexts:
1. test-metrics-phase7-1760900946
2. redis-phase7-1760900252
3. redis-phase7-metrics
4. readme-update-v2

# Agent completion tracking:
- architect-6, architect-7
- backend-dev-14, backend-dev-15
- devops-engineer-3, devops-engineer-4
- reviewer (multiple contexts)

# Metrics being tracked:
- retry_count
- iteration_duration
- agent_latency
- loop3_consensus
```

**This proves**: Your Redis instance is already capturing coordination data from multiple executions. The portal just needs to **read and display** this existing data.

---

## Quick Start: Add Redis Integration

Want to enable cross-session/cross-repo monitoring? Here's the minimal change:

```javascript
// Add to scripts/simple-portal-server.cjs

const redis = require('redis');
const client = redis.createClient();

// Connect to Redis
client.connect().catch(err => {
  console.warn('⚠️  Redis not available, portal will show limited data');
});

// Add new endpoint
async function handleRequest(req, res) {
  if (req.url === '/api/swarms') {
    try {
      const keys = await client.keys('swarm:*:metadata');
      const tasks = await Promise.all(
        keys.map(async key => ({
          taskId: key.split(':')[1],
          metadata: await client.get(key)
        }))
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ tasks }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Redis unavailable' }));
    }
    return;
  }
  // ... rest of handler
}
```

**Test it**:
```bash
# Restart portal with Redis
npm run portal:restart

# Check active swarms
curl http://localhost:3456/api/swarms
```

---

## Recommendations

### For Immediate Use

1. **Keep current portal** - It provides session auto-start and basic health checks
2. **Plan Redis integration** - Use epic from `planning/completed/cli-hybrid-routing/web-portal-integration-epic.json`
3. **Test cross-session** - Run swarms in two Claude Code sessions, verify Redis keys overlap

### For Production

1. **Enable Redis integration** (Phase 1 from roadmap above)
2. **Add authentication** - Secure Redis and portal with passwords
3. **Add repo filtering** - Group swarms by repository in UI
4. **Monitor Redis memory** - Set TTL on coordination keys (currently 7 days)

### For Multi-Machine

1. **Configure Redis networking** - Use sentinel for HA
2. **Deploy portal centrally** - One portal per team, not per machine
3. **Use task metadata** - Capture repo path, machine hostname, user

---

## Summary

**Current State**:
- Portal auto-starts ✅
- Redis coordination active ✅
- Portal-Redis integration ❌ (not yet implemented)

**Cross-Session/Cross-Repo Support**:
- **Architecture supports it** ✅
- **Redis already captures data** ✅
- **Portal needs connection code** ⚠️ (next step)

**Your Questions Answered**:
1. **Other sessions**: YES - visible (with Redis integration)
2. **Other repos**: YES - visible (with Redis integration)
3. **Same computer only** - YES (unless Redis is networked)

Next step: Add Redis client to portal server and create `/api/swarms` endpoint.
