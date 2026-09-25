# Multi-Language Agent Docker Images - Architecture Plan

## Executive Summary

This document defines a specialized Docker image strategy for CFN Loop agents, where different agent types (frontend, backend, database, mobile, etc.) use purpose-built images with pre-installed language toolchains and validation tools.

**Goal**: Enable agents to run language-specific validation (TypeScript, Rust, Python, Go) without mounting host dependencies.

**Key Benefits**:
- ✅ Pre-check validation works in containers
- ✅ Consistent environments across projects
- ✅ Faster agent execution (no dependency downloads)
- ✅ Smaller per-agent overhead (shared base images)

---

## Image Taxonomy

### 1. Base Image (Universal)

**Name**: `claude-flow-novice-agent:base`
**Purpose**: Minimal runtime for coordination-only agents
**Size**: ~150MB

**Includes**:
- Node.js 18 (Alpine)
- CFN CLI (dist/)
- Redis client
- Git, Bash, cURL
- Agent definitions

**Use Cases**:
- Coordinators
- Product Owners
- Reviewers (read-only agents)
- Orchestrators

**Dockerfile**: `Dockerfile.agent` (current base)

---

### 2. Frontend Image

**Name**: `claude-flow-novice-agent:frontend`
**Purpose**: TypeScript/JavaScript frontend development
**Size**: ~250MB

