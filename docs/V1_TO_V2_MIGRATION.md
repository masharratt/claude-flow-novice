# V1 to V2 Coordination Migration Guide

## Overview

Phase 11 introduces **CoordinationToggle** - a seamless V1/V2 coordination system switch without code changes. Choose your version via environment variable or explicit config.

**Migration Benefits:**
- 🚀 SDK-based V2 coordination (52,208 LOC of advanced features)
- 🔄 Zero-downtime gradual rollout (0-100% traffic control)
- 🛡️ Backward-compatible V1 adapter (19,145 LOC legacy support)
- 🎯 Feature-flag based user assignment (deterministic SHA-256 hashing)

---

## Quick Start

### Option 1: Environment Variable (Recommended)
```bash
# Switch to V2 globally
export COORDINATION_VERSION=v2
npx claude-flow-novice swarm "your task"

# Switch to V1 (legacy)
export COORDINATION_VERSION=v1
npx claude-flow-novice swarm "your task"
```

### Option 2: CLI Flag
```bash
# V2 coordination
npx claude-flow-novice swarm "your task" --coordination-version v2

# V1 coordination
npx claude-flow-novice swarm "your task" --coordination-version v1
```

### Option 3: Programmatic Config
```typescript
import { CoordinationToggle } from './coordination/coordination-toggle.js';

const coordinator = await CoordinationToggle.create({
  version: 'v2',  // or 'v1'
  topology: 'mesh',
  maxAgents: 5,
});
```

---

## Feature Comparison

| Feature | V1 (Legacy) | V2 (SDK) |
|---------|------------|----------|
| **Agent Spawning** | ✅ QueenAgent.delegateTask | ✅ CoordinatorFactory.spawnAgent |
| **Topology** | ✅ Hierarchical, Mesh | ✅ Hierarchical, Mesh, Hybrid |
| **Consensus** | ✅ Raft, Quorum | ✅ Byzantine, Raft, Quorum, PBFT |
| **Pause/Resume** | ❌ Not supported | ✅ Lifecycle management |
| **Checkpoints** | ❌ Not supported | ✅ Auto-checkpointing (30s interval) |
| **Token Management** | ⚠️ Manual tracking | ✅ Dynamic token allocation |
| **Background Processing** | ⚠️ Basic | ✅ Advanced queue with priorities |
| **API Mode** | ❌ CLI only | ✅ SDK + API server modes |
| **Metrics** | ⚠️ Basic stats | ✅ Comprehensive telemetry |

---

## Gradual Rollout Strategy

### Hash-Based User Assignment

Control V2 rollout percentage with deterministic user assignment:

```bash
# 0% rollout - all users on V1 (safe default)
export V2_ROLLOUT_PERCENT=0

# 50% rollout - gradual migration
export V2_ROLLOUT_PERCENT=50

# 100% rollout - full V2 adoption
export V2_ROLLOUT_PERCENT=100
```

**How it works:**
- SHA-256 hash of `userId` determines V1 or V2 assignment
- Deterministic: Same user always gets same version
- Statistical: 50% rollout produces ~40-60% split (validated in tests)

**Override for specific users:**
```bash
# Force V2 for testing, regardless of rollout %
export COORDINATION_VERSION=v2
```

---

## Migration Strategies

### Strategy 1: Canary Deployment (Recommended)
**Timeline:** 2-4 weeks

1. **Week 1: 10% Rollout**
   ```bash
   export V2_ROLLOUT_PERCENT=10
   ```
   - Monitor metrics for V2 users
   - Compare performance vs V1 baseline
   - Identify edge cases

2. **Week 2: 50% Rollout**
   ```bash
   export V2_ROLLOUT_PERCENT=50
   ```
   - Validate statistical split (40-60% range)
   - A/B test feature adoption
   - Gather user feedback

3. **Week 3: 90% Rollout**
   ```bash
   export V2_ROLLOUT_PERCENT=90
   ```
   - Final validation before full migration
   - Ensure V1 users have no regressions

4. **Week 4: 100% V2**
   ```bash
   export V2_ROLLOUT_PERCENT=100
   ```
   - Full V2 adoption
   - V1 remains available for rollback

### Strategy 2: Blue-Green Deployment
**Timeline:** 1 week

1. **Deploy V2 in parallel** (no traffic)
   ```bash
   export COORDINATION_VERSION=v1  # Current production
   ```

2. **Switch traffic to V2** (instant cutover)
   ```bash
   export COORDINATION_VERSION=v2
   ```

3. **Rollback if issues**
   ```bash
   export COORDINATION_VERSION=v1
   ```

### Strategy 3: Feature-Flag Testing
**Timeline:** Development/QA only

