# Implementation Checklist: Unified Coordination System

**Goal:** Build abstraction layer that supports CLI, SDK, and Hybrid coordination modes with seamless switching.

---

## Phase 1: Core Abstraction Layer (Week 1)

### 1.1 Define Coordinator Interface

- [ ] Create `src/coordination/v2/interfaces/ICoordinator.ts`
  ```typescript
  interface ICoordinator {
    mode: 'cli' | 'sdk' | 'hybrid';
    spawnAgent(role: string, task: string): Promise<Agent>;
    pauseAgent(agentId: string): Promise<void>;
    resumeAgent(agentId: string, instruction?: string): Promise<void>;
    createCheckpoint(agentId: string): Promise<Checkpoint>;
    // ... 12 more methods
  }
  ```

- [ ] Create `src/coordination/v2/interfaces/IAgent.ts`
  ```typescript
  interface IAgent {
    id: string;
    role: string;
    status: AgentStatus;
    execute(): Promise<AgentResult>;
    getProgress(): Promise<ProgressInfo>;
  }
  ```

- [ ] Create `src/coordination/v2/types/coordination.ts`
  - Mode types
  - Configuration types
  - Result types
  - Error types

**Deliverable:** TypeScript interfaces that work for all modes

---

### 1.2 Configuration System

- [ ] Create `src/coordination/v2/config/schema.ts`
  - JSON schema for `claude-flow-config.json`
  - Validation using Zod or JSON Schema
  - Default configurations

- [ ] Create `src/coordination/v2/config/loader.ts`
  - Load from config file
  - Load from environment variables
  - Merge config sources (priority: env > file > defaults)

- [ ] Create `src/coordination/v2/config/validator.ts`
  - Validate configuration completeness
  - Check for conflicting settings
  - Provide clear error messages

**Test:**
```bash
# Should load config from file
cat claude-flow-config.json
# Should override with env vars
export CFN_COORDINATION_MODE=sdk
```

---

### 1.3 Mode Detection

- [ ] Create `src/coordination/v2/detection/mode-detector.ts`
  ```typescript
  async function detectOptimalMode(): Promise<DetectionResult> {
    // Check for API credentials
    // Check for CLI availability
    // Check for proxy setup
    // Return recommended mode + warnings
  }
  ```

- [ ] Create detection checks:
  - `checkApiKeyAvailable()`
  - `checkClaudeCodeInstalled()`
  - `checkProxyRunning(url: string)`
  - `checkSDKInstalled()`
  - `checkSystemResources()`

- [ ] Create `src/coordination/v2/detection/capability-matrix.ts`
  - Feature compatibility table
  - Performance characteristics
  - Cost estimates

**Test:**
```typescript
const result = await detectOptimalMode();
// Returns: { mode: 'cli', features: [...], warnings: [] }
```

---

## Phase 2: CLI Coordinator Implementation (Week 2)

### 2.1 CLI Coordinator Core

- [ ] Create `src/coordination/v2/cli/CLICoordinator.ts`
  - Implements `ICoordinator`
  - Uses bash/pipes/signals from our research
  - Agent pooling for fast spawning

- [ ] Create `src/coordination/v2/cli/AgentPool.ts`
  - Pre-spawn idle agents
  - Named pipe communication
  - Health monitoring

- [ ] Create `src/coordination/v2/cli/ProcessManager.ts`
  - Process lifecycle (spawn, pause, kill)
  - Signal handling (SIGSTOP, SIGCONT, SIGUSR1/2)
  - Process groups for hierarchy

**Deliverable:** Working CLI coordination matching our POC

---

### 2.2 CLI State Management

- [ ] Create `src/coordination/v2/cli/StateStore.ts`
  - tmpfs-based storage (/dev/shm)
  - JSON checkpoint format
  - File locking (flock)

- [ ] Create `src/coordination/v2/cli/CheckpointManager.ts`
  - Create checkpoint (agent state snapshot)
  - Restore from checkpoint
  - Checkpoint history (last 10)

- [ ] Create `src/coordination/v2/cli/MessageBus.ts`
  - Named pipe messaging
  - Broadcast to multiple agents
  - Timeout handling

