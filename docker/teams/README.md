# Team-Specific Docker Images for CFN Agents

## Overview

This directory contains team-customized Docker images built on top of the base CFN agent image. Each team can customize dependencies, tools, and configuration while maintaining consistent base functionality.

**Architecture Pattern:** Base → Team → Agent Specialization

```
cfn-agent:base (449MB)
  ├─→ cfn-agent-engineering:latest (python, pytest, mypy)
  ├─→ cfn-agent-marketing:latest (PHP, WordPress CLI, composer)
  └─→ cfn-agent-data:latest (pandas, jupyter, spark-submit)
```

---

## Quick Start

### 1. Build Base Image (Once)

```bash
# Using docker-build skill (recommended - 96% faster)
./.claude/skills/docker-build/build.sh \
  --dockerfile docker/teams/base/Dockerfile.base \
  --tag cfn-agent:base

# Or direct build (slower on WSL2)
docker build -f docker/teams/base/Dockerfile.base -t cfn-agent:base .
```

### 2. Build Team Image

```bash
# Build engineering team image
docker build -f docker/teams/engineering/Dockerfile \
  -t cfn-agent-engineering:latest \
  docker/teams/engineering/

# Build marketing team image
docker build -f docker/teams/marketing/Dockerfile \
  -t cfn-agent-marketing:latest \
  docker/teams/marketing/

# Build data team image
docker build -f docker/teams/data/Dockerfile \
  -t cfn-agent-data:latest \
  docker/teams/data/
```

### 3. Run Team Agent

```bash
# Run engineering agent
docker run --rm \
  --name engineering-agent-1 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v $(pwd)/workspace:/workspace:rw \
  -e CFN_TEAM="engineering" \
  -e CFN_REDIS_HOST="cfn-redis" \
  --network cfn-network \
  --env-file .env \
  cfn-agent-engineering:latest \
  backend-developer "Fix authentication bug"
```

---

## Image Tagging Convention

**Format:** `cfn-agent-{team}:{version|agent-type}`

### Version Tags

```bash
# Latest version (rolling tag)
cfn-agent-engineering:latest

# Specific version (immutable)
cfn-agent-engineering:v1.2.3
cfn-agent-engineering:2025-11-24

# Semantic versioning
cfn-agent-engineering:1.x      # Major version
cfn-agent-engineering:1.2.x    # Minor version
```

### Agent-Type Tags (Optional)

**Use when team needs agent-specific customizations:**

```bash
# Engineering team - Python specialist
cfn-agent-engineering:python-specialist

# Marketing team - WordPress specialist
cfn-agent-marketing:wordpress-specialist

# Data team - ML specialist
cfn-agent-data:ml-specialist
```

### Multi-Architecture Tags

```bash
# Platform-specific builds
cfn-agent-engineering:latest-amd64
cfn-agent-engineering:latest-arm64

# Multi-arch manifest (Docker automatically selects)
cfn-agent-engineering:latest
```

---

## Directory Structure

```
docker/teams/
├── README.md (this file)
├── base/
│   ├── Dockerfile.base           # Base agent image (all teams inherit)
│   └── entrypoint.sh             # Common entrypoint script
├── engineering/
│   ├── Dockerfile                # Engineering-specific customizations
│   ├── requirements.txt          # Python dependencies
│   ├── package.json              # Node.js dependencies
│   └── config/
│       ├── .pylintrc             # Python linting config
│       ├── .prettierrc           # Code formatting config
│       └── agents.json           # Agent-specific configs
├── marketing/
│   ├── Dockerfile                # Marketing-specific customizations
│   ├── composer.json             # PHP dependencies
│   ├── package.json              # Node.js dependencies
│   └── config/
│       ├── wp-cli.yml            # WordPress CLI config
│       └── agents.json           # Agent-specific configs
├── data/
│   ├── Dockerfile                # Data-specific customizations
│   ├── requirements.txt          # Python data science stack
│   └── config/
│       ├── spark-defaults.conf   # Spark configuration
│       ├── jupyter_config.py     # Jupyter notebook config
│       └── agents.json           # Agent-specific configs
└── scripts/
    ├── build-all-teams.sh        # Build all team images
    ├── build-team.sh             # Build single team image
    ├── push-team-images.sh       # Push to registry
    └── validate-team-image.sh    # Test team image
```

---

## Creating a New Team Image

### Step 1: Create Team Directory

