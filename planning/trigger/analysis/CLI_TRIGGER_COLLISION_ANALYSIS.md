# CLI Mode vs Trigger.dev Docker Mode - Collision Analysis & Mitigation Strategy

**Date:** 2025-11-24
**Analysis Scope:** Identify collision points between CLI mode (local execution) and Trigger.dev Docker mode (container-based execution)
**Status:** ⚠️ HIGH COLLISION RISK IDENTIFIED

---

## Executive Summary

**Key Finding:** 75% of coordination logic is shared between CLI mode and Trigger.dev Docker mode, but **significant infrastructure naming collisions** exist that will cause runtime failures if CLI mode files are edited without considering Trigger.dev dependencies.

**Risk Level:** 🔴 **HIGH** - Editing CLI mode for local use will break Trigger.dev Docker mode without proper namespace isolation

**Recommended Strategy:** Implement **Phase 1 (Mode Prefixes)** immediately to prevent collisions, followed by **Phase 2 (Service Name Aliases)** for infrastructure convergence.

---

## Overlap Analysis

### Shared Patterns (75% Overlap)

| Component | CLI Mode | Trigger.dev | Overlap % | Collision Risk |
|-----------|----------|-------------|-----------|----------------|
| Redis Coordination | ✅ BLPOP | ✅ BLPOP | 100% | 🔴 HIGH |
| Environment Variables | ✅ CFN_* | ✅ CFN_* | 100% | 🟡 MEDIUM |
| Quality Gates | ✅ MVP/Std/Ent | ✅ MVP/Std/Ent | 100% | 🟢 LOW |
| Provider Routing | ✅ 5 providers | ✅ 5 providers | 100% | 🟢 LOW |
| Agent Protocol | ✅ CLI protocol | ✅ CLI protocol | 100% | 🟡 MEDIUM |
| Execution Context | Host process | Docker container | 0% | 🟢 LOW |
| Orchestration | Direct spawn | Trigger.dev jobs | 0% | 🟢 LOW |
| Network Naming | `mcp-network` | `trigger-cfn-network` | 50% | 🔴 HIGH |
| Service Discovery | `cfn-redis` | `redis` | 50% | 🔴 HIGH |

---

## 🔴 HIGH COLLISION RISK (Will Break Trigger.dev)

### 1. Redis Key Namespacing

**Affected Files:**
- `src/cli/spawn-agent-cli.ts:146`
- `trigger-dev/src/jobs/cfn-loop3.ts`
- `.claude/skills/cfn-coordination/*.sh`

**Problem:**
Both modes use identical Redis key patterns without namespace isolation:

```bash
# CLI Mode
cfn:task:{TASK_ID}:status
cfn:task:{TASK_ID}:completed
cfn:task:{TASK_ID}:result

# Trigger.dev Mode (IDENTICAL - COLLISION)
cfn:task:{TASK_ID}:status
cfn:task:{TASK_ID}:completed
cfn:task:{TASK_ID}:result
```

**Collision Scenario:**
```bash
# Terminal 1: CLI mode spawns agent locally
$ spawn-agent-cli backend-dev --task-id "task-123"
# Creates: cfn:task:task-123:status = "running"

# Terminal 2: Trigger.dev job runs simultaneously
$ trigger.dev run cfn-loop-3 --payload '{"taskId":"task-123"}'
# Overwrites: cfn:task:task-123:status = "completed"

# Result: CLI agent exits prematurely (thinks Trigger.dev completed the task)
# Result: Trigger.dev job skips work (thinks CLI already did it)
```

**Impact:**
- ❌ Task completion signals interfere between modes
- ❌ CLI agents exit prematurely
- ❌ Trigger.dev jobs skip work
- ❌ Coordination deadlocks (waiting for wrong completion signal)
- ❌ Redis counters corrupted (task:completed incremented twice)

**Mitigation (Phase 1):**
```typescript
// FILE: src/cli/spawn-agent-cli.ts:146
const taskId = args.taskId || process.env.TASK_ID;
const prefixedTaskId = `cli:${taskId}`; // Add "cli:" prefix

// FILE: trigger-dev/src/jobs/cfn-loop3.ts
const prefixedTaskId = `trigger:${payload.taskId}`; // Add "trigger:" prefix

// Redis keys now isolated:
// CLI:     cfn:task:cli:task-123:status
// Trigger: cfn:task:trigger:task-123:status
```

