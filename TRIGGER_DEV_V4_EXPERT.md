# Trigger.dev v4 Self-Hosted Expert Guide

## Overview

Trigger.dev v4 is a production-grade workflow orchestration platform deployable via Docker Compose. This guide covers self-hosted setup, configuration, task definition patterns, CLI authentication, and v4-specific API changes.

## Architecture Overview

### Service Stack

Trigger.dev v4 deploys 9 core services via two Docker Compose files:

**webapp/docker-compose.yml** (Application Layer):
- `webapp` - Main UI and API server (port 8030 → 3000)
- `postgres` - Primary database (port 5434 → 5432)
- `redis` - Session and cache layer (port 6389 → 6379)
- `clickhouse` - Analytics and logs storage (ports 9123 → 8123, 9090 → 9000)
- `electric` - Real-time sync engine (port 5133 → 3000)
- `minio` - S3-compatible object storage (ports 9000-9001 → 9000-9001)
- `registry` - Docker image registry for tasks (port 5000 → 5000)

**worker/docker-compose.yml** (Execution Layer):
- `supervisor` - Task scheduler and coordinator
- `docker-proxy` - Secure Docker daemon access for task execution

### Port Mapping Reference

| Service | External | Internal | Purpose |
|---------|----------|----------|---------|
| webapp | 8030 | 3000 | Web UI and API endpoint |
| postgres | 5434 | 5432 | Database (Note: NOT 5433) |
| redis | 6389 | 6379 | Session/cache |
| clickhouse-http | 9123 | 8123 | Analytics queries |
| clickhouse-native | 9090 | 9000 | Native protocol |
| minio | 9000 | 9000 | S3 API |
| minio-console | 9001 | 9001 | S3 console UI |
| registry | 5000 | 5000 | Docker registry |

**Critical Note**: Postgres uses port 5434 (not 5433). This prevents conflicts with other local services.

## Installation and Startup

### Prerequisites
- Docker and Docker Compose (v2.0+)
- Node.js 18+
- Git
- At least 4GB available RAM
- Ports: 8030, 5434, 6389, 9000-9001, 5000, and 5133 must be available

### Step 1: Clone and Initialize

```bash
git clone https://github.com/triggerdotdev/trigger.dev.git
cd trigger.dev
git checkout v4  # Ensure v4 branch

# Initialize environment
cp .env.example .env.local
```

### Step 2: Start Infrastructure Services

```bash
cd webapp
docker-compose up -d

# Verify all services are healthy
docker-compose ps
# Expected: webapp, postgres, redis, clickhouse, electric, minio, registry all "Up"

# Wait 30-60 seconds for database initialization
sleep 45
```

### Step 3: Initialize Database

```bash
# From webapp directory
docker-compose exec postgres psql -U postgres -d trigger -f /init.sql

# Alternatively, the webapp container may auto-initialize on first start
# Check logs: docker-compose logs -f webapp
```

### Step 4: Start Worker Services

```bash
cd ../worker
docker-compose up -d

# Verify supervisor and docker-proxy are running
docker-compose ps
```

### Step 5: Verify Deployment

```bash
# Test webapp health
curl -s http://localhost:8030/health | jq .

# Expected response: {"status": "healthy", "version": "4.0.0", ...}

# Check postgres connectivity
psql -h localhost -p 5434 -U postgres -d trigger -c "SELECT 1;"

# Check Redis connectivity
redis-cli -p 6389 ping
# Expected: "PONG"
```

## Trigger.dev Configuration

### trigger.config.ts Setup

Create or update `trigger.config.ts` in your project root:

```typescript
import type { TriggerConfig } from "@trigger.dev/sdk/v3";

export const config: TriggerConfig = {
  // Unique project identifier (obtain from webapp UI after login)
  project: "proj_uuvpcrkpfruhlpbpzlov",

  // Self-hosted API endpoint
  triggerUrl: process.env.TRIGGER_API_URL || "http://localhost:8030",

  // Maximum execution duration (seconds)
  maxDuration: 300,

  // Retry configuration
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      factor: 2,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
    },
  },

  // Task source directories
  dirs: ["./src/trigger"],
};
```