```bash
mkdir -p docker/teams/{team-name}/{config,scripts}
cd docker/teams/{team-name}
```

### Step 2: Create Team Dockerfile

**Template:**

```dockerfile
# docker/teams/{team-name}/Dockerfile
FROM cfn-agent:base

# Team metadata
ARG TEAM_NAME={team-name}
ENV CFN_TEAM=${TEAM_NAME}
LABEL team="${TEAM_NAME}"
LABEL cost-center="${TEAM_NAME}-001"
LABEL maintainer="team-{team-name}@company.com"

# Install team-specific language runtimes
# (Example: Python 3.11 for data science team)
RUN apt-get update && apt-get install -y \
    python3.11 \
    python3.11-dev \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Install team-specific dependencies
COPY requirements.txt* ./
RUN if [ -f requirements.txt ]; then pip3 install -r requirements.txt; fi

COPY package.json* package-lock.json* ./
RUN if [ -f package.json ]; then npm ci; fi

COPY composer.json* composer.lock* ./
RUN if [ -f composer.json ]; then composer install --no-dev; fi

# Copy team-specific configuration
COPY config/ /etc/cfn/team/

# Copy team-specific scripts
COPY scripts/ /usr/local/bin/team/
RUN chmod +x /usr/local/bin/team/*.sh || true

# Team-specific environment defaults
ENV CFN_AGENT_TIMEOUT=3600
ENV CFN_MAX_MEMORY=2g
ENV CFN_LOG_LEVEL=info

# Health check
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Use base entrypoint
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
```

### Step 3: Add Team Dependencies

**Python (requirements.txt):**
```text
# Testing frameworks
pytest==7.4.3
pytest-cov==4.1.0
mypy==1.7.1

# Linting and formatting
pylint==3.0.3
black==23.12.1
isort==5.13.2

# Team-specific libraries
requests==2.31.0
pydantic==2.5.2
```

**Node.js (package.json):**
```json
{
  "name": "cfn-agent-engineering",
  "version": "1.0.0",
  "dependencies": {
    "typescript": "^5.3.3",
    "eslint": "^8.56.0",
    "prettier": "^3.1.1",
    "jest": "^29.7.0"
  }
}
```

**PHP (composer.json):**
```json
{
  "name": "cfn-agent-marketing",
  "require": {
    "php": ">=8.1",
    "phpunit/phpunit": "^10.5",
    "squizlabs/php_codesniffer": "^3.8"
  }
}
```

### Step 4: Add Team Configuration

**config/agents.json:**
```json
{
  "team": "engineering",
  "agents": {
    "backend-developer": {
      "language": "python",
      "linter": "pylint",
      "formatter": "black",
      "test_command": "pytest",
      "memory": "1g",
      "timeout": 1800
    },
    "frontend-developer": {
      "language": "typescript",
      "linter": "eslint",
      "formatter": "prettier",
      "test_command": "npm test",
      "memory": "1g",
      "timeout": 1200
    }
  }
}
```

### Step 5: Build and Test

```bash
# Build team image
docker build -f docker/teams/{team-name}/Dockerfile \
  -t cfn-agent-{team-name}:latest \
  docker/teams/{team-name}/

# Test team image
docker run --rm cfn-agent-{team-name}:latest \
  --version

# Validate dependencies
docker run --rm cfn-agent-{team-name}:latest \
  bash -c "python3 --version && node --version"
```

---

## Team Dependency Management

### Shared Dependencies (Base Image)

**Included in `cfn-agent:base`:**
- Node.js 20 LTS
- CFN Loop CLI (claude-flow-novice)
- Git, curl, bash
- Redis CLI
- Basic Unix utilities

### Team-Specific Dependencies

**Add to team Dockerfile:**

#### Language Runtimes

```dockerfile
# Python
RUN apt-get update && apt-get install -y python3.11 python3-pip

# Ruby
RUN apt-get update && apt-get install -y ruby-full

# Java
RUN apt-get update && apt-get install -y openjdk-17-jdk

# Go
RUN wget https://go.dev/dl/go1.21.5.linux-amd64.tar.gz && \
    tar -C /usr/local -xzf go1.21.5.linux-amd64.tar.gz
ENV PATH="/usr/local/go/bin:$PATH"
```

#### Build Tools

```dockerfile
# C/C++ toolchain
RUN apt-get update && apt-get install -y build-essential cmake

# Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:$PATH"

# Docker CLI (for nested container workflows)
RUN apt-get update && apt-get install -y docker.io
```