**Estimated Effort:** 2-3 hours (prefix injection in 4 files)

---

### 2. Docker Network Naming

**Affected Files:**
- `docker/docker-compose.yml:100-114` (mcp-network)
- `docker/trigger-dev/docker-compose.yml:349-350` (trigger-cfn-network)

**Problem:**
Different network names prevent cross-mode service discovery:

```yaml
# CLI Mode: docker/docker-compose.yml
networks:
  mcp-network:
    driver: bridge

services:
  cfn-redis:
    container_name: cfn-redis
    networks:
      - mcp-network

# Trigger.dev: docker/trigger-dev/docker-compose.yml
networks:
  trigger-cfn-network:
    driver: bridge

services:
  redis:
    container_name: trigger-dev-redis
    networks:
      - trigger-cfn-network
```

**Collision Scenario:**
```bash
# CLI mode starts services
$ docker-compose -f docker/docker-compose.yml up -d
# Creates: mcp-network with cfn-redis service

# Trigger.dev starts services
$ docker-compose -f docker/trigger-dev/docker-compose.yml up -d
# Creates: trigger-cfn-network with redis service

# CLI agent tries to connect
$ docker run --network mcp-network -e CFN_REDIS_HOST=redis ...
# ❌ FAILS: "redis" service doesn't exist in mcp-network (it's "cfn-redis")

# Trigger.dev agent tries to connect
$ docker run --network trigger-cfn-network -e CFN_REDIS_HOST=cfn-redis ...
# ❌ FAILS: "cfn-redis" service doesn't exist in trigger-cfn-network (it's "redis")
```

**Impact:**
- ❌ Service discovery failures
- ❌ CLI agents can't find `redis` service
- ❌ Trigger.dev agents can't find `cfn-redis` service
- ❌ Cross-network container communication impossible
- ❌ DNS resolution errors in both modes

**Mitigation (Phase 2):**
```yaml
# OPTION A: Standardize on "cfn-redis" (Breaking change for Trigger.dev)
# FILE: docker/trigger-dev/docker-compose.yml:24
redis:
  container_name: cfn-redis  # Changed from trigger-dev-redis
  networks:
    - trigger-cfn-network

# OPTION B: Add network aliases (Non-breaking, RECOMMENDED)
# FILE: docker/trigger-dev/docker-compose.yml:36
redis:
  container_name: trigger-dev-redis
  networks:
    trigger-cfn-network:
      aliases:
        - redis          # Original name
        - cfn-redis      # CLI compatibility alias
```

**Estimated Effort:** 1 hour (network alias addition)

---

### 3. Service Name Inconsistency

**Affected Files:**
- `src/cli/agent-spawner.ts:200` (CFN_REDIS_HOST=cfn-redis)
- `trigger-dev/src/jobs/cfn-loop3.ts:386` (CFN_REDIS_HOST=redis)

**Problem:**
Different service names injected as environment variables:

```typescript
// CLI Mode: src/cli/agent-spawner.ts:200
const env = [
  'CFN_REDIS_HOST=cfn-redis',  // Service name in mcp-network
  'CFN_REDIS_PORT=6379',
  'CFN_NETWORK_NAME=mcp-network'
];

// Trigger.dev: trigger-dev/src/jobs/cfn-loop3.ts:386
const env = [
  'CFN_REDIS_HOST=redis',      // Service name in trigger-cfn-network
  'CFN_REDIS_PORT=6379',
  'CFN_NETWORK_NAME=trigger-cfn-network'
];
```

**Collision Scenario:**
```bash
# Developer edits CLI spawner to use "redis" for consistency
# FILE: src/cli/agent-spawner.ts:200
CFN_REDIS_HOST=redis  # Changed from "cfn-redis"

# Now CLI agents fail to connect
$ spawn-agent-cli backend-dev --task-id "task-123"
# Agent tries: redis-cli -h redis -p 6379
# ❌ FAILS: DNS resolution error (service is "cfn-redis" in mcp-network)

# Trigger.dev agents still work (their network has "redis")
$ trigger.dev run cfn-loop-3
# Agent tries: redis-cli -h redis -p 6379
# ✅ SUCCEEDS: DNS resolves (service is "redis" in trigger-cfn-network)
```

