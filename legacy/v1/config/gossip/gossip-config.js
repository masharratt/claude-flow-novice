/**
 * Gossip Protocol Configuration
 * Configuration templates for different network topologies and use cases
 */

const gossipConfigurations = {
  // Development configuration - fast intervals for testing
  development: {
    gossip: {
      gossipInterval: 500,          // 500ms gossip rounds
      fanout: 2,                    // Contact 2 peers per round
      rumorLifetime: 10000,         // 10 second rumor lifetime
      antiEntropyInterval: 2000,    // 2 second anti-entropy
      maxRetransmissions: 2
    },
    verification: {
      taskTimeout: 5000,            // 5 second task timeout
      consensusThreshold: 0.6,      // 60% consensus required
      maxConcurrentTasks: 5,
      retryAttempts: 2
    },
    monitoring: {
      monitoringInterval: 1000,     // 1 second monitoring
      alertThresholds: {
        memory: 70,
        cpu: 70,
        network: 80,
        agents: 50
      },
      alertCooldown: 5000,          // 5 second cooldown
      historySize: 50
    },
    consensus: {
      validationTimeout: 3000,      // 3 second validation timeout
      consensusThreshold: 0.6,
      heartbeatInterval: 2000
    }
  },

  // Production configuration - balanced for reliability and performance
  production: {
    gossip: {
      gossipInterval: 1000,         // 1 second gossip rounds
      fanout: 3,                    // Contact 3 peers per round
      rumorLifetime: 30000,         // 30 second rumor lifetime
      antiEntropyInterval: 5000,    // 5 second anti-entropy
      maxRetransmissions: 3
    },
    verification: {
      taskTimeout: 30000,           // 30 second task timeout
      consensusThreshold: 0.66,     // 66% consensus required
      maxConcurrentTasks: 10,
      retryAttempts: 3
    },
    monitoring: {
      monitoringInterval: 5000,     // 5 second monitoring
      alertThresholds: {
        memory: 80,
        cpu: 75,
        network: 90,
        agents: 80
      },
      alertCooldown: 30000,         // 30 second cooldown
      historySize: 200
    },
    consensus: {
      validationTimeout: 15000,     // 15 second validation timeout
      consensusThreshold: 0.66,
      heartbeatInterval: 5000
    }
  },

  // High-throughput configuration - optimized for many small tasks
  highThroughput: {
    gossip: {
      gossipInterval: 200,          // 200ms gossip rounds
      fanout: 4,                    // Contact 4 peers per round
      rumorLifetime: 15000,         // 15 second rumor lifetime
      antiEntropyInterval: 1000,    // 1 second anti-entropy
      maxRetransmissions: 2
    },
    verification: {
      taskTimeout: 10000,           // 10 second task timeout
      consensusThreshold: 0.6,      // 60% consensus for speed
      maxConcurrentTasks: 20,
      retryAttempts: 2
    },
    monitoring: {
      monitoringInterval: 2000,     // 2 second monitoring
      alertThresholds: {
        memory: 85,
        cpu: 80,
        network: 90,
        agents: 85
      },
      alertCooldown: 10000,         // 10 second cooldown
      historySize: 100
    },
    consensus: {
      validationTimeout: 8000,      // 8 second validation timeout
      consensusThreshold: 0.6,
      heartbeatInterval: 3000
    }
  },

  // Low-latency configuration - optimized for critical real-time tasks
  lowLatency: {
    gossip: {
      gossipInterval: 100,          // 100ms gossip rounds
      fanout: 5,                    // Contact 5 peers per round
      rumorLifetime: 5000,          // 5 second rumor lifetime
      antiEntropyInterval: 500,     // 500ms anti-entropy
      maxRetransmissions: 1
    },
    verification: {
      taskTimeout: 3000,            // 3 second task timeout
      consensusThreshold: 0.5,      // 50% consensus for speed
      maxConcurrentTasks: 15,
      retryAttempts: 1
    },
    monitoring: {
      monitoringInterval: 500,      // 500ms monitoring
      alertThresholds: {
        memory: 75,
        cpu: 70,
        network: 85,
        agents: 75
      },
      alertCooldown: 2000,          // 2 second cooldown
      historySize: 50
    },
    consensus: {
      validationTimeout: 2000,      // 2 second validation timeout
      consensusThreshold: 0.5,
      heartbeatInterval: 1000
    }
  },

  // Large-scale configuration - optimized for many nodes
  largeScale: {
    gossip: {
      gossipInterval: 2000,         // 2 second gossip rounds
      fanout: 6,                    // Contact 6 peers per round
      rumorLifetime: 60000,         // 60 second rumor lifetime
      antiEntropyInterval: 10000,   // 10 second anti-entropy
      maxRetransmissions: 4
    },
    verification: {
      taskTimeout: 45000,           // 45 second task timeout
      consensusThreshold: 0.75,     // 75% consensus for reliability
      maxConcurrentTasks: 8,
      retryAttempts: 3
    },
    monitoring: {
      monitoringInterval: 10000,    // 10 second monitoring
      alertThresholds: {
        memory: 85,
        cpu: 80,
        network: 95,
        agents: 90
      },
      alertCooldown: 60000,         // 60 second cooldown
      historySize: 500
    },
    consensus: {
      validationTimeout: 30000,     // 30 second validation timeout
      consensusThreshold: 0.75,
      heartbeatInterval: 10000
    }
  },

  // Fault-tolerant configuration - optimized for unreliable networks
  faultTolerant: {
    gossip: {
      gossipInterval: 1500,         // 1.5 second gossip rounds
      fanout: 4,                    // Contact 4 peers per round
      rumorLifetime: 45000,         // 45 second rumor lifetime
      antiEntropyInterval: 3000,    // 3 second anti-entropy
      maxRetransmissions: 5
    },
    verification: {
      taskTimeout: 60000,           // 60 second task timeout
      consensusThreshold: 0.6,      // 60% consensus (lower for faults)
      maxConcurrentTasks: 6,
      retryAttempts: 5
    },
    monitoring: {
      monitoringInterval: 3000,     // 3 second monitoring
      alertThresholds: {
        memory: 90,
        cpu: 85,
        network: 95,
        agents: 85
      },
      alertCooldown: 45000,         // 45 second cooldown
      historySize: 300
    },
    consensus: {
      validationTimeout: 45000,     // 45 second validation timeout
      consensusThreshold: 0.6,
      heartbeatInterval: 8000
    }
  }
};