**Test:**
```typescript
const coordinator = new CLICoordinator();
const agent = await coordinator.spawnAgent('coder', 'Write function');
const checkpoint = await coordinator.createCheckpoint(agent.id);
// Checkpoint saved to /dev/shm/cfn/{session}/checkpoints/
```

---

### 2.3 CLI Pause/Resume

- [ ] Implement `pauseAgent()` using:
  - SIGSTOP (instant freeze)
  - Cooperative pause (checkpoint-based)
  - Timeout fallback

- [ ] Implement `resumeAgent()` with:
  - SIGCONT (instant resume)
  - Context injection
  - State restoration

**Test:**
```typescript
await coordinator.pauseAgent(agent.id);
// Agent frozen, zero token consumption
await coordinator.resumeAgent(agent.id, 'New instruction');
// Agent resumes with updated context
```

---

## Phase 3: SDK Coordinator Implementation (Week 3)

### 3.1 SDK Coordinator Core

- [ ] Create `src/coordination/v2/sdk/SDKCoordinator.ts`
  - Implements `ICoordinator`
  - Uses `@anthropic-ai/claude-code` query()
  - Session forking for fast spawn

- [ ] Create `src/coordination/v2/sdk/SessionManager.ts`
  - Session ID tracking
  - Parent-child relationships
  - Fork session with `forkSession: true`

- [ ] Create `src/coordination/v2/sdk/QueryController.ts`
  - Wrap SDK query() API
  - Handle pause via `query.interrupt()`
  - Resume via `resumeSessionAt`

**Deliverable:** SDK coordination using official API

---

### 3.2 SDK State Management

- [ ] Create `src/coordination/v2/sdk/MessageStore.ts`
  - Store message UUIDs
  - Track conversation history
  - Checkpoint = message UUID

- [ ] Create `src/coordination/v2/sdk/ArtifactAdapter.ts`
  - Use SDK artifact storage
  - Content-addressed storage
  - Binary data support

**Test:**
```typescript
const coordinator = new SDKCoordinator({ apiKey: process.env.ANTHROPIC_API_KEY });
const agent = await coordinator.spawnAgent('coder', 'Write function');
// Uses SDK session forking (50-100ms)
```

---

### 3.3 SDK Error Handling

- [ ] Create `src/coordination/v2/sdk/ErrorTranslator.ts`
  - Translate SDK errors to common format
  - Handle rate limits
  - Handle quota exceeded
  - Fallback to CLI on failure

- [ ] Implement retry logic:
  - Exponential backoff
  - Circuit breaker pattern
  - Graceful degradation

**Test:**
```typescript
// Simulate API failure
await coordinator.spawnAgent('coder', 'task');
// Should auto-fallback to CLI mode
// Logs: "SDK unavailable, falling back to CLI"
```

---

## Phase 4: Hybrid Coordinator Implementation (Week 4)

### 4.1 Proxy Integration

- [ ] Create `src/coordination/v2/hybrid/HybridCoordinator.ts`
  - SDK coordination features
  - Proxy-based inference
  - Provider abstraction

- [ ] Create `src/coordination/v2/hybrid/ProxyManager.ts`
  - Start/stop proxy
  - Health checks
  - Provider switching

- [ ] Create `src/coordination/v2/hybrid/ProviderAdapter.ts`
  - OpenRouter adapter
  - Ollama adapter
  - DeepSeek adapter
  - Custom provider support

**Deliverable:** SDK coordination + cheap inference

---

### 4.2 Provider Configuration

- [ ] Create provider configs:
  - `configs/providers/openrouter.json`
  - `configs/providers/ollama.json`
  - `configs/providers/deepseek.json`

- [ ] Implement model mapping:
  - Anthropic model → OpenRouter equivalent
  - Cost tracking per provider
  - Quality tier selection

**Test:**
```typescript
const coordinator = new HybridCoordinator({
  coordinationMode: 'sdk',
  inferenceProvider: 'openrouter',
  model: 'google/gemini-2.5-pro'
});
// SDK coordination + Gemini inference (62% cheaper)
```

---

## Phase 5: Factory & Auto-Detection (Week 5)

### 5.1 Coordinator Factory

