# Trigger.dev CFN Loop Jobs

This directory contains trigger.dev job definitions for CFN Loop agent orchestration.

## Phase 1: Single Agent Spawn

### Job: test-single-agent

**File**: `test-single-agent.ts`

**Purpose**: Validate single agent container spawning for Phase 1 testing.

**Trigger Event**: `test.agent.spawn`

**Payload Schema**:
```typescript
{
  agentType: string;        // e.g., "backend-developer", "frontend-developer"
  taskDescription: string;  // Task for the agent to execute
}
```

**Container Configuration**:
- **Image**: `cfn-agent:test`
- **Network**: `cfn-network`
- **CPU Limit**: 2 cores
- **Memory Limit**: 4GB
- **Volumes**: `/workspace:/workspace` (read/write)
- **Auto-Remove**: Yes (`--rm` flag)

**Environment Variables**:
- `TASK_ID`: Unique task identifier from trigger.dev run context
- `AGENT_TYPE`: Type of agent being spawned

**Success Criteria**:
- ✅ Agent container spawns successfully
- ✅ Container executes CLI agent command
- ✅ stdout/stderr captured in job logs
- ✅ Container exits cleanly with `--rm`
- ✅ Resource limits enforced (2 CPU, 4GB RAM)
- ✅ Workspace volume accessible
- ✅ Exit code propagated to trigger.dev

## Usage

### 1. Build TypeScript

```bash
cd docker/trigger-dev
npm install
npm run build
```

### 2. Start Trigger.dev Server

```bash
docker-compose up -d
```

### 3. Trigger Test Event

**Via API**:
```bash
curl -X POST http://localhost:3000/api/v1/events \
  -H "Authorization: Bearer $TRIGGER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "test.agent.spawn",
    "payload": {
      "agentType": "backend-developer",
      "taskDescription": "Test container spawning"
    }
  }'
```

**Via Trigger.dev SDK** (programmatic):
```typescript
import { client } from "@trigger.dev/sdk";

await client.sendEvent({
  name: "test.agent.spawn",
  payload: {
    agentType: "backend-developer",
    taskDescription: "Implement user authentication",
  },
});
```

### 4. Monitor Execution

**Dashboard**: http://localhost:3040

**Logs**:
```bash
# Job logs
docker logs trigger-dev-worker -f

# Container logs (if debugging)
docker logs <container-name>
```

## Testing

**Run validation tests**:
```bash
./test-single-agent-job.sh
```

This script validates:
1. TypeScript build succeeds
2. cfn-agent:test image exists (builds if missing)
3. cfn-network exists (creates if missing)
4. Direct container spawning works
5. Job structure is valid

## Implementation Details

### Container Spawning

The job uses Node.js `child_process.exec` to spawn Docker containers:

```typescript
const dockerCmd = [
  "docker run --rm",
  `--name ${containerName}`,
  "--network cfn-network",
  "--cpus=2",
  "--memory=4g",
  `-e TASK_ID=${ctx.run.id}`,
  `-e AGENT_TYPE=${agentType}`,
  "-v /workspace:/workspace",
  "cfn-agent:test",
  agentType,
  `--task "${taskDescription}"`,
].join(" ");

const { stdout, stderr } = await execAsync(dockerCmd);
```

### Error Handling

- **Container execution errors**: Captured and logged with exit code
- **Timeout**: 30 minutes per agent execution
- **Buffer size**: 10MB for stdout/stderr capture
- **Job-level errors**: Logged and propagated to trigger.dev

### Resource Management

- **Memory**: 4GB per container (enforced by Docker `--memory` flag)
- **CPU**: 2 cores per container (enforced by Docker `--cpus` flag)
- **Cleanup**: Automatic via `--rm` flag (container removed on exit)
- **Network isolation**: cfn-network provides isolated networking

## Next Steps (Phase 2)

Phase 2 will extend this job to support:
- Multi-agent parallel execution (3+ agents concurrently)
- Resource conflict validation
- Network isolation testing
- Concurrent workspace access verification

## Troubleshooting

### Issue: Container fails to spawn

**Check**:
1. Docker daemon is running
2. cfn-network exists: `docker network inspect cfn-network`
3. cfn-agent:test image exists: `docker image inspect cfn-agent:test`
4. Sufficient system resources (4GB RAM available)

### Issue: Job timeout

**Increase timeout** in `test-single-agent.ts`:
```typescript
const { stdout, stderr } = await execAsync(dockerCmd, {
  timeout: 60 * 60 * 1000, // 60 minutes
});
```

### Issue: Output not captured

**Check buffer size** (default 10MB):
```typescript
const { stdout, stderr } = await execAsync(dockerCmd, {
  maxBuffer: 50 * 1024 * 1024, // 50MB
});
```

### Issue: Container not cleaned up

**Verify `--rm` flag** is present in Docker command. If manual cleanup needed:
```bash
docker ps -a | grep cfn-agent | awk '{print $1}' | xargs docker rm -f
```

## Related Documentation

- **Plan**: `/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/9ad08ade1656a61406c6e8c78f16cc38aca1eba9b40e9fbad6aec263a8c30631/planning/trigger/TRIGGER_DEV_PER_AGENT_CONTAINER_PLAN.md`
- **Docker CLAUDE.md**: `/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/9ad08ade1656a61406c6e8c78f16cc38aca1eba9b40e9fbad6aec263a8c30631/docker/CLAUDE.md`
- **Trigger.dev CLAUDE.md**: `/mnt/wsl/docker-desktop-bind-mounts/Ubuntu/9ad08ade1656a61406c6e8c78f16cc38aca1eba9b40e9fbad6aec263a8c30631/docker/trigger-dev/CLAUDE.md`