#### Cloud CLIs

```dockerfile
# AWS CLI
RUN pip3 install awscli

# Google Cloud SDK
RUN echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | \
    tee -a /etc/apt/sources.list.d/google-cloud-sdk.list && \
    apt-get update && apt-get install -y google-cloud-sdk

# Azure CLI
RUN curl -sL https://aka.ms/InstallAzureCLIDeb | bash
```

### Dependency Version Pinning

**Best Practices:**

```dockerfile
# ❌ AVOID: Unpinned versions (breaks reproducibility)
RUN pip3 install requests

# ✅ CORRECT: Pin exact versions
RUN pip3 install requests==2.31.0

# ✅ ALSO CORRECT: Pin major.minor (allows patches)
RUN pip3 install 'requests>=2.31,<2.32'
```

**Requirements files:**
```text
# requirements.txt - Pin all transitive dependencies
requests==2.31.0
urllib3==2.1.0
certifi==2023.11.17
charset-normalizer==3.3.2
idna==3.6
```

---

## Build Optimization

### Multi-Stage Builds

**Reduce final image size by 60-80%:**

```dockerfile
# Stage 1: Build dependencies
FROM cfn-agent:base AS builder

WORKDIR /build

# Install build tools
RUN apt-get update && apt-get install -y \
    python3-dev \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install Python packages with native extensions
COPY requirements.txt ./
RUN pip3 install --prefix=/install -r requirements.txt

# Stage 2: Runtime
FROM cfn-agent:base

# Copy only installed packages (not build tools)
COPY --from=builder /install /usr/local

# Team configuration
ENV CFN_TEAM=engineering

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
```

**Size comparison:**
- Single-stage: 1.2GB (includes gcc, g++, headers)
- Multi-stage: 580MB (runtime only)
- Reduction: 52%

### Layer Caching Strategy

**Order Dockerfile instructions from least to most frequently changed:**

```dockerfile
FROM cfn-agent:base

# 1. System packages (rarely change)
RUN apt-get update && apt-get install -y python3

# 2. Dependency manifests (change occasionally)
COPY requirements.txt package.json ./

# 3. Install dependencies (expensive, cache this)
RUN pip3 install -r requirements.txt && npm install

# 4. Configuration files (change more often)
COPY config/ /etc/cfn/team/

# 5. Application code (changes most frequently)
COPY scripts/ /usr/local/bin/team/
```

**Cache hit rate:**
- Poor ordering: 20% cache hits
- Optimal ordering: 85% cache hits
- Build time reduction: 70%

### .dockerignore

**Prevent context bloat:**

```dockerignore
# docker/teams/{team-name}/.dockerignore

# Build artifacts
node_modules/
__pycache__/
*.pyc
dist/
build/

# Development files
.git/
.env*
*.log
.vscode/
.idea/

# Test files (if not needed in image)
tests/
*.test.js
*_test.go

# Documentation
README.md
docs/
*.md
```

**Context size reduction:**
- Without .dockerignore: 500MB context
- With .dockerignore: 50MB context
- Build speed improvement: 10x faster

---

## Team Image Validation

### Automated Testing Script

**scripts/validate-team-image.sh:**