### Environment Variables

```bash
# In your .env or .env.local
TRIGGER_API_URL=http://localhost:8030
TRIGGER_ACCESS_TOKEN=[obtained after CLI login]
NODE_ENV=development
```

## CLI Authentication and Setup

### Step 1: Install Trigger CLI

```bash
npm install @trigger.dev/cli --save-dev
# or
npx trigger.dev@latest login -a http://localhost:8030
```

### Step 2: Login with Self-Hosted Instance

```bash
npx trigger.dev@latest login \
  -a http://localhost:8030 \
  --profile self-hosted-v4
```

This command will:
1. Open your default browser to http://localhost:8030/auth/cli/request
2. Display a magic link or OAuth flow
3. Redirect back to CLI with access token
4. Store credentials in `~/.trigger/profiles.json` under `self-hosted-v4`

### Step 3: Obtain Project ID

```bash
# Login to webapp at http://localhost:8030
# Navigate to: Settings → Projects
# Copy the project ID (format: proj_xxx)
# Add to trigger.config.ts
```

### Step 4: Start Development Server

```bash
npx trigger.dev@latest dev \
  --profile self-hosted-v4 \
  --dir ./src/trigger
```

Expected output:
```
[trigger.dev] Login successful
[trigger.dev] Initializing project: proj_uuvpcrkpfruhlpbpzlov
[trigger.dev] Watching for tasks in: ./src/trigger
[trigger.dev] Local dev server listening on http://localhost:3001
[trigger.dev] Connected to API: http://localhost:8030
```

## Task Definition Patterns (v4)

### Basic Task Structure

```typescript
// src/trigger/hello-world.ts
import { task } from "@trigger.dev/sdk/v3";

export const helloWorldTask = task({
  id: "hello-world",
  retry: { maxAttempts: 3 },
  run: async (payload: { name: string; greeting: string }) => {
    console.log(`${payload.greeting}, ${payload.name}!`);
    return { success: true, message: `Greeted ${payload.name}` };
  },
});
```

### Task with File Output

```typescript
import { task } from "@trigger.dev/sdk/v3";
import fs from "fs";
import path from "path";

export const generateCodeTask = task({
  id: "generate-code",
  retry: { maxAttempts: 2 },
  run: async (payload: {
    outputDir: string;
    language: string;
    greeting: string;
    progLang: string;
    extension: string;
    agentType: string;
  }) => {
    const fileName = `${payload.greeting}-${payload.language}-${payload.agentType}.${payload.extension}`;
    const filePath = path.join(payload.outputDir, fileName);

    const content = `// Generated file for ${payload.agentType}\nconsole.log("Hello from ${payload.progLang}");`;

    fs.mkdirSync(payload.outputDir, { recursive: true });
    fs.writeFileSync(filePath, content);

    return {
      success: true,
      file: fileName,
      path: filePath,
      size: content.length,
    };
  },
});
```

### Task with Dependencies

```typescript
import { task, tasks } from "@trigger.dev/sdk/v3";

const fetchDataTask = task({
  id: "fetch-data",
  run: async (url: string) => {
    const response = await fetch(url);
    return response.json();
  },
});

const processDataTask = task({
  id: "process-data",
  run: async (data: any) => {
    return { processed: true, count: data.length };
  },
});

const orchestrateTask = task({
  id: "orchestrate",
  run: async () => {
    const data = await tasks.invoke(fetchDataTask, "https://api.example.com/data");
    const result = await tasks.invoke(processDataTask, data);
    return result;
  },
});
```

## Batch Triggering and v4 API Changes

### The batchTrigger Issue

In v4, the `batchHandle.runs` property may be undefined. This is a breaking change from v3. Always use nullish coalescing:

```typescript
import { tasks } from "@trigger.dev/sdk/v3";

