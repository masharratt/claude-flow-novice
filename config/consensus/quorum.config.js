/**
 * Quorum Configuration for Verification Consensus
 *
 * Configuration settings for Byzantine fault-tolerant quorum management
 * and verification consensus protocols.
 */

module.exports = {
  // Core quorum settings
  quorum: {
    minSize: 3,
    maxSize: 21,
    defaultSize: 5,

    // Byzantine fault tolerance configuration
    byzantineFaultTolerance: {
      enabled: true,
      maxByzantineNodesFormula: '(n-1)/3', // Standard BFT formula
      requiredMajority: 0.67, // 2/3 majority for BFT
      detectionEnabled: true,
      recoveryEnabled: true
    },

    // Dynamic scaling settings
    scaling: {
      enabled: true,
      autoScaling: true,
      scaleUpThreshold: 0.8, // Scale up when 80% capacity
      scaleDownThreshold: 0.3, // Scale down when 30% capacity
      maxScaleUpNodes: 5, // Maximum nodes to add at once
      maxScaleDownNodes: 2, // Maximum nodes to remove at once
      cooldownPeriod: 60000, // 1 minute between scaling operations

      // Scaling strategies
      strategies: {
        performance: {
          enabled: true,
          latencyThreshold: 3000, // Scale if latency > 3s
          throughputThreshold: 100 // Scale if TPS < 100
        },
        network: {
          enabled: true,
          partitionRiskThreshold: 0.3,
          connectivityThreshold: 0.8
        },
        faultTolerance: {
          enabled: true,
          minToleranceLevel: 1,
          adaptiveAdjustment: true
        }
      }
    },

    // Node selection criteria
    nodeSelection: {
      // Reliability requirements
      reliability: {
        minUptimePercent: 95,
        maxFailuresPerHour: 2,
        minResponseTime: 1000, // ms
        historicalWindowHours: 24
      },

      // Performance requirements
      performance: {
        minCpuCores: 2,
        minMemoryMB: 4096,
        minBandwidthMbps: 100,
        maxLatencyMs: 500
      },

      // Geographic distribution
      geographic: {
        enableDistribution: true,
        minRegions: 2,
        maxNodesPerRegion: 10,
        diversityWeight: 0.2
      },

      // Security requirements
      security: {
        requireTLS: true,
        requireAuthentication: true,
        requireDigitalSignatures: true,
        certificateValidation: true
      }
    }
  },

  // Voting system configuration
  voting: {
    // Default voting settings
    defaults: {
      votingMethod: 'BYZANTINE_AGREEMENT',
      requiredMajority: 0.67,
      timeout: 30000, // 30 seconds
      allowAbstention: true,
      requireUnanimity: false,
      maxRetries: 3
    },

    // Vote validation
    validation: {
      requireDigitalSignatures: true,
      signatureAlgorithm: 'ECDSA',
      hashAlgorithm: 'SHA-256',
      timestampTolerance: 30000, // 30 second tolerance

      // Byzantine detection
      byzantineDetection: {
        enabled: true,
        doubleVotingCheck: true,
        signatureValidation: true,
        timingAnomalyDetection: true,
        behaviorAnalysis: true,
        suspiciousPatternThreshold: 3
      }
    },

    // Vote aggregation
    aggregation: {
      weightingEnabled: true,
      nodeWeightCalculation: 'PERFORMANCE_BASED', // or 'STAKE_BASED', 'EQUAL'
      consensusStrengthCalculation: true,
      marginalVictoryThreshold: 0.1 // 10% margin for clear victory
    }
  },

  // Network monitoring configuration
  network: {
    monitoring: {
      enabled: true,
      interval: 5000, // 5 seconds
      metrics: [
        'latency',
        'bandwidth',
        'packet_loss',
        'jitter',
        'connectivity'
      ]
    },

    // Network conditions thresholds
    thresholds: {
      latency: {
        good: 100, // ms
        warning: 500,
        critical: 1000
      },
      packetLoss: {
        good: 0.001, // 0.1%
        warning: 0.01, // 1%
        critical: 0.05 // 5%
      },
      bandwidth: {
        minimum: 10, // Mbps
        recommended: 100,
        optimal: 1000
      }
    },

    // Partition detection and recovery
    partitionDetection: {
      enabled: true,
      detectionTimeout: 10000, // 10 seconds
      recoveryTimeout: 60000, // 1 minute
      maxPartitionDuration: 300000, // 5 minutes
      autoRecovery: true
    }
  },

  // Performance settings
  performance: {
    // Consensus performance targets
    targets: {
      maxConsensusLatency: 5000, // 5 seconds
      minThroughput: 100, // transactions per second
      maxResourceUsage: {
        cpu: 0.8, // 80%
        memory: 0.9, // 90%
        network: 0.7 // 70%
      }
    },

    // Performance optimization
    optimization: {
      enabled: true,
      autoTuning: true,
      metrics: [
        'consensus_latency',
        'throughput',
        'resource_usage',
        'queue_length'
      ]
    },

    // Load balancing
    loadBalancing: {
      enabled: true,
      algorithm: 'WEIGHTED_ROUND_ROBIN', // or 'LEAST_CONNECTIONS', 'CONSISTENT_HASH'
      rebalancingInterval: 30000, // 30 seconds
      maxLoadImbalance: 0.3 // 30% imbalance threshold
    }
  },

  // Security configuration
  security: {
    // Cryptographic settings
    cryptography: {
      hashAlgorithm: 'SHA-256',
      signatureScheme: 'ECDSA',
      keyLength: 256,
      saltLength: 32
    },

    // Authentication and authorization
    authentication: {
      methods: ['DIGITAL_SIGNATURES', 'CERTIFICATES'],
      certificateValidation: true,
      certificateRevocation: true,
      sessionTimeout: 3600000 // 1 hour
    },

    // Communication security
    communication: {
      encryption: 'TLS_1_3',
      mutualAuthentication: true,
      certificatePinning: true,
      endToEndEncryption: true
    },

    // Audit and logging
    audit: {
      enabled: true,
      logLevel: 'INFO',
      logRotation: true,
      maxLogSize: '100MB',
      retentionDays: 90,

      // Audit events
      events: [
        'quorum_establishment',
        'voting_start',
        'voting_end',
        'byzantine_detection',
        'scaling_operation',
        'network_partition'
      ]
    }
  },

  // Specification validation
  validation: {
    // Compliance rules
    compliance: {
      strictMode: true,
      failOnViolation: true,
      warningThreshold: 5,

      // Required specifications
      requiredSpecs: [
        'consensus_algorithm',
        'byzantine_fault_tolerance',
        'performance_requirements',
        'security_requirements'
      ]
    },

    // Validation intervals
    intervals: {
      continuous: true,
      periodicValidation: 3600000, // 1 hour
      onDemandValidation: true,
      preChangeValidation: true
    },

    // Test scenarios
    testing: {
      enabled: true,
      scenarios: [
        'single_byzantine_node',
        'multiple_byzantine_nodes',
        'network_partition',
        'high_latency',
        'node_failures',
        'scaling_stress_test'
      ],

      // Test execution
      execution: {
        concurrent: true,
        timeout: 300000, // 5 minutes per test
        retries: 2,
        reportGeneration: true
      }
    }
  },

  // Hooks configuration
  hooks: {
    enabled: true,

    // Pre-task hooks
    preTask: {
      enabled: true,
      timeout: 5000,
      actions: [
        'session_restore',
        'resource_preparation',
        'context_loading'
      ]
    },

    // Post-edit hooks
    postEdit: {
      enabled: true,
      timeout: 3000,
      actions: [
        'memory_store',
        'metrics_update',
        'pattern_training'
      ]
    },

    // Post-task hooks
    postTask: {
      enabled: true,
      timeout: 10000,
      actions: [
        'result_storage',
        'metrics_export',
        'history_update',
        'session_cleanup'
      ]
    },

    // Session management
    sessions: {
      enabled: true,
      persistence: true,
      compression: true,
      encryption: true,
      maxSessionAge: 86400000 // 24 hours
    }
  },

  // Development and testing settings
  development: {
    debugging: {
      enabled: process.env.NODE_ENV !== 'production',
      verbose: false,
      tracing: false,
      profiling: false
    },

    // Simulation settings
    simulation: {
      enabled: process.env.NODE_ENV === 'development',
      networkLatencyRange: [50, 500], // ms
      nodeFailureRate: 0.05, // 5%
      byzantineNodeRate: 0.1, // 10%
      partitionProbability: 0.02 // 2%
    },

    // Mock data
    mocking: {
      enabled: process.env.NODE_ENV === 'test',
      mockNetworkConditions: true,
      mockNodeMetrics: true,
      mockVotingBehavior: true,
      deterministicRandom: true
    }
  },

  // Integration settings
  integration: {
    // MCP tool integration
    mcp: {
      enabled: true,
      coordinationEnabled: true,
      memoryIntegration: true,
      neuralIntegration: true
    },

    // External systems
    external: {
      monitoring: {
        enabled: false,
        endpoints: [],
        authentication: null
      },

      alerting: {
        enabled: false,
        webhooks: [],
        emailNotifications: false
      }
    }
  }
};