**Includes** (Base +):
- TypeScript 5.x
- ESLint 8.x
- Prettier 3.x
- @typescript-eslint/* plugins
- React/Vue type definitions (optional)

**Use Cases**:
- typescript-specialist
- react-frontend-engineer
- ui-designer (with validation)

**Dockerfile**: `Dockerfile.agent-frontend` (created)

**Agent Frontmatter**:
```yaml
# .claude/agents/typescript-specialist.md
---
docker_image: frontend
requires_validation: true
---
```

---

### 3. Backend Image (Rust)

**Name**: `claude-flow-novice-agent:backend-rust`
**Purpose**: Rust backend development
**Size**: ~800MB (Rust toolchain is large)

**Includes** (Base +):
- Rust 1.75+
- Cargo
- Clippy (linter)
- cargo-audit (security)
- cargo-edit (dependency management)
- musl-dev, openssl-dev

**Use Cases**:
- rust-developer
- backend-developer (Rust projects)
- api-specialist (Rust APIs)

**Dockerfile**: `Dockerfile.agent-backend` (created)

**Agent Frontmatter**:
```yaml
# .claude/agents/rust-developer.md
---
docker_image: backend-rust
requires_validation: true
---
```

---

### 4. Backend Image (Python)

**Name**: `claude-flow-novice-agent:backend-python`
**Purpose**: Python backend development
**Size**: ~300MB

**Includes** (Base +):
- Python 3.11
- pip, poetry, pipenv
- pytest, mypy, black, flake8
- FastAPI/Django type stubs
- SQLAlchemy

**Use Cases**:
- backend-developer (Python projects)
- database-architect (Python ORMs)
- api-specialist (FastAPI/Django)

**Dockerfile**: `Dockerfile.agent-backend-python` (TBD)

---

### 5. Backend Image (Go)

**Name**: `claude-flow-novice-agent:backend-go`
**Purpose**: Go backend development
**Size**: ~400MB

**Includes** (Base +):
- Go 1.21+
- go fmt, go vet, golint
- golangci-lint (meta-linter)
- go test tooling

**Use Cases**:
- backend-developer (Go projects)
- api-specialist (Go microservices)

**Dockerfile**: `Dockerfile.agent-backend-go` (TBD)

---

### 6. Database Image

**Name**: `claude-flow-novice-agent:database`
**Purpose**: Database schema, migration, query work
**Size**: ~350MB

**Includes** (Base +):
- PostgreSQL client (psql)
- MySQL client (mysql)
- MongoDB client (mongosh)
- SQLite
- Schema migration tools (Flyway, Liquibase)

**Use Cases**:
- database-architect
- backend-developer (DB-heavy work)

**Dockerfile**: `Dockerfile.agent-database` (TBD)

---

### 7. Mobile Image (React Native)

**Name**: `claude-flow-novice-agent:mobile`
**Purpose**: React Native/mobile development
**Size**: ~400MB

**Includes** (Base +):
- TypeScript 5.x
- React Native CLI
- Metro bundler
- ESLint (React Native config)
- Jest (mobile testing)

**Use Cases**:
- mobile-dev
- react-frontend-engineer (mobile)

**Dockerfile**: `Dockerfile.agent-mobile` (TBD)

---

### 8. DevOps Image

**Name**: `claude-flow-novice-agent:devops`
**Purpose**: Infrastructure, CI/CD, containerization
**Size**: ~500MB

**Includes** (Base +):
- Docker CLI (for Docker-in-Docker)
- Kubernetes kubectl
- Terraform
- Ansible
- YAML linters (yamllint)

**Use Cases**:
- devops-engineer
- docker-specialist
- monitoring-specialist

**Dockerfile**: `Dockerfile.agent-devops` (TBD)

---

### 9. Fullstack Image

**Name**: `claude-flow-novice-agent:fullstack`
**Purpose**: Combined frontend + backend tooling
**Size**: ~600MB

**Includes**:
- Frontend tools (TypeScript, ESLint, Prettier)
- Python 3.11 (backend)
- PostgreSQL client
- Redis client

**Use Cases**:
- General-purpose agents in monorepo projects
- Fullstack developers

**Dockerfile**: `Dockerfile.agent-fullstack` (TBD)

---

## Image Selection Strategy

### Automatic Detection

Agents declare required image in frontmatter:

```yaml
# .claude/agents/typescript-specialist.md
---
docker_image: frontend
requires_validation: true
validation_commands:
  - npx tsc --noEmit
  - npx eslint --max-warnings 0
---
```

### Fallback Hierarchy

If agent doesn't specify image:

1. Check project type (package.json → frontend, Cargo.toml → backend-rust, etc.)
2. Check agent name pattern (typescript-* → frontend, rust-* → backend-rust)
3. Default to base image

### Override via CLI

```bash
# Explicit image override
npx claude-flow-novice agent-spawn typescript-specialist \
    --docker-image=fullstack \
    --workspace=/path/to/project

# Auto-detect from project
npx claude-flow-novice agent-spawn typescript-specialist \
    --auto-detect-image \
    --workspace=/path/to/project
```

---

## Build System

### Multi-Architecture Support

All images support:
- linux/amd64 (WSL2, Linux)
- linux/arm64 (Apple Silicon)

### Build Script

```bash
# scripts/docker/build-all-images.sh

#!/bin/bash
set -euo pipefail

IMAGES=(
    "base:Dockerfile.agent"
    "frontend:Dockerfile.agent-frontend"
    "backend-rust:Dockerfile.agent-backend"
    "backend-python:Dockerfile.agent-backend-python"
    "backend-go:Dockerfile.agent-backend-go"
    "database:Dockerfile.agent-database"
    "mobile:Dockerfile.agent-mobile"
    "devops:Dockerfile.agent-devops"
    "fullstack:Dockerfile.agent-fullstack"
)

for img in "${IMAGES[@]}"; do
    NAME="${img%%:*}"
    DOCKERFILE="${img##*:}"
    
    echo "🔨 Building claude-flow-novice-agent:$NAME..."
    docker build -f "$DOCKERFILE" -t "claude-flow-novice-agent:$NAME" .
    
    echo "✅ Built claude-flow-novice-agent:$NAME"
done

echo "✅ All images built successfully"
docker images | grep claude-flow-novice-agent
```

### Versioning

Images follow CFN version:
```
claude-flow-novice-agent:frontend-2.15.0
claude-flow-novice-agent:frontend-latest
```

---

## Image Size Optimization

### Layer Caching Strategy

1. **Base layers** (rarely change):
   - OS packages
   - Language runtimes

2. **Tool layers** (moderate change):
   - npm global installs
   - cargo installs

3. **Project layers** (frequent change):
   - CFN CLI (dist/)
   - Agent definitions

### Multi-Stage Builds

For large toolchains (Rust, Go):
```dockerfile
# Stage 1: Build tools
FROM rust:1.75-alpine AS rust-tools
RUN cargo install clippy cargo-audit

# Stage 2: Runtime
FROM node:18-alpine
COPY --from=rust-tools /usr/local/cargo /usr/local/cargo
```

### Size Targets

| Image | Current | Target | Status |
|-------|---------|--------|--------|
| base | 150MB | 150MB | ✅ |
| frontend | 250MB | 200MB | 🔄 Optimize |
| backend-rust | 800MB | 600MB | 🔄 Multi-stage |
| backend-python | 300MB | 250MB | 🔄 Alpine Python |
| backend-go | 400MB | 300MB | 🔄 Multi-stage |
| database | 350MB | 300MB | ✅ |
| mobile | 400MB | 350MB | 🔄 Optimize |
| devops | 500MB | 400MB | 🔄 Remove unused |
| fullstack | 600MB | 500MB | 🔄 Share layers |

---

## Validation Integration

### Pre-Check Pattern

Each image includes validation tools for pre-check:

```bash
# Frontend pre-check (in container)
npx tsc --noEmit --project /workspace/tsconfig.json

# Backend pre-check (in container)
cargo check --manifest-path /workspace/Cargo.toml

# Python pre-check (in container)
mypy /workspace/src --config-file /workspace/mypy.ini
```

### Worker Script Integration

```bash
# tests/docker/b10-typescript-fix/agent-worker-with-precheck.sh

# Detect agent type from environment
AGENT_TYPE="${CFN_AGENT_TYPE:-base}"

case "$AGENT_TYPE" in
    frontend)
        # TypeScript validation
        ERROR_COUNT=$(npx tsc --noEmit 2>&1 | grep -c "error TS" || echo "0")
        ;;
    backend-rust)
        # Rust validation
        ERROR_COUNT=$(cargo check 2>&1 | grep -c "error:" || echo "0")
        ;;
    backend-python)
        # Python validation
        ERROR_COUNT=$(mypy . 2>&1 | grep -c "error:" || echo "0")
        ;;
    *)
        # No validation for base image
        ERROR_COUNT="0"
        ;;
esac
```

---

## Migration Path

### Phase 1: Core Images (Week 1)
- ✅ Frontend (TypeScript, ESLint, Prettier)
- ✅ Backend-Rust (Cargo, Clippy)
- 🔄 Backend-Python (pip, pytest, mypy)

### Phase 2: Specialized Images (Week 2)
- Database (PostgreSQL, MySQL clients)
- Mobile (React Native tooling)
- Fullstack (combined frontend + Python)

### Phase 3: Advanced Images (Week 3)
- Backend-Go (golangci-lint)
- DevOps (Terraform, kubectl)
- Polyglot (multi-language support)

### Phase 4: Optimization (Week 4)
- Multi-stage builds for size reduction
- Layer caching improvements
- Registry push automation

---

## Testing Strategy

### Per-Image Test Suite

Each image includes health check:

```bash
# tests/docker/test-frontend-image.sh

#!/bin/bash
set -euo pipefail

IMAGE="claude-flow-novice-agent:frontend"

echo "🧪 Testing $IMAGE..."

# Test 1: Image exists
docker images | grep "$IMAGE" || { echo "❌ Image not found"; exit 1; }

# Test 2: TypeScript available
docker run --rm "$IMAGE" tsc --version || { echo "❌ TypeScript missing"; exit 1; }

# Test 3: ESLint available
docker run --rm "$IMAGE" eslint --version || { echo "❌ ESLint missing"; exit 1; }

# Test 4: CFN CLI works
docker run --rm "$IMAGE" node dist/cli/index.js --version || { echo "❌ CLI broken"; exit 1; }

echo "✅ All tests passed for $IMAGE"
```

### Integration Tests

```bash
# tests/docker/test-image-agent-spawn.sh

# Test agent spawning with each image type
for AGENT_TYPE in frontend backend-rust backend-python; do
    npx claude-flow-novice agent-spawn test-agent \
        --docker-image="$AGENT_TYPE" \
        --prompt="Test validation tools" \
        --workspace=/tmp/test-project
done
```

---

## Cost-Benefit Analysis

### Storage Costs

**With Specialized Images**:
- 9 images × 400MB avg = 3.6GB disk space

**With Mount Strategy**:
- 1 base image × 150MB = 150MB
- Host node_modules × N projects = varies (500MB - 5GB)

**Verdict**: Specialized images cost ~3.5GB extra but eliminate host dependency management.

### Build Time Costs

| Image | Build Time | Rebuild Frequency |
|-------|-----------|-------------------|
| base | 2 min | Rare (CFN updates) |
| frontend | 3 min | Rare (tool updates) |
| backend-rust | 15 min | Rare (Rust updates) |
| backend-python | 4 min | Rare (Python updates) |

**Total initial build**: ~35 minutes (one-time)
**Incremental rebuilds**: 2-4 min each

### Performance Benefits

**Pre-Check Validation**:
- With mount: N agents × 5s tsc = 160s (32 agents)
- With image: N agents × 0.5s tsc = 16s (tools pre-installed)
- **Savings**: 90% validation time

**Agent Spawn Time**:
- With mount: 3s spawn + 2s tool discovery = 5s
- With image: 2s spawn (tools ready) = 2s
- **Savings**: 60% spawn time

---

## Recommendations

### Immediate (Week 1)
1. ✅ Build frontend image (TypeScript validation)
2. ✅ Test B10 batch with frontend image
3. Build backend-rust image
4. Update agent frontmatter with docker_image field

### Short-Term (Month 1)
1. Build remaining core images (Python, Go, database)
2. Implement auto-detection from project files
3. Add validation commands to agent frontmatter
4. Create comprehensive test suite

### Long-Term (Quarter 1)
1. Multi-arch builds (ARM64 support)
2. Registry automation (Docker Hub/GHCR)
3. Layer caching optimization
4. Polyglot image for mixed projects

---

## Open Questions

1. **Version management**: Pin tool versions or use latest?
   - Recommendation: Pin major versions, allow minor updates
2. **Image updates**: Auto-rebuild on tool updates?
   - Recommendation: Manual rebuilds on CFN version bumps
3. **Custom images**: Allow user-defined images?
   - Recommendation: Yes, via --docker-image override
4. **Registry hosting**: Docker Hub, GHCR, or private?
   - Recommendation: GHCR (free for open source)

---

## Related Files

- `Dockerfile.agent` - Base image
- `Dockerfile.agent-frontend` - Frontend image (created)
- `Dockerfile.agent-backend` - Backend-Rust image (created)
- `scripts/docker/build-all-images.sh` - Build automation (TBD)
- `tests/docker/test-frontend-image.sh` - Image testing (TBD)
- `.claude/agents/*/frontmatter` - Agent image declarations (TBD)

---

## Success Metrics

### Performance
- ✅ Pre-check validation < 1s per agent
- ✅ Agent spawn time < 3s
- ✅ Validation accuracy 95%+

### Reliability
- ✅ No "tool not found" errors
- ✅ Consistent validation across environments
- ✅ No host dependency conflicts

### Maintainability
- ✅ Image rebuild < 5 min each
- ✅ Clear versioning strategy
- ✅ Automated testing pipeline
