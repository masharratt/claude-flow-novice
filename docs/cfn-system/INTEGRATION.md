# CFN System Integration Guide

## Quick Start Integration

### Basic Task Execution
```bash
# CLI Mode (production)
/cfn-loop-cli "Implement feature X" --mode=standard --provider=kimi

# Task Mode (debugging)
/cfn-loop-task "Investigate bug Y" --mode=standard

# Docker Mode (containerized)
/cfn-docker:CFN_DOCKER_CLI "Build service Z" --mode=standard
```

## Provider Integration

### Multi-Provider Setup
```bash
# Enable custom routing
export CFN_CUSTOM_ROUTING=true

# Switch providers
/switch-api kimi  # Balanced cost/quality
/switch-api zai   # Lowest cost
/switch-api max   # Highest quality
```

### Provider Configuration
```typescript
interface ProviderConfig {
  name: string;
  endpoint: string;
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  costTier: 'low' | 'medium' | 'high';
}
```

## Docker Integration

### Build Requirements
```bash
# Must build from Linux storage
./.claude/skills/docker-build/build.sh \
  --dockerfile docker/Dockerfile.agent \
  --tag cfn-agent:latest
```

### Multi-Worktree Setup
```bash
# Create isolated environment
git worktree add ../feature-branch feature-branch
cd ../feature-branch

# Start isolated stack
./scripts/docker/run-in-worktree.sh up -d

# Set environment variables
export COMPOSE_PROJECT_NAME="cfn-feature-branch"
export CFN_REDIS_PORT="6421"
export CFN_POSTGRES_PORT="5474"
```

### Service Communication
```bash
# Internal Docker network
redis-cli -h redis -p 6379  # Use service names
psql -h postgres -p 5432 -U user

# External host access
redis-cli -h localhost -p 6421  # Use offset ports
```

## Skill Integration

### TypeScript Skills
```typescript
// Structure of a TypeScript skill
interface Skill {
  name: string;
  version: string;
  execute: (input: SkillInput) => Promise<SkillOutput>;
  dependencies?: string[];
  memoryLimit?: number;
  timeout?: number;
}

// Example skill execution
const skill = new CfnProductOwnerDecision();
const result = await skill.execute({
  taskId: 'task-123',
  validatorScores: [0.9, 0.85, 0.88],
  context: {}
});
```

### Bash Skills
```bash
#!/bin/bash
# Standard bash skill structure
set -euo pipefail

# Input validation
if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <task-id>" >&2
  exit 1
fi

# Core logic
task_id=$1
# ... implementation ...

# Output
echo '{"success": true, "confidence": 0.9}'
```

## Redis Integration

### Connection Setup
```typescript
const redis = createClient({
  url: `redis://${REDIS_HOST}:${REDIS_PORT}`,
  password: REDIS_PASSWORD
});

await redis.connect();
```

### Key Patterns
```typescript
// Agent coordination
await redis.set(`task:${taskId}:total`, agentCount);
await redis.incr(`task:${taskId}:completed`);

// Consensus collection
await redis.hset(`consensus:${taskId}`, {
  'validator-1': '0.9',
  'validator-2': '0.85',
  'validator-3': '0.88'
});

// Artifact storage
await redis.set(`artifact:${taskId}:${agentId}`, JSON.stringify(result));
```

## Database Integration

### SQLite Schema (Task Mode)
```sql
-- Core tables
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  description TEXT,
  status TEXT,
  mode TEXT,
  created_at DATETIME,
  updated_at DATETIME
);

CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  type TEXT,
  status TEXT,
  confidence REAL,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

CREATE TABLE results (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  agent_id TEXT,
  data TEXT,
  timestamp DATETIME,
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);
```

### PostgreSQL Integration (Docker)
```sql
-- Extended schema for persistent storage
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  description TEXT NOT NULL,
  status VARCHAR(20) NOT NULL,
  mode VARCHAR(20) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## CI/CD Integration

### GitHub Actions Workflow
```yaml
name: CFN Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Start Redis
        run: docker run -d -p 6379:6379 redis:7-alpine

      - name: Run CFN Tests
        run: |
          npm install
          ./tests/cli-mode/run-all-tests.sh
          ./tests/docker-mode/run-all-implementations.sh
```

