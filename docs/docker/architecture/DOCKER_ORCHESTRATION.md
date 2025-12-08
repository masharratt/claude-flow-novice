# Docker Orchestration Architecture

## Overview

The CFN system uses a sophisticated Docker-based orchestration model for multi-agent coordination, featuring wave-based spawning, memory budget management, and intelligent batching strategies.

## Core Components

### 1. Coordinator System
- **Location**: `/docker/coordinator/`
- **Purpose**: Manages agent lifecycle and task distribution
- **Key Features**:
  - Wave-based spawning with 40GB memory budget
  - Four-tier batching strategy
  - Redis-based coordination
  - Health monitoring and recovery

### 2. Agent Containers
- **Location**: `/docker/agents/`
- **Types**: Backend, Frontend, Docker, Python, Rust, TypeScript
- **Optimization**: Multi-stage builds for minimal image size

### 3. Memory Management

#### Four-Tier Batching Strategy
| Tier | Cluster Size | Memory | Use Case |
|------|-------------|--------|----------|
| 1 | 1 file | 512MB | Independent files |
| 2 | 2-3 files | 600MB | Small clusters |
| 3 | 4-8 files | 800MB | Medium modules |
| 4 | 9+ files | 1GB | Large modules |

#### Wave Spawning Algorithm
```javascript
const MEMORY_BUDGET = 40 * 1024 * 1024 * 1024; // 40GB
while (batchQueue.length > 0) {
  const wave = [];
  let waveMemory = 0;

  while (batchQueue.length > 0 && waveMemory + batchMemory <= MEMORY_BUDGET) {
    wave.push(batchQueue.shift());
    waveMemory += batchMemory;
  }

  await spawnWave(wave);
}
```

### 4. Network Architecture

#### Service Discovery
- Internal DNS for container communication
- Service names: `redis`, `postgres`, `orchestrator`
- Port offset system for multi-worktree isolation

#### Security Layers
1. **Network Isolation**: Dedicated networks per stack
2. **Seccomp Profiles**: Restricted system calls
3. **Read-only FS**: Immutable runtime where possible
4. **Non-root Users**: Least privilege principle

## Performance Optimizations

### Build Performance
- **Linux Native Storage**: 96% faster builds (20s vs 755s)
- **Layer Caching**: Strategic Dockerfile ordering
- **.dockerignore**: Minimal build contexts
- **Multi-stage**: Separate build/runtime dependencies

### Runtime Performance
- **Memory Pooling**: Reuse warm containers
- **Parallel Execution**: Wave-based concurrency
- **Resource Limits**: Prevent resource contention
- **Health Checks**: Proactive failure detection

## Known Issues

### Bug #4: Container Status Tracking
- **Problem**: Coordinator waits for Redis queue consumption that never happens
- **Solution**: Replace Redis queue with Docker API polling
- **Status**: Identified, fix in progress

### Bug #3: Redis CLI Deadlock
- **Problem**: CLI commands blocking on stdin
- **Solution**: Use pipe input pattern
- **Status**: Fixed

## Multi-Worktree Support

### Isolation Strategy
- Unique project names per worktree
- Port offset calculations
- Separate Redis namespaces
- Independent volume mounts

### Environment Variables
```bash
export COMPOSE_PROJECT_NAME="cfn-${BRANCH}"
export CFN_REDIS_PORT="${BASE_REDIS_PORT}"
export CFN_POSTGRES_PORT="${BASE_POSTGRES_PORT}"
export WORKTREE_BRANCH="${BRANCH}"
```

## Monitoring and Observability

### Metrics Collection
- Container resource usage
- Task completion rates
- Error rates by type
- Wave execution timing

### Logging Strategy
- Structured JSON logs
- Centralized aggregation
- Correlation IDs for task tracking
- Log levels: ERROR, WARN, INFO, DEBUG

### Health Checks
- Container status polling (every 2s)
- Redis connectivity checks
- Memory usage monitoring
- Task timeout detection (30min default)

## Future Enhancements

1. **Kubernetes Integration**: Native K8s deployment support
2. **Auto-scaling**: Dynamic wave sizing based on load
3. **Cost Optimization**: Spot instance integration
4. **Advanced Scheduling**: GPU-aware agent placement