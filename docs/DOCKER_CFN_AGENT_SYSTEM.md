# Docker CFN Agent System Containerization Guide

**Purpose:** Comprehensive guide to containerizing the Claude Flow Novice (CFN) agent system with complete infrastructure support.

**Cross-Reference:** `.claude/agents/cfn-dev-team/dev-ops/docker-specialist.md`

---

## Table of Contents

1. [CFN System Integration](#cfn-system-integration)
2. [.dockerignore Best Practices](#dockerignore-best-practices-for-agent-systems)
3. [Build Performance Optimization](#build-performance-optimization)
4. [Multi-Stage Builds](#multi-stage-builds-for-agent-containers)
5. [Environment Credential Management](#environment-credential-management)
6. [Agent Container Entrypoints](#agent-container-entrypoints)
7. [Validation Requirements](#validation-requirements)
8. [Container Registry Management](#container-registry-management)
9. [Resource Limits and Health Checks](#resource-limits-and-health-checks)

---

## CFN System Integration

When containerizing the Claude Flow Novice agent system, the Docker image must include the complete CFN infrastructure for agents to function properly.

### Required CFN Components

**Agent Definitions**: 62 agents across 11 categories
```bash
.claude/agents/cfn-dev-team/
├── analysts/         (1 agent)
├── architecture/     (5 agents)
├── coordinators/     (4 agents)
├── dev-ops/          (5 agents)
├── developers/       (10 agents)
├── documentation/    (5 agents)
├── product-owners/   (4 agents)
├── reviewers/        (7 agents)
├── testers/          (9 agents)
├── testing/          (1 agent)
└── utility/          (9 agents)
```

**Skill Modules**: 72 skills in `.claude/skills/*/SKILL.md`
- `cfn-coordination/` - Agent coordination protocols
- `cfn-agent-spawning/` - Agent lifecycle management
- `cfn-loop-validation/` - CFN Loop gate/consensus checks
- `pre-edit-backup/` - File backup before edits
- `hook-pipeline/` - Post-edit validation hooks

**Slash Commands**: 57 commands in `.claude/commands/**/*.md`
- `/cfn-loop-cli` - Production CFN Loop (cost-optimized)
- `/cfn-loop-task` - Debug CFN Loop (full visibility)
- `/switch-api` - Change Main Chat API provider

**Project Configuration**: `CLAUDE.md` - Core project instructions

### Error Without CFN System

```
Error: Agent definition not found: typescript-specialist
```

This occurs when `.dockerignore` excludes markdown files, preventing agents from loading.

---

## .dockerignore Best Practices for Agent Systems

**Critical Pattern**: Wildcard exclusions (like `*.md`) must have explicit exceptions for CFN system files.

### Correct Configuration

```dockerignore
# Documentation (exclude general docs)
docs/
*.md
!README.md
!CLAUDE.md              # ← Project configuration (REQUIRED)
!LICENSE

# CFN Agent System (REQUIRED for agent functionality)
!.claude/**/*.md        # ← 62 agents + 72 skills + 57 commands
!claude-assets/**/*.md  # ← Asset documentation

# Development files (exclude)
node_modules/
npm-debug.log
.git/
.gitignore
.env
.DS_Store
coverage/
.vscode/
*.test.js
```

### Why This Matters

- Without exceptions, `*.md` excludes ALL markdown files
- Agents cannot load their definitions
- Skills and commands become unavailable
- Silent failures occur (agents report success but do no work)

### Verification

```bash
# After build, verify agent files are present
docker run --rm IMAGE_NAME find .claude/agents -name "*.md" | wc -l
# Expected: 62 agent files

docker run --rm IMAGE_NAME find .claude/skills -name "SKILL.md" | wc -l
# Expected: 72 skill files

docker run --rm IMAGE_NAME find .claude/commands -name "*.md" | wc -l
# Expected: 57 command files

docker run --rm IMAGE_NAME cat CLAUDE.md | head -5
# Expected: CLAUDE.md content visible
```

---

## Build Performance Optimization

### BuildKit Strategies

**Enable BuildKit** (80-90% faster rebuilds):
```bash
export DOCKER_BUILDKIT=1

# Build with inline cache
docker build \
  --cache-from myregistry/claude-flow-novice:agent \
  --build-arg BUILDKIT_INLINE_CACHE=1 \
  -t claude-flow-novice:agent \
  -f Dockerfile.agent .
```

**Cache Mounts** (persist dependencies across builds):
```dockerfile
# syntax=docker/dockerfile:1.4

FROM node:18-alpine

# Cache npm dependencies
RUN --mount=type=cache,target=/root/.npm \
    npm ci --production

# Cache agent build artifacts
RUN --mount=type=cache,target=/app/.cache \
    npm run build
```

### Layer Ordering for Cache Efficiency

Order Dockerfile layers from least-to-most frequently changed:

```dockerfile
# Layer 1: Base image + system packages (rarely change)
FROM node:18-alpine
RUN apk add --no-cache bash redis git jq

# Layer 2: Package dependencies (changes occasionally)
WORKDIR /app
COPY package*.json ./
RUN npm ci --production && npm cache clean --force

# Layer 3: Compiled code (changes frequently)
COPY dist/ ./dist/

# Layer 4: CFN system files (changes frequently)
COPY CLAUDE.md ./
COPY .claude/ ./.claude/
COPY claude-assets/ ./claude-assets/
COPY scripts/ ./scripts/

# Layer 5: Entrypoint (rarely changes)
COPY scripts/docker-agent-init.sh /usr/local/bin/
ENTRYPOINT ["docker-agent-init.sh"]
```

**Impact**: Current single-stage builds invalidate cache on ANY file change. Optimized ordering only invalidates cache for changed layers.

**Performance Example**:
- Full build (cold cache): ~20 minutes
- Optimized rebuild (warm cache): ~2-4 minutes (80-90% reduction)
- Source code change only: ~1-2 minutes (only layers 3-4 rebuild)

---

## Multi-Stage Builds for Agent Containers

```dockerfile
# Stage 1: Build dependencies
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Build TypeScript
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Stage 2: Production runtime
FROM node:18-alpine AS runtime
WORKDIR /app

# Install runtime dependencies only
RUN apk add --no-cache bash redis git jq

# Copy production node_modules
COPY --from=builder /app/node_modules ./node_modules

# Copy compiled code
COPY --from=builder /app/dist ./dist

# Copy CFN system (complete agent infrastructure)
COPY CLAUDE.md ./
COPY .claude/ ./.claude/
COPY claude-assets/ ./claude-assets/
COPY scripts/ ./scripts/
COPY package*.json ./

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup && \
    chown -R appuser:appgroup /app
USER appuser

# Entrypoint
COPY --chown=appuser:appgroup scripts/docker-agent-init.sh /usr/local/bin/
ENTRYPOINT ["docker-agent-init.sh"]
CMD ["agent"]
```

**Benefits**:
- Smaller final image (no build tools in runtime)
- Faster builds (parallel stage execution)
- Better layer caching (build and runtime separated)

---

## Environment Credential Management

### Multi-Provider API Support

The CFN system supports multiple AI providers for cost optimization and redundancy:

**Supported Providers**:
```bash
# Z.ai (default) - Cost-optimized ($0.50/1M tokens)
CLAUDE_API_PROVIDER=zai
ZAI_API_KEY=<key>
ZAI_BASE_URL=https://api.z.ai/api/anthropic

# Kimi - Mid-range ($2/1M tokens)
CLAUDE_API_PROVIDER=kimi
KIMI_API_KEY=<key>
KIMI_BASE_URL=https://api.moonshot.cn/v1

# OpenRouter - 400+ models (varies)
CLAUDE_API_PROVIDER=openrouter
OPENROUTER_API_KEY=<key>
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1

# Anthropic - Premium ($15/1M tokens)
CLAUDE_API_PROVIDER=anthropic
ANTHROPIC_API_KEY=<key>
```

### Passing Credentials to Containers

#### Method 1: Environment File (Recommended for development)
```bash
# Pass all credentials via .env file
docker run --env-file .env \
  claude-flow-novice:agent \
  typescript-specialist "Fix TypeScript errors"

# Override provider per container
docker run --env-file .env \
  -e CLAUDE_API_PROVIDER=kimi \
  claude-flow-novice:agent \
  backend-developer "Implement API endpoint"
```

#### Method 2: Docker Secrets (Recommended for production)
```bash
# Create secrets
echo "$ZAI_API_KEY" | docker secret create zai_api_key -
echo "$KIMI_API_KEY" | docker secret create kimi_api_key -

# Use in Docker service
docker service create \
  --name cfn-agent \
  --secret zai_api_key \
  --secret kimi_api_key \
  -e CLAUDE_API_PROVIDER=zai \
  claude-flow-novice:agent
```

#### Method 3: BuildKit Secrets (For private dependencies)
```dockerfile
# Install private npm packages
RUN --mount=type=secret,id=npm_token \
    npm config set //registry.npmjs.org/:_authToken=$(cat /run/secrets/npm_token) && \
    npm ci --production
```

```bash
# Build with secret
docker build \
  --secret id=npm_token,src=$HOME/.npmrc \
  -t claude-flow-novice:agent \
  -f Dockerfile.agent .
```

### Anti-Pattern

Never hardcode credentials in Dockerfile or commit `.env` files:
```dockerfile
# ❌ WRONG - credentials in image
ENV ZAI_API_KEY=4089902faf6c4d30baf352a3d144e1a2
ENV ANTHROPIC_API_KEY=sk-ant-1234567890

# ✅ CORRECT - credentials passed at runtime
# (no ENV declarations for secrets)
```

### Cost Savings Example

Running 32 agents in parallel:
```bash
# Anthropic (premium)
32 agents × 10K tokens × $15/1M = $4.80

# Z.ai (default)
32 agents × 10K tokens × $0.50/1M = $0.16

# Savings: $4.64 (97% reduction)
```

---

## Agent Container Entrypoints

### Initialization Script Pattern

Container entrypoints must write Redis coordination data for agent health monitoring and recovery.

**Example**: `scripts/docker-agent-init.sh`
```bash
#!/bin/bash
set -euo pipefail

# Generate agent ID if not provided
AGENT_ID="${AGENT_ID:-docker-$(date +%s)-$$}"
TASK_ID="${TASK_ID:-}"
AGENT_TYPE="${AGENT_TYPE:-unknown}"

# Write spawning signal to Redis
if [[ -n "$TASK_ID" ]]; then
  redis-cli -h "${REDIS_HOST:-localhost}" -p "${REDIS_PORT:-6379}" \
    HSET "swarm:${TASK_ID}:agent:${AGENT_ID}" \
    "pid" "$$" \
    "container_id" "$HOSTNAME" \
    "status" "spawned" \
    "spawned_at" "$(date -Iseconds)" \
    "agent_type" "$AGENT_TYPE"

  redis-cli -h "${REDIS_HOST:-localhost}" -p "${REDIS_PORT:-6379}" \
    LPUSH "swarm:${TASK_ID}:${AGENT_ID}:signal" "spawned"
fi

# Execute agent via Claude Code CLI
node /app/dist/cli/index.js agent "$AGENT_TYPE" "$@"
EXIT_CODE=$?

# Write completion signal to Redis
if [[ -n "$TASK_ID" ]]; then
  STATUS="complete"
  [[ $EXIT_CODE -ne 0 ]] && STATUS="error"

  redis-cli -h "${REDIS_HOST:-localhost}" -p "${REDIS_PORT:-6379}" \
    HSET "swarm:${TASK_ID}:agent:${AGENT_ID}:done" \
    "status" "$STATUS" \
    "exit_code" "$EXIT_CODE" \
    "completed_at" "$(date -Iseconds)"

  redis-cli -h "${REDIS_HOST:-localhost}" -p "${REDIS_PORT:-6379}" \
    LPUSH "swarm:${TASK_ID}:${AGENT_ID}:done" "$STATUS"
fi

exit $EXIT_CODE
```

### Key Features

1. **Agent ID generation**: Unique identifier for tracking
2. **Process metadata**: PID + container ID for health checks
3. **Spawning signal**: Orchestrator knows agent started
4. **Completion signal**: Orchestrator knows agent finished
5. **Exit code propagation**: Distinguish success from failure
6. **Redis host/port flags**: Respect REDIS_HOST environment (Bug #3 fix)

### Orchestrator Health Monitoring

```bash
# Check if agent process is alive
AGENT_PID=$(redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" \
  HGET "swarm:${TASK_ID}:agent:${AGENT_ID}" "pid")

if ! ps -p "$AGENT_PID" > /dev/null 2>&1; then
  echo "Agent $AGENT_ID (PID $AGENT_PID) is dead - triggering recovery"
  # Respawn agent
  docker run --env-file .env \
    -e TASK_ID="$TASK_ID" \
    -e AGENT_ID="${AGENT_ID}-retry" \
    -e AGENT_TYPE="$AGENT_TYPE" \
    -e REDIS_HOST="$REDIS_HOST" \
    claude-flow-novice:agent
fi
```

### Docker Compose with Entrypoint

```yaml
version: '3.9'

services:
  cfn-agent:
    build:
      context: .
      dockerfile: Dockerfile.agent
    image: claude-flow-novice:agent
    environment:
      - CLAUDE_API_PROVIDER=zai
      - REDIS_HOST=redis
      - REDIS_PORT=6379
    env_file:
      - .env
    depends_on:
      redis:
        condition: service_healthy
    networks:
      - cfn-network
    command: ["typescript-specialist", "Fix TypeScript errors"]

  redis:
    image: redis:7-alpine
    networks:
      - cfn-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

networks:
  cfn-network:
    driver: bridge
```

---

## Validation Requirements

### Pre-Deployment Verification

Before running agents in production, verify the Docker image contains all required CFN system files:

```bash
#!/bin/bash
set -euo pipefail

echo "=== CFN Agent System Validation ==="

# Test 1: Verify agent definition count
AGENT_COUNT=$(docker run --rm claude-flow-novice:agent \
  find .claude/agents -name "*.md" -not -name "README.md" | wc -l)

if [ "$AGENT_COUNT" -ne 62 ]; then
  echo "❌ Expected 62 agents, found $AGENT_COUNT"
  exit 1
fi
echo "✅ Agent definitions: $AGENT_COUNT/62"

# Test 2: Verify skill count
SKILL_COUNT=$(docker run --rm claude-flow-novice:agent \
  find .claude/skills -name "SKILL.md" | wc -l)

if [ "$SKILL_COUNT" -ne 72 ]; then
  echo "❌ Expected 72 skills, found $SKILL_COUNT"
  exit 1
fi
echo "✅ Skill modules: $SKILL_COUNT/72"

# Test 3: Verify command count
COMMAND_COUNT=$(docker run --rm claude-flow-novice:agent \
  find .claude/commands -name "*.md" | wc -l)

if [ "$COMMAND_COUNT" -ne 57 ]; then
  echo "❌ Expected 57 commands, found $COMMAND_COUNT"
  exit 1
fi
echo "✅ Slash commands: $COMMAND_COUNT/57"

# Test 4: Verify CLAUDE.md exists
docker run --rm claude-flow-novice:agent cat CLAUDE.md > /dev/null 2>&1
if [ $? -ne 0 ]; then
  echo "❌ CLAUDE.md not found in image"
  exit 1
fi
echo "✅ CLAUDE.md present"

# Test 5: Verify API credentials accessible
docker run --rm --env-file .env claude-flow-novice:agent bash -c \
  'env | grep -E "(ZAI_API_KEY|CLAUDE_API_PROVIDER)" > /dev/null'
if [ $? -ne 0 ]; then
  echo "❌ API credentials not accessible"
  exit 1
fi
echo "✅ API credentials accessible"

echo ""
echo "=== All Pre-Deployment Checks Passed ==="
```

### Post-Deployment Functional Tests

```bash
#!/bin/bash
set -euo pipefail

echo "=== CFN Agent Functional Tests ==="

# Test 6: Single agent execution
echo "Testing single agent spawn..."
docker run --rm --env-file .env \
  claude-flow-novice:agent \
  typescript-specialist \
  "Read the LICENSE file and return the license type" > /tmp/agent-output.txt

if grep -q "license" /tmp/agent-output.txt; then
  echo "✅ Single agent execution works"
else
  echo "❌ Agent did not produce expected output"
  cat /tmp/agent-output.txt
  exit 1
fi

# Test 7: Provider switching
echo "Testing provider switching (Kimi)..."
docker run --rm --env-file .env \
  -e CLAUDE_API_PROVIDER=kimi \
  claude-flow-novice:agent \
  typescript-specialist \
  "Brief test: return 'OK'" > /tmp/kimi-output.txt

if grep -q "OK" /tmp/kimi-output.txt; then
  echo "✅ Kimi provider works"
else
  echo "⚠️  Kimi provider test inconclusive"
fi

# Test 8: Redis coordination data
echo "Testing Redis coordination..."
docker-compose up -d redis
sleep 2

TASK_ID="test-$(date +%s)"
docker run --rm --env-file .env \
  -e TASK_ID="$TASK_ID" \
  -e AGENT_ID="agent-test-1" \
  -e AGENT_TYPE="typescript-specialist" \
  -e REDIS_HOST=redis \
  --network cfn-network \
  claude-flow-novice:agent \
  typescript-specialist "Test prompt"

# Verify Redis data written
SPAWNED=$(redis-cli -h redis -p 6379 \
  HGET "swarm:${TASK_ID}:agent:agent-test-1" "status")

if [ "$SPAWNED" == "spawned" ]; then
  echo "✅ Redis coordination data written"
else
  echo "❌ Redis coordination data missing"
  exit 1
fi

docker-compose down

echo ""
echo "=== All Functional Tests Passed ==="
```

### Silent Failure Detection

**Problem**: Agents may report success without doing work if definitions are missing.

**Detection Strategy**:
```bash
# Before test: Capture baseline
git diff --name-only > /tmp/baseline-diff.txt

# Run agent that should modify files
docker run --rm --env-file .env \
  -v $(pwd):/workspace \
  claude-flow-novice:agent \
  typescript-specialist "Fix TypeScript errors in src/file.ts"

# After test: Verify changes
git diff --name-only > /tmp/after-diff.txt

# Compare
if diff /tmp/baseline-diff.txt /tmp/after-diff.txt > /dev/null; then
  echo "❌ Silent failure detected: No files modified"
  echo "   Agent reported success but did no work"
  exit 1
else
  echo "✅ Agent modified files as expected"
  git diff --name-only | head -10
fi
```

**Indicators of Silent Failure**:
- Agent exits quickly (<10 seconds for complex task)
- No git diff changes in target files
- No error messages in logs
- Redis shows "complete" but confidence score is 0.0

---

## Container Registry Management

### Push to Multiple Registries

```bash
#!/bin/bash
set -e

IMAGE_NAME="myapp"
VERSION="1.0.0"
REGISTRIES=(
  "docker.io/myorg"
  "ghcr.io/myorg"
  "myregistry.azurecr.io"
)

# Build image
docker build -t "${IMAGE_NAME}:${VERSION}" .

# Tag and push to all registries
for registry in "${REGISTRIES[@]}"; do
  echo "Pushing to $registry..."

  docker tag "${IMAGE_NAME}:${VERSION}" "${registry}/${IMAGE_NAME}:${VERSION}"
  docker tag "${IMAGE_NAME}:${VERSION}" "${registry}/${IMAGE_NAME}:latest"

  docker push "${registry}/${IMAGE_NAME}:${VERSION}"
  docker push "${registry}/${IMAGE_NAME}:latest"

  echo "✅ Pushed to $registry"
done
```

### Image Signing with Cosign

```bash
# Sign image
cosign sign --key cosign.key myregistry/myapp:1.0.0

# Verify signature
cosign verify --key cosign.pub myregistry/myapp:1.0.0

# Attach SBOM (Software Bill of Materials)
cosign attach sbom --sbom sbom.spdx.json myregistry/myapp:1.0.0
```

---

## Resource Limits and Health Checks

### Production-Ready Configuration

```dockerfile
FROM node:18-alpine

# Install tini for proper signal handling
RUN apk add --no-cache tini
ENTRYPOINT ["/sbin/tini", "--"]

# Health check with timeout
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node healthcheck.js || exit 1

# Resource limits (via docker run)
# docker run --memory="512m" --cpus="0.5" myapp:latest
```

### Health Check Script

```javascript
// healthcheck.js
const http = require('http');

const options = {
  host: 'localhost',
  port: process.env.PORT || 3000,
  path: '/health',
  timeout: 2000
};

const request = http.request(options, (res) => {
  if (res.statusCode === 200) {
    process.exit(0);
  } else {
    process.exit(1);
  }
});

request.on('error', () => {
  process.exit(1);
});

request.end();
```

---

## Quick Reference

### Build Agent Image

```bash
# Standard build
docker build -f Dockerfile.agent -t claude-flow-novice:agent .

# Linux native build (WSL2, OOM-resistant)
export DOCKERFILE="Dockerfile.agent"
export IMAGE_NAME="claude-flow-novice-agent"
./scripts/docker/build-from-linux.sh
```

### Run Agent Container

```bash
# Single agent execution
docker run --rm --env-file .env \
  claude-flow-novice:agent \
  typescript-specialist \
  "Fix TypeScript errors"

# With Redis coordination
docker run --rm --env-file .env \
  -e TASK_ID="task-123" \
  -e AGENT_ID="agent-1" \
  -e REDIS_HOST="redis" \
  --network cfn-network \
  claude-flow-novice:agent \
  typescript-specialist \
  "Fix TypeScript errors"
```

### Validate Image

```bash
# Pre-deployment validation
./tests/docker/validate-cfn-agent-image.sh

# Post-deployment functional tests
./tests/docker/cfn-agent-functional-tests.sh
```

---

## Related Documentation

### Docker Coordinator
- **Bug #4 Analysis:** `docs/bugs/BUG_4_DOCKER_COORDINATOR.md`
- **Coordinator Architecture:** `docker/CLAUDE.md`
- **Integration Testing:** `docs/DOCKER_COORDINATOR_INTEGRATION_TEST_FINDINGS.md`

### CFN System
- **Agent Specialist:** `.claude/agents/cfn-dev-team/dev-ops/docker-specialist.md`
- **Agent Directory:** `.claude/agents/cfn-dev-team/README.md`
- **Coordination Skills:** `.claude/skills/cfn-coordination/SKILL.md`

### Build and Deployment
- **Linux Build Script:** `scripts/docker/build-from-linux.sh`
- **Build Configuration:** `scripts/docker/linux-build.config`
- **Test Scripts:** `tests/docker/`

---

## Success Metrics

### Image Quality
- CFN system files: 100% present (62 agents, 72 skills, 57 commands)
- Silent failures: 0 detected
- Pre-deployment validation: 100% pass rate

### Build Performance
- Cold build: <20 minutes
- Warm rebuild: <5 minutes
- Source-only rebuild: <2 minutes

### Runtime Performance
- Agent spawn time: <10 seconds
- Redis coordination overhead: <1 second
- Multi-provider switching: No downtime

---

**Maintained By:** docker-specialist agent
**Last Updated:** 2025-11-12
**Version:** 1.0.0