**Impact:**
- ❌ Inconsistent agent behavior across modes
- ❌ CLI agents fail when Trigger.dev naming adopted
- ❌ Hard to maintain (two different configuration sets)

**Mitigation (Phase 2):**
```yaml
# Add network aliases to Trigger.dev redis service
# FILE: docker/trigger-dev/docker-compose.yml:36
redis:
  networks:
    trigger-cfn-network:
      aliases:
        - redis
        - cfn-redis  # Now both names work
```

**Estimated Effort:** 30 minutes (alias addition + testing)

---

## 🟡 MEDIUM COLLISION RISK (Requires Coordination)

### 4. Docker Socket Access Patterns

**Affected Files:**
- `docker/docker-compose.yml:70` (direct socket mount)
- `docker/trigger-dev/docker-compose.yml:301` (socket proxy)

**Problem:**
Different Docker socket exposure strategies:

```yaml
# CLI Mode: Direct socket mount (simple but less secure)
# FILE: docker/docker-compose.yml:70
cfn-coordinator:
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock:ro

# Trigger.dev: Socket proxy (secure but complex)
# FILE: docker/trigger-dev/docker-compose.yml:301
trigger-worker:
  environment:
    DOCKER_HOST: tcp://socket-proxy:2375
```

**Collision Scenario:**
```bash
# Developer edits CLI coordinator to use socket proxy for security
# FILE: docker/docker-compose.yml:70
# volumes:
#   - /var/run/docker.sock:/var/run/docker.sock:ro  # Commented out
environment:
  DOCKER_HOST: tcp://socket-proxy:2375  # Added

# Now CLI coordinator fails (socket-proxy doesn't exist in mcp-network)
$ docker-compose -f docker/docker-compose.yml up -d
# Coordinator tries: DOCKER_HOST=tcp://socket-proxy:2375
# ❌ FAILS: socket-proxy service not found

# Trigger.dev still works (socket-proxy exists in trigger-cfn-network)
$ docker-compose -f docker/trigger-dev/docker-compose.yml up -d
# Worker tries: DOCKER_HOST=tcp://socket-proxy:2375
# ✅ SUCCEEDS: socket-proxy resolves
```

**Impact:**
- ⚠️ Agent spawning failures in CLI mode
- ⚠️ Security inconsistency (direct socket vs proxy)
- ⚠️ Requires deploying socket-proxy to mcp-network

**Mitigation (Phase 3):**
```yaml
# Deploy socket proxy to CLI mode network
# FILE: docker/docker-compose.yml (add socket-proxy service)
services:
  socket-proxy:
    image: tecnativa/docker-socket-proxy:latest
    container_name: cfn-socket-proxy
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    environment:
      CONTAINERS: '1'
      POST: '1'
      DELETE: '1'
      PRIVILEGED: '0'
      HOST: '0'
      VOLUMES: '0'
      SOCKETV2: '0'
    networks:
      - mcp-network
    expose:
      - "2375"

  cfn-coordinator:
    environment:
      DOCKER_HOST: tcp://socket-proxy:2375
    # Remove direct socket mount
```

**Estimated Effort:** 2 hours (socket-proxy deployment + testing)

---

### 5. Environment Variable Contract

**Affected Files:**
- `docker/runtime/cfn-runtime.contract.yml` (shared contract)
- `src/cli/agent-spawner.ts` (CLI implementation)
- `trigger-dev/src/jobs/cfn-loop3.ts` (Trigger.dev implementation)

**Problem:**
Shared environment variable names but different default values:

```yaml
# Contract: docker/runtime/cfn-runtime.contract.yml
redis_host:
  cfn_name: CFN_REDIS_HOST
  default: cfn-redis
  scope: coordinator, agent

# CLI Mode uses: cfn-redis (matches contract)
# Trigger.dev uses: redis (overrides contract)
```

