# Agent Accessibility Guide: Making Experimental Agents Available to Novices

## Quick Start Guide

This guide provides step-by-step instructions for making experimental agents accessible to novice users in the Claude-Flow system.

## Overview

The Claude-Flow system currently restricts experimental agents to intermediate, advanced, and enterprise users. This guide shows how to safely make these agents available to novice users while maintaining system stability.

## Available Experimental Agents

### Current Agent Inventory by Stability Level

#### Beta Level Agents (Currently Intermediate+ Only)
- `raft-manager` - Raft consensus protocol manager
- `gossip-coordinator` - Gossip protocol coordination manager
- `quorum-manager` - Quorum-based decision making manager
- `matrix-solver` - Advanced matrix computation solver
- `pagerank` - PageRank algorithm implementation

#### Alpha Level Agents (Currently Advanced+ Only)
- `consensus-builder` - Advanced consensus mechanism builder
- `byzantine-coordinator` - Byzantine fault tolerance coordinator
- `crdt-synchronizer` - Conflict-free replicated data types synchronizer
- `security-manager` - Advanced security and access control manager
- `phi-calculator` - Advanced mathematical phi calculations
- `nanosecond-scheduler` - Nanosecond precision task scheduler

#### Research Level Agents (Currently Enterprise Only)
- `temporal-advantage` - Temporal processing advantage optimizer
- `consciousness-evolution` - Consciousness evolution simulation agent
- `psycho-symbolic` - Psychological and symbolic reasoning agent
- `safla-neural` - Self-Aware Feedback Loop Algorithm neural specialist

## Modification Methods

### Method 1: Enable All Experimental Features for Novices (Simplest)

Edit `/src/config/config-manager.ts` and modify the `FEATURE_FLAGS_BY_LEVEL` constant:

```javascript
const FEATURE_FLAGS_BY_LEVEL: Record<ExperienceLevel, FeatureFlags> = {
  novice: {
    neuralNetworks: true,           // Changed from false
    byzantineConsensus: true,       // Changed from false
    enterpriseIntegrations: true,   // Changed from false
    advancedMonitoring: true,       // Changed from false
    multiTierStorage: true,         // Changed from false
    teamCollaboration: true,        // Changed from false
    customWorkflows: true,          // Changed from false
    performanceAnalytics: true,     // Changed from false
  },
  // ... keep other levels unchanged
};
```

### Method 2: Make Specific Agents Stable (Safest)

Edit `/src/features/experimental/FeatureClassification.js` and change specific agents from experimental to stable:

```javascript
static EXPERIMENTAL_AGENTS = {
  // Change these agents to stable by removing them from this object
  // and adding them to the stable agents list in AgentVisibilityManager.js

  // Example: Remove these entries to make them stable
  // 'matrix-solver': { ... },
  // 'pagerank': { ... },
  // 'raft-manager': { ... },

  // Keep only the agents you want to remain experimental
  'temporal-advantage': {
    stability: 'research',
    // ... keep existing config
  },
  // ... keep other high-risk agents
};
```

Then add the newly stable agents to `/src/features/experimental/AgentVisibilityManager.js`:

```javascript
async getAllAvailableAgents() {
  const stableAgents = [
    { name: 'coder', category: 'development', stability: 'stable', description: 'Main coding agent' },
    { name: 'tester', category: 'development', stability: 'stable', description: 'Testing specialist' },
    { name: 'reviewer', category: 'development', stability: 'stable', description: 'Code review agent' },
    { name: 'planner', category: 'management', stability: 'stable', description: 'Project planning agent' },
    { name: 'researcher', category: 'analysis', stability: 'stable', description: 'Research specialist' },

    // Add newly stable agents here
    { name: 'matrix-solver', category: 'math', stability: 'stable', description: 'Advanced matrix computation solver' },
    { name: 'pagerank', category: 'analysis', stability: 'stable', description: 'PageRank algorithm implementation' },
    { name: 'raft-manager', category: 'consensus', stability: 'stable', description: 'Raft consensus protocol manager' },
  ];
  // ... rest of method
}
```

### Method 3: Lower Stability Requirements (Graduated Approach)

Edit `/src/features/experimental/FeatureClassification.js` and modify the stability levels:

