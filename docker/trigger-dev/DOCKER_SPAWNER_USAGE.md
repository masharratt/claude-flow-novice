# Docker Spawner - Usage Guide

Dockerode wrapper for container lifecycle management in CFN Loop agent orchestration.

## Overview

`docker-spawner.ts` provides type-safe container creation, monitoring, and cleanup with:
- Automatic socket-proxy fallback (TCP then socket)
- Stream-based log capture (stdout/stderr)
- Timeout handling with forced kill on expiration
- Memory string parsing ("512m", "1g", etc)
- Comprehensive error handling with logging

## Installation

Docker Spawner is a built-in module. Dependencies are already in `package.json`:

```bash
npm install  # Installs dockerode and @types/dockerode
```

## Basic Usage

### Import

```typescript
import { DockerSpawner, parseMemoryString, ContainerSpawnOptions, ContainerResult } from './docker-spawner';
```

### Create Spawner

```typescript
const spawner = new DockerSpawner();
// Defaults: socket-proxy:2375, fallback to /var/run/docker.sock
```

With custom configuration:

```typescript
const spawner = new DockerSpawner(
  'custom-socket-proxy',  // hostname
  2375,                   // port
  '/var/run/docker.sock'  // socket path
);
```

### Spawn Container

```typescript
const result = await spawner.spawnAgentContainer({
  image: 'cfn-agent:latest',
  name: 'agent-1-timestamp',
  memory: '512m',
  cpus: 0.5,
  env: {
    TASK_ID: 'task-123',
    AGENT_ID: 'agent-1',
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  },
  mounts: [
    { source: '/workspace', target: '/workspace', readonly: false },
    { source: '/home/user/.ssh', target: '/root/.ssh', readonly: true },
  ],
  networkMode: 'cfn-network',
  timeout: 300000, // 5 minutes
  command: ['node', '/app/agent-worker.js'],
});

if (result.success) {
  console.log(`Task completed in ${result.durationMs}ms`);
  console.log('Output:', result.stdout);
} else {
  console.error('Task failed:', result.error);
  console.error('Logs:', result.stderr);
  console.error('Exit code:', result.exitCode);
}
```

## Configuration

### Memory String Format

Supports: `b`, `k/kb`, `m/mb`, `g/gb` (case-insensitive)

```typescript
parseMemoryString('512');      // 512 bytes
parseMemoryString('512b');     // 512 bytes
parseMemoryString('512k');     // 512 KB
parseMemoryString('512kb');    // 512 KB
parseMemoryString('512m');     // 512 MB
parseMemoryString('512mb');    // 512 MB
parseMemoryString('1g');       // 1 GB
parseMemoryString('2gb');      // 2 GB
parseMemoryString('1.5g');     // 1.5 GB (with decimals)
parseMemoryString('  512m  '); // Handles whitespace
```

### Docker Connection Priority

1. **DOCKER_HOST** env var (if set to `tcp://` or `unix://`)
2. **socket-proxy** via TCP (default: `socket-proxy:2375`)
3. **Docker socket** (default: `/var/run/docker.sock`)

```bash
# Using TCP
export DOCKER_HOST=tcp://localhost:2375
spawner = new DockerSpawner();

# Using socket file
export DOCKER_HOST=unix:///var/run/docker.sock
spawner = new DockerSpawner();

# Using defaults (socket-proxy)
spawner = new DockerSpawner();
```

## Container Lifecycle

### Timeline

1. **Create** container from image with options
2. **Start** container
3. **Attach** to logs (stdout/stderr)
4. **Wait** for completion (or timeout)
5. **Cleanup** container if needed

### Timeout Handling

If container exceeds timeout:
1. Stop container (SIGTERM) with 5-second grace period
2. Kill container (SIGKILL) if still running
3. Return error result with timeout flag

```typescript
const result = await spawner.spawnAgentContainer({
  // ... other options ...
  timeout: 300000, // 5 minutes = 300,000 ms
});

if (result.error && result.error.includes('timeout')) {
  console.log('Container took too long, was killed');
}
```

## Error Handling

All errors are captured and returned in the result object:

```typescript
const result = await spawner.spawnAgentContainer({
  image: 'nonexistent:image',
  name: 'test',
  memory: '512m',
  env: {},
  mounts: [],
  networkMode: 'bridge',
  timeout: 10000,
});

// Check result
if (!result.success) {
  console.error(`Container failed: ${result.error}`);
  console.error(`Exit code: ${result.exitCode}`);
  console.error(`Duration: ${result.durationMs}ms`);
  console.error(`Container ID: ${result.containerId}`);
}
```

## Memory Optimization

Four-tier memory allocation for parallel agents:

| Tier | Memory | Use Case |
|------|--------|----------|
| 1 | 512m | Independent files |
| 2 | 600m | Small feature clusters (2-3 files) |
| 3 | 800m | Medium modules (4-8 files) |
| 4 | 1g | Large interconnected modules (9+ files) |

Example - spawn wave of agents:

```typescript
const batches = [
  { tier: 1, memory: '512m', files: ['App.tsx'] },
  { tier: 2, memory: '600m', files: ['LoginForm.tsx', 'AuthContext.tsx'] },
  { tier: 3, memory: '800m', files: ['Dashboard.tsx', 'Settings.tsx', 'Profile.tsx', 'utils.ts'] },
  { tier: 4, memory: '1g', files: ['AdminPanel.tsx', 'UserMgmt.tsx', 'Analytics.tsx', /* ... */] },
];

const handles = await Promise.all(
  batches.map(batch =>
    spawner.spawnAgentContainer({
      image: 'cfn-agent:latest',
      name: `agent-${batch.tier}-${Date.now()}`,
      memory: batch.memory,
      env: {
        BATCH_TIER: String(batch.tier),
        BATCH_FILES: JSON.stringify(batch.files),
      },
      mounts: [{ source: '/workspace', target: '/workspace' }],
      networkMode: 'cfn-network',
      timeout: 1800000, // 30 minutes
    })
  )
);
```

## Advanced Patterns

### Multi-Stage Deployment

```typescript
const spawner = new DockerSpawner('socket-proxy', 2375);

// 1. Verify Docker is accessible
const accessible = await spawner.isAccessible();
if (!accessible) {
  throw new Error('Docker daemon not accessible');
}

// 2. Spawn container with retries
let result: ContainerResult | null = null;
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    result = await spawner.spawnAgentContainer({
      image: 'cfn-agent:latest',
      name: `agent-attempt-${attempt}-${Date.now()}`,
      memory: '512m',
      env: { ATTEMPT: String(attempt) },
      mounts: [{ source: '/workspace', target: '/workspace' }],
      networkMode: 'cfn-network',
      timeout: 600000,
    });

    if (result.success) {
      console.log(`Success on attempt ${attempt}`);
      break;
    } else if (attempt < 3) {
      console.warn(`Attempt ${attempt} failed, retrying...`);
      await new Promise(r => setTimeout(r, 5000)); // 5 second backoff
    }
  } catch (error) {
    console.error(`Attempt ${attempt} error:`, error);
  }
}

// 3. Process result
if (result && result.success) {
  console.log('Task completed:', result.stdout);
} else {
  console.error('Task failed after 3 attempts');
}
```

### Volume Management

```typescript
const result = await spawner.spawnAgentContainer({
  image: 'cfn-agent:latest',
  name: 'agent-volumes',
  memory: '512m',
  env: {},
  mounts: [
    // Read-write workspace
    { source: '/home/user/workspace', target: '/workspace', readonly: false },
    // Read-only config
    { source: '/etc/cfn/config', target: '/config', readonly: true },
    // Read-only environment
    { source: '/home/user/.env', target: '/.env', readonly: true },
    // Named volume for temporary storage
    { source: 'agent-cache', target: '/cache', readonly: false },
  ],
  networkMode: 'cfn-network',
  timeout: 600000,
});
```

### Network Integration

```typescript
// Join existing Docker network
const result = await spawner.spawnAgentContainer({
  image: 'cfn-agent:latest',
  name: 'agent-network',
  memory: '512m',
  env: {
    REDIS_HOST: 'cfn-redis',      // Service name in network
    REDIS_PORT: '6379',
    POSTGRES_HOST: 'cfn-postgres', // Service name in network
    POSTGRES_PORT: '5432',
  },
  mounts: [],
  networkMode: 'cfn-network', // Join cfn-network
  timeout: 600000,
});
```