**Collision Scenario:**
```bash
# Developer changes contract default to "redis"
# FILE: docker/runtime/cfn-runtime.contract.yml
redis_host:
  default: redis  # Changed from "cfn-redis"

# Now CLI mode breaks (mcp-network has "cfn-redis", not "redis")
$ spawn-agent-cli backend-dev --task-id "task-123"
# Agent reads: CFN_REDIS_HOST=redis (from contract)
# ❌ FAILS: DNS resolution error

# Trigger.dev still works (explicit override in docker-compose.yml)
CFN_REDIS_HOST: ${CFN_REDIS_HOST:-redis}
# ✅ SUCCEEDS: Override prevents contract change
```

**Impact:**
- ⚠️ Contract changes break one mode or the other
- ⚠️ Overrides in docker-compose.yml hide contract issues
- ⚠️ Hard to maintain consistency

**Mitigation (Phase 2):**
```yaml
# Use mode-specific overrides in contract
# FILE: docker/runtime/cfn-runtime.contract.yml
redis_host:
  cfn_name: CFN_REDIS_HOST
  default: cfn-redis
  cli_override: cfn-redis
  trigger_override: redis

# Both modes read contract with mode awareness
# CLI reads: cli_override
# Trigger.dev reads: trigger_override
```

**Estimated Effort:** 3 hours (contract refactor + implementation)

---

## 🟢 LOW COLLISION RISK (Safe to Edit)

### 6. Agent Type Definitions

**Affected Files:**
- `src/cli/spawn-agent-cli.ts:87`
- `trigger-dev/src/jobs/cfn-loop3.ts:34-48`

**Why Safe:**
Agent types are static configuration, not runtime coordination. Both modes can be updated simultaneously without collision.

**Edit Example:**
```typescript
// Add new agent type to both files
// FILE: src/cli/spawn-agent-cli.ts:87
const VALID_AGENTS = [
  'backend-dev',
  'tester',
  'security-specialist',
  'data-engineer'  // NEW
];

// FILE: trigger-dev/src/jobs/cfn-loop3.ts:34
const AgentTypeSchema = z.enum([
  'backend-developer',
  'tester',
  'security-specialist',
  'data-engineer'  // NEW
]);
```

**Impact:** ✅ None (as long as both modes updated together)

**Estimated Effort:** 15 minutes (add to both enums)

---

### 7. Quality Gate Thresholds

**Affected Files:**
- `.claude/commands/cfn/cfn-loop-cli.md`
- `trigger-dev/src/jobs/cfn-loop3.ts:172-176`

**Why Safe:**
Quality gates are business logic, not infrastructure. Changes apply universally.

**Edit Example:**
```typescript
// Change Standard mode threshold
const thresholds = {
  mvp: 0.70,
  standard: 0.90,  // Changed from 0.95
  enterprise: 0.98
};
```

**Impact:** ✅ Consistent behavior across both modes

**Estimated Effort:** 10 minutes (update threshold values)

---

### 8. Provider Routing Configuration

**Affected Files:**
- `src/cli/agent-spawner.ts` (provider logic)
- `trigger-dev/src/jobs/cfn-loop3.ts` (provider logic)

**Why Safe:**
Provider routing is application logic, not infrastructure. No runtime dependencies between modes.

**Edit Example:**
```typescript
// Add new provider
const VALID_PROVIDERS = [
  'zai',
  'kimi',
  'anthropic',
  'openrouter',
  'max',
  'gemini'  // NEW
];
```

**Impact:** ✅ None (independent routing decisions)

**Estimated Effort:** 20 minutes (add provider + API key handling)

---

## Recommended Mitigation Strategy

### Phase 1: Namespace Isolation (IMMEDIATE - 2-3 hours)

**Goal:** Prevent Redis key collisions between CLI and Trigger.dev modes

**Implementation:**

1. **Add mode prefixes to task IDs**

```typescript
// FILE: src/cli/spawn-agent-cli.ts:146
function generateTaskId(rawTaskId: string, mode: 'cli' | 'trigger'): string {
  return `${mode}:${rawTaskId}`;
}

const taskId = generateTaskId(args.taskId || process.env.TASK_ID, 'cli');
```

