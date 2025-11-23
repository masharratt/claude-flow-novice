# Trigger.dev Worker Image with CFN Agent Infrastructure

This document describes the custom trigger.dev worker image that integrates CFN Loop agent execution capabilities.

---

## Phase 1.1: Docker Image Enhancement (2025-11-23)

**Status:** ✅ Complete - Ready for Build Testing
**Objective:** Enhanced worker image with per-agent container isolation and cost optimization

### Key Enhancements

1. **Multi-stage build** - Smaller final image (excludes TypeScript compiler, ~100MB savings)
2. **AGENT_TYPE build argument** - Enables per-agent specialization at build time
3. **Agent profiles baked in** - 62 CFN agents with metadata accessible at runtime
4. **Production dependencies** - jq, docker.io, bash, curl (~46MB total)
5. **Docker access fix** - GID 1001 supplementary group (Phase 0 issue resolved)
6. **Security hardening** - Non-root execution, minimal attack surface
7. **Health checks** - Validates worker responsiveness every 30s

### Phase 0 Validation Results

| Test | Status | Evidence |
|------|--------|----------|
| Docker socket access | ✅ Pass | GID 1001 fix applied |
| Sibling container spawning | ✅ Pass | 10 concurrent agents tested |
| Redis coordination | ✅ Pass | Container-to-container working |
| Environment propagation | ✅ Pass | API keys reach containers |
| Resource limits | ✅ Pass | CPU/memory enforced |
| Exit code propagation | ✅ Pass | Failures detected |
| Container cleanup | ✅ Pass | No orphaned containers |

**Full report:** `planning/trigger/phase0-assumption-test-results.md`

### Build Commands

**Recommended (96% faster on WSL2):**
```bash
./.claude/skills/docker-build/build.sh \
  --dockerfile docker/trigger-dev/Dockerfile.worker \
  --tag cfn-trigger-worker:latest
```

**With agent specialization:**
```bash
docker build -f docker/trigger-dev/Dockerfile.worker \
  --build-arg AGENT_TYPE=backend-developer \
  -t cfn-trigger-worker:backend .
```

### Test Commands

**Verify agent profiles:**
```bash
docker run --rm cfn-trigger-worker:latest \
  ls -la /triggerdotdev/.claude/agents/cfn-dev-team/
```

**Test Docker access:**
```bash
docker run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  cfn-trigger-worker:latest docker ps
```

**Test jq (metadata parsing):**
```bash
docker run --rm cfn-trigger-worker:latest jq --version
```

### Image Size

| Component | Size | Notes |
|-----------|------|-------|
| Base (trigger.dev) | ~400-500MB | Official upstream |
| System deps | ~46MB | jq, docker.io, bash, curl |
| Agent profiles | ~2-3MB | 62 markdown files |
| Workflows | ~10-20MB | Compiled TypeScript |
| Node modules | ~50-100MB | Workflow deps |
| **Total** | **~520-670MB** | Production-ready |

### Next: Phase 1.2

**Objective:** Spawn one agent in isolated container from trigger.dev job

**Tasks:**
1. Build minimal `cfn-agent:test` image
2. Create single-agent spawn job
3. Verify execution and output capture
4. Test cleanup and resource limits

---

## Overview

The worker image extends the official trigger.dev base image with:
- CFN agent execution environment (claude-flow-novice CLI)
- Per-agent container spawning capabilities via Docker-in-Docker
- Custom AI provider routing (Z.ai, Kimi, OpenRouter, Anthropic)
- Agent template mounting for dynamic agent loading

## Image Architecture

```
Base: ghcr.io/triggerdotdev/trigger.dev:latest
├── CFN Dependencies
│   ├── claude-flow-novice CLI (global npm install)
│   ├── TypeScript compiler (ts-node)
│   └── Docker CLI (for per-agent containers)
├── Trigger.dev Workflows
│   ├── trigger-dev/src/ (workflow definitions)
│   ├── trigger-dev/package.json (dependencies)
│   └── Built JavaScript (npm run build)
├── Agent Templates
│   └── .claude/agents/ (mounted from host)
└── Deliverables Directory
    └── /tmp/trigger-dev-deliverables (worker output)
```

## Build Process

### Standard Build (Recommended - 96% faster)

Use the docker-build skill for optimal performance on WSL2:

```bash
# From project root
./.claude/skills/docker-build/build.sh \
  --dockerfile docker/trigger-dev/Dockerfile.worker \
  --tag trigger-dev-worker-cfn:latest
```

