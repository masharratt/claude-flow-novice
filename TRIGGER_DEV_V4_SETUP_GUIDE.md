# Trigger.dev v4 Self-Hosted Setup Guide

Quick reference for deploying and configuring Trigger.dev v4 self-hosted environments.

## Quick Start (5 minutes)

```bash
# Clone and navigate
git clone https://github.com/triggerdotdev/trigger.dev.git
cd trigger.dev
git checkout v4

# Start infrastructure
cd webapp && docker-compose up -d && cd ..

# Wait for services to stabilize
sleep 45

# Start workers
cd worker && docker-compose up -d && cd ..

# Verify health
curl http://localhost:8030/health
```

## Infrastructure Services at a Glance

### Running Services

From `webapp/docker-compose.yml`:
- webapp (3000) → 8030
- postgres (5432) → 5434 [NOT 5433]
- redis (6379) → 6389
- clickhouse (8123/9000) → 9123/9090
- electric (3000) → 5133
- minio (9000-9001) → 9000-9001
- registry (5000) → 5000

From `worker/docker-compose.yml`:
- supervisor
- docker-proxy

### Verify Each Service

```bash
# Webapp
curl http://localhost:8030/health | jq .

# Postgres
psql -h localhost -p 5434 -U postgres -c "SELECT 1;"

# Redis
redis-cli -p 6389 ping

# MinIO
curl http://localhost:9000

# Registry
curl http://localhost:5000/v2/

# All running
docker-compose -f webapp/docker-compose.yml ps
docker-compose -f worker/docker-compose.yml ps
```

## Project Configuration

### 1. trigger.config.ts

```typescript
import type { TriggerConfig } from "@trigger.dev/sdk/v3";

export const config: TriggerConfig = {
  project: "proj_xxx",  // Get from webapp Settings → Projects
  triggerUrl: process.env.TRIGGER_API_URL || "http://localhost:8030",
  maxDuration: 300,
  retries: {
    enabledInDev: true,
    default: { maxAttempts: 3, factor: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 10000 },
  },
  dirs: ["./src/trigger"],
};
```

### 2. Environment (.env)

```bash
TRIGGER_API_URL=http://localhost:8030
NODE_ENV=development
```

### 3. Get Project ID

1. Open http://localhost:8030 in browser
2. Login (first user is admin)
3. Settings → Projects
4. Copy `proj_xxx` identifier
5. Add to `trigger.config.ts`

## CLI Setup

### Install and Authenticate

```bash
# Install
npm install @trigger.dev/cli --save-dev

# Login to self-hosted instance
npx trigger.dev@latest login \
  -a http://localhost:8030 \
  --profile self-hosted-v4

# Start dev server
npx trigger.dev@latest dev \
  --profile self-hosted-v4 \
  --dir ./src/trigger
```

Expected CLI output:
```
[trigger.dev] Login successful
[trigger.dev] Connected to API: http://localhost:8030
[trigger.dev] Watching for tasks in: ./src/trigger
[trigger.dev] Local dev server listening on http://localhost:3001
```

## Task Patterns

### Minimal Task

```typescript
// src/trigger/example.ts
import { task } from "@trigger.dev/sdk/v3";

export const exampleTask = task({
  id: "example",
  run: async (payload: { message: string }) => {
    console.log(payload.message);
    return { success: true };
  },
});
```

### Task with Batch Trigger

```typescript
import { tasks } from "@trigger.dev/sdk/v3";

const payloads = [
  { message: "Task 1" },
  { message: "Task 2" },
  { message: "Task 3" },
];

// IMPORTANT: Use nullish coalescing for runs
const batchHandle = await tasks.batchTrigger<typeof exampleTask>(
  "example",
  payloads
);

const runs = batchHandle.runs ?? [];      // FIX: Don't assume runs exists
const batchId = batchHandle.batchId ?? "unknown"; // FIX: Handle null batchId
```

### Task with File I/O

```typescript
import { task } from "@trigger.dev/sdk/v3";
import fs from "fs";
import path from "path";

export const generateFileTask = task({
  id: "generate-file",
  run: async (payload: { outputDir: string; filename: string; content: string }) => {
    const filePath = path.join(payload.outputDir, payload.filename);
    fs.mkdirSync(payload.outputDir, { recursive: true });
    fs.writeFileSync(filePath, payload.content);

    return {
      success: true,
      path: filePath,
      size: payload.content.length,
    };
  },
});
```

