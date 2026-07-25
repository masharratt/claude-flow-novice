# Docker Quick Start Guide

## Prerequisites

- Docker Desktop or Docker Engine (Linux)
- WSL2 with Docker integration (Windows)
- At least 8GB RAM available
- 40GB disk space for containers

## Initial Setup

### 1. Clone and Navigate
```bash
cd /path/to/claude-flow-novice
```

### 2. Start Development Stack
```bash
# Main development environment
docker-compose up -d

# Verify services are running
docker-compose ps
```

### 3. Build Agent Images
```bash
# Use the optimized build script (Linux native storage)
./.claude/skills/docker-build/build.sh

# Or build specific image
./.claude/skills/docker-build/build.sh --tag cfn-agent:latest
```

## Common Workflows

### Running Tests
```bash
# Run all Docker tests
./tests/docker-mode/run-all-implementations.sh

# Run specific test
./tests/docker/test-agent-spawning.sh
```

### Multi-Worktree Development
```bash
# Create worktree
git worktree add ../feature-branch feature-branch

# Start in worktree
cd ../feature-branch
./scripts/docker/run-in-worktree.sh up -d

# Set environment
export COMPOSE_PROJECT_NAME="cfn-feature-branch"
```

### Production Deployment
```bash
# Deploy production stack
docker-compose -f docs/docker/reference/docker-compose.production.yml up -d

# With monitoring
docker-compose -f docs/docker/reference/docker-compose.production.yml \
              -f docs/docker/reference/docker-compose.monitoring.yml up -d
```

## Troubleshooting

### Build Issues
```bash
# Slow builds? Verify you're using Linux storage
df -h | grep /tmp

# Clean build cache
docker builder prune -a

# Build from Linux storage
DOCKERFILE="docker/Dockerfile.agent" IMAGE_NAME="cfn-agent" ./scripts/docker/build-from-linux.sh
```

### Port Conflicts
```bash
# Check what's using ports
netstat -tulpn | grep :6379

# Clean up containers
docker stop $(docker ps -aq) && docker rm $(docker ps -aq)

# Prune networks
docker network prune -f
```

### Resource Issues
```bash
# Check container resources
docker stats

# Inspect container limits
docker inspect <container-name> | grep -A 10 "Resources"
```

## Environment Variables

### Required
- `COMPOSE_PROJECT_NAME`: Unique identifier for deployment
- `CFN_REDIS_PORT`: Redis server port
- `CFN_POSTGRES_PORT`: PostgreSQL port
- `WORKTREE_BRANCH`: Git branch name

### Optional
- `MEMORY_BUDGET`: Total memory for agents (default: 40g)
- `MAX_ITERATIONS`: Max loop iterations (default: 10)
- `DEBUG`: Enable debug logging (true/false)

## Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Coordinator   │───▶│     Redis       │◀───│   Agent Pool    │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   PostgreSQL    │    │   Monitoring    │    │     Logs        │
│                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Next Steps

1. Read the [Architecture Guide](../architecture/DOCKER_ORCHESTRATION.md)
2. Check [Troubleshooting Guide](../troubleshooting/)
3. Review [Configuration Reference](../reference/README.md)

## Get Help

- Check container logs: `docker-compose logs -f <service>`
- Join the CFN Discord/Slack
- Create an issue in the repository