const taskPayloads = [
  { language: "en", greeting: "hello", outputDir: "/tmp/test-1" },
  { language: "en", greeting: "hello", outputDir: "/tmp/test-2" },
];

try {
  const batchHandle = await tasks.batchTrigger<typeof helloWorldTask>(
    "hello-world",
    taskPayloads
  );

  // CORRECT: Use nullish coalescing
  const runs = batchHandle.runs ?? [];
  const batchId = batchHandle.batchId ?? "unknown";

  console.log(`Batch ID: ${batchId}`);
  console.log(`Triggered ${runs.length} tasks`);

  // WRONG: Don't assume runs exists
  // const runs = batchHandle.runs; // May be undefined!
} catch (error) {
  console.error("Batch trigger failed:", error);
}
```

### Expected Batch Response

```typescript
interface BatchHandle<T> {
  batchId: string | null;
  runs?: Array<{
    id: string;
    status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
    createdAt: Date;
  }>;
}
```

## Common Patterns and Best Practices

### 1. Structured Logging

```typescript
export const loggingTask = task({
  id: "logging-demo",
  run: async (input: string) => {
    console.log("[INFO] Task started with input:", input);
    try {
      // Do work
      console.log("[DEBUG] Processing step 1 complete");
      return { success: true };
    } catch (error) {
      console.error("[ERROR] Task failed:", error);
      throw error;
    }
  },
});
```

### 2. Error Handling and Retries

```typescript
export const resilientTask = task({
  id: "resilient-task",
  retry: {
    maxAttempts: 5,
    factor: 2,              // Exponential backoff multiplier
    minTimeoutInMs: 1000,   // Start at 1 second
    maxTimeoutInMs: 30000,  // Cap at 30 seconds
  },
  run: async (url: string) => {
    try {
      const response = await fetch(url, { timeout: 5000 });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    } catch (error) {
      // Will automatically retry based on config above
      throw error;
    }
  },
});
```

### 3. Environment-Specific Configuration

```typescript
export const envAwareTask = task({
  id: "env-aware",
  run: async (payload: any) => {
    const apiUrl = process.env.TRIGGER_API_URL || "http://localhost:8030";
    const isDev = process.env.NODE_ENV === "development";

    if (isDev) {
      console.log("[DEV] Running in development mode");
    }

    return { apiUrl, isDev };
  },
});
```

## Troubleshooting and Common Issues

### Issue 1: "Cannot connect to http://localhost:8030"

**Symptoms**:
```
Error: connect ECONNREFUSED 127.0.0.1:8030
```

**Solution**:
```bash
# Verify webapp is running
docker-compose -f webapp/docker-compose.yml ps

# Check logs for startup errors
docker-compose -f webapp/docker-compose.yml logs webapp | tail -50

# Ensure port 8030 is not in use
lsof -i :8030

# Restart if needed
docker-compose -f webapp/docker-compose.yml restart webapp
sleep 30
curl http://localhost:8030/health
```

### Issue 2: "Database connection failed"

**Symptoms**:
```
Error: connect ECONNREFUSED 127.0.0.1:5434
```

**Solution**:
```bash
# Verify postgres is running
docker-compose -f webapp/docker-compose.yml ps postgres

# Check the correct port (5434, not 5433)
psql -h localhost -p 5434 -U postgres -c "SELECT 1;"

# If port is wrong, verify docker-compose.yml:
grep -A3 "postgres:" webapp/docker-compose.yml

# Restart postgres
docker-compose -f webapp/docker-compose.yml restart postgres
sleep 20
```

### Issue 3: "batchTrigger returns undefined runs"

**Symptoms**:
```typescript
const runs = batchHandle.runs; // runs is undefined
console.log(runs.length); // TypeError: Cannot read property 'length' of undefined
```

**Solution**:
```typescript
// Always use nullish coalescing
const runs = batchHandle.runs ?? [];
const batchId = batchHandle.batchId ?? "unknown";

