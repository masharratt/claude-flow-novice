# Phase 11: V1/V2 Toggle Architecture - Implementation Plan

## Executive Summary

**Scope**: MEDIUM (3-5 days, ~1400 LOC)
**Strategy**: Adapter Pattern + Factory Selection + Feature Flags
**Risk**: LOW (V1 remains unchanged, V2 opt-in via env var)
**Goal**: Enable gradual V2 rollout while maintaining V1 stability

---

## Architecture Overview

### Toggle Mechanism

```typescript
// Environment-based selection (initialization time only)
const COORDINATION_VERSION = process.env.COORDINATION_VERSION || 'v2'; // Default V2

if (COORDINATION_VERSION === 'v1') {
  coordinator = new V1CoordinatorAdapter(await createV1Coordinator(config));
} else {
  coordinator = await CoordinatorFactory.create(config);
}
```

### Unified Interface

Both V1 and V2 expose the same `ICoordinator` interface:

```typescript
interface ICoordinator {
  // Common operations
  spawnAgent(config: AgentSpawnConfig): Promise<Agent>;
  pauseAgent(agentId: string): Promise<PauseResult>;
  resumeAgent(agentId: string): Promise<ResumeResult>;
  getMetrics(): CoordinatorMetrics;
  shutdown(): Promise<void>;

  // Topology info
  getTopology(): 'hierarchical' | 'mesh';
  getAgentCount(): number;
}
```

---

## Implementation Components

### 1. CoordinationToggle (Factory Selector)

**File**: `/src/coordination/coordination-toggle.ts`
**LOC**: ~80

```typescript
export class CoordinationToggle {
  static async create(options?: {
    version?: 'v1' | 'v2';
    topology?: 'mesh' | 'hierarchical';
    maxAgents?: number;
    // ... other config
  }): Promise<ICoordinator> {
    const version = options?.version || process.env.COORDINATION_VERSION || 'v2';

    if (version === 'v1') {
      return this.createV1Coordinator(options);
    } else {
      return this.createV2Coordinator(options);
    }
  }

  private static async createV1Coordinator(options): Promise<ICoordinator> {
    const v1Config = ConfigTranslator.toV1Config(options);
    const v1Coordinator = await createTopologyCoordinator(v1Config, dependencies);
    return new V1CoordinatorAdapter(v1Coordinator);
  }

  private static async createV2Coordinator(options): Promise<ICoordinator> {
    const v2Config = ConfigTranslator.toV2Config(options);
    return await CoordinatorFactory.create(v2Config);
  }
}
```

**Key Features**:
- Auto-detects version from env var
- Translates unified config to V1/V2 specific formats
- Returns `ICoordinator` regardless of version

---

### 2. V1CoordinatorAdapter

**File**: `/src/coordination/adapters/v1-coordinator-adapter.ts`
**LOC**: ~450