**Performance Benefits:**
- 96% faster builds vs direct Docker build on Windows mounts
- Automatic context sync to Linux native storage
- BuildKit optimization enabled
- Prevents OOM errors (exit code 137)

### Manual Build (Alternative)

```bash
# Direct Docker build (slower on WSL2)
docker build -f docker/trigger-dev/Dockerfile.worker \
  -t trigger-dev-worker-cfn:latest .
```

**Note:** Manual builds on WSL2 Windows mounts may take 755s vs <20s with Linux native storage.

## Environment Configuration

### Required Environment Variables

```bash
# Trigger.dev Configuration
TRIGGER_API_KEY=tr_dev_...              # API authentication
TRIGGER_API_URL=http://trigger-webapp:3000  # Webapp endpoint
WORKER_MODE=true                         # Enable worker mode
WORKER_ID=trigger-worker-1               # Unique worker identifier

# Database and Services
DATABASE_URL=postgresql://...            # PostgreSQL connection
REDIS_URL=redis://redis:6379             # Redis for job queue
MINIO_URL=http://minio:9000              # Object storage
CLICKHOUSE_URL=http://clickhouse:8123    # Analytics database

# CFN Agent Execution
ANTHROPIC_API_KEY=sk-ant-...             # Claude API key (required)
CFN_WORKSPACE=/workspace                 # Agent workspace path
CFN_DELIVERABLES_PATH=/tmp/trigger-dev-deliverables  # Output directory

# AI Provider Configuration (Optional)
CFN_CUSTOM_ROUTING=true                  # Enable custom provider routing
CFN_DEFAULT_PROVIDER=zai                 # Default to Z.ai for cost optimization
ZAI_API_KEY=...                          # Z.ai API key
KIMI_API_KEY=...                         # Kimi API key
OPENROUTER_API_KEY=...                   # OpenRouter API key
```

### Docker Compose Integration

The worker is configured in `docker-compose.yml`:

```yaml
trigger-worker:
  build:
    context: ../..
    dockerfile: docker/trigger-dev/Dockerfile.worker
  image: trigger-dev-worker-cfn:latest
  container_name: trigger-dev-worker
  volumes:
    - /tmp/trigger-dev-deliverables:/tmp/trigger-dev-deliverables
    - ../..:/workspace:rw  # Project root for agent access
    - ../../.env:/workspace/.env:ro  # API keys
    - /var/run/docker.sock:/var/run/docker.sock  # Docker-in-Docker
  networks:
    - trigger-cfn-network
  restart: unless-stopped
```

## Agent Execution

### How Agents are Loaded

1. **Agent Type Selection**: Specified via `AGENT_TYPE` environment variable
2. **Template Location**: `claude-assets/agents/cfn-dev-team/developers/[agent-type].md`
3. **Provider Routing**: Determined by agent template frontmatter or default provider
4. **Execution**: `npx claude-flow-novice agent [agent-type] --task-id [id]`

### Agent Template Structure

Each agent template includes provider parameters:

```markdown
---
name: backend-developer
description: Backend development specialist
tools: [Read, Write, Edit, Bash, Grep]
model: sonnet
type: specialist
---

<!-- PROVIDER_PARAMETERS
provider: zai
model: glm-4.6
-->
```

### Supported Agent Types

Currently available agent templates:
- `backend-developer` - Backend API and service development
- `react-frontend-engineer` - React/TypeScript frontend development
- `devops-engineer` - Infrastructure and deployment automation
- `tester` - Test implementation and validation
- `reviewer` - Code review and quality assessment

**Note:** All agent templates are located in `claude-assets/agents/cfn-dev-team/`.

## AI Provider Routing

### Default Provider (Z.ai)

When `CFN_CUSTOM_ROUTING=true` and no explicit provider is set in agent template:
- **Provider**: Z.ai
- **Model**: glm-4.6
- **Cost**: $0.50/1M tokens (95-98% savings vs Anthropic)

### Explicit Provider Configuration

Agents can specify custom providers in their templates:

```markdown
<!-- PROVIDER_PARAMETERS
provider: kimi
model: moonshot-v1-8k
-->
```

### Available Providers

| Provider | Model | Cost/1M Tokens | Use Case |
|----------|-------|----------------|----------|
| **zai** | glm-4.6 | $0.50 | Cost-optimized (default) |
| **kimi** | moonshot-v1-8k | $2.00 | Mid-range quality |
| **openrouter** | Various | Varies | Access 400+ models |
| **anthropic** | claude-3-5-sonnet | $15.00 | Premium quality |

