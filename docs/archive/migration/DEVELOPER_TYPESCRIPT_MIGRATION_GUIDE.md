# Developer TypeScript Migration Guide

**Version:** v2.16.0+
**Last Updated:** 2025-11-20
**Target Audience:** CFN Loop Developers

## Table of Contents

1. [Quick Start](#quick-start)
2. [Architecture Overview](#architecture-overview)
3. [Using TypeScript Implementations](#using-typescript-implementations)
4. [CLI Argument Compatibility](#cli-argument-compatibility)
5. [Environment Configuration](#environment-configuration)
6. [Debugging TypeScript Code](#debugging-typescript-code)
7. [Common Migration Patterns](#common-migration-patterns)
8. [Troubleshooting](#troubleshooting)
9. [Best Practices](#best-practices)

---

## Quick Start

### Prerequisites
```bash
# Ensure Node.js 18+ and TypeScript 5.3+ installed
node --version  # v18.0.0+
npx tsc --version  # Version 5.3.3+

# Install dependencies
npm install
```

### Enable TypeScript (Default)
```bash
# TypeScript is enabled by default in v2.16.0+
# No configuration needed

# Verify TypeScript execution
export DEBUG=cfn:*
npx claude-flow-novice agent-spawn backend-dev --task-id test-123
```

### Fallback to Bash (Temporary)
```bash
# Only during soft launch period (Weeks 1-2)
export USE_TYPESCRIPT=false

# Will be removed in Week 7
```

---

## Architecture Overview

### TypeScript Module Structure

```
src/
├── agent-spawner/           # Agent spawning logic
│   ├── agent-spawner.ts     # Main spawner (replaces spawn-agent.sh)
│   ├── types.ts             # Type definitions
│   └── index.ts             # Public exports
│
├── agents/                  # Agent selection and lifecycle
│   ├── agent-loader.ts      # Agent definition loading
│   ├── agent-registry.ts    # Agent registry
│   ├── agent-validator.ts   # Validation logic
│   ├── lifecycle-manager.ts # Lifecycle tracking
│   └── index.ts             # Public exports
│
├── coordination/            # Redis coordination
│   ├── coordination-signal.ts   # Signal dispatch
│   ├── coordination-wait.ts     # Blocking wait
│   ├── coordination-collect.ts  # Result collection
│   └── index.ts                 # Public exports
│
├── hooks/                   # File modification hooks
│   ├── pre-edit-backup.ts   # Backup creation
│   ├── post-edit-validate.ts # Validation pipeline
│   └── index.ts             # Public exports
│
└── validation/              # Quality gates
    ├── test-executor.ts     # Test execution
    ├── gate-checker.ts      # Quality gate checks
    ├── consensus-scorer.ts  # Consensus scoring
    └── index.ts             # Public exports
```

### Key Design Principles

1. **Type Safety:** All functions have explicit types
2. **Error Handling:** Structured error types with stack traces
3. **Testability:** Pure functions with dependency injection
4. **Modularity:** Clear separation of concerns
5. **Backward Compatibility:** CLI arguments match bash versions

---

## Using TypeScript Implementations

### Agent Spawning

**Old (bash):**
```bash
./.claude/skills/cfn-agent-spawning/spawn-agent.sh \
  backend-dev \
  --task-id abc-123 \
  --confidence 0.90 \
  --agent-id backend-001
```

**New (TypeScript):**
```bash
# Direct CLI execution (same arguments)
npx claude-flow-novice agent-spawn backend-dev \
  --task-id abc-123 \
  --confidence 0.90 \
  --agent-id backend-001

# Programmatic usage
node -e "
const { spawnAgent } = require('./src/agent-spawner');
spawnAgent({
  agentType: 'backend-dev',
  taskId: 'abc-123',
  confidence: 0.90,
  agentId: 'backend-001'
});
"
```

### Agent Selection

**Old (bash):**
```bash
./.claude/skills/cfn-agent-selection/select-agent.sh \
  --task "Fix security bug" \
  --role implementer
```

**New (TypeScript):**
```bash
npx claude-flow-novice agent-select \
  --task "Fix security bug" \
  --role implementer

# Or programmatically
node -e "
const { selectAgent } = require('./src/agents');
const agent = selectAgent({
  task: 'Fix security bug',
  role: 'implementer'
});
console.log(agent.type);
"
```

### Coordination

**Old (bash):**
```bash
# Signal dispatch
./.claude/skills/cfn-coordination/coordination-signal.sh \
  "swarm:task-123:loop3-complete" \
  --data "confidence=0.95"

# Wait for signal
./.claude/skills/cfn-coordination/coordination-wait.sh \
  "swarm:task-123:loop3-complete" \
  --timeout 300
```

**New (TypeScript):**
```bash
# Signal dispatch
npx claude-flow-novice coord-signal \
  "swarm:task-123:loop3-complete" \
  --data "confidence=0.95"

# Wait for signal
npx claude-flow-novice coord-wait \
  "swarm:task-123:loop3-complete" \
  --timeout 300

# Programmatic
node -e "
const { signal, wait } = require('./src/coordination');
await signal('swarm:task-123:loop3-complete', { confidence: 0.95 });
await wait('swarm:task-123:loop3-complete', 300);
"
```

### File Hooks

**Old (bash):**
```bash
# Pre-edit backup
BACKUP_PATH=$(./.claude/hooks/cfn-invoke-pre-edit.sh \
  "src/file.ts" --agent-id backend-001)

# Post-edit validation
./.claude/hooks/cfn-invoke-post-edit.sh \
  "src/file.ts" --agent-id backend-001
```

**New (TypeScript):**
```bash
# Pre-edit backup
npx claude-flow-novice pre-edit \
  "src/file.ts" --agent-id backend-001

# Post-edit validation
npx claude-flow-novice post-edit \
  "src/file.ts" --agent-id backend-001

# Programmatic
node -e "
const { createBackup, validateEdit } = require('./src/hooks');
await createBackup('src/file.ts', 'backend-001');
await validateEdit('src/file.ts', 'backend-001');
"
```

---

## CLI Argument Compatibility

### Argument Mapping

TypeScript implementations maintain **exact compatibility** with bash versions:

| Bash Argument | TypeScript Equivalent | Type | Required |
|---------------|----------------------|------|----------|
| `--task-id` | `--task-id` | string | Yes |
| `--agent-id` | `--agent-id` | string | No |
| `--confidence` | `--confidence` | number | No |
| `--timeout` | `--timeout` | number | No |
| `--mode` | `--mode` | string | No |
| `--role` | `--role` | string | No |
| `--data` | `--data` | string | No |

### Environment Variable Support

| Bash Variable | TypeScript Support | Default |
|---------------|-------------------|---------|
| `USE_TYPESCRIPT` | Yes (deprecated) | `true` |
| `CFN_REDIS_HOST` | Yes | `localhost` |
| `CFN_REDIS_PORT` | Yes | `6379` |
| `DEBUG` | Yes | (none) |
| `NODE_ENV` | Yes | `development` |
| `TASK_ID` | Yes | (generated) |
| `AGENT_ID` | Yes | (generated) |

---

## Environment Configuration

### Required Variables

```bash
# Redis connection (required for coordination)
export CFN_REDIS_HOST=localhost
export CFN_REDIS_PORT=6379

# Optional: Enable debug logging
export DEBUG=cfn:*

# Optional: Set environment
export NODE_ENV=production
```

### Optional Variables

```bash
# Timeout defaults (seconds)
export CFN_DEFAULT_TIMEOUT=300
export CFN_SPAWN_TIMEOUT=60

# Retry configuration
export CFN_MAX_RETRIES=3
export CFN_RETRY_DELAY=5

# Logging
export CFN_LOG_LEVEL=info  # debug, info, warn, error
export CFN_LOG_FILE=.artifacts/logs/cfn.log
```

### Docker Environment

When running in Docker, these are automatically set:

```yaml
# docker-compose.yml
services:
  cfn-coordinator:
    environment:
      USE_TYPESCRIPT: "true"
      CFN_REDIS_HOST: redis
      CFN_REDIS_PORT: 6379
      NODE_ENV: production
      DEBUG: cfn:*
```

---

## Debugging TypeScript Code

### Enable Debug Logging

```bash
# All CFN modules
export DEBUG=cfn:*

# Specific modules
export DEBUG=cfn:spawner,cfn:coordination

# Verbose output
export DEBUG=cfn:*,verbose
```

### Source Maps

TypeScript generates source maps for debugging:

```bash
# View stack trace with original TypeScript lines
node --enable-source-maps src/agent-spawner/index.js

# Debug with Node inspector
node --inspect-brk --enable-source-maps src/agent-spawner/index.js
```

### VSCode Debugging

**launch.json:**
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug TypeScript",
      "program": "${workspaceFolder}/src/agent-spawner/index.ts",
      "preLaunchTask": "npm: build",
      "sourceMaps": true,
      "outFiles": ["${workspaceFolder}/dist/**/*.js"],
      "env": {
        "DEBUG": "cfn:*"
      }
    }
  ]
}
```

### Common Debug Commands

```bash
# Check if TypeScript is being used
grep "agent-executor.ts" /tmp/coordinator-*.log

# View TypeScript errors
tail -f .artifacts/logs/typescript-errors.log

# Verify TypeScript compilation
npm run build
npx tsc --noEmit

# Run tests with coverage
npm test -- --coverage
```

---

## Common Migration Patterns

### Pattern 1: Bash Script to TypeScript Function

**Before (bash):**
```bash
#!/bin/bash
function validate_agent() {
  local agent_type=$1
  if [[ ! -f ".claude/agents/$agent_type/CLAUDE.md" ]]; then
    echo "ERROR: Agent not found"
    return 1
  fi
  echo "SUCCESS"
}
```

**After (TypeScript):**
```typescript
import fs from 'fs/promises';
import path from 'path';

export async function validateAgent(agentType: string): Promise<void> {
  const agentPath = path.join('.claude', 'agents', agentType, 'CLAUDE.md');
  try {
    await fs.access(agentPath);
  } catch (error) {
    throw new Error(`Agent not found: ${agentType}`);
  }
}
```

### Pattern 2: Bash Arguments to TypeScript Options

**Before (bash):**
```bash
#!/bin/bash
while [[ $# -gt 0 ]]; do
  case $1 in
    --task-id) TASK_ID=$2; shift 2 ;;
    --timeout) TIMEOUT=$2; shift 2 ;;
    *) shift ;;
  esac
done
```

**After (TypeScript):**
```typescript
import { parseArgs } from 'util';

interface SpawnOptions {
  taskId: string;
  timeout?: number;
}

const { values } = parseArgs({
  options: {
    'task-id': { type: 'string' },
    'timeout': { type: 'string' }
  }
});

const options: SpawnOptions = {
  taskId: values['task-id']!,
  timeout: values.timeout ? parseInt(values.timeout) : 300
};
```

### Pattern 3: Bash Pipes to TypeScript Streams

**Before (bash):**
```bash
cat file.txt | grep "ERROR" | wc -l
```

**After (TypeScript):**
```typescript
import { createReadStream } from 'fs';
import { createInterface } from 'readline';

async function countErrors(filePath: string): Promise<number> {
  let count = 0;
  const rl = createInterface({
    input: createReadStream(filePath),
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (line.includes('ERROR')) count++;
  }

  return count;
}
```

### Pattern 4: Bash Subprocesses to TypeScript Child Processes

**Before (bash):**
```bash
npx claude-flow-novice agent-spawn backend-dev &
PID=$!
wait $PID
```

**After (TypeScript):**
```typescript
import { spawn } from 'child_process';

function spawnAgent(agentType: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['claude-flow-novice', 'agent-spawn', agentType]);

    proc.on('exit', (code) => {
      code === 0 ? resolve() : reject(new Error(`Exit code ${code}`));
    });
  });
}
```

---

## Troubleshooting

### Issue 1: "Cannot find module" Errors

**Symptom:**
```
Error: Cannot find module './src/agent-spawner'
```

**Solution:**
```bash
# Rebuild TypeScript
npm run build

# Verify dist/ directory exists
ls -la dist/

# Check tsconfig.json outDir
grep outDir tsconfig.json
```

### Issue 2: TypeScript Not Being Used

**Symptom:**
```
Using bash fallback for agent spawning
```

**Solution:**
```bash
# Check environment variable
echo $USE_TYPESCRIPT  # Should be empty or "true"

# Remove override
unset USE_TYPESCRIPT

# Verify in logs
grep "agent-executor.ts" /tmp/coordinator-*.log
```

### Issue 3: Redis Connection Failures

**Symptom:**
```
Error: Redis connection failed: ECONNREFUSED
```

**Solution:**
```bash
# Check Redis is running
redis-cli ping  # Should return "PONG"

# Start Redis if needed
redis-server --daemonize yes

# Verify connection
export CFN_REDIS_HOST=localhost
export CFN_REDIS_PORT=6379
redis-cli -h $CFN_REDIS_HOST -p $CFN_REDIS_PORT ping
```

### Issue 4: Type Errors in Custom Code

**Symptom:**
```
error TS2345: Argument of type 'string' is not assignable to parameter of type 'AgentType'
```

**Solution:**
```bash
# Check type definitions
cat src/agents/types.ts

# Use type assertions if needed
const agentType = 'backend-dev' as AgentType;

# Or import proper types
import { AgentType } from './src/agents/types';
```

### Issue 5: Performance Degradation

**Symptom:**
```
Agent spawning slower than bash version
```

**Solution:**
```bash
# Enable Node.js performance profiling
node --prof src/agent-spawner/index.js

# Generate report
node --prof-process isolate-*.log > profile.txt

# Check for bottlenecks
grep -A 5 "ticks" profile.txt
```

---

## Best Practices

### 1. Type Safety

```typescript
// ✅ GOOD: Explicit types
function spawnAgent(options: SpawnOptions): Promise<SpawnResult> {
  // ...
}

// ❌ BAD: Implicit any
function spawnAgent(options) {
  // ...
}
```

### 2. Error Handling

```typescript
// ✅ GOOD: Structured errors
class AgentSpawnError extends Error {
  constructor(message: string, public agentType: string) {
    super(message);
    this.name = 'AgentSpawnError';
  }
}

throw new AgentSpawnError('Failed to spawn', 'backend-dev');

// ❌ BAD: Generic errors
throw new Error('Something went wrong');
```

### 3. Async/Await

```typescript
// ✅ GOOD: Proper async handling
async function spawnMultiple(agents: string[]): Promise<void> {
  await Promise.all(agents.map(agent => spawnAgent(agent)));
}

// ❌ BAD: Missing await
function spawnMultiple(agents: string[]) {
  agents.map(agent => spawnAgent(agent)); // Returns unhandled promises
}
```

### 4. Testing

```typescript
// ✅ GOOD: Testable with dependency injection
export function createSpawner(redis: RedisClient) {
  return async function spawn(agent: string) {
    // Use injected redis
  };
}

// ❌ BAD: Hard to test
export async function spawn(agent: string) {
  const redis = new RedisClient(); // Hard-coded dependency
}
```

### 5. Logging

```typescript
// ✅ GOOD: Structured logging
import debug from 'debug';
const log = debug('cfn:spawner');

log('Spawning agent: %s', agentType);

// ❌ BAD: Console logs
console.log('Spawning agent:', agentType);
```

---

## Additional Resources

- **TypeScript Handbook:** https://www.typescriptlang.org/docs/handbook/
- **Node.js TypeScript Guide:** https://nodejs.org/en/docs/guides/typescript/
- **Testing Guide:** `tests/CLAUDE.md`
- **Rollout Overview:** `docs/TYPESCRIPT_ROLLOUT_OVERVIEW.md`
- **FAQ:** `docs/TYPESCRIPT_MIGRATION_FAQ.md`

## Support

- **Slack:** #typescript-migration
- **GitHub Issues:** Label `typescript-migration`
- **Emergency:** Page on-call engineer

---

**Last Updated:** 2025-11-20
**Next Review:** 2025-12-01
