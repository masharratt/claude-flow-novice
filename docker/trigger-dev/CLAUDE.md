# Trigger.dev Self-Hosted Infrastructure - Claude Development Guide

Development guide for Trigger.dev v4 self-hosted infrastructure in CFN Loop environments.

## Quick Reference - v4 Setup

### Infrastructure
- **Location**: `docker/trigger-dev-v4/hosting/docker/`
- **Webapp URL**: http://localhost:8030
- **Services**: 9 containers (webapp, postgres, redis, clickhouse, electric, minio, registry, supervisor, docker-proxy)

### Local Credentials (stored in `.env`)
- **User**: CFN Admin (admin@localhost.dev)
- **Organization**: CFN Stress Test
- **Project ID**: `proj_uuvpcrkpfruhlpbpzlov`
- **CLI Profile**: `self-hosted-v4`

### Start Commands
```bash
# Start v4 infrastructure
cd docker/trigger-dev-v4/hosting/docker
docker compose -f webapp/docker-compose.yml -f worker/docker-compose.yml up -d

# Login and start dev server
cd docker/trigger-dev
npx trigger.dev@latest login -a http://localhost:8030 --profile self-hosted-v4
npx trigger.dev@latest dev --profile self-hosted-v4
```

---

## Trigger.dev v4 Architecture

### Service Port Mappings

| Service | External Port | Internal Port | Notes |
|---------|--------------|---------------|-------|
| webapp | 8030 | 3000 | Main UI and API |
| postgres | 5434 | 5432 | Changed from 5433 (conflict) |
| redis | 6389 | 6379 | |
| clickhouse | 9123/9090 | 8123/9000 | HTTP/Native |
| minio | 9000-9001 | 9000-9001 | Object storage |
| registry | 5000 | 5000 | Docker registry |
| electric | internal | 3000 | Postgres replication |
| supervisor | internal | 8020 | Worker management |
| docker-proxy | internal | 2375 | Docker socket proxy |

### Docker Compose Files
- `webapp/docker-compose.yml` - Core services (webapp, postgres, redis, clickhouse, electric, minio, registry)
- `worker/docker-compose.yml` - Worker services (supervisor, docker-proxy)

---

## v4 Task Definition

### Configuration (`trigger.config.ts`)
```typescript
import type { TriggerConfig } from "@trigger.dev/sdk/v3";

export const config: TriggerConfig = {
  project: "proj_uuvpcrkpfruhlpbpzlov",
  triggerUrl: process.env.TRIGGER_API_URL || "http://localhost:8030",
  maxDuration: 300,
  retries: {
    enabledInDev: true,
    default: { maxAttempts: 3, factor: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 10000 },
  },
  dirs: ["./src/trigger"],
};
```

### Task Definition Pattern
```typescript
import { task, tasks } from "@trigger.dev/sdk/v3";
import * as fs from "fs";

export const helloWorldTask = task({
  id: "hello-world",
  retry: { maxAttempts: 3 },
  run: async (payload: {
    outputDir: string;
    language: string;
    greeting: string;
    progLang: string;
    extension: string;
    agentType: string;
  }) => {
    const fileName = `${payload.language}-${payload.progLang}-${payload.agentType}.${payload.extension}`;
    const filePath = `${payload.outputDir}/${fileName}`;

    if (!fs.existsSync(payload.outputDir)) {
      fs.mkdirSync(payload.outputDir, { recursive: true });
    }

    fs.writeFileSync(filePath, `// ${payload.greeting}\n`);

    return {
      success: true,
      file: fileName,
      path: filePath,
      language: payload.language,
      progLang: payload.progLang,
      greeting: payload.greeting,
    };
  },
});
```

### Batch Triggering (v4 API Change)
**CRITICAL**: In v4, `batchHandle.runs` may be undefined. Always use nullish coalescing:

```typescript
// Trigger batch
const batchHandle = await tasks.batchTrigger<typeof helloWorldTask>(
  "hello-world",
  taskPayloads
);

