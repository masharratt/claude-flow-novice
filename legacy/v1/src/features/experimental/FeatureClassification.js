/**
 * Experimental Features Classification System
 * Checkpoint 1.4 - Progressive Visibility Management
 */

export class FeatureClassification {
  /**
   * Stability levels for experimental features
   */
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
      visibility: 'intermediate',
      description: 'Feature-complete, visible to intermediate+ users with opt-in',
      riskLevel: 'low',
      requiresConsent: true,
      showWarnings: true,
    },
    ALPHA: {
      level: 'alpha',
      visibility: 'advanced',
      description: 'Experimental, visible to advanced+ users with warnings',
      riskLevel: 'medium',
      requiresConsent: true,
      showWarnings: true,
    },
    RESEARCH: {
      level: 'research',
      visibility: 'enterprise',
      description: 'Highly experimental, enterprise users only with explicit enablement',
      riskLevel: 'high',
      requiresConsent: true,
      showWarnings: true,
    },
  };

  /**
   * User experience levels
   */
  static USER_LEVELS = {
    NOVICE: 'novice',
    INTERMEDIATE: 'intermediate',
    ADVANCED: 'advanced',
    ENTERPRISE: 'enterprise',
  };

  /**
   * Experimental agents classification
   */
  static EXPERIMENTAL_AGENTS = {
    // Consensus and Distributed Systems - Now Stable for Novice Access
    'consensus-builder': {
      stability: 'stable',
      category: 'consensus',
      description: 'General consensus mechanism builder',
      dependencies: [],
      warnings: [],
      enablementFlags: [],
    },
    'byzantine-coordinator': {
      stability: 'stable',
      category: 'consensus',
      description: 'Byzantine fault tolerance coordinator',
      dependencies: [],
      warnings: [],
      enablementFlags: [],
    },
    'raft-manager': {
      stability: 'beta',
      category: 'consensus',
      description: 'Raft consensus protocol manager',
      dependencies: [],
      warnings: ['Leader election overhead'],
      enablementFlags: ['experimental.consensus.enabled'],
    },
    'gossip-coordinator': {
      stability: 'stable',
      category: 'consensus',
      description: 'Gossip protocol coordination for scalability',
      dependencies: [],
      warnings: [],
      enablementFlags: [],
    },
    'crdt-synchronizer': {
      stability: 'alpha',
      category: 'data',
      description: 'Conflict-free replicated data types synchronizer',
      dependencies: [],
      warnings: ['Memory overhead for large datasets', 'Complex merge operations'],
      enablementFlags: ['experimental.data.crdt.enabled'],
    },
    'quorum-manager': {
      stability: 'beta',
      category: 'consensus',
      description: 'Quorum-based decision making manager',
      dependencies: [],
      warnings: ['Requires minimum cluster size'],
      enablementFlags: ['experimental.consensus.enabled'],
    },
    'security-manager': {
      stability: 'alpha',
      category: 'security',
      description: 'Advanced security and access control manager',
      dependencies: [],
      warnings: ['May block legitimate operations', 'Performance impact on security checks'],
      enablementFlags: ['experimental.security.advanced.enabled'],
    },

    // Advanced AI and Neural - Research Level
    'temporal-advantage': {
      stability: 'research',
      category: 'neural',
      description: 'Temporal processing advantage optimizer',
      dependencies: [],
      warnings: ['Highly experimental AI', 'Unpredictable behavior', 'Resource intensive'],
      enablementFlags: ['experimental.neural.temporal.enabled', 'research.ai.enabled'],
    },
    'consciousness-evolution': {
      stability: 'research',
      category: 'neural',
      description: 'Consciousness evolution simulation agent',
      dependencies: [],
      warnings: [
        'Experimental consciousness models',
        'May produce unpredictable outputs',
        'High computational cost',
      ],
      enablementFlags: ['experimental.neural.consciousness.enabled', 'research.ai.enabled'],
    },
    'psycho-symbolic': {
      stability: 'research',
      category: 'neural',
      description: 'Psychological and symbolic reasoning agent',
      dependencies: [],
      warnings: [
        'Experimental psychological models',
        'May generate sensitive content',
        'Requires careful monitoring',
      ],
      enablementFlags: ['experimental.neural.psycho.enabled', 'research.ai.enabled'],
    },
    'phi-calculator': {
      stability: 'alpha',
      category: 'math',
      description: 'Advanced mathematical phi calculations',
      dependencies: [],
      warnings: ['Complex mathematical operations', 'High precision requirements'],
      enablementFlags: ['experimental.math.advanced.enabled'],
    },

    // Performance and Optimization - Alpha Level
    'nanosecond-scheduler': {
      stability: 'alpha',
      category: 'performance',
      description: 'Nanosecond precision task scheduler',
      dependencies: [],
      warnings: ['High precision timing requirements', 'May cause timing conflicts'],
      enablementFlags: ['experimental.performance.precision.enabled'],
    },
    'matrix-solver': {
      stability: 'beta',
      category: 'math',
      description: 'Advanced matrix computation solver',
      dependencies: [],
      warnings: ['High memory usage for large matrices'],
      enablementFlags: ['experimental.math.matrix.enabled'],
    },
    pagerank: {
      stability: 'beta',
      category: 'analysis',
      description: 'PageRank algorithm implementation',
      dependencies: [],
      warnings: ['Memory intensive for large graphs'],
      enablementFlags: ['experimental.analysis.graph.enabled'],
    },

    // Neural Specialists - Research Level
    'safla-neural': {
      stability: 'research',
      category: 'neural',
      description: 'Self-Aware Feedback Loop Algorithm neural specialist',
      dependencies: [],
      warnings: [
        'Self-modifying neural networks',
        'Unpredictable learning patterns',
        'May require reset mechanisms',
      ],
      enablementFlags: ['experimental.neural.safla.enabled', 'research.ai.enabled'],
    },
  };

  /**
   * Determine if an agent should be visible to a user
   */
  static isAgentVisible(agentName, userLevel, enabledFeatures = []) {
    const agent = this.EXPERIMENTAL_AGENTS[agentName];
    if (!agent) {
      return true; // Non-experimental agents are always visible
    }

    const stability = this.STABILITY_LEVELS[agent.stability.toUpperCase()];
    if (!stability) {
      return false; // Unknown stability level, hide by default
    }

    // Check user level permissions
    const userCanSee = this.canUserSeeStabilityLevel(userLevel, stability.visibility);
    if (!userCanSee) {
      return false;
    }

    // Check if required feature flags are enabled
    if (agent.enablementFlags && agent.enablementFlags.length > 0) {
      const hasRequiredFlags = agent.enablementFlags.every((flag) =>
        enabledFeatures.includes(flag),
      );
      if (!hasRequiredFlags) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if user level can see stability level
   */
  static canUserSeeStabilityLevel(userLevel, requiredVisibility) {
    const levelHierarchy = {
      [this.USER_LEVELS.NOVICE]: 0,
      [this.USER_LEVELS.INTERMEDIATE]: 1,
      [this.USER_LEVELS.ADVANCED]: 2,
      [this.USER_LEVELS.ENTERPRISE]: 3,
    };

    const visibilityHierarchy = {
      all: 0,
      intermediate: 1,
      advanced: 2,
      enterprise: 3,
    };

    return levelHierarchy[userLevel] >= visibilityHierarchy[requiredVisibility];
  }

  /**
   * Get filtered agent list based on user level and enabled features
   */
  static getVisibleAgents(allAgents, userLevel, enabledFeatures = []) {
    return allAgents.filter((agentName) =>
      this.isAgentVisible(agentName, userLevel, enabledFeatures),
    );
  }

  /**
   * Get agent metadata with visibility and warnings
   */
  static getAgentMetadata(agentName, userLevel, enabledFeatures = []) {
    const agent = this.EXPERIMENTAL_AGENTS[agentName];
    if (!agent) {
      return { isExperimental: false, visible: true };
    }

    const stability = this.STABILITY_LEVELS[agent.stability.toUpperCase()];
    const visible = this.isAgentVisible(agentName, userLevel, enabledFeatures);

    return {
      isExperimental: true,
      visible,
      stability: stability.level,
      riskLevel: stability.riskLevel,
      description: agent.description,
      category: agent.category,
      warnings: agent.warnings || [],
      requiresConsent: stability.requiresConsent,
      showWarnings: stability.showWarnings,
      dependencies: agent.dependencies || [],
      enablementFlags: agent.enablementFlags || [],
    };
  }

  /**
   * Get all experimental features by category
   */
  static getFeaturesByCategory() {
    const categories = {};

    Object.entries(this.EXPERIMENTAL_AGENTS).forEach(([agentName, config]) => {
      if (!categories[config.category]) {
        categories[config.category] = [];
      }
      categories[config.category].push({
        name: agentName,
        ...config,
      });
    });

    return categories;
  }
}