Test both versions in same environment:
```bash
# Developer 1: V1 testing
export COORDINATION_VERSION=v1
npm test

# Developer 2: V2 testing
export COORDINATION_VERSION=v2
npm test
```

---

## V1 Configuration Translation

### Automatic Config Translation

**V1 Config (CoordinationTopologyConfig):**
```typescript
{
  topology: 'hierarchical',
  maxAgents: 10,
  strategy: 'capability-based',
  hierarchical: {
    minWorkers: 8,
    maxWorkers: 10,
    autoScale: true,
  },
  consensus: {
    protocol: 'raft',
    timeout: 5000,
  },
}
```

**Auto-translated to V2 (FactoryOptions):**
```typescript
{
  mode: 'sdk',
  topology: 'hierarchical',
  maxConcurrentAgents: 10,
  defaultTokenBudget: 20000,
  enableDynamicAllocation: true,
  enableCheckpoints: true,
  checkpointInterval: 30000,
  enableBackgroundProcessing: true,
}
```

**Translation handled by `ConfigTranslator`** - no manual mapping required!

---

## V1 Dependency Requirements

When using V1 coordination, you **must** provide explicit dependencies:

```typescript
import { CoordinationToggle } from './coordination/coordination-toggle.js';

const coordinator = await CoordinationToggle.create({
  version: 'v1',
  topology: 'mesh',
  maxAgents: 5,

  // REQUIRED for V1:
  v1Dependencies: {
    memory: SwarmMemory,
    broker: MessageBroker,
    dependencyGraph: DependencyGraph,
    logger: console,
  },
});
```

**Why?** V1 is legacy and requires explicit injection to prevent default assumptions.

**V2 has no dependency requirements** - all managed internally by SDK.

---

## Troubleshooting

### Issue: "Invalid COORDINATION_VERSION"
**Error:**
```
Invalid COORDINATION_VERSION: "v3". Must be 'v1' or 'v2'.
```

**Solution:**
```bash
# Only v1 or v2 are valid (case-insensitive)
export COORDINATION_VERSION=v2  # ✅
export COORDINATION_VERSION=V2  # ✅ (normalized to v2)
export COORDINATION_VERSION=v3  # ❌
```

---

### Issue: "V1 dependencies missing"
**Error:**
```
Missing or invalid V1 dependency: memory
```

**Solution:**
Provide all 4 required V1 dependencies:
```typescript
v1Dependencies: {
  memory: SwarmMemory,          // ✅
  broker: MessageBroker,        // ✅
  dependencyGraph: DependencyGraph,  // ✅
  logger: console,              // ✅
}
```

---

### Issue: Pause/Resume not working
**Error:**
```
V1 coordination does not support pause/resume. Use V2 with SDK mode.
```

**Solution:**
Switch to V2 for SDK features:
```bash
export COORDINATION_VERSION=v2
```

**Fallback behavior (V1):**
- `pauseAgent()`: Returns `{ success: false, reason: 'V1 does not support pause' }`
- `resumeAgent()`: Returns `{ success: false, reason: 'V1 does not support resume' }`

Configure fallback:
```typescript
new V1CoordinatorAdapter(
  v1Coordinator,
  'noop'  // Silent NOOP (default)
  // OR
  'error' // Throw errors for unsupported features
);
```

---

### Issue: Invalid rollout percentage
**Error:**
```
Invalid V2_ROLLOUT_PERCENT: "150". Must be between 0 and 100.
```

**Solution:**
```bash
export V2_ROLLOUT_PERCENT=100  # ✅ Max rollout
export V2_ROLLOUT_PERCENT=50   # ✅ Half rollout
export V2_ROLLOUT_PERCENT=150  # ❌ Out of range
export V2_ROLLOUT_PERCENT=abc  # ❌ Non-numeric
```

---

## Observability

### Monitoring V1/V2 Usage

**CLI Logs:**
```bash
npx claude-flow-novice swarm "task" --coordination-version v2

# Output:
🔧 Coordination: V2
[INFO] V2 coordinator selected
  version: v2
  topology: mesh
  source: explicit
```

**Programmatic Logging:**
```typescript
const coordinator = await CoordinationToggle.create({
  version: 'v2',
  // ... logger will automatically log version selection
});

// Logs:
// [INFO] V2 coordinator selected
//   version: v2
//   topology: mesh
//   source: explicit
```

### Recommended Metrics

Track these for gradual rollout monitoring:

1. **Version Distribution**
   - % users on V1 vs V2
   - Rollout effectiveness (actual vs target %)

2. **Performance Comparison**
   - V1 avg task duration
   - V2 avg task duration
   - Token consumption delta

