# Team-Specific Docker Images - Quick Start Guide

## 5-Minute Setup

### 1. Build Base Image (Once)

```bash
# Using docker-build skill (recommended - 96% faster on WSL2)
./.claude/skills/docker-build/build.sh \
  --dockerfile docker/teams/base/Dockerfile.base \
  --tag cfn-agent:base
```

**Expected result:** `cfn-agent:base` (~450MB)

### 2. Build Team Images

```bash
# Build all teams at once
./docker/teams/scripts/build-all-teams.sh

# Or build individual team
./docker/teams/scripts/build-team.sh engineering
./docker/teams/scripts/build-team.sh marketing
./docker/teams/scripts/build-team.sh data
```

**Expected images:**
- `cfn-agent-engineering:latest` (~650MB) - Python + TypeScript + testing
- `cfn-agent-marketing:latest` (~600MB) - PHP + WordPress + build tools
- `cfn-agent-data:latest` (~1.2GB) - Python data science + ML + Jupyter

### 3. Run Team Agent

```bash
# Engineering team - backend developer
docker run --rm \
  -v $(pwd)/workspace:/workspace:rw \
  -e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  cfn-agent-engineering:latest \
  backend-developer "Fix authentication bug in auth.py"

# Marketing team - WordPress specialist
docker run --rm \
  -v $(pwd)/wordpress:/workspace:rw \
  -e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  cfn-agent-marketing:latest \
  wordpress-specialist "Update theme styles for mobile"

# Data team - data scientist
docker run --rm \
  -v $(pwd)/analytics:/workspace:rw \
  -e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  cfn-agent-data:latest \
  data-scientist "Analyze customer churn data"
```

### 4. Validate Images

```bash
# Validate single team
./docker/teams/scripts/validate-team-image.sh engineering

# Validate all teams
for team in engineering marketing data; do
  ./docker/teams/scripts/validate-team-image.sh $team
done
```

**Expected output:** All tests passing (9 tests per team)

---

## Common Commands

### Building

```bash
# Build with no cache (force rebuild)
./docker/teams/scripts/build-team.sh engineering --no-cache

# Build and push to registry
DOCKER_REGISTRY=myregistry.com ./docker/teams/scripts/build-team.sh engineering --push
```

### Running

```bash
# With Redis coordination
docker run --rm \
  --network cfn-network \
  -e CFN_REDIS_HOST=cfn-redis \
  -e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  -v $(pwd)/workspace:/workspace:rw \
  cfn-agent-engineering:latest \
  backend-developer "Implement feature"

# With custom timeout and memory
docker run --rm \
  --memory=2g \
  -e CFN_AGENT_TIMEOUT=3600 \
  -e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  -v $(pwd)/workspace:/workspace:rw \
  cfn-agent-data:latest \
  ml-engineer "Train model"
```

### Inspecting

```bash
# View team configuration
docker run --rm cfn-agent-engineering:latest \
  cat /etc/cfn/team/agents.json

# Check installed tools
docker run --rm cfn-agent-engineering:latest \
  bash -c "python3 --version && pytest --version && tsc --version"

# View image layers
docker history cfn-agent-engineering:latest --human
```

---

## Customization Examples

### Add Team-Specific Tool

Edit `docker/teams/{team}/Dockerfile`:

```dockerfile
# Add PostgreSQL client to engineering team
USER root
RUN apk add --no-cache postgresql-client
USER cfn
```

### Add Python Package

Edit `docker/teams/{team}/requirements.txt`:

```text
# Add FastAPI to engineering team
fastapi==0.108.0
uvicorn==0.25.0
```

### Add Node Package

Edit `docker/teams/{team}/package.json`:

```json
{
  "dependencies": {
    "axios": "^1.6.2"
  }
}
```

### Modify Agent Configuration

Edit `docker/teams/{team}/config/agents.json`:

```json
{
  "agents": {
    "custom-specialist": {
      "language": "python",
      "memory": "1g",
      "timeout": 1800,
      "tags": ["custom", "specialist"]
    }
  }
}
```

---

## Troubleshooting

### Build Fails with "base image not found"

```bash
# Build base image first
./.claude/skills/docker-build/build.sh \
  --dockerfile docker/teams/base/Dockerfile.base \
  --tag cfn-agent:base
```

### Image Size Too Large

```bash
# Check layer sizes
docker history cfn-agent-{team}:latest --human

# Use multi-stage build (see README.md)
# Remove unnecessary packages
# Clear package manager caches
```

### Dependencies Not Installed

```bash
# Rebuild with no cache
./docker/teams/scripts/build-team.sh {team} --no-cache

# Check dependency files exist
ls docker/teams/{team}/requirements.txt
ls docker/teams/{team}/package.json
```

### Validation Tests Fail

```bash
# Run validation with verbose output
./docker/teams/scripts/validate-team-image.sh {team}

# Check specific tool availability
docker run --rm cfn-agent-{team}:latest python3 --version
docker run --rm cfn-agent-{team}:latest pytest --version
```

---

## Production Deployment

### Push to Registry

```bash
# Set registry URL
export DOCKER_REGISTRY="myregistry.com"

# Push single team
./docker/teams/scripts/push-team-images.sh engineering

# Push all teams
./docker/teams/scripts/push-team-images.sh all
```

### Pull from Registry

```bash
# Pull specific team
docker pull myregistry.com/cfn-agent-engineering:latest

# Pull specific version
docker pull myregistry.com/cfn-agent-engineering:2025-11-24
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cfn-agent-engineering
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: agent
        image: myregistry.com/cfn-agent-engineering:latest
        resources:
          limits:
            memory: "2Gi"
            cpu: "1000m"
```

---

## Next Steps

1. **Customize team images** - Add team-specific tools and dependencies
2. **Create additional teams** - Follow template in README.md
3. **Set up CI/CD** - Automate builds and pushes
4. **Security scanning** - Run Trivy on all images
5. **Production deployment** - Push to registry and deploy

**Full documentation:** `docker/teams/README.md`
**Team examples:** `docker/teams/{engineering,marketing,data}/`
**Build scripts:** `docker/teams/scripts/`