## Docker-in-Docker Support

### Per-Agent Container Spawning

The worker supports spawning individual containers for each agent execution:

```bash
# Example: Spawn backend-developer agent in isolated container
docker run --rm \
  --name agent-backend-dev-$TASK_ID \
  --network trigger-cfn-network \
  -e AGENT_TYPE="backend-developer" \
  -e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  -e CFN_WORKSPACE="/workspace" \
  -v /workspace:/workspace:rw \
  -v /workspace/.env:/workspace/.env:ro \
  trigger-dev-worker-cfn:latest \
  npx claude-flow-novice agent backend-developer --task-id "$TASK_ID"
```

### Volume Mounts Required

```yaml
volumes:
  # Project root (read/write for agent file operations)
  - /path/to/project:/workspace:rw

  # Environment file (read-only for API keys)
  - /path/to/project/.env:/workspace/.env:ro

  # Docker socket (for per-agent spawning)
  - /var/run/docker.sock:/var/run/docker.sock

  # Deliverables output (agent results)
  - /tmp/trigger-dev-deliverables:/tmp/trigger-dev-deliverables
```

## Testing

### Automated Test Suite

Comprehensive test suite located at `tests/trigger-dev/test-worker-image.sh`:

```bash
# Run all tests
./tests/trigger-dev/test-worker-image.sh
```

### Test Coverage

The test suite validates:

1. **Image Build** - Worker image builds successfully with all dependencies
2. **Agent Profile Loading** - backend-developer template loads correctly from mounted volume
3. **Default Provider Routing** - Z.ai glm-4.6 provider defaults when `CFN_CUSTOM_ROUTING=true`
4. **Explicit Provider** - Kimi provider configuration via environment variables
5. **Clean Exit** - Container shuts down gracefully with exit code 0
6. **Error Handling** - Invalid agent type handled without catastrophic failure

### Manual Testing

#### Test 1: Build Image

```bash
# Build worker image (recommended - 96% faster)
./.claude/skills/docker-build/build.sh \
  --dockerfile docker/trigger-dev/Dockerfile.worker \
  --tag trigger-dev-worker-cfn:latest

# Verify image exists
docker images | grep trigger-dev-worker-cfn
```

#### Test 2: Verify Agent Templates Accessible

```bash
# Start container with backend-developer agent type
docker run -d \
  --name test-worker-profile \
  --network trigger-cfn-network \
  -e AGENT_TYPE="backend-developer" \
  -e CFN_WORKSPACE="/workspace" \
  -v $(pwd):/workspace:rw \
  trigger-dev-worker-cfn:latest \
  sh -c "ls -la /workspace/claude-assets/agents/cfn-dev-team/developers/ && sleep 5"

# Check logs for agent template listing
docker logs test-worker-profile

# Verify backend-developer.md is accessible
docker exec test-worker-profile test -f /workspace/claude-assets/agents/cfn-dev-team/developers/backend-developer.md
echo $?  # Should output 0 (success)

# Cleanup
docker rm -f test-worker-profile
```

#### Test 3: Test Provider Routing

```bash
# Test default Z.ai routing
docker run -d \
  --name test-worker-zai \
  --network trigger-cfn-network \
  -e AGENT_TYPE="backend-developer" \
  -e CFN_CUSTOM_ROUTING="true" \
  -e NODE_ENV="development" \
  trigger-dev-worker-cfn:latest \
  sh -c "env | grep -E '(CFN|PROVIDER)' && sleep 5"

# Check environment variables
docker logs test-worker-zai

# Cleanup
docker rm -f test-worker-zai
```

#### Test 4: Test Explicit Provider (Kimi)

```bash
# Test Kimi provider routing
docker run -d \
  --name test-worker-kimi \
  --network trigger-cfn-network \
  -e AGENT_TYPE="backend-developer" \
  -e CFN_CUSTOM_ROUTING="true" \
  -e CFN_DEFAULT_PROVIDER="kimi" \
  -e KIMI_API_KEY="test-key" \
  trigger-dev-worker-cfn:latest \
  sh -c "env | grep -E '(PROVIDER|KIMI)' && sleep 5"

# Verify KIMI_API_KEY is set
docker exec test-worker-kimi sh -c 'test -n "$KIMI_API_KEY"'
echo $?  # Should output 0 (success)

# Cleanup
docker rm -f test-worker-kimi
```

#### Test 5: Test Container Exit