```typescript
export class V1CoordinatorAdapter implements ICoordinator {
  constructor(
    private v1Coordinator: TopologyCoordinator, // V1's return type
    private fallbackBehavior: 'error' | 'noop' = 'noop'
  ) {}

  async spawnAgent(config: AgentSpawnConfig): Promise<Agent> {
    // V1 uses coordinator.coordinator.delegateTask() (QueenAgent)
    // OR coordinator.coordinator.assignTask() (MeshCoordinator)

    if (this.v1Coordinator.topology === 'hierarchical') {
      const queenAgent = this.v1Coordinator.coordinator as QueenAgent;
      const result = await queenAgent.delegateTask({
        type: config.type,
        priority: config.priority,
        capabilities: config.capabilities || [],
      });

      return this.mapV1ResultToAgent(result, config);
    } else {
      // Mesh topology
      const meshCoordinator = this.v1Coordinator.coordinator as MeshCoordinator;
      const result = await meshCoordinator.assignTask({
        taskId: config.agentId,
        type: config.type,
        priority: config.priority,
      });

      return this.mapV1ResultToAgent(result, config);
    }
  }

  async pauseAgent(agentId: string): Promise<PauseResult> {
    // V1 doesn't support pause/resume - SDK feature only
    if (this.fallbackBehavior === 'error') {
      throw new Error('V1 coordination does not support pause/resume. Use V2 with SDK mode.');
    }

    // NOOP fallback - log warning
    console.warn(`[V1 Adapter] Pause not supported for agent ${agentId}. Operation ignored.`);
    return { success: false, reason: 'V1 does not support pause' };
  }

  async resumeAgent(agentId: string): Promise<ResumeResult> {
    // Similar to pauseAgent - NOOP or error
    if (this.fallbackBehavior === 'error') {
      throw new Error('V1 coordination does not support pause/resume. Use V2 with SDK mode.');
    }

    console.warn(`[V1 Adapter] Resume not supported for agent ${agentId}. Operation ignored.`);
    return { success: false, reason: 'V1 does not support resume' };
  }

  getMetrics(): CoordinatorMetrics {
    // V1 has QueenAgent.getMetrics() or MeshCoordinator.getMetrics()
    const v1Metrics = this.v1Coordinator.coordinator.getMetrics();

    return {
      agentCount: v1Metrics.activeWorkers || v1Metrics.activePeers || 0,
      topology: this.v1Coordinator.topology,
      taskQueueSize: v1Metrics.queuedTasks || 0,
      // Map other fields...
    };
  }

  getTopology(): 'hierarchical' | 'mesh' {
    return this.v1Coordinator.topology;
  }

  getAgentCount(): number {
    const metrics = this.getMetrics();
    return metrics.agentCount;
  }

  async shutdown(): Promise<void> {
    await this.v1Coordinator.shutdown();
  }

  // Helper methods
  private mapV1ResultToAgent(v1Result: any, config: AgentSpawnConfig): Agent {
    return {
      id: config.agentId,
      type: config.type,
      state: v1Result.status === 'assigned' ? 'WORKING' : 'IDLE',
      priority: config.priority,
      capabilities: config.capabilities || [],
      // ... map other fields
    };
  }
}
```

**Key Challenges**:
1. **Pause/Resume Gap**: V1 doesn't support SDK features → NOOP fallback or error
2. **Different Task Models**: V1 `delegateTask` vs V2 `spawnAgent` → semantic mapping
3. **Metrics Translation**: V1 and V2 track different metrics → best-effort mapping

---

### 3. ConfigTranslator

**File**: `/src/coordination/config-translator.ts`
**LOC**: ~150

```typescript
export class ConfigTranslator {
  static toV1Config(unified: UnifiedCoordinatorConfig): CoordinationTopologyConfig {
    return {
      topology: unified.topology || 'mesh',
      maxAgents: unified.maxAgents || 10,
      strategy: unified.strategy || 'balanced',

      hierarchical: unified.topology === 'hierarchical' ? {
        minWorkers: Math.min(8, unified.maxAgents || 10),
        maxWorkers: unified.maxAgents || 10,
        autoScale: true,
        scalingThreshold: 0.8,
      } : undefined,

      mesh: unified.topology === 'mesh' ? {
        maxAgents: unified.maxAgents || 10,
        maxConnections: Math.floor((unified.maxAgents || 10) / 3),
        taskDistributionStrategy: 'capability-based',
      } : undefined,

      consensus: unified.enableConsensus ? {
        protocol: unified.topology === 'hierarchical' ? 'raft' : 'quorum',
        timeout: 5000,
      } : undefined,
    };
  }

  static toV2Config(unified: UnifiedCoordinatorConfig): FactoryOptions {
    return {
      mode: 'sdk', // V2 defaults to SDK mode
      topology: unified.topology || 'mesh',
      maxConcurrentAgents: unified.maxAgents || 10,
      defaultTokenBudget: unified.tokenBudget || 20000,

      apiKey: process.env.ANTHROPIC_API_KEY,
      enableDynamicAllocation: true,

      // V2-specific features
      enableCheckpoints: true,
      checkpointInterval: 30000,
      enableBackgroundProcessing: true,
    };
  }
}

interface UnifiedCoordinatorConfig {
  topology?: 'mesh' | 'hierarchical';
  maxAgents?: number;
  strategy?: 'balanced' | 'adaptive' | 'performance';
  enableConsensus?: boolean;
  tokenBudget?: number;
  // ... other common fields
}
```