// SAFE: Handle undefined runs array
const runs = batchHandle.runs ?? [];
const batchId = batchHandle.batchId ?? "unknown";
console.log(`Batch ${batchId} triggered with ${runs.length} runs`);

// Process results
for (const run of runs) {
  const result = await tasks.retrieve<typeof helloWorldTask>(run);
  // ...
}
```

---

## Stress Test Results

### Test 1: Single Agent (PASSED)
- **Duration**: 590ms (560ms execution)
- **Output**: `/tmp/hello-test-1/en-typescript-typescript-specialist.ts`

### Test 2: 5 Agents Parallel (PASSED)
- **Duration**: ~1.5s total
- **Files Created** (all in `/tmp/hello-test-5/`):
  - `en-typescript-typescript-specialist.ts`
  - `en-python-backend-developer.py`
  - `en-rust-rust-developer.rs`
  - `en-go-backend-developer.go`
  - `en-java-backend-developer.java`

### Test 3: 100 Agents Parallel (PASSED)
- **Duration**: ~32s total (orchestrator: 145ms, child tasks: ~31s)
- **Files Created**: 100 files in `/tmp/hello-test-100/`
- **Matrix**: 10 spoken languages × 10 programming languages
- **Languages**: en, es, fr, de, it, pt, ja, ko, zh, ru
- **Prog Languages**: TypeScript, Python, Rust, Go, Java, C#, Ruby, PHP, Swift, Kotlin
- **Throughput**: ~3 tasks/second average

---

## CLI Authentication Flow

### Login Process
```bash
# Login with profile (opens browser)
npx trigger.dev@latest login -a http://localhost:8030 --profile self-hosted-v4
```

The login uses magic links. Since no email transport is configured:
1. Check webapp container logs for the magic link
2. Open the link in browser to complete authentication
3. Profile saved to `~/.trigger/profiles/self-hosted-v4.json`

### Start Dev Server
```bash
npx trigger.dev@latest dev --profile self-hosted-v4
```

Output shows:
- Worker version (e.g., `20251125.1`)
- Registered tasks
- Real-time task execution logs

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| `batchHandle.runs` undefined | v4 API change | Use `batchHandle.runs ?? []` |
| Port 5433 in use | Conflict with other DB | Use port 5434 for postgres |
| "Dev server not connected" | Dev process stopped | Restart `npx trigger.dev@latest dev` |
| Magic link not received | No email transport | Check webapp logs for link |
| Tasks not appearing | Wrong project ID | Verify `trigger.config.ts` project ID |

### Health Checks
```bash
# Check all services
cd docker/trigger-dev-v4/hosting/docker
docker compose -f webapp/docker-compose.yml -f worker/docker-compose.yml ps

# Check webapp health
curl -I http://localhost:8030/login

# Check dev server
# Look for "Local worker ready" message
```

### View Webapp Logs
```bash
docker logs trigger-webapp-1 --tail=100

# Look for magic links during login:
# "Click this link to verify: http://localhost:8030/..."
```

---

## AI Provider Integration

### Supported Providers

The `claude-agent` task supports multiple AI providers via the `provider` field:

| Provider | Base URL | API Key Env Var | Cost |
|----------|----------|-----------------|------|
| `zai` | `https://api.z.ai/api/anthropic` | `ZAI_API_KEY` | Low ($0.50/1M tokens) |
| `kimi` | `https://api.moonshot.cn/v1` | `KIMI_API_KEY` | Medium ($2/1M tokens) |
| `openrouter` | `https://openrouter.ai/api/v1` | `OPENROUTER_API_KEY` | Variable |
| `anthropic` | (default) | `ANTHROPIC_API_KEY` | Premium |
| `gemini` | `https://generativelanguage.googleapis.com/v1beta` | `GEMINI_API_KEY` | Variable |
| `xai` | `https://api.x.ai/v1` | `XAI_API_KEY` | Variable |

### Usage Examples