- [ ] Create `src/coordination/v2/factory/CoordinatorFactory.ts`
  ```typescript
  export async function createCoordinator(
    config?: Partial<CoordinationConfig>
  ): Promise<ICoordinator> {
    const detectedMode = await detectOptimalMode();
    const finalConfig = mergeConfig(config, detectedMode);

    switch (finalConfig.mode) {
      case 'cli': return new CLICoordinator(finalConfig);
      case 'sdk': return new SDKCoordinator(finalConfig);
      case 'hybrid': return new HybridCoordinator(finalConfig);
    }
  }
  ```

- [ ] Implement mode switching:
  - Runtime mode detection
  - Fallback chain: sdk → hybrid → cli
  - Clear logging of selection

**Test:**
```typescript
// Auto-detection
const coord1 = await createCoordinator();
// Explicit mode
const coord2 = await createCoordinator({ mode: 'cli' });
// Both should work identically
```

---

### 5.2 Feature Detection

- [ ] Create `src/coordination/v2/features/FeatureDetector.ts`
  - Runtime capability checking
  - Feature compatibility matrix
  - Warning system

- [ ] Implement graceful degradation:
  ```typescript
  if (!coordinator.supportsFeature('pause-resume')) {
    console.warn('Pause/resume not available in CLI mode, using SIGSTOP');
  }
  ```

**Test:**
```typescript
const features = await coordinator.getAvailableFeatures();
// Returns: ['spawn', 'pause', 'checkpoint', 'hierarchy']
```

---

## Phase 6: Migration Tools (Week 6)

### 6.1 Configuration Migration

- [ ] Create `scripts/migrate-config.ts`
  - Detect current setup
  - Generate migration plan
  - Update config files
  - Preserve existing settings

- [ ] Create migration templates:
  - CLI → SDK migration
  - SDK → Hybrid migration
  - Rollback scripts

**Usage:**
```bash
npx claude-flow-novice migrate --from cli --to sdk
# Updates config, guides through API key setup
```

---

### 6.2 Compatibility Checker

- [ ] Create `src/coordination/v2/tools/CompatibilityChecker.ts`
  - Check code for mode-specific features
  - Warn about non-portable patterns
  - Suggest alternatives

- [ ] Create `scripts/check-compatibility.ts`
  ```bash
  npx claude-flow-novice check-compat
  # Scans code for mode-specific usage
  # Reports: "All code is mode-agnostic ✓"
  ```

---

### 6.3 Testing Utilities

- [ ] Create `src/coordination/v2/testing/MockCoordinator.ts`
  - Test-friendly coordinator
  - No actual spawning
  - Deterministic behavior

- [ ] Create test helpers:
  - `withMode(mode, testFn)` - Run test in specific mode
  - `testAllModes(testFn)` - Run test in all modes
  - Mode switching tests

**Example:**
```typescript
describe('Agent coordination', () => {
  testAllModes('should spawn agents', async (coordinator) => {
    const agent = await coordinator.spawnAgent('coder', 'task');
    expect(agent.id).toBeDefined();
  });
});
```

---

## Phase 7: Documentation & Examples (Week 7)

### 7.1 User Documentation

- [ ] Create `docs/getting-started.md`
  - Quick start for each mode
  - Configuration examples
  - Common use cases

- [ ] Create `docs/api-reference.md`
  - Full API documentation
  - Type definitions
  - Examples for each method

- [ ] Create `docs/migration-guide.md`
  - Step-by-step upgrade paths
  - Breaking changes (if any)
  - Troubleshooting

---

### 7.2 Code Examples

- [ ] Create `examples/basic-cli.ts` - CLI mode basics
- [ ] Create `examples/basic-sdk.ts` - SDK mode basics
- [ ] Create `examples/basic-hybrid.ts` - Hybrid mode basics
- [ ] Create `examples/mode-switching.ts` - Runtime switching
- [ ] Create `examples/production-setup.ts` - Full production config

---

### 7.3 Guides

- [ ] Create `docs/guides/choosing-a-mode.md`
- [ ] Create `docs/guides/cost-optimization.md`
- [ ] Create `docs/guides/troubleshooting.md`
- [ ] Create `docs/guides/performance-tuning.md`