```bash
# Test clean exit
docker run -d \
  --name test-worker-exit \
  --network trigger-cfn-network \
  trigger-dev-worker-cfn:latest \
  sh -c "echo 'Worker started' && sleep 1 && echo 'Worker exiting' && exit 0"

# Wait for exit
sleep 3

# Check exit code
docker inspect --format='{{.State.ExitCode}}' test-worker-exit
# Should output 0

# Cleanup
docker rm -f test-worker-exit
```

#### Test 6: Test Error Handling

```bash
# Test invalid agent type
docker run -d \
  --name test-worker-invalid \
  --network trigger-cfn-network \
  -e AGENT_TYPE="nonexistent-agent" \
  -e CFN_WORKSPACE="/workspace" \
  -v $(pwd):/workspace:rw \
  trigger-dev-worker-cfn:latest \
  sh -c "ls /workspace/claude-assets/agents/cfn-dev-team/developers/nonexistent-agent.md 2>&1; exit 0"

# Check logs for error handling
docker logs test-worker-invalid
# Should show "No such file or directory" or similar

# Cleanup
docker rm -f test-worker-invalid
```

### Expected Test Results

All tests should pass with these outcomes:

| Test | Expected Result |
|------|----------------|
| **Test 1** | Image builds successfully, contains Node.js environment |
| **Test 2** | backend-developer.md accessible, container runs without errors |
| **Test 3** | CFN_CUSTOM_ROUTING=true shown, Z.ai is default provider |
| **Test 4** | KIMI_API_KEY set correctly, Kimi provider configured |
| **Test 5** | Container exits with code 0, logs show clean shutdown |
| **Test 6** | Missing file error reported, container doesn't crash |

### Troubleshooting Tests

#### Image Build Fails

```bash
# Check Docker version
docker --version  # Should be 20.10+ or later

# Verify Docker daemon running
docker ps

# Check disk space
df -h

# Try rebuild without cache
./.claude/skills/docker-build/build.sh --no-cache \
  --dockerfile docker/trigger-dev/Dockerfile.worker \
  --tag trigger-dev-worker-cfn:latest
```

#### Agent Template Not Found

```bash
# Verify agent template exists
ls -la claude-assets/agents/cfn-dev-team/developers/backend-developer.md

# Check volume mount path
docker run --rm -v $(pwd):/workspace:rw alpine ls -la /workspace/claude-assets/agents/

# Verify PWD is project root
echo $PWD  # Should be /path/to/claude-flow-novice
```

#### Provider Routing Issues

```bash
# Check environment variables are passed
docker inspect test-worker-zai | grep -A 20 Env

# Verify CFN_CUSTOM_ROUTING in docker-compose
grep -A 10 "trigger-worker:" docker/trigger-dev/docker-compose.yml | grep CFN_CUSTOM_ROUTING

# Check .env file exists
test -f .env && echo "Found" || echo "Missing"
```

## Production Deployment

### Build for Production

```bash
# Build optimized image
NODE_ENV=production ./.claude/skills/docker-build/build.sh \
  --dockerfile docker/trigger-dev/Dockerfile.worker \
  --tag trigger-dev-worker-cfn:v1.0.0

# Tag for registry
docker tag trigger-dev-worker-cfn:v1.0.0 \
  registry.example.com/trigger-dev-worker-cfn:v1.0.0

# Push to registry
docker push registry.example.com/trigger-dev-worker-cfn:v1.0.0
```

### Security Considerations

1. **API Keys**: Never commit `.env` file to version control
2. **Docker Socket**: Restrict access to `/var/run/docker.sock` in production
3. **Volume Permissions**: Use read-only mounts where possible
4. **Network Isolation**: Use Docker networks for service isolation
5. **Image Scanning**: Scan images for vulnerabilities before deployment

### Monitoring

#### Health Checks

```bash
# Check worker container health
docker ps --filter "name=trigger-worker" --format "table {{.Names}}\t{{.Status}}"

# View worker logs
docker logs trigger-dev-worker --tail=50 --follow

# Check trigger.dev job queue
docker exec trigger-dev-redis redis-cli LLEN "trigger:queue:default"
```

#### Metrics

Monitor these metrics in production:
- Container CPU/memory usage
- Job processing rate (jobs/minute)
- Average job duration
- Error rate (failed jobs / total jobs)
- Agent spawn success rate

## Migration from spawn-workers.js

The worker image replaces the legacy `spawn-workers.js` orchestration:

### Old Pattern (spawn-workers.js)