```bash
#!/bin/bash
set -euo pipefail

TEAM_NAME="${1:-engineering}"
IMAGE_NAME="cfn-agent-${TEAM_NAME}:latest"

echo "Validating team image: $IMAGE_NAME"

# Test 1: Image exists
if ! docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
  echo "❌ FAIL: Image not found"
  exit 1
fi
echo "✅ PASS: Image exists"

# Test 2: Base layer inheritance
BASE_LAYERS=$(docker history cfn-agent:base --format "{{.ID}}" | head -5)
TEAM_LAYERS=$(docker history "$IMAGE_NAME" --format "{{.ID}}" | tail -5)
if ! echo "$TEAM_LAYERS" | grep -q "$(echo "$BASE_LAYERS" | head -1)"; then
  echo "❌ FAIL: Does not inherit from base image"
  exit 1
fi
echo "✅ PASS: Inherits from base image"

# Test 3: CFN CLI available
if ! docker run --rm "$IMAGE_NAME" npx claude-flow-novice --version >/dev/null 2>&1; then
  echo "❌ FAIL: CFN CLI not available"
  exit 1
fi
echo "✅ PASS: CFN CLI available"

# Test 4: Team environment set
TEAM_ENV=$(docker run --rm "$IMAGE_NAME" printenv CFN_TEAM)
if [ "$TEAM_ENV" != "$TEAM_NAME" ]; then
  echo "❌ FAIL: CFN_TEAM not set correctly (expected: $TEAM_NAME, got: $TEAM_ENV)"
  exit 1
fi
echo "✅ PASS: Team environment correct"

# Test 5: Team dependencies installed
case "$TEAM_NAME" in
  engineering)
    docker run --rm "$IMAGE_NAME" python3 --version >/dev/null 2>&1 || exit 1
    docker run --rm "$IMAGE_NAME" pytest --version >/dev/null 2>&1 || exit 1
    ;;
  marketing)
    docker run --rm "$IMAGE_NAME" php --version >/dev/null 2>&1 || exit 1
    docker run --rm "$IMAGE_NAME" wp --version >/dev/null 2>&1 || exit 1
    ;;
  data)
    docker run --rm "$IMAGE_NAME" python3 -c "import pandas" >/dev/null 2>&1 || exit 1
    docker run --rm "$IMAGE_NAME" jupyter --version >/dev/null 2>&1 || exit 1
    ;;
esac
echo "✅ PASS: Team dependencies installed"

# Test 6: Image size reasonable
IMAGE_SIZE=$(docker image inspect "$IMAGE_NAME" --format '{{.Size}}')
IMAGE_SIZE_MB=$((IMAGE_SIZE / 1024 / 1024))
if [ "$IMAGE_SIZE_MB" -gt 2000 ]; then
  echo "⚠️  WARN: Image size large (${IMAGE_SIZE_MB}MB > 2000MB)"
else
  echo "✅ PASS: Image size reasonable (${IMAGE_SIZE_MB}MB)"
fi

# Test 7: Security scan (if Trivy installed)
if command -v trivy >/dev/null 2>&1; then
  CRITICAL_VULNS=$(trivy image --severity CRITICAL --quiet "$IMAGE_NAME" | grep -c "CRITICAL" || true)
  if [ "$CRITICAL_VULNS" -gt 0 ]; then
    echo "❌ FAIL: $CRITICAL_VULNS critical vulnerabilities found"
    exit 1
  fi
  echo "✅ PASS: No critical vulnerabilities"
fi

echo ""
echo "✅ All validation tests passed for $IMAGE_NAME"
```

**Usage:**
```bash
# Validate single team
./docker/teams/scripts/validate-team-image.sh engineering

# Validate all teams
for team in engineering marketing data; do
  ./docker/teams/scripts/validate-team-image.sh "$team"
done
```

---

## CI/CD Integration

### GitHub Actions Workflow

**.github/workflows/build-team-images.yml:**

```yaml
name: Build Team Images

on:
  push:
    branches: [main]
    paths:
      - 'docker/teams/**'
  pull_request:
    paths:
      - 'docker/teams/**'

jobs:
  build-team-images:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        team: [engineering, marketing, data]

    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build base image
        uses: docker/build-push-action@v5
        with:
          context: .
          file: docker/teams/base/Dockerfile.base
          tags: cfn-agent:base
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Build team image
        uses: docker/build-push-action@v5
        with:
          context: docker/teams/${{ matrix.team }}
          file: docker/teams/${{ matrix.team }}/Dockerfile
          tags: cfn-agent-${{ matrix.team }}:latest
          build-args: |
            TEAM_NAME=${{ matrix.team }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Validate team image
        run: |
          ./docker/teams/scripts/validate-team-image.sh ${{ matrix.team }}

      - name: Security scan
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: cfn-agent-${{ matrix.team }}:latest
          severity: CRITICAL,HIGH
          exit-code: 1

      - name: Push to registry (main branch only)
        if: github.ref == 'refs/heads/main'
        run: |
          echo "${{ secrets.DOCKER_PASSWORD }}" | docker login -u "${{ secrets.DOCKER_USERNAME }}" --password-stdin
          docker tag cfn-agent-${{ matrix.team }}:latest myregistry/cfn-agent-${{ matrix.team }}:latest
          docker push myregistry/cfn-agent-${{ matrix.team }}:latest
```

---

## Production Deployment

### Image Registry Strategy

**Multi-Registry Pattern:**