// Or optional chaining for safety
const runCount = batchHandle.runs?.length ?? 0;
```

### Issue 4: "Tasks not registering with dev server"

**Symptoms**:
```
[trigger.dev] Watching for tasks in: ./src/trigger
[trigger.dev] No tasks found
```

**Solution**:
```bash
# Verify task files exist and have correct structure
ls -la src/trigger/

# Ensure trigger.config.ts has correct dirs
cat trigger.config.ts | grep dirs

# Check that task exports are named exports (not default)
grep "export const.*Task = task" src/trigger/*.ts

# Restart dev server with verbose logging
DEBUG=trigger.dev npx trigger.dev@latest dev --profile self-hosted-v4
```

### Issue 5: "CLI login not completing"

**Symptoms**:
```
Opening browser to http://localhost:8030/auth/cli/request
[Waiting for authentication...]
[Timeout after 5 minutes]
```

**Solution**:
```bash
# Check if webapp is accessible
curl http://localhost:8030/health

# Verify browser can reach localhost:8030
# (If using WSL, use http://wsl.localhost:8030)

# Try explicit profile creation
npx trigger.dev@latest login \
  -a http://localhost:8030 \
  --profile self-hosted-v4 \
  --skip-browser

# Then manually navigate to the provided link in browser
```

## Performance Considerations

### Task Execution Benchmarks

Based on stress testing with v4:

| Scenario | Duration | Notes |
|----------|----------|-------|
| Single task (no retries) | ~590ms | Includes API overhead |
| 5 parallel tasks | ~1.5s total | Child tasks execute concurrently |
| Batch of 10 | ~2.5s | Linear scaling with task count |

### Optimization Tips

1. **Batch Operations**: Use `tasks.batchTrigger()` instead of looping and invoking individually
   - Single task: ~600ms
   - Batch 5: ~1.5s (vs. ~3s if individual)

2. **Minimize Payload Size**: Keep task payloads under 1MB
   ```typescript
   // Avoid: Large nested objects
   await tasks.invoke(task, { largeData: entireDatabase });

   // Prefer: Minimal required data
   await tasks.invoke(task, { id: itemId }); // Fetch inside task
   ```

3. **Set Appropriate Timeouts**:
   ```typescript
   fetch(url, { timeout: 5000 }) // Don't wait indefinitely
   ```

4. **Use Retries Wisely**:
   - Idempotent tasks: aggressive retries (5 attempts)
   - Side-effect tasks: conservative retries (2 attempts)

## Monitoring and Debugging

### Viewing Task Logs

```bash
# Webapp logs
docker-compose -f webapp/docker-compose.yml logs -f webapp

# Supervisor logs (task execution)
docker-compose -f worker/docker-compose.yml logs -f supervisor

# View specific task run
curl http://localhost:8030/api/runs/[run-id]/logs
```

### Health Checks

```bash
# Full system health
curl -s http://localhost:8030/health | jq .

# Database connectivity
docker-compose -f webapp/docker-compose.yml exec postgres \
  psql -U postgres -d trigger -c "SELECT version();"

# Redis connectivity
docker-compose -f webapp/docker-compose.yml exec redis \
  redis-cli ping

# ClickHouse connectivity
docker-compose -f webapp/docker-compose.yml exec clickhouse \
  curl http://localhost:8123/ping
```

## Security Considerations

### For Development

- Default credentials are safe for localhost-only deployments
- Access control via firewall rules if exposing to network

### For Production

- Use strong, unique database passwords in `.env`
- Enable TLS/SSL for all external connections
- Use authentication tokens (never hardcode in code)
- Implement network segmentation (private Docker networks only)
- Regularly update Docker images: `docker-compose pull && docker-compose up -d`

## Next Steps and Resources

- Official docs: https://trigger.dev/docs/v4
- GitHub: https://github.com/triggerdotdev/trigger.dev
- Discord community: https://discord.gg/trigger
- v4 migration guide (from v3): https://trigger.dev/docs/v4/migration
- Task API reference: https://trigger.dev/docs/v4/sdk/task