```javascript
static STABILITY_LEVELS = {
  STABLE: {
    level: 'stable',
    visibility: 'all',
    description: 'Production-ready, visible to all users',
    riskLevel: 'none',
    requiresConsent: false,
    showWarnings: false,
  },
  BETA: {
    level: 'beta',
    visibility: 'all',              // Changed from 'intermediate' to 'all'
    description: 'Feature-complete, visible to all users with opt-in',
    riskLevel: 'low',
    requiresConsent: true,
    showWarnings: true,
  },
  ALPHA: {
    level: 'alpha',
    visibility: 'intermediate',     // Changed from 'advanced' to 'intermediate'
    description: 'Experimental, visible to intermediate+ users with warnings',
    riskLevel: 'medium',
    requiresConsent: true,
    showWarnings: true,
  },
  RESEARCH: {
    level: 'research',
    visibility: 'advanced',         // Changed from 'enterprise' to 'advanced'
    description: 'Highly experimental, advanced+ users with explicit enablement',
    riskLevel: 'high',
    requiresConsent: true,
    showWarnings: true,
  },
};
```

### Method 4: Enable Global Feature Flags (Most Permissive)

Edit `/src/config/features/ExperimentalConfig.js` and enable experimental features globally:

```javascript
featureFlags: {
  // Consensus and distributed systems
  'experimental.consensus.enabled': true,        // Changed from false
  'experimental.byzantine.enabled': true,       // Changed from false
  'experimental.raft.enabled': true,            // Changed from false
  'experimental.gossip.enabled': true,          // Changed from false

  // Data synchronization
  'experimental.data.crdt.enabled': true,       // Changed from false

  // Security features
  'experimental.security.advanced.enabled': true, // Changed from false

  // Neural and AI features (use caution)
  'experimental.neural.temporal.enabled': true,    // Changed from false
  'experimental.neural.consciousness.enabled': true, // Changed from false
  'experimental.neural.psycho.enabled': true,      // Changed from false
  'experimental.neural.safla.enabled': true,       // Changed from false
  'research.ai.enabled': true,                     // Changed from false

  // Performance and optimization
  'experimental.performance.precision.enabled': true, // Changed from false
  'experimental.math.advanced.enabled': true,         // Changed from false
  'experimental.math.matrix.enabled': true,           // Changed from false
  'experimental.analysis.graph.enabled': true,        // Changed from false
},
```

## Recommended Implementation Strategy

### Phase 1: Enable Safe Beta Agents (Low Risk)

Start with the safest experimental agents:

1. Enable these beta agents using Method 2 (make them stable):
   - `matrix-solver` - Mathematical computation, low system impact
   - `pagerank` - Analysis tool, low system impact
   - `quorum-manager` - Decision making, well-tested consensus

### Phase 2: Enable More Beta Agents (Medium Risk)

2. Next, enable these beta agents:
   - `raft-manager` - Well-established consensus protocol
   - `gossip-coordinator` - Network coordination, predictable behavior

### Phase 3: Enable Alpha Agents (Higher Risk)

3. Carefully enable alpha agents with monitoring:
   - `phi-calculator` - Mathematical tool, contained impact
   - `security-manager` - Security features with safeguards

### Phase 4: Advanced Agents (Highest Risk - Optional)

4. Only if needed, enable more complex agents:
   - `consensus-builder` - Complex consensus mechanisms
   - `byzantine-coordinator` - Advanced fault tolerance
   - `crdt-synchronizer` - Data synchronization
   - `nanosecond-scheduler` - Precision timing

### Phase 5: Research Agents (Enterprise Features - Use Extreme Caution)

5. Research-level agents require careful consideration:
   - These agents are experimental and may have unpredictable behavior
   - Consider enabling only in controlled environments
   - Require explicit user acknowledgment of risks

## Implementation Steps

### Step 1: Choose Your Method

Select one of the four methods above based on your needs:
- **Method 1**: Quickest, enables everything for novices
- **Method 2**: Safest, graduates specific agents to stable
- **Method 3**: Balanced, lowers barriers gradually
- **Method 4**: Most permissive, enables all experimental features

### Step 2: Make the Code Changes

Apply your chosen method by editing the appropriate configuration files.

### Step 3: Test the Changes

1. Restart the Claude-Flow system
2. Create a test user with novice experience level
3. Verify the experimental agents are now visible
4. Test agent functionality with simple tasks

### Step 4: Monitor and Validate