## Logging

All operations are logged with `[docker-spawner]` prefix:

```
[docker-spawner] Spawning container: agent-1
  Image: cfn-agent:latest
  Memory: 512m
  Timeout: 300000ms
  Memory (bytes): 536870912
[docker-spawner] Creating container: agent-1
[docker-spawner] Container created: a1b2c3d4e5f6
[docker-spawner] Starting container...
[docker-spawner] Container started: a1b2c3d4e5f6
[docker-spawner] Waiting for container completion: a1b2c3d4e5f6
[docker-spawner] Container exited with code: 0
[docker-spawner] Cleaning up container: a1b2c3d4e5f6
[docker-spawner] Stopping container: a1b2c3d4e5f6
[docker-spawner] Container stopped: a1b2c3d4e5f6
[docker-spawner] Removing container: a1b2c3d4e5f6
[docker-spawner] Container removed: a1b2c3d4e5f6
```

## Integration with CFN Loop

Docker Spawner integrates with CFN Loop Trigger.dev tasks:

```typescript
import { task } from "@trigger.dev/sdk/v3";
import { DockerSpawner } from "./docker-spawner";

export const agentTask = task({
  id: "run-agent",
  run: async (payload) => {
    const spawner = new DockerSpawner();

    const result = await spawner.spawnAgentContainer({
      image: process.env.AGENT_IMAGE || "cfn-agent:latest",
      name: `agent-${payload.taskId}-${Date.now()}`,
      memory: payload.memory || "512m",
      env: {
        TASK_ID: payload.taskId,
        AGENT_TYPE: payload.agentType,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        ...payload.env,
      },
      mounts: [
        { source: "/workspace", target: "/workspace", readonly: false },
      ],
      networkMode: "cfn-network",
      timeout: payload.timeout || 1800000, // 30 minutes default
    });

    return {
      success: result.success,
      exitCode: result.exitCode,
      output: result.stdout,
      error: result.error,
      durationMs: result.durationMs,
      containerId: result.containerId,
    };
  },
});
```

## Testing

Run unit tests:

```bash
npm test -- src/lib/docker-spawner.test.ts
```

Integration tests (requires Docker daemon):

```bash
npm test -- src/lib/docker-spawner.test.ts --testNamePattern="Integration"
```

## Troubleshooting

### "Docker daemon not accessible"

```typescript
const accessible = await spawner.isAccessible();
if (!accessible) {
  console.error('Docker daemon is not running or not accessible');
  // Check DOCKER_HOST or socket permissions
}
```

**Solutions:**
- Ensure Docker daemon is running
- Verify socket-proxy is running (if using it)
- Check `DOCKER_HOST` environment variable
- Verify socket permissions: `ls -la /var/run/docker.sock`

### "Cannot create container"

**Check:**
- Image exists: `docker images | grep cfn-agent`
- Image is on correct registry
- Container name is unique (no existing containers with same name)
- Memory string is valid: `parseMemoryString('512m')` doesn't throw

### "Container timeout"

**Solutions:**
- Increase `timeout` parameter (in milliseconds)
- Profile container to see what's taking time
- Check logs: `docker logs <container-id>`
- Verify resource limits are sufficient

### "Permission denied" on socket

```bash
# Give Docker socket permission
sudo usermod -aG docker $USER
newgrp docker

# Or change socket permission
sudo chmod 666 /var/run/docker.sock
```

## Performance Benchmarks

Based on B10 stress test (10 parallel agents):

| Operation | Duration |
|-----------|----------|
| Create container | 50-100ms |
| Start container | 20-50ms |
| Run agent task | 2-5 minutes |
| Cleanup | 10-20ms |

**Memory overhead per container:** 376MB (peak)

## References

- `docker-compose.yml` - socket-proxy configuration
- `cfn-docker-coordination/docker-client.ts` - Full Docker client implementation
- `cli-executor.ts` - Timeout handling patterns
- `TRIGGER_TASKS_MANIFEST.md` - Integration with Trigger.dev
