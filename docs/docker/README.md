# Docker Documentation

This directory contains comprehensive documentation for the CFN Docker infrastructure and containerization strategy.

## Structure

### `/architecture/`
- Design decisions and architectural patterns
- Container orchestration models
- Multi-agent coordination strategies

### `/guides/`
- Getting started guides
- Best practices
- Operational procedures

### `/reference/`
- Docker Compose configurations (moved from root)
- Environment file templates
- Configuration reference

### `/troubleshooting/`
- Common issues and solutions
- Debug procedures
- Performance tuning

## Quick Links

- **Main Docker Directory**: `/docker/` - Contains all Dockerfiles, configurations, and implementations
- **Production Compose**: See `reference/docker-compose.production.yml`
- **Development Compose**: Use root `docker-compose.yml`

## Key Components

1. **Agent Containers** (`/docker/agents/`)
   - Type-specific Dockerfiles for different agent types
   - Optimized multi-stage builds

2. **Coordinator System** (`/docker/coordinator/`)
   - Wave-based spawning architecture
   - Memory budget management (40GB)

3. **Team Configurations** (`/docker/teams/`)
   - Isolated environments per team
   - Custom tooling and permissions

4. **Runtime Configuration** (`/docker/runtime/`)
   - Security profiles (seccomp)
   - Resource limits
   - Network policies

## Getting Started

```bash
# Development environment
docker-compose up -d

# Production environment
docker-compose -f docs/docker/reference/docker-compose.production.yml up -d

# Build all agent images
./.claude/skills/docker-build/build.sh
```

## Important Notes

- Always use Linux native storage for builds (96% faster)
- Memory budget: 40GB total for all agents
- Four-tier batching strategy for optimal resource usage
- See `CLAUDE.md` for complete Docker build requirements