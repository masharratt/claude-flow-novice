# Docker CFN Agent Orchestration (Reference)

Detailed patterns for Docker-based CFN Loop execution. Load when implementing or debugging the coordinator/agent containers. The CLAUDE.md in `docker/` holds the load-when pointers and gotchas; this file holds the code.

Env contract source of truth: `docker/runtime/cfn-runtime.contract.yml`.

## Coordinator Pattern (Option C — Hybrid Iterator)

Self-contained coordinator with an internal iteration loop. Maps to CFN Loop 3 (implement) → Loop 2 (validate `tsc --noEmit`) → Product Owner (ITERATE if errors>0, PROCEED if 0, max 10 iterations).

Coordinator phases (`docker/coordinator/src/coordinator.js`):
1. `analyzeAllErrors()` — `tsc --noEmit` across codebase
2. `buildDependencyGraph()` — imports (directory or AST)
3. `clusterFiles()` — Union-Find connected components
4. `createBatches()` — assign memory tier by cluster size
5. `pushTasksToRedis()` — task queue + metadata
6. `spawnAgents()` — wave-based within memory budget
7. `waitForCompletion()` — passive Redis polling (5s)
8. `cleanupAgents()`
9. Loop until `errors === 0` or max iterations

Agent worker (`docker/agents/agent-worker.js`): atomic RPOP claim → read files → run CLI specialist → write files → `INCR task:completed` → loop until queue empty.

Passive polling chosen over active tracking: simpler, survives coordinator restart, scales to any agent count.

## Wave-Based Spawning

Maximize parallelism while respecting the memory budget.

```javascript
const MEMORY_BUDGET = 40 * 1024 * 1024 * 1024; // 40GB
let batchQueue = [...batches];

while (batchQueue.length > 0) {
  const wave = [];
  let waveMemory = 0;
  while (batchQueue.length > 0) {
    const batchMemory = parseMemory(batchQueue[0].memory);
    if (waveMemory + batchMemory <= MEMORY_BUDGET) {
      wave.push(batchQueue.shift());
      waveMemory += batchMemory;
    } else break; // budget full, next wave
  }
  await Promise.all(wave.map(batch => spawnAgent(batch)));
  await waitForWaveCompletion(wave);
}
```

## Spawning Agent Containers (Dockerode)

```javascript
const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const container = await docker.createContainer({
  Image: 'claude-flow-novice-agent:frontend',
  name: `agent-${batchId}-${Date.now()}`,
  HostConfig: {
    Memory: parseMemory(batch.memory),
    Binds: ['/workspace:/workspace:rw', '${PWD}/.env:/workspace/.env:ro'],
    NetworkMode: 'cfn-network',
    AutoRemove: false // manual cleanup after validation
  },
  Env: [
    'REDIS_HOST=cfn-redis', 'REDIS_PORT=6379',
    `TASK_ID=${batchId}`, `AGENT_ID=agent-${batchId}`,
    `ITERATION=${currentIteration}`
  ],
  Cmd: ['node', '/app/agent-worker.js']
});
await container.start();
```

Agent entrypoint loop (`agent-worker.js`):

```javascript
const redis = Redis.createClient({ host: process.env.REDIS_HOST });
async function main() {
  while (true) {
    const taskId = await redis.rpop('task:queue');
    if (!taskId) process.exit(0);
    const task = await redis.hgetall(`task:${taskId}`);
    const result = await fixTypeScriptErrors(JSON.parse(task.files), task);
    await redis.incr('task:completed');
    await redis.hset(`task:${taskId}:result`, {
      agent_id: process.env.AGENT_ID, status: 'completed',
      files_modified: JSON.stringify(result.filesModified),
      fix_time_seconds: result.duration,
      completed_at: new Date().toISOString()
    });
  }
}
main().catch(err => { console.error('Agent failed:', err); process.exit(1); });
```

## Image Building

Fast path (96% faster, WSL2-safe): `./.claude/skills/docker-build/build.sh [--dockerfile F] [--tag T] [--no-cache]`. Wraps `scripts/docker/build-from-linux.sh`, rsyncs to `/tmp/cfn-build` (Linux native storage) to avoid Windows-mount OOM (exit 137). See `.claude/skills/docker-build/SKILL.md`.

Direct build (small context only): `docker build -f Dockerfile.agent -t claude-flow-novice-agent:latest .`

Language images: `Dockerfile.agent.typescript` → `:frontend`, `Dockerfile.agent.python` → `:python`, `Dockerfile.agent.rust` → `:rust`.

Coordinator Dockerfile: `FROM node:20-slim`, `npm install --production`, mount `/var/run/docker.sock` + `/workspace`, `ENTRYPOINT ["node", "src/coordinator.js"]`. Agent Dockerfile: `FROM node:20-slim`, `npm install -g typescript claude-flow-novice`, `ENTRYPOINT ["node", "agent-worker.js"]`.

## Dependency Clustering

Phase 1 — directory-based (fast, ~80% accuracy): group files by `path.dirname`. Ship this first.

Phase 2 — AST-based (~95%, enhance if accuracy <80%):

```javascript
const ts = require('typescript');
function buildDependencyGraph(files) {
  const graph = new Map();
  for (const file of files) {
    const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest);
    graph.set(file, extractImports(sf));
  }
  return unionFind(graph); // connected components
}
```

## Redis Coordination Schema

```
task:queue      LIST    task_ids
task:total      STRING  total tasks this iteration
task:completed  STRING  completed this iteration
task:<n>        HASH    batch_id, tier, files(JSON), total_errors, memory, coordination_note, iteration
task:<n>:result HASH    agent_id, status, files_modified(JSON), fix_time_seconds, completed_at
```

Coordinator creates tasks (`hset` metadata, `set task:total/completed`, `lpush task:queue`). Agents claim atomically (`rpop task:queue`), report via `incr task:completed` + `hset <id>:result`. Coordinator waits by polling `task:completed` vs `task:total` every 5s.

## Testing

- Full frontend: `tests/docker/intelligent-coordinator-test.sh` — counts `tsc` errors before/after, runs coordinator, reports reduction.
- Batch reference: `tests/docker/b10-typescript-fix-test.sh` — 32 agents, 376MB peak/agent.
- Validate: pre (count errors, images exist, Redis up, mount ok), during (logs, memory, agent count, queue progress), post (final errors, cleanup, failures).

## Troubleshooting

| Issue | Diagnosis | Fix |
|-------|-----------|-----|
| OOM build (exit 137) | large context on Windows mount | use docker-build skill |
| Agents not claiming | `docker exec cfn-redis redis-cli LLEN task:queue`; ping cfn-redis | verify `--network cfn-network`, Redis up, `REDIS_HOST` |
| Coordinator OOM | `docker stats cfn-coordinator` | `--memory=4g`, smaller batches |
| Agents hang | `docker logs <agent>` | raise timeout, reduce tier memory, check infinite loops |
| Too many iterations | check clustering accuracy/fix quality | switch to AST clustering, adjust tiers, more agent memory |

Monitor: `docker logs -f cfn-coordinator`, `docker stats`, `redis-cli GET task:completed/total`.
Cleanup: `docker ps -a --filter name=agent- -q | xargs docker rm -f`, `docker exec cfn-redis redis-cli FLUSHALL`.