```bash
# Development (Docker Hub)
docker tag cfn-agent-engineering:latest \
  dockerhub.com/company/cfn-agent-engineering:v1.2.3

# Staging (AWS ECR)
docker tag cfn-agent-engineering:latest \
  123456789.dkr.ecr.us-east-1.amazonaws.com/cfn-agent-engineering:v1.2.3

# Production (GCP Artifact Registry)
docker tag cfn-agent-engineering:latest \
  us-docker.pkg.dev/project-id/cfn-agents/cfn-agent-engineering:v1.2.3
```

### Kubernetes Deployment

**deployment.yaml:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cfn-agent-engineering
  namespace: cfn-agents
spec:
  replicas: 5
  selector:
    matchLabels:
      app: cfn-agent
      team: engineering
  template:
    metadata:
      labels:
        app: cfn-agent
        team: engineering
    spec:
      containers:
      - name: agent
        image: myregistry/cfn-agent-engineering:v1.2.3
        imagePullPolicy: Always
        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
        env:
        - name: CFN_TEAM
          value: "engineering"
        - name: CFN_REDIS_HOST
          value: "cfn-redis.cfn-agents.svc.cluster.local"
        - name: ANTHROPIC_API_KEY
          valueFrom:
            secretKeyRef:
              name: cfn-secrets
              key: anthropic-api-key
        volumeMounts:
        - name: workspace
          mountPath: /workspace
      volumes:
      - name: workspace
        persistentVolumeClaim:
          claimName: cfn-workspace-pvc
```

---

## Troubleshooting

### Common Issues

#### Issue: Base image not found

**Error:**
```
failed to solve with frontend dockerfile.v0: failed to create LLB definition:
pull access denied for cfn-agent, repository does not exist
```

**Solution:**
```bash
# Build base image first
./.claude/skills/docker-build/build.sh \
  --dockerfile docker/teams/base/Dockerfile.base \
  --tag cfn-agent:base
```

#### Issue: Team dependencies not installed

**Error:**
```
ModuleNotFoundError: No module named 'pytest'
```

**Solution:**
```bash
# Check requirements.txt exists
ls docker/teams/engineering/requirements.txt

# Rebuild with --no-cache
docker build --no-cache -f docker/teams/engineering/Dockerfile \
  -t cfn-agent-engineering:latest docker/teams/engineering/
```

#### Issue: Image size too large (>2GB)

**Diagnosis:**
```bash
docker history cfn-agent-engineering:latest --human
```

**Solutions:**
1. Use multi-stage builds (see Build Optimization)
2. Remove unnecessary packages
3. Clear package manager caches
4. Use Alpine base (not Ubuntu)

#### Issue: Layer caching not working

**Diagnosis:**
```bash
docker build --progress=plain -f docker/teams/engineering/Dockerfile \
  -t cfn-agent-engineering:latest docker/teams/engineering/
```

**Solutions:**
1. Reorder Dockerfile instructions (dependencies before code)
2. Use BuildKit: `export DOCKER_BUILDKIT=1`
3. Check .dockerignore (exclude changing files)

---

## Best Practices

### Security

1. **Run as non-root user:**
   ```dockerfile
   RUN useradd -m -s /bin/bash cfn-agent
   USER cfn-agent
   ```

2. **Scan for vulnerabilities:**
   ```bash
   trivy image cfn-agent-engineering:latest
   ```

3. **Use secrets management:**
   ```bash
   # ❌ WRONG: Embed secrets in image
   ENV ANTHROPIC_API_KEY=sk-ant-xxx

   # ✅ CORRECT: Mount at runtime
   docker run -e ANTHROPIC_API_KEY="$(cat /secure/key)" ...
   ```

### Performance

1. **Use layer caching** (order instructions by change frequency)
2. **Multi-stage builds** (separate build and runtime)
3. **Minimize layers** (combine RUN commands)
4. **Use .dockerignore** (reduce build context)

### Maintainability

1. **Pin dependency versions** (reproducible builds)
2. **Document customizations** (comments in Dockerfile)
3. **Automated testing** (validate-team-image.sh)
4. **Version tagging** (semantic versioning)

---

## Reference Examples

See example implementations:
- `docker/teams/engineering/` - Python backend development
- `docker/teams/marketing/` - PHP WordPress development
- `docker/teams/data/` - Python data science stack

For questions or issues, see:
- Main Docker docs: `docker/CLAUDE.md`
- Build optimization: `.claude/skills/docker-build/SKILL.md`
- Coordinator patterns: `docker/runtime/cfn-runtime.contract.yml`

---

**Version:** 1.0.0
**Last Updated:** 2025-11-24
**Maintainer:** docker-specialist