3. **Feature Adoption**
   - V2-only feature usage (pause/resume, checkpoints)
   - SDK vs CLI mode distribution

4. **Error Rates**
   - V1 coordinator errors
   - V2 coordinator errors
   - Rollback trigger conditions

---

## Rollback Plan

### Emergency Rollback (Instant)
```bash
# Revert to V1 globally
export COORDINATION_VERSION=v1

# Or reduce V2 rollout
export V2_ROLLOUT_PERCENT=0
```

### Gradual Rollback
```bash
# Reduce V2 traffic incrementally
export V2_ROLLOUT_PERCENT=50  # Half rollback
export V2_ROLLOUT_PERCENT=25  # Quarter rollback
export V2_ROLLOUT_PERCENT=0   # Full V1
```

### Trigger Conditions
Rollback if:
- V2 error rate > 5% (vs <1% baseline)
- V2 avg latency > 2x V1 latency
- Critical V2-only bug affecting >10% users
- Security vulnerability in V2 coordinator

---

## Security Considerations

### VUL-1: Environment Variable Injection (Fixed)
**Protection:** Strict regex validation `/^v[12]$/`
```typescript
// ✅ Safe
COORDINATION_VERSION=v2  // Valid

// ❌ Blocked
COORDINATION_VERSION="v2; rm -rf /"  // Injection attempt blocked
```

### VUL-2: Hash Collision (Fixed)
**Protection:** SHA-256 cryptographic hash + 256-char limit
```typescript
// ✅ Collision-resistant
hashUserId("user123")  // SHA-256 → deterministic 0-99

// ❌ DoS prevented
hashUserId("A".repeat(1000000))  // Rejected (max 256 chars)
```

### VUL-3: Rollout Manipulation (Fixed)
**Protection:** Strict numeric validation + range check
```bash
# ✅ Valid
export V2_ROLLOUT_PERCENT=50

# ❌ Blocked
export V2_ROLLOUT_PERCENT=999      # Out of range
export V2_ROLLOUT_PERCENT="NaN"    # Non-numeric
```

### VUL-4: Prototype Pollution (Fixed)
**Protection:** Dangerous key detection
```typescript
// ❌ Blocked
v1Dependencies: {
  __proto__: { isAdmin: true },  // Prototype pollution attempt
}

// ✅ Validated
v1Dependencies: {
  memory: SwarmMemory,  // Safe
}
```

### VUL-5: Version Confusion (Fixed)
**Protection:** Transparent audit logging
```typescript
// All version selections logged:
[INFO] V2 coordinator selected
  version: v2
  source: explicit | environment | default
  topology: mesh
```

---

## Best Practices

### 1. Start with Low Rollout
```bash
# Begin conservatively
export V2_ROLLOUT_PERCENT=5
```

### 2. Monitor Metrics During Rollout
- Set up alerts for error rate spikes
- Compare V1 vs V2 performance
- Track feature adoption

### 3. Test Both Versions in CI/CD
```yaml
# .github/workflows/test.yml
jobs:
  test-v1:
    env:
      COORDINATION_VERSION: v1
    run: npm test

  test-v2:
    env:
      COORDINATION_VERSION: v2
    run: npm test
```

### 4. Document Rollback Triggers
Define clear conditions for reverting to V1

### 5. Gradual Adoption (Weeks not Days)
Allow time to identify edge cases

---

## FAQ

**Q: Can I use V1 and V2 simultaneously?**
A: No, `COORDINATION_VERSION` is global. Use `V2_ROLLOUT_PERCENT` for gradual migration.

**Q: What happens if I don't set `COORDINATION_VERSION`?**
A: Defaults to V2 (if `V2_ROLLOUT_PERCENT` allows) or gradual rollout logic.

**Q: Is V1 deprecated?**
A: No, V1 remains fully supported via `V1CoordinatorAdapter`. V2 is recommended for new features.

**Q: Can I mix V1 and V2 coordinators in same codebase?**
A: Not recommended. Choose one version per deployment for consistency.

**Q: How do I test V2 features locally?**
A: `export COORDINATION_VERSION=v2` overrides all rollout logic.

**Q: What if V2 breaks my workflow?**
A: Instant rollback: `export COORDINATION_VERSION=v1`

---

## Next Steps

1. ✅ Set `COORDINATION_VERSION=v2` in development
2. ✅ Test V2 features (pause/resume, checkpoints, SDK mode)
3. ✅ Start 10% rollout in staging
4. ✅ Monitor metrics for 1 week
5. ✅ Gradual increase to 50% → 90% → 100%
6. ✅ Document team-specific migration learnings

**Need help?** File an issue at [claude-flow-novice/issues](https://github.com/anthropics/claude-flow-novice/issues)