2. **Update Redis key patterns**

```typescript
// FILE: .claude/skills/cfn-coordination/coordination-signal.sh
# Add mode prefix to all Redis keys
TASK_ID="${MODE}:${TASK_ID}"  # cli:task-123 or trigger:task-123
redis-cli SET "cfn:task:${TASK_ID}:status" "running"
```

3. **Update coordinator logic**

```typescript
// FILE: trigger-dev/src/jobs/cfn-loop3.ts
const taskId = `trigger:${payload.taskId}`;
await redis.set(`cfn:task:${taskId}:status`, 'running');
```

**Testing:**
```bash
# Test CLI mode
$ spawn-agent-cli backend-dev --task-id "test-123"
$ redis-cli KEYS "cfn:task:cli:test-123:*"
# Expected: cfn:task:cli:test-123:status

# Test Trigger.dev mode
$ trigger.dev run cfn-loop-3 --payload '{"taskId":"test-123"}'
$ redis-cli KEYS "cfn:task:trigger:test-123:*"
# Expected: cfn:task:trigger:test-123:status

# Verify no collision
$ redis-cli KEYS "cfn:task:*:test-123:*"
# Expected: 2 distinct key sets (cli and trigger)
```

**Files to Modify:**
- `src/cli/spawn-agent-cli.ts`
- `src/cli/agent-spawner.ts`
- `trigger-dev/src/jobs/cfn-loop3.ts`
- `.claude/skills/cfn-coordination/*.sh`

**Estimated Effort:** 2-3 hours

---

### Phase 2: Service Name Aliases (SHORT-TERM - 1 hour)

**Goal:** Enable cross-mode service discovery without breaking changes

**Implementation:**

1. **Add network aliases to Trigger.dev redis**

```yaml
# FILE: docker/trigger-dev/docker-compose.yml:36
redis:
  container_name: trigger-dev-redis
  networks:
    trigger-cfn-network:
      aliases:
        - redis          # Original name
        - cfn-redis      # CLI compatibility alias
```

2. **Add network aliases to CLI mode redis**

```yaml
# FILE: docker/docker-compose.yml:8
cfn-redis:
  container_name: cfn-redis
  networks:
    mcp-network:
      aliases:
        - cfn-redis      # Original name
        - redis          # Trigger.dev compatibility alias
```

**Testing:**
```bash
# Test CLI mode can resolve both names
$ docker-compose -f docker/docker-compose.yml up -d
$ docker run --rm --network mcp-network redis:7-alpine redis-cli -h redis ping
# Expected: PONG
$ docker run --rm --network mcp-network redis:7-alpine redis-cli -h cfn-redis ping
# Expected: PONG

# Test Trigger.dev mode can resolve both names
$ docker-compose -f docker/trigger-dev/docker-compose.yml up -d
$ docker run --rm --network trigger-cfn-network redis:7-alpine redis-cli -h redis ping
# Expected: PONG
$ docker run --rm --network trigger-cfn-network redis:7-alpine redis-cli -h cfn-redis ping
# Expected: PONG
```

**Files to Modify:**
- `docker/docker-compose.yml`
- `docker/trigger-dev/docker-compose.yml`

**Estimated Effort:** 1 hour

---

### Phase 3: Environment Contract Unification (LONG-TERM - 3-4 hours)

**Goal:** Single source of truth for environment variables with mode-specific overrides

**Implementation:**

1. **Extend environment contract**

```yaml
# FILE: docker/runtime/cfn-runtime.contract.yml
redis_host:
  cfn_name: CFN_REDIS_HOST
  legacy_name: REDIS_HOST
  default: cfn-redis
  type: string
  scope: coordinator, agent
  modes:
    cli:
      override: cfn-redis
      network: mcp-network
    trigger:
      override: redis
      network: trigger-cfn-network
  validation:
    pattern: '^[a-z0-9\-]+$'
    description: "Redis service hostname"
```

2. **Implement contract reader**