1. Monitor system performance for any degradation
2. Check error logs for experimental agent issues
3. Validate that warnings and consent dialogs still appear
4. Ensure resource limits are still enforced

## Safety Considerations

### Maintaining Safety While Enabling Access

Even when making experimental agents accessible to novices, maintain these safety measures:

1. **Keep Warnings Active**: Don't disable warning systems
2. **Require Consent**: Keep explicit consent requirements for experimental features
3. **Enforce Resource Limits**: Maintain CPU and memory restrictions
4. **Enable Monitoring**: Keep performance monitoring active
5. **Provide Documentation**: Ensure users understand experimental nature

### Configuration for Safe Novice Access

When implementing changes, consider this safe configuration:

```javascript
// Safe configuration for novice access to experimental agents
const SAFE_NOVICE_CONFIG = {
  experienceLevel: 'novice',

  // Enable select experimental features with safeguards
  featureFlags: {
    // Safe math and analysis tools
    'experimental.math.matrix.enabled': true,
    'experimental.analysis.graph.enabled': true,

    // Well-tested consensus (beta level)
    'experimental.consensus.enabled': true,
    'experimental.raft.enabled': true,

    // Keep neural/AI features disabled for novices
    'experimental.neural.temporal.enabled': false,
    'experimental.neural.consciousness.enabled': false,
    'research.ai.enabled': false,
  },

  // Enhanced monitoring for experimental features
  monitoring: {
    enabled: true,
    collectInterval: 2000,     // More frequent monitoring
    alertThresholds: {
      cpu: { warning: 50, critical: 70 },    // Lower thresholds
      memory: { warning: 60, critical: 80 }, // Lower thresholds
      responseTime: { warning: 500, critical: 2000 },
    },
    autoDisableOnCritical: true,  // Auto-disable on issues
  },

  // Stricter UI settings for novices
  ui: {
    showExperimentalSection: true,
    enableAdvancedMode: false,
    hideWarningsAfterAcknowledge: false,  // Always show warnings
    groupByStability: true,
    showRiskIndicators: true,
  },
};
```

## Rollback Procedures

If issues occur after enabling experimental agents for novices:

### Quick Rollback

1. **Revert Configuration Changes**: Restore the original configuration files from version control
2. **Restart System**: Restart the Claude-Flow system to apply changes
3. **Verify Rollback**: Confirm that experimental agents are no longer visible to novices

### Selective Rollback

1. **Identify Problematic Agent**: Determine which specific agent is causing issues
2. **Disable Specific Agent**: Remove only that agent's access while keeping others enabled
3. **Monitor Results**: Verify that the issue is resolved

### Emergency Rollback

If severe issues occur:

1. **Set Global Disable**: Set all experimental feature flags to `false`
2. **Force Novice Restrictions**: Temporarily downgrade all users to novice level
3. **System Recovery**: Allow system to stabilize before re-enabling features

## Testing Checklist

Before deploying changes to production:

- [ ] Backup current configuration files
- [ ] Test in development environment first
- [ ] Verify novice users can see experimental agents
- [ ] Confirm warning dialogs still appear
- [ ] Test agent functionality with sample tasks
- [ ] Monitor resource usage during agent execution
- [ ] Verify rollback procedures work correctly
- [ ] Test user experience level transitions
- [ ] Validate feature flag behavior
- [ ] Check error handling and logging

## Support and Troubleshooting

### Common Issues

1. **Agents Not Visible**: Check feature flags and user experience level
2. **Permission Denied**: Verify stability level and visibility settings
3. **Resource Errors**: Check resource limits and monitoring thresholds
4. **Performance Issues**: Review monitoring data and consider rollback

### Debug Commands

Use these commands to debug agent access issues:

```bash
# Check current user experience level
npx claude-flow config get experienceLevel

# List available agents for current user
npx claude-flow agent list --include-experimental

# Check feature flag status
npx claude-flow config get featureFlags

# Monitor experimental agent performance
npx claude-flow monitor --experimental-only
```

## Conclusion

Making experimental agents accessible to novices requires careful consideration of safety, monitoring, and user experience. Start with the safest agents and gradually expand access while maintaining robust safety measures. Always prioritize system stability and user safety over feature accessibility.

The recommended approach is to use Method 2 (making specific agents stable) starting with beta-level mathematical and analysis tools, then gradually expanding to more complex agents based on user feedback and system performance.