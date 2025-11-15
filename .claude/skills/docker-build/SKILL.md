# Docker Build Skill - WSL2 Optimized

**Version:** 1.0.0
**Purpose:** Build Docker images with 96% faster build times on WSL2 environments
**Location:** `.claude/skills/docker-build/`

## Overview

This skill provides WSL2-optimized Docker image building by syncing build context to Linux native storage (`/tmp/cfn-build`) before building, avoiding severe I/O performance penalties from Windows mounts.

**Performance Impact:**
- Windows mount: 755 seconds build time
- Linux native: 20 seconds build time
- **96% faster builds**

## Usage

```bash
# Build any Docker image (automatic detection)
./.claude/skills/docker-build/build.sh \
  --dockerfile docker/Dockerfile.agent \
  --tag cfn-agent:latest

# Build with custom context
./.claude/skills/docker-build/build.sh \
  --dockerfile docker/Dockerfile.orchestrator \
  --tag cfn-orchestrator:latest \
  --context ./custom-context

# Specify platform
./.claude/skills/docker-build/build.sh \
  --dockerfile docker/Dockerfile.coordinator \
  --tag cfn-coordinator:latest \
  --platform linux/amd64
```

## Parameters

| Parameter | Required | Description | Default |
|-----------|----------|-------------|---------|
| `--dockerfile` | Yes | Path to Dockerfile | - |
| `--tag` | Yes | Image tag to build | - |
| `--context` | No | Build context directory | Project root |
| `--platform` | No | Target platform | Current platform |

## How It Works

1. **Sync Phase:** Copies build context from Windows mount to `/tmp/cfn-build/`
2. **Build Phase:** Runs `docker build` from Linux native storage
3. **Cleanup Phase:** Returns built image to host, removes temp directory

## WSL2 Performance Context

WSL2 has severe I/O performance issues when Docker accesses Windows mounts:
- File enumeration: 0.1s (Linux) vs 755s (Windows)
- Context transfer becomes the bottleneck
- Every file operation crosses mount boundary

This skill eliminates the bottleneck by working entirely in Linux filesystem.

## Requirements

- WSL2 environment
- Docker installed and running
- `/tmp/` writable (standard Linux configuration)
- Sufficient disk space in `/tmp/` for build context

## Error Handling

- Validates Dockerfile exists
- Validates tag is provided
- Creates temp directory with cleanup trap
- Preserves error codes from docker build
- Automatic cleanup on success/failure

## Integration with CFN Docker Infrastructure

All CFN Docker images should use this skill:
```bash
# cfn-agent
./.claude/skills/docker-build/build.sh --dockerfile docker/Dockerfile.agent --tag cfn-agent:latest

# cfn-orchestrator
./.claude/skills/docker-build/build.sh --dockerfile docker/Dockerfile.orchestrator --tag cfn-orchestrator:latest

# cfn-coordinator
./.claude/skills/docker-build/build.sh --dockerfile docker/Dockerfile.coordinator --tag cfn-coordinator:latest
```

## See Also

- `docker/Dockerfile.agent` - Base agent image
- `docker/Dockerfile.orchestrator` - Orchestration image
- `docker/Dockerfile.coordinator` - Coordination image
- `CLAUDE.md` lines 60-90 - Docker build requirements
- `docs/CFN_DOCKER_INFRASTRUCTURE_REQUIREMENTS_SPEC.md` - Full infrastructure spec