```javascript
// Legacy: Node.js script spawning agents
const agents = ['backend-dev', 'tester', 'reviewer'];
for (const agent of agents) {
  await spawnAgent(agent, taskId);
}
```

### New Pattern (Trigger.dev Jobs)

```typescript
// Modern: Trigger.dev job orchestration
export const cfnLoopJob = client.defineJob({
  id: "cfn-loop-execution",
  name: "CFN Loop Agent Execution",
  trigger: { event: { name: "cfn.loop.start" } },
  run: async (payload, io, ctx) => {
    // Agent execution handled by worker container
    const result = await io.runTask("execute-agent", async () => {
      // Worker container spawns agent with proper isolation
      return executeAgent(payload.agentType, payload.taskId);
    });
    return result;
  },
});
```

### Migration Benefits

1. **Isolation**: Each agent runs in isolated container
2. **Scalability**: Workers scale independently of webapp
3. **Reliability**: Failed jobs automatically retry
4. **Monitoring**: Trigger.dev dashboard provides visibility
5. **Cost Optimization**: Custom provider routing reduces API costs by 95-98%

## Phase 1.1: Worker Entrypoint (entrypoint.sh)

### Overview

The entrypoint script (`docker/trigger-dev/entrypoint.sh`) initializes the worker container environment for CFN agent execution. It handles:

1. **AGENT_TYPE Validation** - Validates the agent type environment variable
2. **Agent Profile Resolution** - Locates the agent profile in .claude/agents/cfn-dev-team/
3. **Provider Parameters Parsing** - Extracts PROVIDER_PARAMETERS from agent profile frontmatter
4. **Provider Environment Setup** - Configures provider-specific API keys and endpoints
5. **Agent Context Initialization** - Prepares the execution environment for the task

### Entrypoint Execution Flow

```
AGENT_TYPE Environment Variable
         ↓
    VALIDATION
    ├─ Check variable is set
    ├─ Check format is valid (^[a-z0-9_-]+$)
    └─ Exit 1 if invalid
         ↓
AGENT PROFILE RESOLUTION
├─ Search .claude/agents/cfn-dev-team/{category}/*.md
├─ Match agent name across directory hierarchy
└─ Exit 1 if not found
         ↓
PROVIDER PARAMETERS PARSING
├─ Extract <!-- PROVIDER_PARAMETERS block from markdown
├─ Parse "provider: value" configuration
├─ Parse "model: value" configuration
├─ Default to Z.ai + glm-4.6 if missing
└─ Continue execution
         ↓
PROVIDER ENVIRONMENT SETUP
├─ Case match on provider type (zai, kimi, anthropic, etc.)
├─ Validate API key is set for selected provider
├─ Set provider-specific environment variables
│  ├─ ANTHROPIC_API_KEY (or provider-specific key)
│  └─ ANTHROPIC_BASE_URL (or provider endpoint)
└─ Exit 2 if API key missing
         ↓
AGENT CONTEXT INITIALIZATION
├─ Export AGENT_TYPE, AGENT_PROVIDER, AGENT_MODEL
├─ Export AGENT_PROFILE_PATH for downstream access
├─ Create CFN_WORKSPACE directory structure
├─ Log initialization summary
└─ Return exit code 0 (success)
         ↓
AGENT TASK EXECUTION
├─ Worker continues with trigger.dev job execution
├─ Agent context available to spawned processes
└─ Task completion and result collection
```

### Required Environment Variables

**AGENT_TYPE** (Required)
- **Format:** lowercase with hyphens/underscores (e.g., `backend-developer`, `docker-specialist`)
- **Validation:** Must match `^[a-z0-9_-]+$` pattern
- **Resolution:** Searched in `.claude/agents/cfn-dev-team/{category}/*.md`
- **Exit Code:** 1 if missing or invalid

**Provider API Key** (Required, varies by provider)
- **Z.ai:** `ZAI_API_KEY`
- **Kimi:** `KIMI_API_KEY`
- **Anthropic:** `ANTHROPIC_API_KEY`
- **Gemini:** `GEMINI_API_KEY`
- **XAi:** `XAI_API_KEY`
- **OpenRouter:** `OPENROUTER_API_KEY`

### Optional Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `AGENT_PROFILES_ROOT` | `/triggerdotdev/.claude/agents/cfn-dev-team` | Override agent profiles location |
| `CFN_WORKSPACE` | `/workspace` | Workspace directory for file operations |
| `CFN_TASK_ID` | (unset) | Task identifier for Redis coordination |
| `DEBUG` | `false` | Enable debug logging to stderr |