```typescript
// FILE: src/lib/environment-contract.ts
export function getEnvValue(key: string, mode: 'cli' | 'trigger'): string {
  const contract = loadContract();
  const spec = contract[key];

  // Check mode-specific override
  if (spec.modes?.[mode]?.override) {
    return spec.modes[mode].override;
  }

  // Check environment variable
  const cfnValue = process.env[spec.cfn_name];
  if (cfnValue) return cfnValue;

  const legacyValue = process.env[spec.legacy_name];
  if (legacyValue) {
    console.warn(`Using legacy env var ${spec.legacy_name}, use ${spec.cfn_name} instead`);
    return legacyValue;
  }

  // Return default
  return spec.default;
}
```

3. **Update spawners to use contract**

```typescript
// FILE: src/cli/agent-spawner.ts
import { getEnvValue } from '../lib/environment-contract';

const redisHost = getEnvValue('redis_host', 'cli');
const redisPort = getEnvValue('redis_port', 'cli');
const networkName = getEnvValue('network_name', 'cli');
```

**Testing:**
```bash
# Test contract resolution
$ node -e "const {getEnvValue} = require('./dist/lib/environment-contract'); console.log(getEnvValue('redis_host', 'cli'));"
# Expected: cfn-redis

$ node -e "const {getEnvValue} = require('./dist/lib/environment-contract'); console.log(getEnvValue('redis_host', 'trigger'));"
# Expected: redis

# Test with environment override
$ CFN_REDIS_HOST=custom-redis node -e "const {getEnvValue} = require('./dist/lib/environment-contract'); console.log(getEnvValue('redis_host', 'cli'));"
# Expected: custom-redis
```

**Files to Create:**
- `src/lib/environment-contract.ts` (new)
- `src/lib/environment-contract.test.ts` (new)

**Files to Modify:**
- `docker/runtime/cfn-runtime.contract.yml`
- `src/cli/agent-spawner.ts`
- `trigger-dev/src/jobs/cfn-loop3.ts`

**Estimated Effort:** 3-4 hours

---

### Phase 4: Socket Proxy Deployment ✅ COMPLETE (2 hours)

**Status:** ✅ **COMPLETE** (2025-11-24)
**Goal:** Consistent security posture across both modes
**Report:** `planning/trigger/PHASE_4_SECURITY_VALIDATION_REPORT.md`

**Implementation:**

1. **Deploy socket-proxy to CLI mode**

```yaml
# FILE: docker/docker-compose.yml
services:
  socket-proxy:
    image: tecnativa/docker-socket-proxy:latest
    container_name: cfn-socket-proxy
    privileged: true
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    environment:
      CONTAINERS: '1'
      POST: '1'
      DELETE: '1'
      PRIVILEGED: '0'
      HOST: '0'
      VOLUMES: '0'
      SOCKETV2: '0'
      LOG: '1'
    networks:
      - mcp-network
    expose:
      - "2375"
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:2375/containers/json"]
      interval: 10s
      timeout: 5s
      retries: 3
    restart: unless-stopped

  cfn-coordinator:
    depends_on:
      - socket-proxy
    environment:
      DOCKER_HOST: tcp://socket-proxy:2375
    # Remove: volumes: - /var/run/docker.sock:/var/run/docker.sock:ro
```

2. **Update coordinator to use proxy**

```typescript
// FILE: docker/coordinator/src/coordinator.js
const docker = new Docker({
  host: process.env.DOCKER_HOST || 'tcp://socket-proxy:2375'
});
```

**Testing:**
```bash
# Test socket proxy
$ docker-compose -f docker/docker-compose.yml up -d socket-proxy
$ docker exec cfn-socket-proxy wget -qO- http://localhost:2375/containers/json
# Expected: JSON array of containers

# Test coordinator can spawn agents via proxy
$ docker-compose -f docker/docker-compose.yml up -d cfn-coordinator
$ docker logs cfn-coordinator | grep "Socket proxy connection"
# Expected: "Connected to socket proxy at tcp://socket-proxy:2375"
```

**Files to Modify:**
- `docker/docker-compose.yml`
- `docker/coordinator/src/coordinator.js`

**Estimated Effort:** 2 hours

---

## Implementation Timeline

### Week 1: Phase 1 (Namespace Isolation)
**Priority:** 🔴 CRITICAL
**Effort:** 2-3 hours
**Deliverables:**
- Mode prefixes added to task IDs
- Redis key patterns updated with prefixes
- CLI and Trigger.dev modes fully isolated
- Tests validating no key collisions