```typescript
import { tasks } from "@trigger.dev/sdk/v3";

// Using Z.ai provider (cost-optimized)
await tasks.trigger("claude-agent", {
  prompt: "Create a TypeScript utility function",
  workDir: "/workspace",
  provider: "zai",
  agentType: "typescript-specialist",
});

// Using Kimi provider (balanced)
await tasks.trigger("claude-agent", {
  prompt: "Implement a REST API endpoint",
  workDir: "/workspace",
  provider: "kimi",
  agentType: "backend-developer",
});

// Using direct Anthropic (premium quality)
await tasks.trigger("claude-agent", {
  prompt: "Design system architecture",
  workDir: "/workspace",
  provider: "anthropic",
  agentType: "system-architect",
});

// Custom env override (any provider)
await tasks.trigger("claude-agent", {
  prompt: "Custom task",
  workDir: "/workspace",
  env: {
    ANTHROPIC_API_KEY: "custom-key",
    ANTHROPIC_BASE_URL: "https://custom.provider.com/v1",
  },
});
```

### Environment Setup

Set API keys in `.env` or export before starting the dev server:

```bash
# Required for Z.ai
export ZAI_API_KEY=your-zai-key
export ZAI_BASE_URL=https://api.z.ai/api/anthropic

# Optional: Other providers
export KIMI_API_KEY=your-kimi-key
export OPENROUTER_API_KEY=your-openrouter-key
export ANTHROPIC_API_KEY=your-anthropic-key

# Start dev server with env vars
npx trigger.dev@latest dev --profile self-hosted-v4
```

### Z.ai Agent Test

The `test-zai-agent` task validates Z.ai integration:

```typescript
await tasks.trigger("test-zai-agent", {
  testId: "test-1",
  outputDir: "/tmp/zai-test",
});
```

**Test Results (2025-11-25):**
- Duration: ~2 minutes
- File created: `/tmp/zai-test/zai-test-zai-test-1.ts`
- Provider routing: Confirmed working via `ANTHROPIC_BASE_URL`
- Status: **PASSED**

### Parallel Agent Spawning

Tasks can be triggered in parallel with different providers:

```typescript
// Spawn 2 agents in parallel
const [handle1, handle2] = await Promise.all([
  tasks.trigger("claude-agent", { prompt: "Task 1", workDir: "/tmp", provider: "zai" }),
  tasks.trigger("claude-agent", { prompt: "Task 2", workDir: "/tmp", provider: "zai" }),
]);
```

Trigger.dev handles parallel execution automatically.

---

## CFN Loop Integration

### Environment Variables for Agents
```bash
export TRIGGER_API_URL="http://localhost:8030"
export TRIGGER_V4_PROJECT_ID="proj_uuvpcrkpfruhlpbpzlov"
export TRIGGER_V4_CLI_PROFILE="self-hosted-v4"
```

### Spawning Tasks from CFN Loop
```typescript
import { tasks } from "@trigger.dev/sdk/v3";
import { helloWorldTask } from "./hello-world.js";

// Single task
const handle = await tasks.trigger<typeof helloWorldTask>("hello-world", {
  outputDir: "/tmp/cfn-output",
  language: "en",
  greeting: "Hello World",
  progLang: "typescript",
  extension: "ts",
  agentType: "typescript-specialist",
});

// Batch of tasks (for parallel agent execution)
const batchHandle = await tasks.batchTrigger<typeof helloWorldTask>(
  "hello-world",
  payloads.map(p => ({ payload: p }))
);
```

---

## File Structure

