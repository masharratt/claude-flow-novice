# Agent Spawner Module

Type-safe TypeScript implementation of spawn-agents.sh for CFN Loop agent orchestration.

## Overview

The Agent Spawner module provides a robust, fully-typed system for spawning and managing agent processes with:

- **Type-safe configuration** - All parameters validated at compile time
- **Memory management** - Wave-based allocation respecting 40GB budget
- **Context enrichment** - Pluggable context enhancement system
- **Redis coordination** - Agent tracking and metadata storage
- **Comprehensive testing** - 67 tests covering core functionality

## Quick Start

```typescript
import { spawnAgents } from '@/agent-spawner';

const summary = await spawnAgents({
  taskId: 'task-abc123',
  iteration: 1,
  agents: ['backend-dev', 'frontend-dev', 'devops-engineer'],
  originalContext: JSON.stringify({ projectId: '123' }),
});

console.log(`Spawned ${summary.totalSpawned} agents`);
console.log(`Success rate: ${summary.injectionSuccessCount}/${summary.totalSpawned}`);
```

## Module Structure

```
src/agent-spawner/
├── agent-spawner.ts      # Main implementation (5 classes, 592 lines)
├── types.ts              # Type definitions (14 interfaces, 169 lines)
├── index.ts              # Module exports
├── MIGRATION_NOTES.md    # Detailed migration documentation
└── README.md             # This file
```

## Core Classes

### AgentSpawner

Main class orchestrating agent spawning operations.

```typescript
class AgentSpawner {
  constructor(
    config: SpawnConfig,
    logger?: Logger,
    contextEnricher?: ContextEnricher,
    redisClient?: RedisClient
  )

  async spawn(): Promise<SpawnSummary>
  getResults(): SpawnResult[]
  reset(): void
}
```

### MemoryTierAnalyzer

Determines memory requirements per agent type.

```typescript
class MemoryTierAnalyzer {
  analyzeTier(agentType: string): MemoryTier
  getTierMemory(tier: MemoryTier): number
  getAllTiers(): MemoryTier[]
}
```

Memory tiers:
- **512MB** - Default/basic agents (backend-dev, etc.)
- **1GB** - Specialists (security-specialist, etc.)
- **2GB** - Validators/reviewers (code-reviewer, etc.)
- **4GB** - Orchestrators (cfn-orchestrator, etc.)

### WaveManager

Allocates agents into waves respecting memory budget.

```typescript
class WaveManager {
  allocateWaves(agentTypes: string[]): string[][]
  getTier(agentType: string): MemoryTier
  reset(): void
  getRemaining(): number
}
```

Features:
- 40GB total budget (10 x 4GB orchestrator agents per wave)
- Sequential wave processing (memory-safe)
- Automatic tier assignment

### InputSanitizer

Security-focused input validation and sanitization.

```typescript
class InputSanitizer {
  sanitize(input: string): string
  validateTaskId(taskId: string): boolean
  validateAgentType(agentType: string): boolean
}
```

Removes dangerous characters while preserving alphanumeric, dash, underscore, dot, comma, colon.

### DefaultContextEnricher

Handles context enrichment with timing and fallback.

```typescript
class DefaultContextEnricher implements ContextEnricher {
  async enrich(
    taskId: string,
    agentType: string,
    originalContext: string
  ): Promise<EnrichedContext>
}
```

Features:
- Injection time measurement
- >200ms warning threshold
- Graceful fallback to original context on failure

## Type Definitions

### SpawnConfig

Configuration for spawning operation.

```typescript
interface SpawnConfig {
  taskId: string;              // Unique task identifier
  iteration: number;           // Current iteration number (0+)
  agents: string[];            // Comma-separated or array of agent types
  originalContext: string;     // Original task context
  logDir?: string;             // Log directory (default: .artifacts/logs)
  redisHost?: string;          // Redis host (default: localhost)
  redisPort?: number;          // Redis port (default: 6379)
  projectRoot?: string;        // Project root (default: cwd)
}
```

### SpawnResult

Result of spawning a single agent.

```typescript
interface SpawnResult {
  agentId: string;                    // Unique agent identifier
  agentType: string;                  // Agent type/role
  pid?: number;                       // Process ID (if successful)
  success: boolean;                   // Spawn success flag
  error?: string;                     // Error message (if failed)
  injectionSuccessful: boolean;       // Context injection success
  injectionTime?: number;             // Context injection time (ms)
  contextSize?: number;               // Context size (bytes)
}
```

### SpawnSummary

Summary of entire spawning operation.

