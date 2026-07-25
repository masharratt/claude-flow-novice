# Command Naming Strategy

## 🎯 Avoiding Conflicts with Existing Packages

### Existing Package on NPM
- **Package:** `claude-flow` (v2.0.0 by ruvnet)
- **Description:** Enterprise-grade AI agent orchestration with ruv-swarm integration
- **Published:** September 6, 2025

**To avoid conflicts, we use distinctive naming:**

---

## 📦 Our Package Name

**Package:** `claude-flow-novice`

**Why "novice"?**
- ✅ Clear differentiation from `claude-flow`
- ✅ Indicates beginner-friendly, accessible framework
- ✅ Unique on npm registry
- ✅ Memorable and descriptive

---

## 🔧 Our Binary Commands

### Command 1: Main CLI
```bash
claude-flow-novice
```
**Purpose:** Main orchestration CLI
**Usage:**
```bash
claude-flow-novice --help
claude-flow-novice status
claude-flow-novice swarm "Build API"
claude-flow-novice agent coder
```

**Why this name:**
- ✅ Matches package name exactly
- ✅ No conflict with `claude-flow` (different command)
- ✅ Clear, discoverable
- ✅ Auto-completion friendly

---

### Command 2-8: CFN Utility Commands (cfn-*)

All utility commands follow the `cfn-*` naming pattern for consistency and discoverability.

#### cfn-spawn
```bash
cfn-spawn agent <type> [options]
```
**Purpose**: Agent spawning utility
**Usage**:
```bash
cfn-spawn agent coder --task-id abc123
cfn-spawn researcher --task-id xyz789
```

#### cfn-loop
```bash
cfn-loop single|epic|sprints <description> [options]
```
**Purpose**: CFN Loop orchestration
**Subcommands**: single, epic, sprints
**Usage**:
```bash
cfn-loop single "Implement JWT auth" --mode=standard
cfn-loop epic "Build auth system"
```

#### cfn-swarm
```bash
cfn-swarm init|status|shutdown [options]
```
**Purpose**: Swarm coordination
**Subcommands**: init, status, shutdown
**Usage**:
```bash
cfn-swarm init mesh --max-agents 5
cfn-swarm status
```

#### cfn-portal
```bash
cfn-portal start|stop|status|agents|metrics|events [options]
```
**Purpose**: Web portal management
**Subcommands**: start, stop, status, agents, metrics, events
**Usage**:
```bash
cfn-portal start --port 3000
cfn-portal agents --status active
```

#### cfn-context
```bash
cfn-context reflect|curate|inject|query|stats [options]
```
**Purpose**: ACE context operations
**Subcommands**: reflect, curate, inject, query, stats
**Usage**:
```bash
cfn-context query "redis coordination"
cfn-context stats
```

#### cfn-metrics
```bash
cfn-metrics agent|consensus|fleet [options]
```
**Purpose**: Monitoring and analytics
**Subcommands**: agent, consensus, fleet
**Usage**:
```bash
cfn-metrics agent --agent-id coder-1
cfn-metrics fleet
```

#### cfn-redis
```bash
cfn-redis pattern|waiting-mode|event [options]
```
**Purpose**: Redis coordination helpers
**Subcommands**: pattern, waiting-mode, event
**Usage**:
```bash
cfn-redis pattern mesh-hybrid --task-id task-123
cfn-redis waiting-mode --task-id task-123 --agent-id coder-1
```

**Why "cfn-*" pattern:**
- ✅ Avoids confusion with `claude-flow` package
- ✅ Short, memorable (CFN = Claude Flow Novice)
- ✅ Consistent naming across all utilities
- ✅ No conflicts on npm registry
- ✅ Discoverable via tab completion

---

## 📋 Command Comparison Table

| Command | Package | Purpose | Conflict Risk |
|---------|---------|---------|---------------|
| `claude-flow` | `claude-flow` (ruvnet) | Enterprise orchestration | N/A (different package) |
| `claude-flow-novice` | **Our package** | Main CLI | ✅ No conflict |
| `cfn-spawn` | **Our package** | Agent spawning | ✅ No conflict |
| `cfn-loop` | **Our package** | CFN Loop orchestration | ✅ No conflict |
| `cfn-swarm` | **Our package** | Swarm coordination | ✅ No conflict |
| `cfn-portal` | **Our package** | Web portal management | ✅ No conflict |
| `cfn-context` | **Our package** | ACE context operations | ✅ No conflict |
| `cfn-metrics` | **Our package** | Monitoring/analytics | ✅ No conflict |
| `cfn-redis` | **Our package** | Redis coordination | ✅ No conflict |