```
docker/trigger-dev/
├── .env                    # Configuration (credentials, API keys)
├── CLAUDE.md               # This file
├── trigger.config.ts       # v4 SDK configuration
├── package.json            # Dependencies (@trigger.dev/sdk)
├── tsconfig.json           # TypeScript config
└── src/
    └── trigger/
        ├── index.ts                    # Task exports
        ├── hello-world.ts              # Simple task definition
        ├── stress-test.ts              # 100-agent orchestrator
        ├── claude-agent.ts             # Core Claude CLI spawner (with provider support)
        ├── test-zai-agent.ts           # Z.ai integration test
        ├── test-claude-poc.ts          # POC file creation test
        ├── parallel-provider-test.ts   # Multi-provider parallel test
        ├── cfn-implementer.ts          # CFN Loop 3 implementer
        ├── cfn-test-runner.ts          # CFN gate check
        ├── cfn-validator.ts            # CFN Loop 2 validator
        └── cfn-orchestrator.ts         # CFN coordinator

docker/trigger-dev-v4/
└── hosting/
    └── docker/
        ├── .env            # Infrastructure secrets
        ├── webapp/
        │   └── docker-compose.yml
        └── worker/
            └── docker-compose.yml
```

---

## Container-Based Agent Coordination

### CFN Runtime Contract Alignment

The `claude-agent` task now aligns with `docker/runtime/cfn-runtime.contract.yml` for container-based agent launching:

**Environment Variables Injected:**

| Variable | Value | Purpose |
|----------|-------|---------|
| `CFN_TASK_ID` | `trigger:<timestamp>-<random>` | Unique task identifier with prefix |
| `CFN_EXECUTION_MODE` | `trigger` | Identifies Trigger.dev execution context |
| `CFN_AGENT_TYPE` | Agent type from payload | Agent specialization |
| `CFN_REDIS_HOST` | `redis` (when enabled) | Docker service name for containers |
| `CFN_REDIS_PORT` | `6379` (when enabled) | Redis port |
| `CFN_NETWORK_NAME` | `trigger-cfn-network` (when enabled) | Docker network name |

### Usage with Redis Coordination

```typescript
// Container-based agent with Redis coordination enabled
await tasks.trigger("claude-agent", {
  prompt: "Implement feature X",
  workDir: "/workspace",
  provider: "zai",
  agentType: "typescript-specialist",
  taskId: "my-custom-task-123", // Optional: auto-generated if not provided
  enableRedisCoordination: true, // Enables CFN_REDIS_* variables
});
```

### Task ID Format

- Pattern: `trigger:<timestamp>-<random>` (e.g., `trigger:1732536789123-abc123`)
- Prevents collision with CLI mode tasks (`cli:task-123`)
- Custom IDs auto-prefixed if not already prefixed
- Returned in result for tracking: `result.taskId`

### Intentional Divergence from CLI Mode

| Aspect | CLI Mode | Trigger.dev Mode | Rationale |
|--------|----------|------------------|-----------|
| Spawning | `child_process.spawn` | `execa` | Better TypeScript integration |
| Redis Host | `localhost` | `redis` | Docker service discovery |
| Network | `mcp-network` | `trigger-cfn-network` | Isolation between modes |
| Task prefix | `cli:` | `trigger:` | Clear execution context |

---

## Version History

- **2025-11-25**: Container-Based Coordination Alignment
  - Added `taskId` and `enableRedisCoordination` to payload
  - Inject CFN runtime environment variables per contract
  - Task IDs auto-generated with `trigger:` prefix
  - Redis coordination optional (for container-based agents)
  - Documented intentional CLI/Trigger divergence
- **2025-11-25**: AI Provider Integration
  - Added `provider` field to `claude-agent` task payload
  - Supports 6 providers: zai, kimi, openrouter, anthropic, gemini, xai
  - Z.ai integration test PASSED (real Claude Code CLI execution)
  - Created parallel provider test task
  - Updated documentation with provider examples
- **2025-11-24**: Updated for Trigger.dev v4
  - Documented v4 architecture (9 services)
  - Added batchTrigger API breaking change fix
  - Documented stress test results (1, 5, and 100 agents ALL PASSED)
  - Added local credentials to .env
- **2025-11-22**: Initial v2/v3 documentation
  - Fixed "features undefined" error
  - Added self-hosted configuration

---

**Status**: ✅ v4 Infrastructure Running | Z.ai Integration PASSED | All Stress Tests PASSED (1, 5, 100 agents) | Container Coordination Aligned