### Pre-commit Hook
```bash
#!/bin/sh
# .git/hooks/pre-commit

# Run critical tests
npm run test:unit
npm run test:integration

# Run CFN validation
./tests/cli-mode/run-all-tests.sh --quiet

# Check linting
npm run lint
```

## Monitoring Integration

### Metrics Collection
```typescript
// daa performance metrics
interface Metrics {
  taskId: string;
  agentId: string;
  startTime: number;
  endTime: number;
  memoryUsed: number;
  outputSize: number;
  errorCount: number;
}

// Collection helper
await redis.hset(`metrics:${taskId}`, {
  `${agentId}:duration`: duration,
  `${agentId}:memory`: memoryUsed,
  `${agentId}:errors`: errorCount
});
```

### Health Checks
```bash
#!/bin/bash
# System health check script

check_redis() {
  redis-cli ping >/dev/null 2>&1 || {
    echo "CRITICAL: Redis not responding"
    exit 2
  }
}

check_disk_space() {
  local available=$(df -m . | awk 'NR==2 {print $4}')
  if (( available < 100 )); then
    echo "WARNING: Low disk space (${available}MB)"
    exit 1
  fi
}

check_agent_processes() {
  local count=$(pgrep -cf "claude-flow-novice")
  if (( count > 20 )); then
    echo "WARNING: High process count (${count})"
  fi
}
```

## API Integration

### REST API Endpoints
```typescript
// Task management
POST /api/tasks
GET /api/tasks/:id
PUT /api/tasks/:id/status
DELETE /api/tasks/:id

// Agent management
POST /api/agents
GET /api/agents/:id
POST /api/agents/:id/stop

// Results
GET /api/tasks/:id/results
GET /api/tasks/:id/artifacts
```

### WebSocket Events
```typescript
// Real-time updates
socket.on('task:started', (data) => {
  console.log(`Task ${data.taskId} started`);
});

socket.on('agent:completed', (data) => {
  console.log(`Agent ${data.agentId} completed`);
});

socket.on('task:completed', (data) => {
  console.log(`Task ${data.taskId} finished`);
});
```

## Third-party Integrations

### Trigger.dev Integration
```typescript
// MDAP mode execution
import { triggerTask } from './trigger-client';

const result = await triggerTask({
  taskName: 'cfn-mdap-implementer',
  payload: {
    context: mdapContext,
    targetFile: filePath,
    instructions: prompt
  },
  idempotencyKey: task.id
});
```

### Supabase Integration
```typescript
// Auth and storage
const { data, error } = await supabase
  .from('tasks')
  .insert([taskRecord])
  .select();

// Storage for artifacts
const { data: uploadData } = await supabase.storage
  .from('artifacts')
  .upload(`${taskId}/result.json`, resultFile);
```

## Configuration Management

### Environment Variables
```bash
# Core configuration
CFN_MODE=standard|enterprise|mvp
CFN_PROVIDER=zai|kimi|anthropic|openrouter
CFN_CUSTOM_ROUTING=true|false

# Resource limits
CFN_MEMORY_LIMIT=1073741824  # 1GB in bytes
CFN_TIMEOUT=300  # 5 minutes
CFN_MAX_AGENTS=10

# Infrastructure
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=cfn
```

### Configuration Files
```json
{
  "cfn": {
    "mode": "standard",
    "provider": "kimi",
    "thresholds": {
      "gate": 0.95,
      "consensus": 0.90
    },
    "agents": {
      "maxConcurrent": 10,
      "memoryLimit": "1GB",
      "timeout": 300
    },
    "artifacts": {
      "path": ".artifacts",
      "retention": "7d"
    }
  }
}
```

## Troubleshooting Integration

### Common Issues
```bash
# Port conflicts
docker stop $(docker ps -aq) && docker rm $(docker ps -aq)

# Redis connection
redis-cli ping  # Should return PONG

# Permission issues
usermod -aG docker $USER && newgrp docker

# Build failures (Windows)
cd /mnt/c/...  # Use Linux storage
```

### Debug Mode
```bash
# Enable verbose logging
export DEBUG=true
export CFN_LOG_LEVEL=debug

# Run with full output
/cfn-loop-task "Debug task" --mode=standard --debug
```