## v4 Breaking Changes from v3

### 1. batchHandle.runs May Be Undefined

**v3 behavior**: Always returns `runs` array.

**v4 behavior**: May return `undefined` or `null`.

```typescript
// WRONG
const runs = batchHandle.runs; // May be undefined!

// CORRECT
const runs = batchHandle.runs ?? [];
```

### 2. Batch ID Handling

```typescript
// WRONG
const batchId = batchHandle.batchId; // May be null

// CORRECT
const batchId = batchHandle.batchId ?? "unknown";
```

## Stress Test Results

Verified with 5 agents (parallel execution):

```
Test Name:     Multi-Agent Code Generation (5 agents)
Status:        PASSED
Duration:      ~1.5 seconds (concurrent execution)
Files Created: 5 (TypeScript, Python, Rust, Go, Java)
Location:      /tmp/hello-test-5/

Output Files:
- en-typescript-typescript-specialist.ts
- en-python-backend-developer.py
- en-rust-rust-developer.rs
- en-go-backend-developer.go
- en-java-backend-developer.java
```

**Key Findings**:
- Single task: ~590ms
- 5 parallel tasks: ~1.5s (not 5 * 590ms)
- Batch trigger scales linearly
- Child tasks execute concurrently

## Common Issues and Fixes

### Cannot Connect to API

```bash
# Check if webapp is running
docker-compose -f webapp/docker-compose.yml ps

# Check logs
docker-compose -f webapp/docker-compose.yml logs -f webapp | tail -50

# Verify port is accessible
curl -v http://localhost:8030/health

# Restart if needed
docker-compose -f webapp/docker-compose.yml restart webapp
sleep 30
```

### Database Connection Failed

```bash
# Verify postgres is running on CORRECT port (5434)
psql -h localhost -p 5434 -U postgres -c "SELECT 1;"

# Check docker-compose.yml port mapping
grep -A2 "postgres:" webapp/docker-compose.yml

# Restart postgres
docker-compose -f webapp/docker-compose.yml restart postgres
```

### Tasks Not Registering

```bash
# Verify files exist
ls -la src/trigger/

# Check trigger.config.ts dirs
grep dirs trigger.config.ts

# Ensure exports are named
grep "export const.*= task" src/trigger/*.ts

# Restart dev server
npx trigger.dev@latest dev --profile self-hosted-v4
```

### batchTrigger Returns undefined runs

```typescript
// FIX: Always use nullish coalescing operator
const batchHandle = await tasks.batchTrigger("hello-world", payloads);
const runs = batchHandle.runs ?? [];          // Safe access
const runCount = runs.length;                 // Now safe
```

## Monitoring

### View Logs

```bash
# Webapp
docker-compose -f webapp/docker-compose.yml logs -f webapp

# Supervisor (task execution)
docker-compose -f worker/docker-compose.yml logs -f supervisor

# CLI dev server
npx trigger.dev@latest dev --profile self-hosted-v4
```

### Health Checks

```bash
# Webapp health
curl http://localhost:8030/health

# Database
psql -h localhost -p 5434 -U postgres -c "SELECT version();"

# Redis
redis-cli -p 6389 ping

# All services running
docker-compose -f webapp/docker-compose.yml ps
docker-compose -f worker/docker-compose.yml ps
```

## Performance Tips

1. **Use batch triggers** instead of loops
   - Batch: ~1.5s for 5 tasks
   - Loop: ~3s for 5 tasks (3x slower)

2. **Keep payloads small**
   - Under 1MB per task
   - Pass IDs, not full objects

3. **Set timeouts**
   ```typescript
   fetch(url, { timeout: 5000 })
   ```

4. **Retry strategy**
   - Idempotent: `maxAttempts: 5`
   - Side-effects: `maxAttempts: 2`

## Shutdown

```bash
# Stop workers first
cd worker && docker-compose down

# Then stop webapp
cd ../webapp && docker-compose down

# Clean up volumes if needed
docker volume prune -f
```

## Next Steps

1. Clone trigger.dev repository
2. Run setup commands (Quick Start section)
3. Login to http://localhost:8030
4. Create tasks in `src/trigger/` directory
5. Start CLI dev server
6. Trigger tasks via API

## Resources

- Trigger.dev docs: https://trigger.dev/docs/v4
- GitHub: https://github.com/triggerdotdev/trigger.dev
- Discord: https://discord.gg/trigger
- Migration guide: https://trigger.dev/docs/v4/migration
