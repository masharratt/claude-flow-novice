# Agent Permission & Access Control System Research Report

## Executive Summary

The Claude-Flow codebase implements a sophisticated multi-tier agent permission system that controls access to experimental and advanced agents based on user experience levels. This report documents the system architecture, permission mechanisms, and procedures for modifying agent accessibility.

## 1. Permission System Architecture

### 1.1 Core Components

The agent permission system consists of four primary components:

1. **FeatureClassification** (`src/features/experimental/FeatureClassification.js`)
2. **AgentVisibilityManager** (`src/features/experimental/AgentVisibilityManager.js`)
3. **ExperimentalConfig** (`src/config/features/ExperimentalConfig.js`)
4. **ConfigManager** (`src/config/config-manager.ts`)

### 1.2 Permission Flow

```
User Request → Experience Level Check → Feature Flags Validation → Agent Visibility Filter → Agent Access Granted/Denied
```

## 2. Experience Tier Classifications

### 2.1 User Levels Hierarchy

The system defines four experience levels with ascending permissions:

```javascript
USER_LEVELS = {
  NOVICE: 'novice',          // Level 0 - Most restricted
  INTERMEDIATE: 'intermediate', // Level 1 - Basic experimental access
  ADVANCED: 'advanced',        // Level 2 - Advanced experimental access
  ENTERPRISE: 'enterprise'     // Level 3 - Full access including research features
}
```

### 2.2 Stability Levels and Visibility

Agent stability levels determine which user levels can access them:

| Stability Level | Visibility | Risk Level | User Access |
|-----------------|------------|------------|-------------|
| `stable` | `all` | `none` | All users (novice+) |
| `beta` | `intermediate` | `low` | Intermediate+ users |
| `alpha` | `advanced` | `medium` | Advanced+ users |
| `research` | `enterprise` | `high` | Enterprise users only |

## 3. Agent Classification System

### 3.1 Stable Agents (Always Visible)

These core agents are accessible to all user levels:

- `coder` - Main coding agent
- `tester` - Testing specialist
- `reviewer` - Code review agent
- `planner` - Project planning agent
- `researcher` - Research specialist

### 3.2 Experimental Agents by Category

#### Consensus & Distributed Systems (Alpha/Beta)
- `consensus-builder` (alpha) - Advanced consensus mechanism builder
- `byzantine-coordinator` (alpha) - Byzantine fault tolerance coordinator
- `raft-manager` (beta) - Raft consensus protocol manager
- `gossip-coordinator` (beta) - Gossip protocol coordination manager
- `quorum-manager` (beta) - Quorum-based decision making manager

#### Neural & AI Features (Research Level)
- `temporal-advantage` (research) - Temporal processing advantage optimizer
- `consciousness-evolution` (research) - Consciousness evolution simulation agent
- `psycho-symbolic` (research) - Psychological and symbolic reasoning agent
- `safla-neural` (research) - Self-Aware Feedback Loop Algorithm neural specialist

#### Performance & Math (Alpha/Beta)
- `nanosecond-scheduler` (alpha) - Nanosecond precision task scheduler
- `phi-calculator` (alpha) - Advanced mathematical phi calculations
- `matrix-solver` (beta) - Advanced matrix computation solver
- `pagerank` (beta) - PageRank algorithm implementation

#### Security & Data (Alpha)
- `security-manager` (alpha) - Advanced security and access control manager
- `crdt-synchronizer` (alpha) - Conflict-free replicated data types synchronizer

## 4. Feature Flag System

### 4.1 Global Feature Flags

The system uses feature flags to control experimental agent access:

```javascript
featureFlags: {
  // Consensus and distributed systems
  'experimental.consensus.enabled': false,
  'experimental.byzantine.enabled': false,
  'experimental.raft.enabled': false,
  'experimental.gossip.enabled': false,

  // Neural and AI features (research level)
  'experimental.neural.temporal.enabled': false,
  'experimental.neural.consciousness.enabled': false,
  'experimental.neural.psycho.enabled': false,
  'experimental.neural.safla.enabled': false,
  'research.ai.enabled': false,

  // Performance and optimization
  'experimental.performance.precision.enabled': false,
  'experimental.math.advanced.enabled': false,
  'experimental.math.matrix.enabled': false,
  'experimental.analysis.graph.enabled': false,
}
```

### 4.2 Feature Flags by Experience Level

Feature flags are automatically set based on user experience level:

```javascript
const FEATURE_FLAGS_BY_LEVEL = {
  novice: {
    // All experimental features disabled
    neuralNetworks: false,
    byzantineConsensus: false,
    enterpriseIntegrations: false,
    // ... all false
  },
  intermediate: {
    // Basic features enabled
    advancedMonitoring: true,
    multiTierStorage: true,
    teamCollaboration: true,
    customWorkflows: true,
    performanceAnalytics: true,
    // Neural still disabled
    neuralNetworks: false,
    byzantineConsensus: false,
  },
  advanced: {
    // Advanced features enabled
    neuralNetworks: true,
    byzantineConsensus: true,
    // Enterprise still disabled
    enterpriseIntegrations: false,
  },
  enterprise: {
    // All features enabled
    neuralNetworks: true,
    byzantineConsensus: true,
    enterpriseIntegrations: true,
    // ... all true
  }
}
```

## 5. Agent Visibility Logic

### 5.1 Visibility Determination Algorithm

```javascript
function isAgentVisible(agentName, userLevel, enabledFeatures) {
  // 1. Check if agent is experimental
  const agent = EXPERIMENTAL_AGENTS[agentName];
  if (!agent) return true; // Non-experimental = always visible

  // 2. Check user level permissions
  const stability = STABILITY_LEVELS[agent.stability.toUpperCase()];
  const userCanSee = canUserSeeStabilityLevel(userLevel, stability.visibility);
  if (!userCanSee) return false;

  // 3. Check feature flag requirements
  if (agent.enablementFlags && agent.enablementFlags.length > 0) {
    const hasRequiredFlags = agent.enablementFlags.every(flag =>
      enabledFeatures.includes(flag)
    );
    if (!hasRequiredFlags) return false;
  }

  return true;
}
```

### 5.2 User Level Hierarchy Check

```javascript
function canUserSeeStabilityLevel(userLevel, requiredVisibility) {
  const levelHierarchy = {
    'novice': 0,
    'intermediate': 1,
    'advanced': 2,
    'enterprise': 3
  };

  const visibilityHierarchy = {
    'all': 0,
    'intermediate': 1,
    'advanced': 2,
    'enterprise': 3
  };

  return levelHierarchy[userLevel] >= visibilityHierarchy[requiredVisibility];
}
```

## 6. Permission Modification Procedures

### 6.1 Making Agents Accessible to Novices

To make experimental agents accessible to novice users, you can modify the system in several ways:

#### Option 1: Change Agent Stability Level
Edit `src/features/experimental/FeatureClassification.js`:

```javascript
// Change from:
'consensus-builder': {
  stability: 'alpha',  // Only advanced+ users
  // ...
}

// To:
'consensus-builder': {
  stability: 'stable', // All users including novices
  // ...
}
```

#### Option 2: Modify Stability Level Visibility
Edit `src/features/experimental/FeatureClassification.js`:

```javascript
static STABILITY_LEVELS = {
  ALPHA: {
    level: 'alpha',
    visibility: 'all',        // Changed from 'advanced' to 'all'
    description: 'Experimental, visible to all users with warnings',
    riskLevel: 'medium',
    requiresConsent: true,
    showWarnings: true,
  },
  // ...
}
```

#### Option 3: Override Feature Flags for Novices
Edit `src/config/config-manager.ts`:

```javascript
const FEATURE_FLAGS_BY_LEVEL = {
  novice: {
    neuralNetworks: true,        // Enable for novices
    byzantineConsensus: true,    // Enable for novices
    // ... enable other experimental features
  },
  // ...
}
```

#### Option 4: Enable Global Feature Flags
Edit `src/config/features/ExperimentalConfig.js`:

```javascript
featureFlags: {
  'experimental.consensus.enabled': true,    // Enable globally
  'experimental.byzantine.enabled': true,   // Enable globally
  'experimental.neural.temporal.enabled': true, // Enable globally
  // ... enable other flags
}
```

### 6.2 Adding New Experimental Agents

To add a new experimental agent:

1. Add to `EXPERIMENTAL_AGENTS` in `FeatureClassification.js`:

```javascript
'new-experimental-agent': {
  stability: 'beta',
  category: 'development',
  description: 'New experimental development agent',
  dependencies: [],
  warnings: ['This is a new experimental feature'],
  enablementFlags: ['experimental.development.new.enabled'],
}
```

2. Add feature flag in `ExperimentalConfig.js`:

```javascript
featureFlags: {
  'experimental.development.new.enabled': false,
  // ...
}
```

3. Add resource limits:

```javascript
features: {
  experimental: {
    'new-experimental-agent': {
      enabled: false,
      stability: 'beta',
      maxInstances: 1,
      resourceLimits: { cpu: 30, memory: 128 },
    },
    // ...
  }
}
```

### 6.3 Modifying User Experience Levels

To change a user's experience level programmatically:

```javascript
// Via ConfigManager
import { configManager } from './src/config/config-manager.ts';
configManager.setExperienceLevel('advanced');

// Via ExperimentalConfig
import { ExperimentalConfig } from './src/config/features/ExperimentalConfig.js';
const experimentalConfig = new ExperimentalConfig(configManager);
await experimentalConfig.setUserLevel(userId, 'advanced');
```

## 7. Configuration Files and Locations

### 7.1 Key Configuration Files

| File | Purpose | Agent Impact |
|------|---------|--------------|
| `src/features/experimental/FeatureClassification.js` | Agent stability definitions | Controls which agents are experimental |
| `src/features/experimental/AgentVisibilityManager.js` | UI visibility logic | Controls agent display in interfaces |
| `src/config/features/ExperimentalConfig.js` | Feature flag management | Controls experimental feature access |
| `src/config/config-manager.ts` | Core configuration | Controls experience levels and feature flags |
| `src/cli/agents/index.ts` | Agent factory | Controls agent creation and types |
| `src/agents/agent-registry.ts` | Agent registration | Manages active agent instances |

### 7.2 User Configuration Storage

User configurations are stored in:
- Global config: `claude-flow.config.json`
- User-specific: `~/.claude-flow/` directory
- Credentials: OS keychain or `~/.claude-flow/credentials.enc`

## 8. Recommendations for Novice Access

### 8.1 Safe Approaches

For making agents accessible to novices while maintaining system safety:

1. **Graduated Enablement**: Enable beta-level agents first, then alpha agents
2. **Enhanced Warnings**: Keep warning systems active even for novices
3. **Resource Limits**: Maintain strict resource limits for experimental agents
4. **Monitoring**: Ensure monitoring remains active to detect issues
5. **Rollback Capability**: Implement easy rollback mechanisms

### 8.2 Suggested Agent Progression

Recommended order for making agents accessible to novices:

1. **Phase 1** (Low Risk):
   - `matrix-solver` (beta)
   - `pagerank` (beta)
   - `quorum-manager` (beta)

2. **Phase 2** (Medium Risk):
   - `raft-manager` (beta)
   - `gossip-coordinator` (beta)
   - `phi-calculator` (alpha)

3. **Phase 3** (Higher Risk):
   - `nanosecond-scheduler` (alpha)
   - `security-manager` (alpha)
   - `crdt-synchronizer` (alpha)

4. **Phase 4** (Highest Risk - Caution Advised):
   - Neural and consciousness agents (research level)

## 9. Testing and Validation

### 9.1 Testing Agent Access Changes

Before implementing changes:

1. Test in development environment
2. Verify feature flag behavior
3. Test user level transitions
4. Validate UI visibility changes
5. Check resource limit enforcement

### 9.2 Validation Scripts

The codebase includes validation scripts at:
- `tests/experimental-features-validation.test.js`
- `scripts/test/validation-summary.ts`
- `tests/config/config-manager.test.ts`

## 10. Security Considerations

### 10.1 Risk Mitigation

When making experimental agents accessible to novices:

1. **Maintain Warnings**: Keep warning systems active
2. **Resource Limits**: Enforce strict CPU/memory limits
3. **Monitoring**: Enable performance monitoring
4. **Rollback**: Implement automatic rollback on errors
5. **Consent**: Require explicit user consent for experimental features

### 10.2 Access Control Validation

The system includes multiple validation layers:
- User level verification
- Feature flag checking
- Resource limit enforcement
- Capability matching
- Consent requirement validation

## Conclusion

The Claude-Flow agent permission system is well-architected with clear separation of concerns and multiple validation layers. The system can be safely modified to make experimental agents accessible to novices by adjusting stability levels, feature flags, or visibility rules. However, such changes should be implemented gradually with proper testing and monitoring to ensure system stability and user safety.

Key files to modify for novice access:
1. `src/features/experimental/FeatureClassification.js` - Change agent stability levels
2. `src/config/features/ExperimentalConfig.js` - Enable feature flags
3. `src/config/config-manager.ts` - Modify experience level defaults

The permission system provides flexible controls while maintaining safety through warnings, resource limits, and graduated access patterns.