---

### 4. MCP Tool Integration

**Files to Update**: 11 MCP tool handlers
**LOC**: ~200 (20 LOC per file average)

```typescript
// Before (hardcoded V1):
import { createTopologyCoordinator } from '../coordination/index.js';

export async function swarm_init(params) {
  const coordinator = await createTopologyCoordinator({
    topology: params.topology,
    maxAgents: params.maxAgents,
  }, dependencies);
  // ...
}

// After (toggle-aware):
import { CoordinationToggle } from '../coordination/coordination-toggle.js';

export async function swarm_init(params) {
  const coordinator = await CoordinationToggle.create({
    version: params.coordinationVersion, // Optional override
    topology: params.topology,
    maxAgents: params.maxAgents,
  });
  // ...
}
```

**MCP Tools to Update**:
- `swarm_init` - Initialize with toggle
- `agent_spawn` - Route through ICoordinator.spawnAgent()
- `task_orchestrate` - Use coordinator.getMetrics()
- `swarm_status` - Version-aware status reporting
- (7 more tools...)

---

### 5. CLI Integration

**File**: `/src/cli/coordination-setup.ts`
**LOC**: ~100

```bash
# CLI flag support
npx claude-flow-novice swarm init --topology mesh --coordination-version v1
npx claude-flow-novice swarm init --topology mesh --coordination-version v2 # Default

# Environment variable
export COORDINATION_VERSION=v1
npx claude-flow-novice swarm init --topology mesh
```

```typescript
// CLI argument parsing
const coordinationVersion = args['--coordination-version'] ||
                           process.env.COORDINATION_VERSION ||
                           'v2';

const coordinator = await CoordinationToggle.create({
  version: coordinationVersion,
  topology: args['--topology'],
  maxAgents: args['--max-agents'],
});
```

---

### 6. Feature Flag System

**File**: `/src/coordination/feature-flags.ts`
**LOC**: ~120

```typescript
export class FeatureFlags {
  private static rolloutPercentage = {
    v2: parseInt(process.env.V2_ROLLOUT_PERCENT || '100'), // Default 100%
  };

  static shouldUseV2(userId?: string): boolean {
    // Gradual rollout logic
    if (this.rolloutPercentage.v2 === 0) return false;
    if (this.rolloutPercentage.v2 === 100) return true;

    // Hash-based assignment (consistent per user)
    const hash = userId ? this.hashUserId(userId) : Math.random() * 100;
    return hash < this.rolloutPercentage.v2;
  }

  static getCoordinationVersion(userId?: string): 'v1' | 'v2' {
    // Explicit override
    if (process.env.COORDINATION_VERSION) {
      return process.env.COORDINATION_VERSION as 'v1' | 'v2';
    }

    // Gradual rollout
    return this.shouldUseV2(userId) ? 'v2' : 'v1';
  }

  private static hashUserId(userId: string): number {
    // Simple hash for consistent assignment
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = ((hash << 5) - hash) + userId.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash) % 100;
  }
}
```

**Rollout Strategy**:
```bash
# Week 1: 5% of users
export V2_ROLLOUT_PERCENT=5

# Week 2: 25%
export V2_ROLLOUT_PERCENT=25

# Week 3: 50%
export V2_ROLLOUT_PERCENT=50

# Week 4: 100%
export V2_ROLLOUT_PERCENT=100
```

---

## Testing Strategy

### Integration Tests (~250 LOC)

**File**: `/tests/integration/coordination-toggle.test.ts`