### PROVIDER_PARAMETERS Format

Agent profiles include provider configuration in HTML comment block:

```markdown
---
name: docker-specialist
description: Docker containerization and orchestration expert
tools: [Read, Write, Edit, Bash]
model: sonnet
---

<!-- PROVIDER_PARAMETERS
provider: zai
model: glm-4.6
-->

# Docker Specialist

## Core Responsibilities
...
```

**Format Rules:**
- Block delimiters: `<!-- PROVIDER_PARAMETERS` ... `-->`
- Parameters on separate lines with format: `key: value`
- Leading whitespace allowed (stripped during parsing)
- Both provider and model optional (defaults applied if missing)

### Provider Setup Examples

**Z.ai (Cost-Optimized)**
```bash
export ZAI_API_KEY="${ZAI_API_KEY}"
export ZAI_BASE_URL="https://api.z.ai/v1"
export ANTHROPIC_API_KEY="${ZAI_API_KEY}"         # Alias for compatibility
export ANTHROPIC_BASE_URL="https://api.z.ai/v1"
```

**Anthropic (Premium)**
```bash
export ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY}"
# No ANTHROPIC_BASE_URL (uses Anthropic defaults)
```

**Kimi (Mid-Range)**
```bash
export KIMI_API_KEY="${KIMI_API_KEY}"
export ANTHROPIC_API_KEY="${KIMI_API_KEY}"        # Alias for compatibility
export ANTHROPIC_BASE_URL="https://api.moonshot.cn/v1"
```

### Exit Codes

| Code | Meaning | Recovery |
|------|---------|----------|
| 0 | Success | Agent context initialized, task ready |
| 1 | Validation/Resolution failed | Check AGENT_TYPE, verify agent profile exists |
| 2 | Provider configuration error | Verify API key is set for selected provider |
| 3 | Environment variable missing | Check required variables for provider |

### Usage in Docker

```bash
# Basic usage with Z.ai (default provider)
docker run --rm \
  -e AGENT_TYPE=backend-developer \
  -e ZAI_API_KEY="sk_live_xxx" \
  -v /workspace:/workspace:rw \
  cfn-trigger-worker:latest

# With custom provider
docker run --rm \
  -e AGENT_TYPE=security-specialist \
  -e ANTHROPIC_API_KEY="sk-ant-xxx" \
  -v /workspace:/workspace:rw \
  cfn-trigger-worker:latest

# With debug logging
docker run --rm \
  -e AGENT_TYPE=docker-specialist \
  -e ZAI_API_KEY="sk_live_xxx" \
  -e DEBUG=true \
  -v /workspace:/workspace:rw \
  cfn-trigger-worker:latest 2>&1 | tee worker.log
```

### Logging Output

Entrypoint logs to stderr with standardized format:

```
[ENTRYPOINT] 2025-11-23 12:13:04 :: Agent profile resolved: ./.claude/agents/cfn-dev-team/dev-ops/docker-specialist.md
[ENTRYPOINT] 2025-11-23 12:13:04 :: Parsed provider: zai, model: glm-4.6
[ENTRYPOINT] 2025-11-23 12:13:04 :: Agent context initialized:
[ENTRYPOINT] 2025-11-23 12:13:04 ::   AGENT_TYPE: docker-specialist
[ENTRYPOINT] 2025-11-23 12:13:04 ::   AGENT_PROVIDER: zai
[ENTRYPOINT] 2025-11-23 12:13:04 ::   AGENT_MODEL: glm-4.6
[ENTRYPOINT] 2025-11-23 12:13:04 :: Entrypoint initialization complete
```

### Security Considerations

1. **API Key Protection**: Never hardcode keys in Dockerfile, pass via environment only
2. **Credential Redaction**: Keys never logged to stdout/stderr
3. **File Permissions**: Agent profiles copied with restricted permissions
4. **Network Isolation**: Use dedicated Docker network (cfn-network) for service discovery

## References

- **Trigger.dev Documentation**: https://trigger.dev/docs
- **Docker-in-Docker**: https://hub.docker.com/_/docker
- **CFN Loop Architecture**: `docs/CFN_LOOP_ARCHITECTURE.md`
- **Custom Provider Routing**: `docs/CUSTOM_PROVIDER_ROUTING.md`
- **Agent Templates**: `claude-assets/agents/cfn-dev-team/README.md`

---

**Last Updated**: 2025-11-23
**Version**: 1.0.0
**Maintained By**: Backend Developer Agent (Phase 1.1 Trigger.dev Integration)