---

## Phase 8: NPM Package Preparation (Week 8)

### 8.1 Package Structure

```
claude-flow-novice/
├── src/
│   └── coordination/
│       └── v2/
│           ├── index.ts           # Main export
│           ├── cli/               # CLI coordinator
│           ├── sdk/               # SDK coordinator
│           ├── hybrid/            # Hybrid coordinator
│           ├── factory/           # Factory pattern
│           └── interfaces/        # Common interfaces
├── dist/                          # Compiled output
├── examples/                      # Example code
├── docs/                          # Documentation
└── package.json
```

---

### 8.2 Package Configuration

- [ ] Update `package.json`:
  ```json
  {
    "name": "claude-flow-novice",
    "version": "2.0.0",
    "main": "dist/index.js",
    "types": "dist/index.d.ts",
    "exports": {
      ".": "./dist/index.js",
      "./cli": "./dist/cli/index.js",
      "./sdk": "./dist/sdk/index.js",
      "./hybrid": "./dist/hybrid/index.js"
    },
    "peerDependencies": {
      "@anthropic-ai/claude-code": "^2.0.0"
    },
    "peerDependenciesMeta": {
      "@anthropic-ai/claude-code": {
        "optional": true
      }
    }
  }
  ```

- [ ] SDK as optional peer dependency
- [ ] Tree-shaking support
- [ ] Proper TypeScript definitions

---

### 8.3 Distribution Strategy

- [ ] CLI-only bundle (no SDK)
  - Smaller package size
  - Zero dependencies
  - Works offline

- [ ] Full bundle (CLI + SDK)
  - Includes SDK support
  - Requires API key
  - Complete feature set

- [ ] Create installation variants:
  ```bash
  # CLI only (lightweight)
  npm install claude-flow-novice

  # With SDK support
  npm install claude-flow-novice @anthropic-ai/claude-code

  # With proxy support
  npm install claude-flow-novice claude-code-router
  ```

---

## Testing Checklist

### Unit Tests
- [ ] Configuration loading
- [ ] Mode detection
- [ ] Feature detection
- [ ] Error handling
- [ ] State management

### Integration Tests
- [ ] CLI coordinator end-to-end
- [ ] SDK coordinator end-to-end
- [ ] Hybrid coordinator end-to-end
- [ ] Mode switching
- [ ] Graceful degradation

### Performance Tests
- [ ] Spawn time benchmarks
- [ ] Pause/resume latency
- [ ] Checkpoint performance
- [ ] Memory usage
- [ ] Concurrent agent limits

### Compatibility Tests
- [ ] Same code in all modes
- [ ] Migration paths
- [ ] Fallback scenarios
- [ ] Error recovery

---

## Release Checklist

- [ ] All tests passing
- [ ] Documentation complete
- [ ] Examples working
- [ ] Migration guide tested
- [ ] Performance benchmarks run
- [ ] Security audit passed
- [ ] Changelog updated
- [ ] Version bumped
- [ ] NPM package published
- [ ] GitHub release created
- [ ] Announcement posted

---

## Success Criteria

✅ **Users can switch modes without code changes**
✅ **CLI mode works with zero configuration**
✅ **SDK mode activates with just API key**
✅ **Hybrid mode provides 60-93% cost savings**
✅ **Auto-detection selects optimal mode**
✅ **Graceful fallback on failures**
✅ **Complete documentation**
✅ **Working examples for all modes**
✅ **Performance matches or exceeds targets**
✅ **NPM package properly structured**

---

## Timeline Summary

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| 1. Abstraction Layer | Week 1 | TypeScript interfaces |
| 2. CLI Coordinator | Week 2 | Working CLI mode |
| 3. SDK Coordinator | Week 3 | Working SDK mode |
| 4. Hybrid Coordinator | Week 4 | Working Hybrid mode |
| 5. Factory & Auto-detect | Week 5 | Unified entry point |
| 6. Migration Tools | Week 6 | Upgrade utilities |
| 7. Documentation | Week 7 | Complete docs |
| 8. NPM Package | Week 8 | Release-ready |

**Total: 8 weeks to production-ready unified coordination system**