**Success Criteria:**
- ✅ CLI and Trigger.dev can run simultaneously without interference
- ✅ Redis keys namespaced correctly (`cli:` vs `trigger:`)
- ✅ Zero coordination signal collisions

---

### Week 2: Phase 2 (Service Name Aliases)
**Priority:** 🟡 HIGH
**Effort:** 1 hour
**Deliverables:**
- Network aliases added to both docker-compose files
- Service discovery works with both names
- Documentation updated

**Success Criteria:**
- ✅ Both `redis` and `cfn-redis` resolve correctly in both networks
- ✅ No service discovery failures
- ✅ Backward compatibility maintained

---

### Month 1: Phase 3 (Environment Contract)
**Priority:** 🟢 MEDIUM
**Effort:** 3-4 hours
**Deliverables:**
- Extended environment contract with mode-specific overrides
- Contract reader implementation
- Spawners refactored to use contract
- Tests validating contract resolution

**Success Criteria:**
- ✅ Single source of truth for environment variables
- ✅ Mode-specific overrides work correctly
- ✅ Legacy environment variable support maintained

---

### Month 2: Phase 4 (Socket Proxy - Optional)
**Priority:** 🟢 LOW
**Effort:** 2 hours
**Deliverables:**
- Socket proxy deployed to CLI mode
- Coordinator updated to use proxy
- Security audit passed

**Success Criteria:**
- ✅ Consistent security posture across modes
- ✅ Socket proxy validates all Docker operations
- ✅ No privileged mode or dangerous operations allowed

---

## Risk Assessment

### High Risk (Immediate Action Required)
- **Redis Key Collisions:** ❌ WILL BREAK both modes if not addressed
- **Service Discovery Failures:** ❌ WILL BREAK agent coordination
- **Mitigation:** Phase 1 + Phase 2 (total 3-4 hours)

### Medium Risk (Short-Term Planning)
- **Environment Variable Drift:** ⚠️ MAY CAUSE inconsistent behavior
- **Docker Socket Access Inconsistency:** ⚠️ MAY CAUSE security issues
- **Mitigation:** Phase 3 + Phase 4 (total 5-6 hours)

### Low Risk (Long-Term Maintenance)
- **Agent Type Synchronization:** ✅ Manageable with documentation
- **Quality Gate Drift:** ✅ Easy to keep in sync
- **Mitigation:** Documentation + periodic reviews

---

## Testing Strategy

### Pre-Mitigation Testing (Validate Collision)
```bash
# 1. Start both modes simultaneously
$ docker-compose -f docker/docker-compose.yml up -d
$ docker-compose -f docker/trigger-dev/docker-compose.yml up -d

# 2. Spawn CLI agent
$ spawn-agent-cli backend-dev --task-id "collision-test"

# 3. Spawn Trigger.dev job with same task ID
$ trigger.dev run cfn-loop-3 --payload '{"taskId":"collision-test"}'

# 4. Check Redis for key collisions
$ redis-cli KEYS "cfn:task:collision-test:*"
# Expected (BEFORE mitigation): MIXED keys from both modes (COLLISION)

# 5. Verify agent failures
$ docker logs <cli-agent-container>
$ docker logs <trigger-agent-container>
# Expected (BEFORE mitigation): Coordination failures, premature exits
```