/**
 * Get configuration by environment and scale
 */
function getConfiguration(environment = 'production', scale = 'medium') {
  const baseConfig = gossipConfigurations[environment] || gossipConfigurations.production;

  // Scale adjustments
  const scaleMultipliers = {
    small: { fanout: 0.7, timeout: 0.8, threshold: 0.9 },
    medium: { fanout: 1.0, timeout: 1.0, threshold: 1.0 },
    large: { fanout: 1.3, timeout: 1.2, threshold: 1.1 },
    xlarge: { fanout: 1.5, timeout: 1.5, threshold: 1.2 }
  };

  const multiplier = scaleMultipliers[scale] || scaleMultipliers.medium;

  return {
    ...baseConfig,
    gossip: {
      ...baseConfig.gossip,
      fanout: Math.max(2, Math.floor(baseConfig.gossip.fanout * multiplier.fanout))
    },
    verification: {
      ...baseConfig.verification,
      taskTimeout: Math.floor(baseConfig.verification.taskTimeout * multiplier.timeout),
      consensusThreshold: Math.min(0.9, baseConfig.verification.consensusThreshold * multiplier.threshold)
    },
    consensus: {
      ...baseConfig.consensus,
      validationTimeout: Math.floor(baseConfig.consensus.validationTimeout * multiplier.timeout),
      consensusThreshold: Math.min(0.9, baseConfig.consensus.consensusThreshold * multiplier.threshold)
    }
  };
}

/**
 * Create custom configuration with overrides
 */
function createCustomConfiguration(baseEnvironment = 'production', overrides = {}) {
  const baseConfig = gossipConfigurations[baseEnvironment] || gossipConfigurations.production;

  return {
    gossip: { ...baseConfig.gossip, ...(overrides.gossip || {}) },
    verification: { ...baseConfig.verification, ...(overrides.verification || {}) },
    monitoring: { ...baseConfig.monitoring, ...(overrides.monitoring || {}) },
    consensus: { ...baseConfig.consensus, ...(overrides.consensus || {}) }
  };
}

/**
 * Network topology configurations
 */
const topologyConfigurations = {
  mesh: {
    description: "Full mesh - every node connects to every other node",
    connectToAll: true,
    minConnections: 3,
    maxConnections: 20,
    redundancy: 'high',
    faultTolerance: 'excellent'
  },

  star: {
    description: "Star topology - central coordinator with spoke nodes",
    centralCoordinator: true,
    minConnections: 1,
    maxConnections: 1,
    redundancy: 'low',
    faultTolerance: 'poor'
  },

  ring: {
    description: "Ring topology - each node connects to next/previous",
    ringConnections: true,
    minConnections: 2,
    maxConnections: 2,
    redundancy: 'medium',
    faultTolerance: 'fair'
  },

  smallWorld: {
    description: "Small world - local clusters with random long-distance links",
    localClusters: true,
    randomLongLinks: true,
    minConnections: 3,
    maxConnections: 8,
    redundancy: 'high',
    faultTolerance: 'good'
  },

  hierarchical: {
    description: "Hierarchical - tree structure with coordinator levels",
    hierarchyLevels: 3,
    minConnections: 1,
    maxConnections: 5,
    redundancy: 'medium',
    faultTolerance: 'good'
  }
};

module.exports = {
  gossipConfigurations,
  topologyConfigurations,
  getConfiguration,
  createCustomConfiguration
};