```typescript
interface SpawnSummary {
  totalSpawned: number;              // Total agents spawned
  injectionSuccessCount: number;     // Successful injections
  injectionFailureCount: number;     // Failed injections
  spawnResults: SpawnResult[];       // Individual results
  startTime: number;                 // Start timestamp
  endTime: number;                   // End timestamp
  duration: number;                  // Total duration (ms)
}
```

## Interfaces for Dependency Injection

### Logger

```typescript
interface Logger {
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
  debug(message: string, data?: unknown): void;
}
```

### ContextEnricher

```typescript
interface ContextEnricher {
  enrich(
    taskId: string,
    agentType: string,
    originalContext: string
  ): Promise<EnrichedContext>;
}
```

### RedisClient

```typescript
interface RedisClient {
  set(key: string, value: string): Promise<string | null>;
  sadd(key: string, value: string): Promise<number>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
}
```

## Advanced Usage

### Custom Logger

```typescript
class MyLogger implements Logger {
  info(message: string, data?: unknown) {
    // Custom logging implementation
  }
  // ... implement other methods
}

const spawner = new AgentSpawner(config, new MyLogger());
```

### Custom Context Enricher

```typescript
class MyContextEnricher implements ContextEnricher {
  async enrich(taskId, agentType, context) {
    // Your enrichment logic
    const enrichedContext = await myEnrichmentService.enrich(context);
    return {
      originalContext: enrichedContext,
      injectionTime: Date.now() - startTime,
      success: true,
    };
  }
}

const spawner = new AgentSpawner(
  config,
  logger,
  new MyContextEnricher()
);
```

### Custom Redis Client

```typescript
import * as redis from 'redis';

class RedisClientAdapter implements RedisClient {
  constructor(private client: redis.RedisClient) {}

  async set(key: string, value: string) {
    return new Promise((resolve, reject) => {
      this.client.set(key, value, (err, result) => {
        err ? reject(err) : resolve(result);
      });
    });
  }
  // ... implement other methods
}

const redisClient = new RedisClientAdapter(redis.createClient());
const spawner = new AgentSpawner(config, logger, enricher, redisClient);
```

## Testing

Run the test suite:

```bash
npm test -- tests/agent-spawner/agent-spawner.test.ts
```

Test results:
- **Total Tests:** 67
- **Passing:** 67 (100%)
- **Coverage:** ~50% statements (70-90% testable code)

See `MIGRATION_NOTES.md` for coverage details.

## Error Handling

AgentSpawner throws typed errors:

```typescript
try {
  const summary = await spawnAgents(config);
} catch (error) {
  if (error instanceof Error) {
    console.error('Spawn failed:', error.message);
  }
}
```

Common errors:
- `Invalid or missing taskId` - Configuration validation
- `Invalid or missing iteration` - Iteration must be ≥0
- `Invalid or missing agents` - Agents array cannot be empty
- `Invalid or missing originalContext` - Context required
- `No agents were spawned` - All spawning attempts failed

## Performance

**Time Complexity:**
- Initialization: O(1)
- Input sanitization: O(n) where n = input length
- Wave allocation: O(m log m) where m = agent count
- Agent spawning: O(m) parallel with Promise.all

**Space Complexity:**
- Configuration storage: O(1)
- Results storage: O(m) for m agents
- Wave allocation: O(w) where w = number of waves

**Memory Constraints:**
- Total budget: 40GB
- Per-wave maximum: 40GB
- Agents are spawned sequentially by wave

## Migration from Bash

This module replaces `.claude/skills/cfn-loop-orchestration/helpers/spawn-agents.sh`.

**Feature parity:**
- ✅ Agent enumeration and spawning
- ✅ Unique ID generation
- ✅ Input sanitization
- ✅ Context enrichment
- ✅ Redis coordination
- ✅ Logging and metrics
- ✅ Error handling

**Improvements:**
- ✅ Full type safety
- ✅ Comprehensive testing (67 tests)
- ✅ Extensible design
- ✅ Better error messages
- ✅ Pluggable components

See `MIGRATION_NOTES.md` for detailed comparison.

## Compatibility

- **Node.js:** ≥18.0.0
- **TypeScript:** ≥5.0
- **npm:** Latest

## Contributing

To extend or modify the Agent Spawner:

1. Update type definitions in `types.ts`
2. Implement changes in `agent-spawner.ts`
3. Add tests in `tests/agent-spawner/agent-spawner.test.ts`
4. Run `npm test` to validate
5. Run `npm run build` to compile
6. Update documentation

## Related Documentation

- **MIGRATION_NOTES.md** - Detailed migration documentation
- **Original Script** - `.claude/skills/cfn-loop-orchestration/helpers/spawn-agents.sh`
- **Test Suite** - `tests/agent-spawner/agent-spawner.test.ts`
- **Type Definitions** - `src/agent-spawner/types.ts`

## License

Part of the Claude Flow Novice project.