### Post-Mitigation Testing (Validate Isolation)
```bash
# 1. Start both modes simultaneously
$ docker-compose -f docker/docker-compose.yml up -d
$ docker-compose -f docker/trigger-dev/docker-compose.yml up -d

# 2. Spawn CLI agent
$ spawn-agent-cli backend-dev --task-id "isolation-test"

# 3. Spawn Trigger.dev job with same task ID
$ trigger.dev run cfn-loop-3 --payload '{"taskId":"isolation-test"}'

# 4. Check Redis for key isolation
$ redis-cli KEYS "cfn:task:cli:isolation-test:*"
# Expected (AFTER Phase 1): CLI-specific keys only

$ redis-cli KEYS "cfn:task:trigger:isolation-test:*"
# Expected (AFTER Phase 1): Trigger-specific keys only

# 5. Verify both agents complete successfully
$ docker logs <cli-agent-container> | grep "completed"
$ docker logs <trigger-agent-container> | grep "completed"
# Expected (AFTER Phase 1): Both agents complete without interference

# 6. Verify service discovery
$ docker run --rm --network mcp-network redis:7-alpine redis-cli -h redis ping
$ docker run --rm --network mcp-network redis:7-alpine redis-cli -h cfn-redis ping
# Expected (AFTER Phase 2): Both resolve correctly (PONG)

$ docker run --rm --network trigger-cfn-network redis:7-alpine redis-cli -h redis ping
$ docker run --rm --network trigger-cfn-network redis:7-alpine redis-cli -h cfn-redis ping
# Expected (AFTER Phase 2): Both resolve correctly (PONG)
```

---

## Monitoring and Validation

### Redis Key Monitoring
```bash
# Check for key collisions (pre-mitigation)
$ redis-cli KEYS "cfn:task:*:status" | wc -l
# Expected (BEFORE): >1 key per task ID (collision)
# Expected (AFTER): 1 key per mode per task ID (isolated)

# Validate namespace isolation (post-mitigation)
$ redis-cli KEYS "cfn:task:cli:*" | wc -l  # CLI keys
$ redis-cli KEYS "cfn:task:trigger:*" | wc -l  # Trigger keys
# Expected: Clear separation, no overlaps
```

### Service Discovery Validation
```bash
# Test DNS resolution in both networks
$ docker run --rm --network mcp-network alpine nslookup redis
$ docker run --rm --network mcp-network alpine nslookup cfn-redis
$ docker run --rm --network trigger-cfn-network alpine nslookup redis
$ docker run --rm --network trigger-cfn-network alpine nslookup cfn-redis
# Expected: All resolve correctly (AFTER Phase 2)
```

### Agent Coordination Validation
```bash
# Monitor agent completion signals
$ redis-cli MONITOR | grep "cfn:task:.*:completed"
# Expected: Clear mode prefixes (cli: or trigger:)

# Track agent lifecycle
$ docker ps --filter "name=agent-" --format "{{.Names}}\t{{.Status}}"
# Expected: Both CLI and Trigger agents run independently
```

---

## Decision Matrix

| Scenario | Action | Phase | Effort | Priority |
|----------|--------|-------|--------|----------|
| Edit CLI for local use | Implement Phase 1 | Namespace Isolation | 2-3h | 🔴 CRITICAL |
| Run both modes simultaneously | Implement Phase 1 + 2 | Isolation + Aliases | 3-4h | 🔴 CRITICAL |
| Standardize configuration | Implement Phase 3 | Contract Unification | 3-4h | 🟡 HIGH |
| Security hardening | Implement Phase 4 | Socket Proxy | 2h | 🟢 MEDIUM |
| Add new agent type | Update both enums | N/A | 15m | 🟢 LOW |
| Change quality gates | Update both files | N/A | 10m | 🟢 LOW |

---

## Conclusion

**Immediate Risk:** Editing CLI mode files without namespace isolation **WILL BREAK** Trigger.dev Docker mode due to Redis key collisions and service discovery failures.

**Recommended Path Forward:**
1. **Week 1:** Implement Phase 1 (namespace isolation) - 2-3 hours
2. **Week 2:** Implement Phase 2 (service name aliases) - 1 hour
3. **Month 1:** Implement Phase 3 (environment contract) - 3-4 hours
4. **Month 2:** Consider Phase 4 (socket proxy) - 2 hours

**Total Effort:** 8-10 hours for full convergence
**Critical Path:** Phase 1 (must complete before any CLI edits)

**Next Steps:**
1. Review this analysis with team
2. Get approval for Phase 1 implementation
3. Schedule Phase 1 execution (2-3 hour sprint)
4. Validate with testing strategy
5. Proceed to Phase 2 once Phase 1 validated

---

**Prepared by:** CFN System Analysis
**Date:** 2025-11-24
**Status:** 📋 READY FOR REVIEW
**Follow-up:** Schedule Phase 1 implementation sprint