```typescript
describe('Coordination Toggle', () => {
  describe('V1 Path', () => {
    it('should spawn agents via V1 QueenAgent', async () => {
      process.env.COORDINATION_VERSION = 'v1';
      const coordinator = await CoordinationToggle.create({
        topology: 'hierarchical',
        maxAgents: 5,
      });

      const agent = await coordinator.spawnAgent({
        agentId: 'test-001',
        type: 'coder',
        priority: 8,
      });

      expect(agent.state).toBe('WORKING');
      expect(coordinator.getTopology()).toBe('hierarchical');
    });

    it('should handle pause gracefully (NOOP)', async () => {
      process.env.COORDINATION_VERSION = 'v1';
      const coordinator = await CoordinationToggle.create({ topology: 'mesh' });
      const agent = await coordinator.spawnAgent({ agentId: 'test-001', type: 'tester' });

      const result = await coordinator.pauseAgent(agent.id);
      expect(result.success).toBe(false);
      expect(result.reason).toContain('V1 does not support pause');
    });
  });

  describe('V2 Path', () => {
    it('should spawn agents via V2 SwarmCoordinatorV2', async () => {
      process.env.COORDINATION_VERSION = 'v2';
      const coordinator = await CoordinationToggle.create({
        topology: 'mesh',
        maxAgents: 5,
      });

      const agent = await coordinator.spawnAgent({
        agentId: 'test-002',
        type: 'coder',
        priority: 8,
      });

      expect(agent.state).toBe('IDLE'); // V2 starts idle, transitions to WORKING
    });

    it('should support pause/resume (SDK feature)', async () => {
      process.env.COORDINATION_VERSION = 'v2';
      const coordinator = await CoordinationToggle.create({ topology: 'mesh' });
      const agent = await coordinator.spawnAgent({ agentId: 'test-002', type: 'tester' });

      const pauseResult = await coordinator.pauseAgent(agent.id);
      expect(pauseResult.success).toBe(true);

      const resumeResult = await coordinator.resumeAgent(agent.id);
      expect(resumeResult.success).toBe(true);
    });
  });

  describe('Feature Flags', () => {
    it('should route 50% to V2 when rollout is 50%', () => {
      process.env.V2_ROLLOUT_PERCENT = '50';
      const v2Count = Array.from({ length: 1000 }, (_, i) =>
        FeatureFlags.shouldUseV2(`user-${i}`)
      ).filter(Boolean).length;

      expect(v2Count).toBeGreaterThan(450);
      expect(v2Count).toBeLessThan(550);
    });
  });
});
```

---

## Migration Guide

### For Developers

**Before (V1 only)**:
```typescript
import { createTopologyCoordinator } from '@/coordination';

const coordinator = await createTopologyCoordinator({
  topology: 'mesh',
  maxAgents: 10,
}, dependencies);

const result = await coordinator.coordinator.assignTask({ ... });
```

**After (Toggle-aware)**:
```typescript
import { CoordinationToggle } from '@/coordination/coordination-toggle';

const coordinator = await CoordinationToggle.create({
  version: 'v2', // or 'v1' for fallback
  topology: 'mesh',
  maxAgents: 10,
});

const agent = await coordinator.spawnAgent({ ... }); // Unified API
```

### For Users

**Environment Variable**:
```bash
# Use V1 (stable, no SDK features)
export COORDINATION_VERSION=v1
npx claude-flow-novice swarm init

# Use V2 (new, SDK features enabled)
export COORDINATION_VERSION=v2
npx claude-flow-novice swarm init
```

**CLI Flag**:
```bash
npx claude-flow-novice swarm init --coordination-version v1
npx claude-flow-novice swarm init --coordination-version v2
```

---

## Rollout Plan

### Week 1: Internal Testing (V2_ROLLOUT_PERCENT=0)
- Deploy toggle infrastructure
- All users on V1 (zero risk)
- Internal team tests V2 manually

### Week 2: Canary (V2_ROLLOUT_PERCENT=5)
- 5% of users automatically get V2
- Monitor metrics: latency, error rate, feature usage
- Rollback to V1 if issues detected