---

## 🔍 Verification

### Check for Command Conflicts

```bash
# Search npm for our command names
npm search claude-flow-novice
# Result: Only our package ✅

npm search cfn-spawn
# Result: No exact matches ✅

# Verify in shell
which claude-flow-novice
which cfn-spawn
# Both point to our package after install ✅
```

---

## 📝 User Guidance

### If Users Have Both Packages Installed

**Scenario:** User has both `claude-flow` and `claude-flow-novice` installed globally

**Commands are distinct:**
```bash
# ruvnet's package
claude-flow [command]

# Our package
claude-flow-novice [command]
cfn-spawn [command]
```

**No namespace collision** - different binary names

---

## 🚀 Future Considerations

### Current CFN-* Commands (v2.0.0)

**Implemented utilities:**
```bash
claude-flow-novice    # Main CLI
cfn-spawn            # Agent spawning
cfn-loop             # CFN Loop orchestration
cfn-swarm            # Swarm coordination
cfn-portal           # Web portal management
cfn-context          # ACE context operations
cfn-metrics          # Monitoring/analytics
cfn-redis            # Redis coordination
```

**Future expansion pattern:**
```bash
cfn-monitor          # Real-time monitoring (future)
cfn-doctor           # Health diagnostics (future)
cfn-migrate          # Migration tools (future)
```

**Benefits:**
- ✅ Consistent branding (CFN acronym)
- ✅ Short, memorable commands
- ✅ Namespace-safe
- ✅ Discoverable via tab completion

---

## 🔄 Migration from Old Names

**If we had old command names, migration path:**

```bash
# Deprecate old commands (package.json)
{
  "bin": {
    "claude-flow-novice": "dist/cli/index.js",
    "cfn-spawn": "dist/cli/spawn.js",

    // Deprecated but kept for backward compatibility
    "claude-flow-spawn": "dist/cli/deprecated-spawn-wrapper.js"
  }
}

# deprecated-spawn-wrapper.js shows warning:
#!/usr/bin/env node
console.warn("⚠️  'claude-flow-spawn' is deprecated. Use 'cfn-spawn' instead.");
require('./spawn.js');
```

**Not needed for us** - we're launching fresh with correct names from v2.0.0

---

## ✅ Final Binary Configuration

```json
{
  "name": "claude-flow-novice",
  "version": "2.0.0",
  "bin": {
    "claude-flow-novice": "dist/cli/index.js",
    "cfn-spawn": "dist/cli/spawn.js",
    "cfn-loop": "dist/cli/cfn-loop.js",
    "cfn-swarm": "dist/cli/cfn-swarm.js",
    "cfn-portal": "dist/cli/cfn-portal.js",
    "cfn-context": "dist/cli/cfn-context.js",
    "cfn-metrics": "dist/cli/cfn-metrics.js",
    "cfn-redis": "dist/cli/cfn-redis.js"
  }
}
```

**Benefits:**
- ✅ Zero conflicts with `claude-flow` package
- ✅ Clear, memorable command names
- ✅ Consistent with internal naming (`/cfn-loop`, etc.)
- ✅ Short utility commands (cfn-* pattern)
- ✅ Complete CLI suite for all operations
- ✅ Room for future expansion

---

## 📚 Summary

**Main Command:**
- `claude-flow-novice` - Main orchestration CLI

**Utility Commands (7 total):**
- `cfn-spawn` - Agent spawning
- `cfn-loop` - CFN Loop orchestration
- `cfn-swarm` - Swarm coordination
- `cfn-portal` - Web portal management
- `cfn-context` - ACE context operations
- `cfn-metrics` - Monitoring/analytics
- `cfn-redis` - Redis coordination

**Pattern:**
- `cfn-<action>` for all utility commands
- Consistent, discoverable, namespace-safe

**Conflict Risk:** ✅ **ZERO** - Verified on npm registry