### Week 3: Ramp Up (V2_ROLLOUT_PERCENT=25)
- 25% of users on V2
- Compare V1 vs V2 performance side-by-side
- Collect user feedback

### Week 4: Majority (V2_ROLLOUT_PERCENT=50)
- 50% split between V1 and V2
- Validate at scale

### Week 5: Full Rollout (V2_ROLLOUT_PERCENT=100)
- All users on V2 by default
- V1 remains available via `COORDINATION_VERSION=v1`

### Month 4: V1 Deprecation Notice
- Announce V1 sunset date (3 months)
- Provide migration tooling

### Month 7: V1 Removal
- Remove V1 code from codebase
- Archive V1 adapters for historical reference

---

## Rollback Strategy

### Immediate Rollback (0-5 minutes)
```bash
# Global rollback to V1
export COORDINATION_VERSION=v1
# OR
export V2_ROLLOUT_PERCENT=0

# Restart services
pm2 restart all
```

### Per-User Rollback
```bash
# Individual user override
COORDINATION_VERSION=v1 npx claude-flow-novice swarm init
```

### Monitoring Triggers
- Error rate >5% in V2 → auto-rollback
- Latency p99 >2x V1 → alert + manual review
- Feature unavailable errors → auto-rollback

---

## Success Criteria

### Phase 11 Completion Criteria

✅ **Toggle Infrastructure**:
- CoordinationToggle factory operational
- V1CoordinatorAdapter passes all tests
- ConfigTranslator handles all config variations

✅ **MCP Integration**:
- All 11 MCP tools route through toggle
- Version-aware status reporting
- No breaking changes to MCP API

✅ **CLI Support**:
- `--coordination-version` flag functional
- Environment variable respected
- Help text updated

✅ **Testing**:
- 95%+ test coverage for toggle infrastructure
- Integration tests validate both V1 and V2 paths
- Performance overhead <5ms

✅ **Documentation**:
- Migration guide published
- Rollout plan documented
- Rollback procedures tested

### Production Readiness Gate

✅ **Canary Success** (Week 2):
- 5% rollout with 0 critical errors
- Latency within 10% of V1
- Feature parity validated

✅ **Scale Validation** (Week 4):
- 50% rollout handles production load
- V2 metrics match or exceed V1
- Zero V1→V2 state corruption incidents

---

## LOC Breakdown (Final)

| Component | LOC | Confidence |
|-----------|-----|------------|
| CoordinationToggle | 80 | HIGH |
| V1CoordinatorAdapter | 450 | MEDIUM (depends on V1 API quirks) |
| ConfigTranslator | 150 | HIGH |
| MCP Tool Updates | 200 | HIGH |
| CLI Integration | 100 | HIGH |
| Feature Flags | 120 | HIGH |
| Integration Tests | 250 | HIGH |
| Documentation | 50 | HIGH |
| **TOTAL** | **1400** | **HIGH** |

---

## Risk Assessment

### HIGH RISK (Mitigated)
- **V1/V2 API Incompatibility**: Adapter pattern + fallback behavior
- **State Migration**: No runtime migration (restart required)

### MEDIUM RISK (Monitored)
- **Performance Overhead**: <5ms adapter overhead (acceptable)
- **Feature Parity Gaps**: Documented, graceful degradation (NOOP for pause/resume)

### LOW RISK
- **Rollout Failures**: Feature flags + instant rollback
- **Breaking Changes**: V1 unchanged, V2 opt-in

---

## Next Steps

1. **Sprint Planning**: 3-5 day sprint, 2 engineers
2. **Implement Core**: CoordinationToggle + V1CoordinatorAdapter
3. **MCP Integration**: Update 11 tool handlers
4. **Testing**: 250 LOC integration tests
5. **Documentation**: Migration guide + rollout plan
6. **Week 1 Deploy**: Internal testing only
7. **Week 2-5**: Gradual rollout (5% → 100%)
8. **Month 4**: V1 deprecation notice
9. **Month 7**: V1 removal

**STATUS**: Ready for implementation ✅
